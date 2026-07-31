import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getDb } from "../../../db";
import { deliveryDueLines, deliveryImports, deliveryTagReceipts, deliveryTagScans } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";

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
    if (!hasPermission(user, "dashboard")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูข้อมูล Due" }, { status: 403 });
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
      arrangedQty: sql<number>`coalesce((
        select sum(picked_qty - dispatched_qty)
        from stock_picks
        where due_line_id = ${deliveryDueLines.id}
          and status in ('staged', 'partial')
      ), 0)`,
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
    if (!hasPermission(user, "scan")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์สแกนและตัดยอด" }, { status: 403 });
    if (user.role !== "admin" && user.role !== "inspector") {
      return Response.json({ error: "เฉพาะผู้ตรวจงานหรือ Admin เท่านั้นที่สแกน Tag ลูกค้าเพื่อขายออกได้" }, { status: 403 });
    }
    const payload = await request.json() as { rawPayload?: string };
    const tag = parseCustomerTag(payload.rawPayload ?? "");
    const db = getDb();
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
    if (currentQty + tag.qty > due.reqQty) {
      return Response.json({ error: `จำนวนใน Tag ทำให้เกิน Due: คงเหลือ ${Math.max(due.reqQty - currentQty, 0)} ชิ้น แต่ Tag มี ${tag.qty} ชิ้น` }, { status: 409 });
    }
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const staged = await DB.prepare(`
      SELECT p.id, p.stock_tag_id AS stockTagId, p.picked_qty AS pickedQty,
        p.dispatched_qty AS dispatchedQty, p.picked_by_name AS pickedByName,
        p.picked_at AS pickedAt, t.tag_id AS stockTagCode,
        t.material_code AS materialCode, t.job_no AS jobNo,
        t.production_date AS productionDate, t.received_at AS receivedAt
      FROM stock_picks p
      INNER JOIN stock_tags t ON t.id = p.stock_tag_id
      WHERE p.due_line_id = ?1 AND p.status IN ('staged', 'partial')
        AND p.picked_qty > p.dispatched_qty
      ORDER BY p.picked_at ASC, p.id ASC
    `).bind(due.id).all<{
      id: number; stockTagId: number; pickedQty: number; dispatchedQty: number;
      pickedByName: string; pickedAt: string; stockTagCode: string; materialCode: string;
      jobNo: string; productionDate: string; receivedAt: string | null;
    }>();
    let needed = tag.qty;
    const consumed: Array<(typeof staged.results)[number] & { qty: number }> = [];
    for (const pick of staged.results) {
      const available = Math.max(Number(pick.pickedQty) - Number(pick.dispatchedQty), 0);
      if (!available) continue;
      const qty = Math.min(available, needed);
      consumed.push({ ...pick, qty });
      needed -= qty;
      if (!needed) break;
    }
    if (needed > 0) {
      return Response.json({
        error: `งานที่ผู้จัดเตรียมไว้ไม่ครบ Tag ลูกค้า: ต้องการ ${tag.qty} ชิ้น แต่จัดรอไว้ ${tag.qty - needed} ชิ้น`,
      }, { status: 409 });
    }
    const scannedQty = currentQty + tag.qty;
    const status = scannedQty === due.reqQty ? "completed" : scannedQty > due.reqQty ? "over" : "partial";
    await DB.batch([
      ...consumed.map((item) => DB.prepare(`UPDATE stock_tags SET
        remaining_qty = remaining_qty - ?1,
        status = CASE WHEN remaining_qty - ?1 <= 0 THEN 'depleted' ELSE 'in_stock' END
        WHERE id = ?2 AND remaining_qty >= ?1`).bind(item.qty, item.stockTagId)),
      ...consumed.map((item) => DB.prepare(`UPDATE stock_picks SET
        dispatched_qty = dispatched_qty + ?1,
        status = CASE WHEN dispatched_qty + ?1 >= picked_qty THEN 'dispatched' ELSE 'partial' END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?2 AND picked_qty - dispatched_qty >= ?1`).bind(item.qty, item.id)),
      ...consumed.map((item) => DB.prepare(`INSERT INTO stock_dispatch_links
        (customer_tag_id, pick_id, due_line_id, stock_tag_id, qty,
         dispatched_by_name, dispatched_by_code, dispatched_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)`)
        .bind(tag.tagId, item.id, due.id, item.stockTagId, item.qty, user.displayName, user.employeeCode)),
      DB.prepare(`INSERT INTO delivery_tag_scans
        (due_line_id, tag_id, raw_payload, qty, unit, location, scanned_by_name, scanned_by_email, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)`)
        .bind(due.id, tag.tagId, tag.rawPayload, tag.qty, tag.unit, tag.location, user.displayName, user.email),
      DB.prepare("UPDATE delivery_due_lines SET status = ?1 WHERE id = ?2").bind(status, due.id),
    ]);
    return Response.json({
      action: "dispatched", tag,
      stockAllocations: consumed.map((item) => ({
        stockTagId: item.stockTagId, stockTagCode: item.stockTagCode, qty: item.qty,
        jobNo: item.jobNo, productionDate: item.productionDate, receivedAt: item.receivedAt,
        pickedByName: item.pickedByName, pickedAt: item.pickedAt,
      })),
      due: { ...due, status, scannedQty, remainingQty: Math.max(due.reqQty - scannedQty, 0), projectedQty: scannedQty, remainingAfter: Math.max(due.reqQty - scannedQty, 0), projectedStatus: status },
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตัดยอด Tag ไม่สำเร็จ" }, { status: 500 });
  }
}
