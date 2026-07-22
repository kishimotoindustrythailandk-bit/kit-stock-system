import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser } from "../../cloudflare-auth";
import { getDb } from "../../../db";
import { deliveryDueLines, deliveryImports, deliveryTagReceipts, deliveryTagScans } from "../../../db/schema";

function qrDate(value: string) {
  if (!/^\d{8}$/.test(value)) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function parseCustomerTag(raw: string) {
  const fields = raw.trim().split("|");
  if (fields.length < 23) throw new Error("QR Tag ไม่ใช่รูปแบบของลูกค้าที่ระบบรองรับ");
  const qty = Number(fields[6]);
  const seq = Number(fields[19]);
  const parsed = {
    rawPayload: raw.trim(),
    doNo: fields[0]?.trim().toUpperCase(),
    tagId: fields[22]?.trim(),
    qty,
    unit: fields[8]?.trim().toUpperCase() || "PC",
    materialCode: fields[10]?.trim().toUpperCase(),
    location: fields[13]?.trim().toUpperCase() || "",
    deliveryDate: qrDate(fields[15]?.trim()),
    line: fields[17]?.trim().toUpperCase() || "",
    shop: fields[18]?.trim().toUpperCase() || "",
    seq,
  };
  if (!parsed.doNo || !parsed.tagId || !parsed.materialCode || !parsed.deliveryDate || !Number.isInteger(qty) || qty <= 0 || !Number.isInteger(seq)) {
    throw new Error("ข้อมูลสำคัญใน QR Tag ไม่ครบ กรุณาตรวจสอบ Tag");
  }
  return parsed;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const db = getDb();
    const dues = await db.select({
      id: deliveryDueLines.id,
      importId: deliveryDueLines.importId,
      doNo: deliveryDueLines.doNo,
      seq: deliveryDueLines.seq,
      materialCode: deliveryDueLines.materialCode,
      materialDescription: deliveryDueLines.materialDescription,
      site: deliveryDueLines.site,
      fact: deliveryDueLines.fact,
      line: deliveryDueLines.line,
      shop: deliveryDueLines.shop,
      reqQty: deliveryDueLines.reqQty,
      deliveryDate: deliveryDueLines.deliveryDate,
      deliveryTime: deliveryDueLines.deliveryTime,
      status: deliveryDueLines.status,
      scannedQty: sql<number>`coalesce(sum(${deliveryTagScans.qty}), 0)`,
      tagCount: sql<number>`count(${deliveryTagScans.id})`,
    }).from(deliveryDueLines)
      .leftJoin(deliveryTagScans, eq(deliveryTagScans.dueLineId, deliveryDueLines.id))
      .groupBy(deliveryDueLines.id)
      .orderBy(deliveryDueLines.deliveryDate, deliveryDueLines.deliveryTime, deliveryDueLines.fact, deliveryDueLines.materialCode);

    const imports = await db.select().from(deliveryImports).orderBy(desc(deliveryImports.id)).limit(20);
    const scans = await db.select({
      id: deliveryTagScans.id,
      dueLineId: deliveryTagScans.dueLineId,
      tagId: deliveryTagScans.tagId,
      qty: deliveryTagScans.qty,
      unit: deliveryTagScans.unit,
      location: deliveryTagScans.location,
      scannedByName: deliveryTagScans.scannedByName,
      createdAt: deliveryTagScans.createdAt,
      materialCode: deliveryDueLines.materialCode,
      fact: deliveryDueLines.fact,
      deliveryDate: deliveryDueLines.deliveryDate,
      deliveryTime: deliveryDueLines.deliveryTime,
    }).from(deliveryTagScans)
      .innerJoin(deliveryDueLines, eq(deliveryTagScans.dueLineId, deliveryDueLines.id))
      .orderBy(desc(deliveryTagScans.id)).limit(100);
    const receipts = await db.select({
      id: deliveryTagReceipts.id, dueLineId: deliveryTagReceipts.dueLineId, tagId: deliveryTagReceipts.tagId,
      qty: deliveryTagReceipts.qty, unit: deliveryTagReceipts.unit, location: deliveryTagReceipts.location,
      receivedByName: deliveryTagReceipts.receivedByName, createdAt: deliveryTagReceipts.createdAt,
      materialCode: deliveryDueLines.materialCode, fact: deliveryDueLines.fact,
    }).from(deliveryTagReceipts)
      .innerJoin(deliveryDueLines, eq(deliveryTagReceipts.dueLineId, deliveryDueLines.id))
      .orderBy(desc(deliveryTagReceipts.id)).limit(100);
    return Response.json({ dues, imports, scans, receipts });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูล Due ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const payload = await request.json() as { rawPayload?: string; operation?: "receive" | "dispatch" };
    const tag = parseCustomerTag(payload.rawPayload ?? "");
    const db = getDb();
    const operation = user.role === "admin" ? (payload.operation || "dispatch") : user.role === "dispatcher" ? "receive" : user.role === "inspector" ? "dispatch" : "";
    if (!operation) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์สแกนรับเข้าหรือส่งออก" }, { status: 403 });
    const duplicate = await db.select({ id: deliveryTagScans.id }).from(deliveryTagScans)
      .where(eq(deliveryTagScans.tagId, tag.tagId)).limit(1);
    if (duplicate.length) return Response.json({ error: "Tag นี้ถูกผู้ตรวจสแกนส่งออกและตัดยอดแล้ว" }, { status: 409 });

    const matches = await db.select().from(deliveryDueLines).where(and(
      eq(deliveryDueLines.doNo, tag.doNo),
      eq(deliveryDueLines.materialCode, tag.materialCode),
      eq(deliveryDueLines.seq, tag.seq),
      eq(deliveryDueLines.deliveryDate, tag.deliveryDate),
      eq(deliveryDueLines.line, tag.line),
      eq(deliveryDueLines.shop, tag.shop),
    )).limit(2);
    if (!matches.length) {
      return Response.json({ error: `ไม่พบ Due ที่ตรงกับ ${tag.materialCode} / Seq ${tag.seq} / ${tag.deliveryDate}` }, { status: 404 });
    }
    if (matches.length > 1) {
      return Response.json({ error: "พบ Due ซ้ำมากกว่า 1 รายการ กรุณาให้ผู้ดูแลตรวจไฟล์นำเข้า" }, { status: 409 });
    }
    const due = matches[0];
    const [currentRow] = await db.select({ total: sql<number>`coalesce(sum(${deliveryTagScans.qty}), 0)` })
      .from(deliveryTagScans).where(eq(deliveryTagScans.dueLineId, due.id));
    const currentQty = Number(currentRow?.total ?? 0);
    if (operation === "receive") {
      const received = await db.select({ id: deliveryTagReceipts.id }).from(deliveryTagReceipts).where(eq(deliveryTagReceipts.tagId, tag.tagId)).limit(1);
      if (received.length) return Response.json({ error: "Tag นี้ถูกผู้จัดงานสแกนรับเข้าแล้ว" }, { status: 409 });
      const [receipt] = await db.insert(deliveryTagReceipts).values({
        dueLineId: due.id, tagId: tag.tagId, rawPayload: tag.rawPayload, qty: tag.qty, unit: tag.unit,
        location: tag.location, receivedByName: user.displayName, receivedByCode: user.employeeCode,
      }).returning();
      return Response.json({ action: "received", receipt, tag, due: { ...due, scannedQty: currentQty, remainingQty: Math.max(due.reqQty - currentQty, 0), projectedQty: currentQty, remainingAfter: Math.max(due.reqQty - currentQty, 0), projectedStatus: due.status } }, { status: 201 });
    }

    const [receipt] = await db.select().from(deliveryTagReceipts).where(eq(deliveryTagReceipts.tagId, tag.tagId)).limit(1);
    if (!receipt) return Response.json({ error: "ยังไม่พบการสแกนรับเข้าจากผู้จัดงาน กรุณารับเข้า Tag นี้ก่อน" }, { status: 409 });

    const [scan] = await db.insert(deliveryTagScans).values({
      dueLineId: due.id,
      tagId: tag.tagId,
      rawPayload: tag.rawPayload,
      qty: tag.qty,
      unit: tag.unit,
      location: tag.location,
      scannedByName: user.displayName,
      scannedByEmail: user.email,
    }).returning();
    const [sumRow] = await db.select({ total: sql<number>`coalesce(sum(${deliveryTagScans.qty}), 0)` })
      .from(deliveryTagScans).where(eq(deliveryTagScans.dueLineId, due.id));
    const scannedQty = Number(sumRow?.total ?? 0);
    const status = scannedQty === due.reqQty ? "completed" : scannedQty > due.reqQty ? "over" : "partial";
    await db.update(deliveryDueLines).set({ status }).where(eq(deliveryDueLines.id, due.id));
    return Response.json({ action: "dispatched", scan, tag, receipt, due: { ...due, status, scannedQty, remainingQty: Math.max(due.reqQty - scannedQty, 0), projectedQty: scannedQty, remainingAfter: Math.max(due.reqQty - scannedQty, 0), projectedStatus: status } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตัดยอด Tag ไม่สำเร็จ" }, { status: 500 });
  }
}
