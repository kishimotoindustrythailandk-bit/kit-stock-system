import { getCurrentUser } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";

type ImageRow = {
  materialCode: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  updatedByName: string;
  updatedAt: string;
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

async function requireUser(adminOnly = false) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  if (adminOnly && user.role !== "admin") return { error: Response.json({ error: "เฉพาะ Admin เท่านั้นที่จัดการรูปชิ้นงานได้" }, { status: 403 }) };
  return { user };
}

function cleanMaterialCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().slice(0, 120);
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { DB, BUCKET } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1" }, { status: 500 });
    const materialCode = cleanMaterialCode(new URL(request.url).searchParams.get("materialCode"));
    if (!materialCode) {
      if (auth.user?.role !== "admin") return Response.json({ error: "เฉพาะ Admin เท่านั้น" }, { status: 403 });
      const result = await DB.prepare(`
        SELECT p.material_code AS materialCode, p.object_key AS objectKey,
          p.original_name AS originalName, p.content_type AS contentType,
          p.updated_by_name AS updatedByName, p.updated_at AS updatedAt,
          COALESCE(MAX(d.material_description), '') AS materialDescription
        FROM part_images p
        LEFT JOIN delivery_due_lines d ON d.material_code = p.material_code
        GROUP BY p.material_code, p.object_key, p.original_name, p.content_type, p.updated_by_name, p.updated_at
        ORDER BY p.updated_at DESC
      `).all();
      return Response.json({ images: result.results });
    }
    if (!BUCKET) return Response.json({ error: "ไม่พบการเชื่อมต่อ R2" }, { status: 500 });
    const row = await DB.prepare(`
      SELECT material_code AS materialCode, object_key AS objectKey,
        original_name AS originalName, content_type AS contentType,
        updated_by_name AS updatedByName, updated_at AS updatedAt
      FROM part_images WHERE material_code = ?1 LIMIT 1
    `).bind(materialCode).first<ImageRow>();
    if (!row) return Response.json({ error: "ยังไม่มีรูปชิ้นงาน" }, { status: 404 });
    const object = await BUCKET.get(row.objectKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์รูปใน R2" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", row.contentType || headers.get("content-type") || "image/jpeg");
    headers.set("cache-control", "private, max-age=300");
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดรูปชิ้นงานไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let newObjectKey = "";
  try {
    const auth = await requireUser(true);
    if (auth.error) return auth.error;
    const { DB, BUCKET } = getRuntimeEnv();
    if (!DB || !BUCKET) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1 หรือ R2" }, { status: 500 });
    const form = await request.formData();
    const materialCode = cleanMaterialCode(form.get("materialCode"));
    const image = form.get("image");
    if (!materialCode) return Response.json({ error: "กรุณาระบุ Material / Part No." }, { status: 400 });
    if (!(image instanceof File) || image.size === 0) return Response.json({ error: "กรุณาเลือกไฟล์รูป" }, { status: 400 });
    if (!ALLOWED_TYPES.has(image.type)) return Response.json({ error: "รองรับเฉพาะ JPG, PNG และ WebP" }, { status: 400 });
    if (image.size > MAX_BYTES) return Response.json({ error: "รูปต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
    const old = await DB.prepare("SELECT object_key AS objectKey FROM part_images WHERE material_code = ?1 LIMIT 1").bind(materialCode).first<{ objectKey: string }>();
    const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    const safeCode = materialCode.replace(/[^A-Z0-9_-]/g, "_");
    newObjectKey = `part-images/${safeCode}/${crypto.randomUUID()}.${extension}`;
    await BUCKET.put(newObjectKey, image.stream(), { httpMetadata: { contentType: image.type }, customMetadata: { materialCode, originalName: image.name } });
    await DB.prepare(`
      INSERT INTO part_images (material_code, object_key, original_name, content_type, updated_by_name, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
      ON CONFLICT(material_code) DO UPDATE SET object_key = excluded.object_key,
        original_name = excluded.original_name, content_type = excluded.content_type,
        updated_by_name = excluded.updated_by_name, updated_at = CURRENT_TIMESTAMP
    `).bind(materialCode, newObjectKey, image.name.slice(0, 200), image.type, auth.user!.displayName).run();
    if (old?.objectKey && old.objectKey !== newObjectKey) await BUCKET.delete(old.objectKey);
    return Response.json({ success: true, materialCode });
  } catch (error) {
    const { BUCKET } = getRuntimeEnv();
    if (newObjectKey && BUCKET) await BUCKET.delete(newObjectKey).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(true);
    if (auth.error) return auth.error;
    const { DB, BUCKET } = getRuntimeEnv();
    if (!DB || !BUCKET) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1 หรือ R2" }, { status: 500 });
    const body = await request.json() as { materialCode?: string };
    const materialCode = cleanMaterialCode(body.materialCode);
    const row = await DB.prepare("SELECT object_key AS objectKey FROM part_images WHERE material_code = ?1 LIMIT 1").bind(materialCode).first<{ objectKey: string }>();
    if (!row) return Response.json({ error: "ไม่พบรูปชิ้นงาน" }, { status: 404 });
    await DB.prepare("DELETE FROM part_images WHERE material_code = ?1").bind(materialCode).run();
    await BUCKET.delete(row.objectKey);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ลบรูปไม่สำเร็จ" }, { status: 400 });
  }
}
