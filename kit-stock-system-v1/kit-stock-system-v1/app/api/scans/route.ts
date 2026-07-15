import { eq, sql } from "drizzle-orm";
import { getEmployeeUser, hasRole } from "../../employee-auth";
import { getDb } from "../../../db";
import { boxScans, parts, workOrders } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function decodePhoto(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("ข้อมูลรูปภาพไม่ถูกต้อง");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { contentType: match[1], bytes };
}

export async function POST(request: Request) {
  let uploadedKey = "";
  try {
    const payload = await request.json() as {
      orderNo?: string;
      tagId?: string;
      boxType?: string;
      actualQty?: number;
      photoDataUrl?: string;
      photoName?: string;
    };
    const orderNo = payload.orderNo?.trim() ?? "";
    const tagId = payload.tagId?.trim().toUpperCase() ?? "";
    const boxType = payload.boxType?.trim() ?? "";
    const user = await getEmployeeUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasRole(user, ["inspector"])) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ตรวจงาน" }, { status: 403 });
    const inspectorName = user.fullName;
    const inspectorEmail = user.employeeCode;
    const requestedQty = Number(payload.actualQty);
    const photoDataUrl = payload.photoDataUrl ?? "";
    const photoName = payload.photoName?.trim() || "camera.jpg";
    const { BUCKET } = getRuntimeEnv();

    if (!orderNo || !tagId || !["full", "partial"].includes(boxType)) {
      return Response.json({ error: "กรุณาระบุใบงาน Tag และประเภทบ๊อคให้ครบ" }, { status: 400 });
    }
    if (!photoDataUrl.startsWith("data:image/")) {
      return Response.json({ error: "ต้องถ่ายรูปงานก่อนบันทึก" }, { status: 400 });
    }
    if (!BUCKET) {
      return Response.json({ error: "พื้นที่เก็บรูปยังไม่พร้อมใช้งาน" }, { status: 503 });
    }
    const decodedPhoto = decodePhoto(photoDataUrl);
    if (decodedPhoto.bytes.byteLength > MAX_PHOTO_BYTES) {
      return Response.json({ error: "รูปภาพต้องมีขนาดไม่เกิน 6 MB" }, { status: 400 });
    }

    const db = getDb();
    const [order] = await db
      .select({
        id: workOrders.id,
        targetQty: workOrders.targetQty,
        lotNo: workOrders.lotNo,
        partNo: parts.partNo,
        standardQty: parts.standardQty,
      })
      .from(workOrders)
      .innerJoin(parts, eq(workOrders.partId, parts.id))
      .where(eq(workOrders.orderNo, orderNo))
      .limit(1);

    if (!order) {
      return Response.json({ error: "ไม่พบใบงานนี้ในระบบ" }, { status: 404 });
    }

    const tagParts = tagId.split("|");
    if (tagParts.length < 3) {
      return Response.json({
        error: `รูปแบบ Tag ไม่ถูกต้อง ต้องเป็น ${order.partNo}|${order.lotNo}|BOX-XXXX`,
      }, { status: 422 });
    }
    if (tagParts[0] !== order.partNo || tagParts[1] !== order.lotNo) {
      return Response.json({
        error: `งานไม่ตรง Tag: ใบงานต้องเป็น ${order.partNo} / ${order.lotNo}`,
      }, { status: 422 });
    }

    const actualQty = boxType === "full" ? order.standardQty : requestedQty;
    if (!Number.isInteger(actualQty) || actualQty <= 0) {
      return Response.json({ error: "จำนวนจริงต้องเป็นจำนวนเต็มมากกว่า 0" }, { status: 400 });
    }
    if (boxType === "partial" && actualQty >= order.standardQty) {
      return Response.json({
        error: `บ๊อคเศษต้องน้อยกว่า ${order.standardQty} ชิ้น`,
      }, { status: 400 });
    }

    const duplicate = await db.select({ id: boxScans.id })
      .from(boxScans).where(eq(boxScans.tagId, tagId)).limit(1);
    if (duplicate.length) {
      return Response.json({ error: "Tag นี้ถูกสแกนและบันทึกแล้ว" }, { status: 409 });
    }

    const extension = decodedPhoto.contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    uploadedKey = `evidence/${safeKey(orderNo)}/${safeKey(tagParts[2])}-${crypto.randomUUID()}.${extension}`;
    await BUCKET.put(uploadedKey, decodedPhoto.bytes, {
      httpMetadata: { contentType: decodedPhoto.contentType },
      customMetadata: { orderNo, tagId, inspectorEmail, boxType },
    });

    const [scan] = await db.insert(boxScans).values({
      workOrderId: order.id,
      tagId,
      boxType,
      actualQty,
      photoKey: uploadedKey,
      photoName,
      photoType: decodedPhoto.contentType,
      inspectorName,
      inspectorEmail,
    }).returning();

    const [sumRow] = await db.select({
      total: sql<number>`coalesce(sum(${boxScans.actualQty}), 0)`,
    }).from(boxScans).where(eq(boxScans.workOrderId, order.id));
    const total = Number(sumRow?.total ?? 0);
    const status = total === order.targetQty ? "completed" : total > order.targetQty ? "over" : "in_progress";
    await db.update(workOrders).set({ status }).where(eq(workOrders.id, order.id));

    return Response.json({ scan, total, targetQty: order.targetQty, status }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      const bucket = getRuntimeEnv().BUCKET;
      if (bucket) await bucket.delete(uploadedKey).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกข้อมูลได้";
    return Response.json({ error: message }, { status: 500 });
  }
}
