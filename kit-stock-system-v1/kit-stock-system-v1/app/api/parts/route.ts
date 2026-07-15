import { eq } from "drizzle-orm";
import { getEmployeeUser, hasRole } from "../../employee-auth";
import { getDb } from "../../../db";
import { parts } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
}

function decodeOptionalImage(dataUrl?: string) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("ข้อมูลรูปสินค้าไม่ถูกต้อง");
  const binary = atob(match[2]);
  if (binary.length > 6 * 1024 * 1024) throw new Error("รูปสินค้าต้องมีขนาดไม่เกิน 6 MB");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { contentType: match[1], bytes };
}

async function saveImage(partNo: string, dataUrl?: string) {
  const image = decodeOptionalImage(dataUrl);
  if (!image) return null;
  const { BUCKET } = getRuntimeEnv();
  if (!BUCKET) throw new Error("พื้นที่เก็บรูปยังไม่พร้อมใช้งาน");
  const extension = image.contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const key = `products/${safeKey(partNo)}-${crypto.randomUUID()}.${extension}`;
  await BUCKET.put(key, image.bytes, { httpMetadata: { contentType: image.contentType } });
  return key;
}

export async function POST(request: Request) {
  try {
    const user = await getEmployeeUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasRole(user, [])) return Response.json({ error: "เฉพาะ Admin เท่านั้นที่เพิ่ม Part ได้" }, { status: 403 });
    const payload = await request.json() as {
      partNo?: string;
      partName?: string;
      customer?: string;
      standardQty?: number;
      containerType?: string;
      imageDataUrl?: string;
    };
    const partNo = payload.partNo?.trim().toUpperCase() ?? "";
    const partName = payload.partName?.trim().toUpperCase() ?? "";
    const customer = payload.customer?.trim() ?? "";
    const standardQty = Number(payload.standardQty);
    const containerType = payload.containerType?.trim() || "บ๊อค";
    if (!partNo || !partName || !customer || !Number.isInteger(standardQty) || standardQty <= 0) {
      return Response.json({ error: "กรุณากรอกข้อมูล Part ให้ครบ" }, { status: 400 });
    }
    const db = getDb();
    const exists = await db.select({ id: parts.id }).from(parts).where(eq(parts.partNo, partNo)).limit(1);
    if (exists.length) return Response.json({ error: "Part No. นี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    const imageKey = await saveImage(partNo, payload.imageDataUrl);
    const [part] = await db.insert(parts).values({
      partNo, partName, customer, standardQty, containerType, imageKey,
    }).returning();
    return Response.json({ part }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เพิ่ม Part ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getEmployeeUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasRole(user, [])) return Response.json({ error: "เฉพาะ Admin เท่านั้นที่แก้ไข Part ได้" }, { status: 403 });
    const payload = await request.json() as {
      id?: number;
      partNo?: string;
      partName?: string;
      customer?: string;
      standardQty?: number;
      containerType?: string;
      imageDataUrl?: string;
    };
    const id = Number(payload.id);
    const partNo = payload.partNo?.trim().toUpperCase() ?? "";
    const partName = payload.partName?.trim().toUpperCase() ?? "";
    const customer = payload.customer?.trim() ?? "";
    const standardQty = Number(payload.standardQty);
    if (!id || !partNo || !partName || !customer || !Number.isInteger(standardQty) || standardQty <= 0) {
      return Response.json({ error: "กรุณากรอกข้อมูล Part ให้ครบ" }, { status: 400 });
    }
    const db = getDb();
    const current = await db.select().from(parts).where(eq(parts.id, id)).limit(1);
    if (!current[0]) return Response.json({ error: "ไม่พบ Part ที่ต้องการแก้ไข" }, { status: 404 });
    const imageKey = payload.imageDataUrl ? await saveImage(partNo, payload.imageDataUrl) : current[0].imageKey;
    const [part] = await db.update(parts).set({
      partNo,
      partName,
      customer,
      standardQty,
      containerType: payload.containerType?.trim() || "บ๊อค",
      imageKey,
    }).where(eq(parts.id, id)).returning();
    return Response.json({ part });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "แก้ไข Part ไม่สำเร็จ" }, { status: 500 });
  }
}
