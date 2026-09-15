import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";

// เก็บ/เสิร์ฟรูปฉลากวัตถุดิบ (ถ่ายตอนรับเข้า) บน R2 แยกจากรูปชิ้นงาน (part-images)
// object_key จะถูกบันทึกไว้ในคอลัมน์ material_lots.label_image_key เพื่อเปิดดูย้อนหลัง
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const KEY_PREFIX = "material-labels/";

export async function POST(request: Request) {
  let newObjectKey = "";
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "materials")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์บันทึกรูปฉลาก Mat’s" }, { status: 403 });
    const { BUCKET } = getRuntimeEnv();
    if (!BUCKET) return Response.json({ error: "ไม่พบการเชื่อมต่อ R2" }, { status: 500 });
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) return Response.json({ error: "กรุณาแนบไฟล์รูปฉลาก" }, { status: 400 });
    if (!ALLOWED_TYPES.has(image.type)) return Response.json({ error: "รองรับเฉพาะ JPG, PNG และ WebP" }, { status: 400 });
    if (image.size > MAX_BYTES) return Response.json({ error: "รูปฉลากต้องมีขนาดไม่เกิน 8 MB" }, { status: 400 });
    const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    const stamp = new Date().toISOString().slice(0, 10);
    newObjectKey = `${KEY_PREFIX}${stamp}/${crypto.randomUUID()}.${extension}`;
    await BUCKET.put(newObjectKey, image.stream(), { httpMetadata: { contentType: image.type }, customMetadata: { uploadedBy: user.displayName } });
    return Response.json({ success: true, objectKey: newObjectKey });
  } catch (error) {
    const { BUCKET } = getRuntimeEnv();
    if (newObjectKey && BUCKET) await BUCKET.delete(newObjectKey).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "อัปโหลดรูปฉลากไม่สำเร็จ" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "materials")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูรูปฉลาก Mat’s" }, { status: 403 });
    const { BUCKET } = getRuntimeEnv();
    if (!BUCKET) return Response.json({ error: "ไม่พบการเชื่อมต่อ R2" }, { status: 500 });
    const key = String(new URL(request.url).searchParams.get("key") || "").trim();
    // จำกัดให้เปิดได้เฉพาะไฟล์ใต้ prefix ของรูปฉลากเท่านั้น กันการอ่านไฟล์อื่นใน R2
    if (!key || !key.startsWith(KEY_PREFIX) || key.includes("..")) return Response.json({ error: "คีย์รูปไม่ถูกต้อง" }, { status: 400 });
    const object = await BUCKET.get(key);
    if (!object) return Response.json({ error: "ไม่พบรูปฉลาก" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=31536000, immutable");
    headers.set("etag", object.httpEtag);
    const cachedTag = request.headers.get("if-none-match");
    if (cachedTag && cachedTag.split(",").some((tag) => tag.trim().replace(/^W\//, "") === object.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(object.body, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดรูปฉลากไม่สำเร็จ" }, { status: 500 });
  }
}
