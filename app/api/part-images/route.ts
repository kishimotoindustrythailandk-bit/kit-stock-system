import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
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

// รูปชิ้นงานมี 2 ช่อง (slot): master = รูปตัวอย่าง, actual = รูปชิ้นงานที่อยู่ในกล่อง
// เก็บคนละตารางเพื่อไม่ต้อง rebuild ตาราง part_images เดิม และ R2 ใช้ prefix แยกกัน
type Slot = "master" | "actual";
function resolveSlot(value: unknown): Slot {
  return String(value ?? "").trim().toLowerCase() === "actual" ? "actual" : "master";
}
function tableForSlot(slot: Slot) {
  // ค่า slot ถูกจำกัดไว้แค่ 2 ค่า จึงปลอดภัยที่จะนำมาต่อเป็นชื่อตาราง
  return slot === "actual" ? "part_actual_images" : "part_images";
}
function keyPrefixForSlot(slot: Slot) {
  return slot === "actual" ? "part-actual-images" : "part-images";
}

async function requireUser(adminOnly = false) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  if (adminOnly && !hasPermission(user, "parts") && !hasPermission(user, "settings")) return { error: Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการรูปชิ้นงาน" }, { status: 403 }) };
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
    const url = new URL(request.url);
    const slot = resolveSlot(url.searchParams.get("slot"));
    const table = tableForSlot(slot);
    if (slot === "actual") {
      await DB.prepare(`
        CREATE TABLE IF NOT EXISTS part_actual_images (
          material_code TEXT PRIMARY KEY NOT NULL,
          object_key TEXT NOT NULL,
          original_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          updated_by_name TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `).run();
    }
    const materialCode = cleanMaterialCode(url.searchParams.get("materialCode"));
    if (!materialCode) {
      if (!auth.user || (!hasPermission(auth.user, "parts") && !hasPermission(auth.user, "settings"))) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูทะเบียนรูปชิ้นงาน" }, { status: 403 });
      const result = await DB.prepare(`
        SELECT p.material_code AS materialCode, p.object_key AS objectKey,
          p.original_name AS originalName, p.content_type AS contentType,
          p.updated_by_name AS updatedByName, p.updated_at AS updatedAt,
          COALESCE(MAX(d.material_description), '') AS materialDescription
        FROM ${table} p
        LEFT JOIN delivery_due_lines d ON d.material_code = p.material_code
        GROUP BY p.material_code, p.object_key, p.original_name, p.content_type, p.updated_by_name, p.updated_at
        ORDER BY p.updated_at DESC
      `).all();
      return Response.json({ images: result.results, slot });
    }
    if (!BUCKET) return Response.json({ error: "ไม่พบการเชื่อมต่อ R2" }, { status: 500 });
    const row = await DB.prepare(`
      SELECT material_code AS materialCode, object_key AS objectKey,
        original_name AS originalName, content_type AS contentType,
        updated_by_name AS updatedByName, updated_at AS updatedAt
      FROM ${table} WHERE material_code = ?1 LIMIT 1
    `).bind(materialCode).first<ImageRow>();
    if (!row) return Response.json({ error: "ยังไม่มีรูปชิ้นงาน" }, { status: 404 });
    const object = await BUCKET.get(row.objectKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์รูปใน R2" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", row.contentType || headers.get("content-type") || "image/jpeg");
    // URL ของรูปอ้างด้วย materialCode จึงไม่เปลี่ยนเลยเวลาอัปโหลดรูปใหม่ทับ
    // เดิมตั้ง max-age=300 เบราว์เซอร์จึงใช้รูปเก่าในแคชต่ออีก 5 นาทีโดยไม่ถามเซิร์ฟเวอร์
    // ผู้ใช้เห็นว่า "อัปโหลดสำเร็จแต่รูปไม่เปลี่ยน" ทั้งที่ระบบบันทึกถูกต้องแล้ว
    //
    // no-cache ไม่ได้แปลว่าห้ามแคช แต่แปลว่าต้องถามเซิร์ฟเวอร์ก่อนใช้ทุกครั้ง
    // ถ้ารูปไม่เปลี่ยน etag จะตรงกันและได้ 304 กลับมา ไม่ต้องโหลดไฟล์ใหม่
    headers.set("cache-control", "private, no-cache");
    headers.set("etag", object.httpEtag);

    // no-cache สั่งให้เบราว์เซอร์ถามทุกครั้ง ถ้าไม่ตอบ 304 ให้ด้วยก็จะกลายเป็น
    // โหลดไฟล์เต็มทุกครั้ง เปลืองเน็ตมากบนมือถือหน้างานที่เปิดรูปบ่อย
    const cachedTag = request.headers.get("if-none-match");
    if (cachedTag && cachedTag.split(",").some((tag) => tag.trim().replace(/^W\//, "") === object.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }

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
    const slot = resolveSlot(form.get("slot"));
    const table = tableForSlot(slot);
    if (slot === "actual") {
      await DB.prepare(`
        CREATE TABLE IF NOT EXISTS part_actual_images (
          material_code TEXT PRIMARY KEY NOT NULL,
          object_key TEXT NOT NULL,
          original_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          updated_by_name TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `).run();
    }
    const image = form.get("image");
    if (!materialCode) return Response.json({ error: "กรุณาระบุ Material / Part No." }, { status: 400 });
    if (!(image instanceof File) || image.size === 0) return Response.json({ error: "กรุณาเลือกไฟล์รูป" }, { status: 400 });
    if (!ALLOWED_TYPES.has(image.type)) return Response.json({ error: "รองรับเฉพาะ JPG, PNG และ WebP" }, { status: 400 });
    if (image.size > MAX_BYTES) return Response.json({ error: "รูปต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
    const old = await DB.prepare(`SELECT object_key AS objectKey FROM ${table} WHERE material_code = ?1 LIMIT 1`).bind(materialCode).first<{ objectKey: string }>();
    const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    const safeCode = materialCode.replace(/[^A-Z0-9_-]/g, "_");
    newObjectKey = `${keyPrefixForSlot(slot)}/${safeCode}/${crypto.randomUUID()}.${extension}`;
    await BUCKET.put(newObjectKey, image.stream(), { httpMetadata: { contentType: image.type }, customMetadata: { materialCode, originalName: image.name, slot } });
    await DB.prepare(`
      INSERT INTO ${table} (material_code, object_key, original_name, content_type, updated_by_name, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
      ON CONFLICT(material_code) DO UPDATE SET object_key = excluded.object_key,
        original_name = excluded.original_name, content_type = excluded.content_type,
        updated_by_name = excluded.updated_by_name, updated_at = CURRENT_TIMESTAMP
    `).bind(materialCode, newObjectKey, image.name.slice(0, 200), image.type, auth.user!.displayName).run();
    if (old?.objectKey && old.objectKey !== newObjectKey) await BUCKET.delete(old.objectKey);
    return Response.json({ success: true, materialCode, slot });
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
    const body = await request.json() as { materialCode?: string; slot?: string };
    const materialCode = cleanMaterialCode(body.materialCode);
    const slot = resolveSlot(body.slot);
    const table = tableForSlot(slot);
    if (slot === "actual") {
      await DB.prepare(`
        CREATE TABLE IF NOT EXISTS part_actual_images (
          material_code TEXT PRIMARY KEY NOT NULL,
          object_key TEXT NOT NULL,
          original_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          updated_by_name TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `).run();
    }
    const row = await DB.prepare(`SELECT object_key AS objectKey FROM ${table} WHERE material_code = ?1 LIMIT 1`).bind(materialCode).first<{ objectKey: string }>();
    if (!row) return Response.json({ error: "ไม่พบรูปชิ้นงาน" }, { status: 404 });
    await DB.prepare(`DELETE FROM ${table} WHERE material_code = ?1`).bind(materialCode).run();
    await BUCKET.delete(row.objectKey);
    return Response.json({ success: true, slot });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ลบรูปไม่สำเร็จ" }, { status: 400 });
  }
}
