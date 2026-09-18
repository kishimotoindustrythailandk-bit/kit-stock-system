import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getDb } from "../../../db";
import { stockAllocations, stockParts, stockTags } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";
import { writeAuditLog } from "../../audit-log";

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function parseInternalTag(raw: string) {
  const value = raw.trim();
  const fields = value.split("|");
  if (fields[0] === "KITSTOCK" && fields[1]) return fields[1].trim().toUpperCase();
  if (/^KITSTK-[A-Z0-9-]+$/i.test(value)) return value.toUpperCase();
  throw new Error("Tag นี้ไม่ใช่ Tag Stock ของ KIT");
}

function createTagBatchCode() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `KITSTK-${stamp}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function createTagId(batchCode: string, boxNo: number, boxCount: number) {
  const width = Math.max(2, String(boxCount).length);
  return `${batchCode}-B${String(boxNo).padStart(width, "0")}OF${String(boxCount).padStart(width, "0")}`;
}

async function findExistingStockJob(DB: D1Database, jobNo: string) {
  return DB.prepare(`
    SELECT tag_id AS tagId, material_code AS materialCode
    FROM stock_tags
    WHERE upper(trim(job_no)) = ?1
    ORDER BY id ASC LIMIT 1
  `).bind(jobNo.trim().toUpperCase()).first<{ tagId: string; materialCode: string }>();
}

/**
 * เดิมไฟล์นี้มี ensureStockManagementTables() ที่ยิง CREATE TABLE / CREATE INDEX
 * 6 คำสั่งผ่าน DB.batch() ทุกครั้งที่ GET หรือ POST เข้ามา บวกกับ CREATE TABLE
 * ของ stock_receipt_adjustments, stock_job_closures และ PRAGMA table_info +
 * ALTER TABLE ของ stock_parts.location อีกชุด
 *
 * ตารางทั้งหมดย้ายไปอยู่ใน migrations/0016, 0017 และ 0018 แล้ว
 * schema จึงมีแหล่งอ้างอิงเดียวคือ migrations/ + db/schema.ts และ request
 * ไม่ต้องจ่ายค่า DDL ทุกครั้งอีก
 *
 * ต้องรัน npm run db:migrate ให้ผ่านก่อน deploy รุ่นนี้ ไม่มีอะไรสร้างตารางให้
 * ตอน runtime อีกแล้ว
 */
function createAdjustmentNo(prefix = "ADJ") {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

async function getMaterialStockSnapshot(DB: D1Database, materialCode: string) {
  const result = await DB.prepare(`
    SELECT t.id, t.tag_id AS tagId, t.remaining_qty AS remainingQty,
      t.received_at AS receivedAt,
      coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
        WHERE p.stock_tag_id = t.id AND p.status IN ('staged', 'partial')), 0) AS stagedQty,
      coalesce((SELECT sum(a.qty) FROM stock_allocations a
        WHERE a.stock_tag_id = t.id AND a.status = 'reserved'), 0) AS legacyReservedQty
    FROM stock_tags t
    WHERE t.material_code = ?1 AND t.status IN ('in_stock', 'depleted')
    ORDER BY coalesce(t.received_at, t.created_at) ASC, t.id ASC
  `).bind(materialCode).all<{
    id: number; tagId: string; remainingQty: number; receivedAt: string | null;
    stagedQty: number; legacyReservedQty: number;
  }>();
  const tags = (result.results || []).map((tag) => ({
    ...tag,
    remainingQty: Number(tag.remainingQty || 0),
    stagedQty: Number(tag.stagedQty || 0),
    legacyReservedQty: Number(tag.legacyReservedQty || 0),
  }));
  const systemQty = tags.reduce((sum, tag) => sum + tag.remainingQty, 0);
  const reservedQty = tags.reduce((sum, tag) => sum + tag.stagedQty + tag.legacyReservedQty, 0);
  const reducibleQty = tags.reduce((sum, tag) => sum + Math.max(tag.remainingQty - tag.stagedQty - tag.legacyReservedQty, 0), 0);
  return { tags, systemQty, reservedQty, reducibleQty };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const fullStockPermissions = ["stock", "manual-stock", "stock-count", "tags", "arrange", "dispatch", "reports", "history"] as const;
    const canReadFullStock = fullStockPermissions.some((key) => hasPermission(user, key));
    const canReadPartsOnly = hasPermission(user, "parts") || hasPermission(user, "replacement");
    if (!canReadFullStock && !canReadPartsOnly) {
      return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูข้อมูล Stock" }, { status: 403 });
    }
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const partsResult = await DB.prepare(`
      SELECT material_code AS materialCode, part_name AS partName, customer, location,
        standard_qty AS standardQty, active, created_at AS createdAt, updated_at AS updatedAt
      FROM stock_parts ORDER BY material_code ASC
    `).all();
    const parts = partsResult.results;
    // หน้า Parts และ Replacement ใช้เฉพาะทะเบียน Part สำหรับแสดง/เลือกสินค้า
    // ไม่ส่ง Tag, allocation, traceability หรือข้อมูลตรวจนับ Stock หากไม่มีสิทธิ์งาน Stock ที่เกี่ยวข้อง
    if (!canReadFullStock) {
      return Response.json({
        parts, tags: [], allocations: [], picks: [], dispatchLinks: [], jobClosures: [],
        manualReceipts: [], countAdjustments: [], countAdjustmentLines: [],
      });
    }
    const db = getDb();
    const tags = await db.select({
      id: stockTags.id,
      tagId: stockTags.tagId,
      materialCode: stockTags.materialCode,
      partName: stockParts.partName,
      customer: stockParts.customer,
      location: stockParts.location,
      qty: stockTags.qty,
      remainingQty: stockTags.remainingQty,
      reservedQty: sql<number>`coalesce(sum(case when ${stockAllocations.status} = 'reserved' then ${stockAllocations.qty} else 0 end), 0)
        + coalesce((select sum(p.picked_qty - p.dispatched_qty) from stock_picks p
          where p.stock_tag_id = ${stockTags.id} and p.status in ('staged', 'partial')), 0)`,
      jobNo: stockTags.jobNo,
      productionDate: stockTags.productionDate,
      status: stockTags.status,
      printedByName: stockTags.printedByName,
      receivedByName: stockTags.receivedByName,
      receivedAt: stockTags.receivedAt,
      receivedQty: sql<number>`coalesce((select r.received_qty from stock_receipt_adjustments r where r.stock_tag_id = ${stockTags.id} order by r.id desc limit 1), case when ${stockTags.status} in ('in_stock', 'depleted') then ${stockTags.qty} else 0 end)`,
      ngQty: sql<number>`coalesce((select r.ng_qty from stock_receipt_adjustments r where r.stock_tag_id = ${stockTags.id} order by r.id desc limit 1), case when ${stockTags.status} = 'ng' then ${stockTags.qty} else 0 end)`,
      createdAt: stockTags.createdAt,
    }).from(stockTags)
      .innerJoin(stockParts, eq(stockParts.materialCode, stockTags.materialCode))
      .leftJoin(stockAllocations, eq(stockAllocations.stockTagId, stockTags.id))
      .groupBy(stockTags.id)
      // ต้องคืน Tag ครบทั้งหมด เพราะหน้า Stock และไฟล์ Excel ใช้ชุดข้อมูลนี้คำนวณยอดรวม
      // การจำกัด 250 แถวทำให้ยอดคงเหลือ ยอดจอง และยอดในพื้นที่ Stock ต่ำกว่าฐานข้อมูลจริง
      .orderBy(desc(stockTags.id));
    const allocations = await db.select({
      id: stockAllocations.id,
      customerTagId: stockAllocations.customerTagId,
      stockTagCode: stockTags.tagId,
      materialCode: stockTags.materialCode,
      qty: stockAllocations.qty,
      status: stockAllocations.status,
      reservedByName: stockAllocations.reservedByName,
      reservedAt: stockAllocations.reservedAt,
      dispatchedByName: stockAllocations.dispatchedByName,
      dispatchedAt: stockAllocations.dispatchedAt,
    }).from(stockAllocations)
      .innerJoin(stockTags, eq(stockTags.id, stockAllocations.stockTagId))
      .orderBy(desc(stockAllocations.id)).limit(100);
    const picks = DB ? await DB.prepare(`
      SELECT p.id, p.due_line_id AS dueLineId, p.picked_qty AS pickedQty,
        p.dispatched_qty AS dispatchedQty, p.status,
        p.picked_by_name AS pickedByName, p.picked_by_code AS pickedByCode,
        p.picked_at AS pickedAt, t.tag_id AS stockTagCode,
        t.material_code AS materialCode, t.job_no AS jobNo,
        t.production_date AS productionDate, t.received_at AS receivedAt,
        d.do_no AS doNo, d.seq, d.fact, d.line, d.shop,
        d.delivery_date AS deliveryDate, d.delivery_time AS deliveryTime
      FROM stock_picks p
      INNER JOIN stock_tags t ON t.id = p.stock_tag_id
      INNER JOIN delivery_due_lines d ON d.id = p.due_line_id
      ORDER BY p.id DESC LIMIT 150
    `).all() : { results: [] };
    const dispatchLinks = DB ? await DB.prepare(`
      SELECT l.id, l.customer_tag_id AS customerTagId, l.qty,
        l.dispatched_by_name AS dispatchedByName, l.dispatched_at AS dispatchedAt,
        p.picked_by_name AS pickedByName, p.picked_at AS pickedAt,
        t.tag_id AS stockTagCode, t.material_code AS materialCode,
        t.job_no AS jobNo, t.production_date AS productionDate,
        t.received_at AS receivedAt, d.do_no AS doNo, d.fact, d.line
      FROM stock_dispatch_links l
      INNER JOIN stock_picks p ON p.id = l.pick_id
      INNER JOIN stock_tags t ON t.id = l.stock_tag_id
      INNER JOIN delivery_due_lines d ON d.id = l.due_line_id
      ORDER BY l.id DESC LIMIT 150
    `).all() : { results: [] };
    const jobClosures = await DB.prepare(`
      SELECT id, job_no AS jobNo, material_code AS materialCode, total_qty AS totalQty,
        received_qty AS receivedQty, ng_qty AS ngQty, ng_tag_count AS ngTagCount,
        reason, closed_by_name AS closedByName, closed_by_code AS closedByCode,
        closed_at AS closedAt
      FROM stock_job_closures ORDER BY id DESC LIMIT 50
    `).all();
    let manualReceipts: { results: unknown[] };
    try {
      manualReceipts = await DB.prepare(`
        SELECT r.id, r.stock_tag_id AS stockTagId, r.tag_id AS tagId,
          r.material_code AS materialCode, coalesce(p.part_name, '') AS partName,
          r.qty, r.job_no AS jobNo, r.production_date AS productionDate,
          r.reference_no AS referenceNo, r.note,
          r.received_by_name AS receivedByName, r.received_by_code AS receivedByCode,
          r.received_at AS receivedAt,
          coalesce(tx.transaction_no, '') AS transactionNo,
          coalesce(tx.total_qty, r.qty) AS transactionTotalQty,
          coalesce(tx.pack_qty, r.qty) AS packQty,
          coalesce(tx.tag_count, 1) AS tagCount,
          coalesce(tx.duplicate_confirmed, 0) AS duplicateConfirmed
        FROM stock_manual_receipts r
        LEFT JOIN stock_parts p ON p.material_code = r.material_code
        LEFT JOIN stock_manual_receive_transactions tx ON tx.id = r.transaction_id
        ORDER BY r.id DESC LIMIT 200
      `).all();
    } catch {
      // During a rolling deploy, keep Stock readable until migration 0026 is applied.
      manualReceipts = await DB.prepare(`
        SELECT r.id, r.stock_tag_id AS stockTagId, r.tag_id AS tagId,
          r.material_code AS materialCode, coalesce(p.part_name, '') AS partName,
          r.qty, r.job_no AS jobNo, r.production_date AS productionDate,
          r.reference_no AS referenceNo, r.note,
          r.received_by_name AS receivedByName, r.received_by_code AS receivedByCode,
          r.received_at AS receivedAt, '' AS transactionNo,
          r.qty AS transactionTotalQty, r.qty AS packQty, 1 AS tagCount,
          0 AS duplicateConfirmed
        FROM stock_manual_receipts r
        LEFT JOIN stock_parts p ON p.material_code = r.material_code
        ORDER BY r.id DESC LIMIT 100
      `).all();
    }
    const countAdjustments = await DB.prepare(`
      SELECT a.id, a.adjustment_no AS adjustmentNo, a.count_date AS countDate,
        a.material_code AS materialCode, coalesce(p.part_name, '') AS partName,
        a.system_qty AS systemQty, a.counted_qty AS countedQty, a.difference,
        a.reason, a.adjusted_by_name AS adjustedByName,
        a.adjusted_by_code AS adjustedByCode, a.adjusted_at AS adjustedAt,
        coalesce((SELECT count(*) FROM stock_count_adjustment_lines l WHERE l.adjustment_id = a.id), 0) AS affectedTagCount
      FROM stock_count_adjustments a
      LEFT JOIN stock_parts p ON p.material_code = a.material_code
      ORDER BY a.id DESC LIMIT 100
    `).all();
    const countAdjustmentLines = await DB.prepare(`
      SELECT id, adjustment_id AS adjustmentId, stock_tag_id AS stockTagId,
        stock_tag_code AS stockTagCode, qty_change AS qtyChange,
        before_qty AS beforeQty, after_qty AS afterQty, created_at AS createdAt
      FROM stock_count_adjustment_lines ORDER BY id DESC LIMIT 400
    `).all();
    const movementDays = await DB.prepare(`
      WITH RECURSIVE days(offset, movementDate) AS (
        SELECT 6, date('now', '+7 hours', '-6 days')
        UNION ALL
        SELECT offset - 1, date(movementDate, '+1 day') FROM days WHERE offset > 0
      )
      SELECT movementDate AS date,
        coalesce((SELECT sum(r.received_qty) FROM stock_receipt_adjustments r
          WHERE date(datetime(r.received_at, '+7 hours')) = movementDate), 0) AS receivedQty,
        coalesce((SELECT sum(p.picked_qty) FROM stock_picks p
          WHERE date(datetime(p.picked_at, '+7 hours')) = movementDate), 0) AS arrangedQty,
        coalesce((SELECT sum(a.difference) FROM stock_count_adjustments a
          WHERE date(datetime(a.adjusted_at, '+7 hours')) = movementDate), 0) AS adjustedQty
      FROM days ORDER BY movementDate
    `).all();
    return Response.json({
      parts, tags, allocations, picks: picks.results, dispatchLinks: dispatchLinks.results,
      jobClosures: jobClosures.results, manualReceipts: manualReceipts.results,
      countAdjustments: countAdjustments.results, countAdjustmentLines: countAdjustmentLines.results,
      movementDays: movementDays.results,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูล Stock ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 30);
    const db = getDb();
    const { DB: runtimeDb } = getRuntimeEnv();
    if (!runtimeDb) throw new Error("ไม่พบการเชื่อมต่อ D1");

    if (action === "save_part") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์เพิ่มหรือแก้ไข Part" }, { status: 403 });
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const partName = clean(body.partName, 240);
      const customer = clean(body.customer, 160);
      const location = clean(body.location, 160);
      const standardQty = Number(body.standardQty || 0);
      if (!materialCode || !partName || !Number.isInteger(standardQty) || standardQty <= 0) {
        return Response.json({ error: "กรุณาระบุ Part No., ชื่อชิ้นงาน และจำนวนสูงสุดต่อกล่องอย่างน้อย 1 ชิ้น" }, { status: 400 });
      }
      const previousPart = await runtimeDb.prepare(`SELECT material_code AS materialCode, part_name AS partName, customer, location, standard_qty AS standardQty FROM stock_parts WHERE material_code = ?1 LIMIT 1`)
        .bind(materialCode).first();
      await runtimeDb.prepare(`
        INSERT INTO stock_parts (material_code, part_name, customer, location, standard_qty, active, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(material_code) DO UPDATE SET
          part_name = excluded.part_name, customer = excluded.customer, location = excluded.location,
          standard_qty = excluded.standard_qty, active = 1, updated_at = CURRENT_TIMESTAMP
      `).bind(materialCode, partName, customer, location, standardQty).run();
      await writeAuditLog(user, {
        module: "parts", moduleLabel: "ทะเบียน Part", action: previousPart ? "update_part" : "create_part",
        actionLabel: previousPart ? "แก้ไข Part" : "เพิ่ม Part", entityType: "stock_part", entityId: materialCode,
        summary: `${previousPart ? "แก้ไข" : "เพิ่ม"} Part ${materialCode} · ${partName}`,
        before: previousPart, after: { materialCode, partName, customer, location, standardQty },
      }, request);
      return Response.json({ success: true, materialCode });
    }

    if (action === "import_parts") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์นำเข้า Part" }, { status: 403 });
      if (body.importContract !== "preserve_existing_v1") {
        return Response.json({ error: "หน้าจอนำเข้า Part เป็นเวอร์ชันเก่า กรุณารีเฟรชหน้าแล้วลองใหม่" }, { status: 409 });
      }
      if (!Array.isArray(body.parts) || !body.parts.length || body.parts.length > 2000) {
        return Response.json({ error: "ไฟล์ต้องมีข้อมูล Part 1–2,000 รายการ" }, { status: 400 });
      }
      const unique = new Map<string, { materialCode: string; partName: string; customer: string; location: string; standardQty: number }>();
      for (const raw of body.parts) {
        const row = raw as Record<string, unknown>;
        const materialCode = clean(row.materialCode, 100).toUpperCase();
        const partName = clean(row.partName, 240);
        const customer = clean(row.customer, 160);
        const location = clean(row.location, 160);
        const standardQty = Number(row.standardQty || 0);
        if (!materialCode || !partName || !Number.isInteger(standardQty) || standardQty <= 0) continue;
        unique.set(materialCode, { materialCode, partName, customer, location, standardQty });
      }
      const parts = [...unique.values()];
      if (!parts.length) {
        return Response.json({ error: "ไม่พบ Part ที่มี Part No., Part Name และจำนวนสูงสุดต่อกล่องครบถ้วน" }, { status: 400 });
      }
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const statements = parts.map((part) => DB.prepare(`
        INSERT INTO stock_parts (material_code, part_name, customer, location, standard_qty, active, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(material_code) DO NOTHING
      `).bind(part.materialCode, part.partName, part.customer, part.location, part.standardQty));
      const insertedMaterialCodes: string[] = [];
      const skippedMaterialCodes: string[] = [];
      for (let index = 0; index < statements.length; index += 100) {
        const batchParts = parts.slice(index, index + 100);
        const results = await DB.batch(statements.slice(index, index + 100));
        results.forEach((result, batchIndex) => {
          const materialCode = batchParts[batchIndex]?.materialCode;
          if (!materialCode) return;
          if (Number(result.meta.changes || 0) > 0) insertedMaterialCodes.push(materialCode);
          else skippedMaterialCodes.push(materialCode);
        });
      }
      await writeAuditLog(user, {
        module: "parts", moduleLabel: "ทะเบียน Part", action: "import_parts", actionLabel: "นำเข้าไฟล์ Part",
        entityType: "stock_part_import", summary: `นำเข้า Part สำเร็จ ${insertedMaterialCodes.length} รายการ ข้ามรายการเดิม ${skippedMaterialCodes.length} รายการ`,
        details: { imported: insertedMaterialCodes.length, skipped: skippedMaterialCodes.length, insertedMaterialCodes, skippedMaterialCodes },
      }, request);
      return Response.json({
        success: true,
        importContract: "preserve_existing_v1",
        imported: insertedMaterialCodes.length,
        skipped: skippedMaterialCodes.length,
        skippedMaterialCodes,
      });
    }

    if (action === "sync_due_parts") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์นำ Part จาก Due เข้าทะเบียน" }, { status: 403 });
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const result = await DB.prepare(`
        INSERT INTO stock_parts (material_code, part_name, customer, standard_qty, active, created_at, updated_at)
        SELECT material_code, max(material_description), '', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM delivery_due_lines
        WHERE material_code <> ''
        GROUP BY material_code
        ON CONFLICT(material_code) DO UPDATE SET
          part_name = CASE WHEN excluded.part_name <> '' THEN excluded.part_name ELSE stock_parts.part_name END,
          active = 1,
          updated_at = CURRENT_TIMESTAMP
      `).run();
      await writeAuditLog(user, {
        module: "parts", moduleLabel: "ทะเบียน Part", action: "import_due_parts", actionLabel: "นำเข้า Part จาก Due",
        entityType: "stock_part", summary: `ซิงก์ทะเบียน Part จาก Due เปลี่ยนแปลง ${Number(result.meta.changes || 0)} รายการ`,
        details: { changed: Number(result.meta.changes || 0) },
      }, request);
      return Response.json({ success: true, changed: result.meta.changes });
    }

    if (action === "delete_part") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ลบ Part" }, { status: 403 });
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      if (!materialCode) return Response.json({ error: "กรุณาระบุ Part ที่ต้องการลบ" }, { status: 400 });
      const [tag] = await db.select({ id: stockTags.id }).from(stockTags)
        .where(eq(stockTags.materialCode, materialCode)).limit(1);
      if (tag) {
        return Response.json({
          error: "Part นี้มี Tag หรือประวัติ Stock แล้ว จึงลบไม่ได้ เพื่อรักษาข้อมูลย้อนหลัง",
        }, { status: 409 });
      }
      const deleted = await db.delete(stockParts).where(eq(stockParts.materialCode, materialCode)).returning();
      if (!deleted.length) return Response.json({ error: "ไม่พบ Part ที่ต้องการลบ" }, { status: 404 });
      await writeAuditLog(user, {
        module: "parts", moduleLabel: "ทะเบียน Part", action: "delete_part", actionLabel: "ลบ Part",
        entityType: "stock_part", entityId: materialCode, summary: `ลบ Part ${materialCode}`, before: deleted[0],
      }, request);
      return Response.json({ success: true, deleted: 1, materialCode });
    }

    if (action === "delete_unused_parts") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ลบ Part" }, { status: 403 });
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const result = await DB.prepare(`
        DELETE FROM stock_parts
        WHERE NOT EXISTS (
          SELECT 1 FROM stock_tags
          WHERE stock_tags.material_code = stock_parts.material_code
        )
      `).run();
      await writeAuditLog(user, {
        module: "parts", moduleLabel: "ทะเบียน Part", action: "delete_unused_parts", actionLabel: "ลบ Part ที่ไม่ได้ใช้งาน",
        entityType: "stock_part", summary: `ลบ Part ที่ไม่มี Tag ${Number(result.meta.changes || 0)} รายการ`, details: { deleted: Number(result.meta.changes || 0) },
      }, request);
      return Response.json({ success: true, deleted: result.meta.changes });
    }

    if (action === "clear_test_stock") {
      if (user.role !== "admin" || !hasPermission(user, "stock")) {
        return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ล้างข้อมูล Stock" }, { status: 403 });
      }
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const results = await DB.batch([
        DB.prepare("DELETE FROM stock_count_adjustment_lines"),
        DB.prepare("DELETE FROM stock_count_adjustments"),
        DB.prepare("DELETE FROM stock_manual_receipts"),
        DB.prepare("DELETE FROM stock_dispatch_links"),
        DB.prepare("DELETE FROM stock_allocations"),
        DB.prepare("DELETE FROM stock_picks"),
        DB.prepare("DELETE FROM stock_tags"),
      ]);
      const deletedCounts = {
        countAdjustmentLines: results[0].meta.changes, countAdjustments: results[1].meta.changes,
        manualReceipts: results[2].meta.changes, dispatchLinks: results[3].meta.changes,
        allocations: results[4].meta.changes, picks: results[5].meta.changes, tags: results[6].meta.changes,
      };
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "clear_test_stock", actionLabel: "ล้างข้อมูล Stock ทดลอง",
        entityType: "stock", summary: `ล้างข้อมูล Stock ทดลองทั้งหมด ${Object.values(deletedCounts).reduce((sum, value) => sum + Number(value || 0), 0)} รายการ`, details: deletedCounts,
      }, request);
      return Response.json({
        success: true,
        deleted: deletedCounts,
      });
    }

    if (action === "delete_tag") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ลบ Tag" }, { status: 403 });
      const tagId = clean(body.tagId, 120).toUpperCase();
      if (!tagId) return Response.json({ error: "กรุณาระบุ Tag ที่ต้องการลบ" }, { status: 400 });
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const tag = await DB.prepare(`
        SELECT id, tag_id AS tagId, status, received_at AS receivedAt
        FROM stock_tags WHERE tag_id = ?1 LIMIT 1
      `).bind(tagId).first<{ id: number; tagId: string; status: string; receivedAt: string | null }>();
      if (!tag) return Response.json({ error: "ไม่พบ Tag ที่ต้องการลบ" }, { status: 404 });
      if (tag.status !== "printed" || tag.receivedAt) {
        return Response.json({
          error: "Tag นี้รับเข้า Stock แล้ว จึงลบไม่ได้ เพื่อรักษาข้อมูลย้อนหลัง",
        }, { status: 409 });
      }
      const result = await DB.prepare(`
        DELETE FROM stock_tags
        WHERE id = ?1 AND status = 'printed' AND received_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM stock_allocations WHERE stock_tag_id = ?1)
          AND NOT EXISTS (SELECT 1 FROM stock_picks WHERE stock_tag_id = ?1)
          AND NOT EXISTS (SELECT 1 FROM stock_dispatch_links WHERE stock_tag_id = ?1)
      `).bind(tag.id).run();
      if (!result.meta.changes) {
        return Response.json({
          error: "Tag นี้มีประวัติรับเข้า จัดงาน หรือขายออกแล้ว จึงลบไม่ได้ เพื่อรักษาข้อมูลย้อนหลัง",
        }, { status: 409 });
      }
      await writeAuditLog(user, {
        module: "tags", moduleLabel: "พิมพ์ Tag", action: "delete_tag", actionLabel: "ลบ Tag",
        entityType: "stock_tag", entityId: tag.tagId, summary: `ลบ Tag ${tag.tagId} ที่ยังไม่รับเข้า Stock`, before: tag,
      }, request);
      return Response.json({ success: true, deleted: 1, tagId: tag.tagId });
    }

    if (action === "create_tag") {
      if (!hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์สร้างและพิมพ์ Tag" }, { status: 403 });
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const jobNo = clean(body.jobNo, 120).toUpperCase();
      const issueDate = new Date(Date.now() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
      const productionDate = issueDate;
      const totalQty = Number(body.qty);
      if (!materialCode || !jobNo || !Number.isInteger(totalQty) || totalQty <= 0) {
        return Response.json({ error: "กรุณาระบุ Part, จำนวนงานรวม และ Job ให้ครบ" }, { status: 400 });
      }
      const existingJob = await findExistingStockJob(runtimeDb, jobNo);
      if (existingJob) {
        return Response.json({
          error: `Job ${jobNo} ถูกใช้แล้วกับ Part ${existingJob.materialCode} (Tag ${existingJob.tagId}) ไม่สามารถสร้างซ้ำได้`,
        }, { status: 409 });
      }
      const [part] = await db.select().from(stockParts).where(and(eq(stockParts.materialCode, materialCode), eq(stockParts.active, true))).limit(1);
      if (!part) return Response.json({ error: "ยังไม่มี Part นี้ในทะเบียน Stock กรุณาให้ Admin เพิ่ม Part ก่อน" }, { status: 404 });
      const packQty = Number(part.standardQty);
      if (!Number.isInteger(packQty) || packQty <= 0) {
        return Response.json({
          error: `Part ${materialCode} ยังไม่ได้กำหนดจำนวนสูงสุดต่อกล่อง กรุณาให้ Admin แก้ไขข้อมูล Part ก่อน`,
        }, { status: 409 });
      }
      const boxCount = Math.ceil(totalQty / packQty);
      if (boxCount > 200) {
        return Response.json({
          error: `จำนวนนี้ต้องสร้าง ${boxCount} กล่อง เกินขีดจำกัด 200 กล่องต่อครั้ง กรุณาแบ่งสร้างเป็นหลายครั้ง`,
        }, { status: 400 });
      }
      const batchCode = createTagBatchCode();
      const tagDrafts = Array.from({ length: boxCount }, (_, index) => {
        const boxNo = index + 1;
        const boxQty = boxNo < boxCount ? packQty : totalQty - (packQty * (boxCount - 1));
        return { tagId: createTagId(batchCode, boxNo, boxCount), boxNo, qty: boxQty };
      });
      // สร้างทุก Tag ด้วย INSERT เดียวแบบ atomic: สำเร็จครบทั้ง Job หรือไม่สร้างเลย
      // WHERE NOT EXISTS ป้องกันสองเครื่องสร้าง Job เดียวกันพร้อมกันโดยไม่ต้องพึ่งผลตรวจล่วงหน้า
      const insertedResult = await runtimeDb.prepare(`
        INSERT INTO stock_tags
          (tag_id, material_code, qty, remaining_qty, job_no, production_date, status,
           printed_by_name, received_by_name, received_by_code, received_at, created_at)
        SELECT
          json_extract(value, '$.tagId'), ?2,
          cast(json_extract(value, '$.qty') AS INTEGER),
          cast(json_extract(value, '$.qty') AS INTEGER),
          ?3, ?4, 'printed', ?5, '', '', NULL, CURRENT_TIMESTAMP
        FROM json_each(?1)
        CROSS JOIN (
          SELECT count(*) AS existing_job_count
          FROM stock_tags WHERE upper(trim(job_no)) = ?3
        ) AS job_guard
        WHERE job_guard.existing_job_count = 0
      `).bind(JSON.stringify(tagDrafts), materialCode, jobNo, productionDate, user.displayName).run();
      if (Number(insertedResult.meta.changes || 0) !== boxCount) {
        return Response.json({
          error: `Job ${jobNo} มีอยู่ในระบบแล้ว หรือจำนวน Tag ที่สร้างไม่ครบ ระบบจึงยกเลิกทั้งรายการ กรุณาตรวจสอบ Job ก่อนบันทึก`,
        }, { status: 409 });
      }
      const inserted = await runtimeDb.prepare(`
        SELECT id, tag_id AS tagId, material_code AS materialCode, qty,
          remaining_qty AS remainingQty, job_no AS jobNo, production_date AS productionDate,
          status, printed_by_name AS printedByName, received_by_name AS receivedByName,
          received_at AS receivedAt, created_at AS createdAt
        FROM stock_tags WHERE tag_id LIKE ?1 ORDER BY id ASC
      `).bind(`${batchCode}-%`).all<{\n        id: number; tagId: string; materialCode: string; qty: number; remainingQty: number;\n        jobNo: string; productionDate: string; status: string; printedByName: string;\n        receivedByName: string; receivedAt: string | null; createdAt: string;\n      }>();
      const draftById = new Map(tagDrafts.map((item) => [item.tagId, item]));
      const tags = (inserted.results || []).map((tag) => {
        const draft = draftById.get(String(tag.tagId));
        const boxNo = draft?.boxNo || 0;
        const boxQty = Number(tag.qty || draft?.qty || 0);
        return {
          ...tag, boxNo, boxCount, deliveryQty: totalQty,
          partName: part.partName, customer: part.customer,
          payload: `KITSTOCK|${tag.tagId}|${materialCode}|${boxQty}|${jobNo}|${productionDate}`,
        };
      });
      if (tags.length !== boxCount) {
        throw new Error("สร้าง Tag สำเร็จในฐานข้อมูล แต่โหลดรายการกลับมาไม่ครบ กรุณารีเฟรชหน้าพิมพ์ Tag");
      }
      await writeAuditLog(user, {
        module: "tags", moduleLabel: "พิมพ์ Tag", action: "create_tags", actionLabel: "สร้างและพิมพ์ Tag",
        entityType: "stock_tag_batch", entityId: batchCode,
        summary: `สร้าง Tag ${boxCount} ใบ · Part ${materialCode} · Job ${jobNo} · รวม ${totalQty} ชิ้น`,
        details: { materialCode, jobNo, totalQty, packQty, boxCount, tagIds: tags.map((item) => item.tagId) },
      }, request);
      return Response.json({
        tags,
        totalQty,
        packQty,
        boxCount,
      }, { status: 201 });
    }

    if (action === "close_job") {
      if (!hasPermission(user, "stock")) {
        return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ปิดรับเข้า Job" }, { status: 403 });
      }
      const jobNo = clean(body.jobNo, 160);
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const reason = clean(body.reason, 300);
      if (!jobNo || !materialCode || !reason) {
        return Response.json({ error: "กรุณาระบุ Job, Part และสาเหตุที่ปิดรับเข้า" }, { status: 400 });
      }
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const summary = await DB.prepare(`
        SELECT coalesce(sum(st.qty), 0) AS totalQty,
          coalesce(sum(CASE WHEN st.status IN ('in_stock', 'depleted') THEN
            coalesce((
              SELECT r.received_qty FROM stock_receipt_adjustments r
              WHERE r.stock_tag_id = st.id ORDER BY r.id DESC LIMIT 1
            ), st.qty)
          ELSE 0 END), 0) AS receivedQty,
          coalesce(sum(CASE WHEN st.status = 'printed' THEN st.qty ELSE 0 END), 0) AS ngQty,
          coalesce(sum(CASE WHEN st.status = 'printed' THEN 1 ELSE 0 END), 0) AS ngTagCount
        FROM stock_tags st WHERE st.job_no = ?1 AND st.material_code = ?2
      `).bind(jobNo, materialCode).first<{ totalQty: number; receivedQty: number; ngQty: number; ngTagCount: number }>();
      if (!summary || Number(summary.ngQty) <= 0) {
        return Response.json({ error: "Job นี้ไม่มี Tag ที่รอรับเข้าให้ปิดเป็น NG" }, { status: 409 });
      }
      await DB.batch([
        DB.prepare(`UPDATE stock_tags SET status = 'ng' WHERE job_no = ?1 AND material_code = ?2 AND status = 'printed'`).bind(jobNo, materialCode),
        DB.prepare(`
          INSERT INTO stock_job_closures
            (job_no, material_code, total_qty, received_qty, ng_qty, ng_tag_count, reason, closed_by_name, closed_by_code)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        `).bind(jobNo, materialCode, Number(summary.totalQty), Number(summary.receivedQty), Number(summary.ngQty), Number(summary.ngTagCount), reason, user.displayName, user.employeeCode),
      ]);
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "close_job", actionLabel: "ปิดรับเข้า Job",
        entityType: "stock_job", entityId: `${jobNo}|${materialCode}`,
        summary: `ปิดรับเข้า Job ${jobNo} · ${materialCode} เป็น NG ${Number(summary.ngQty)} ชิ้น`,
        details: { jobNo, materialCode, reason, ...summary },
      }, request);
      return Response.json({ success: true, jobNo, materialCode, ...summary });
    }

    if (action === "reopen_ng_job") {
      if (user.role !== "admin" || !hasPermission(user, "stock")) {
        return Response.json({ error: "เฉพาะ Admin เท่านั้นที่เปิด Job คืนได้" }, { status: 403 });
      }
      const jobNo = clean(body.jobNo, 160);
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      if (!jobNo || !materialCode) return Response.json({ error: "กรุณาระบุ Job และ Part" }, { status: 400 });
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const result = await DB.prepare(`
        UPDATE stock_tags SET status = 'printed'
        WHERE job_no = ?1 AND material_code = ?2 AND status = 'ng'
      `).bind(jobNo, materialCode).run();
      if (!result.meta.changes) return Response.json({ error: "ไม่พบ Tag NG ของ Job นี้" }, { status: 404 });
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "reopen_job", actionLabel: "เปิด Job คืน",
        entityType: "stock_job", entityId: `${jobNo}|${materialCode}`,
        summary: `เปิด Job ${jobNo} · ${materialCode} คืน ${Number(result.meta.changes)} Tag`, details: { jobNo, materialCode, reopenedTags: Number(result.meta.changes) },
      }, request);
      return Response.json({ success: true, reopenedTags: result.meta.changes });
    }

    if (action === "receive") {
      if (!hasPermission(user, "stock")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์รับงานเข้า Stock" }, { status: 403 });
      const tagId = parseInternalTag(clean(body.rawPayload, 1000));
      const [tag] = await db.select().from(stockTags).where(eq(stockTags.tagId, tagId)).limit(1);
      if (!tag) return Response.json({ error: "ไม่พบ Tag Stock นี้ในระบบ" }, { status: 404 });
      if (tag.status !== "printed") return Response.json({ error: tag.status === "ng" ? "Tag นี้ถูกบันทึกเป็น NG แล้ว กรุณาให้ Admin ตรวจสอบ" : tag.status === "depleted" ? "Tag นี้ถูกขายออกหมดแล้ว" : "Tag นี้รับเข้า Stock แล้ว" }, { status: 409 });

      const part = await runtimeDb.prepare(`
        SELECT part_name AS partName, customer, location
        FROM stock_parts WHERE material_code = ?1 LIMIT 1
      `).bind(tag.materialCode).first<{ partName: string; customer: string; location: string }>();
      const image = await runtimeDb.prepare("SELECT 1 AS ok FROM part_master_images WHERE material_code = ?1 LIMIT 1")
        .bind(tag.materialCode).first<{ ok: number }>();

      if (clean(body.mode, 20) === "preview") {
        return Response.json({
          action: "receive_preview",
          rawPayload: clean(body.rawPayload, 1000),
          tag: { ...tag, partName: part?.partName || "", customer: part?.customer || "", location: part?.location || "" },
          master: { materialCode: tag.materialCode, partName: part?.partName || "", customer: part?.customer || "", hasImage: !!image },
        });
      }

      const receivedQty = body.receivedQty === undefined ? Number(tag.qty) : Number(body.receivedQty);
      const productionDate = clean(body.productionDate, 10)
        || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(productionDate)) {
        return Response.json({ error: "กรุณาระบุวันที่ผลิตให้ถูกต้อง" }, { status: 400 });
      }
      if (!Number.isInteger(receivedQty) || receivedQty < 0 || receivedQty > Number(tag.qty)) {
        return Response.json({ error: `จำนวนรับเข้าต้องอยู่ระหว่าง 0 ถึง ${tag.qty} ชิ้น` }, { status: 400 });
      }
      const ngQty = Number(tag.qty) - receivedQty;
      const nextStatus = receivedQty > 0 ? "in_stock" : "ng";
      const [updated] = await db.update(stockTags).set({
        status: nextStatus, remainingQty: receivedQty,
        receivedByName: user.displayName, receivedByCode: user.employeeCode,
        productionDate,
        receivedAt: sql`CURRENT_TIMESTAMP`,
      }).where(and(eq(stockTags.id, tag.id), eq(stockTags.status, "printed"))).returning();
      if (!updated) {
        return Response.json({ error: "Tag นี้เพิ่งถูกสแกนรับเข้า Stock ไปแล้ว กรุณารีเฟรชหน้าจอ" }, { status: 409 });
      }
      await runtimeDb.prepare(`
        INSERT INTO stock_receipt_adjustments
          (stock_tag_id, tag_id, original_qty, received_qty, ng_qty,
           received_by_name, received_by_code, received_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
      `).bind(tag.id, tag.tagId, tag.qty, receivedQty, ngQty, user.displayName, user.employeeCode).run();
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "receive_stock", actionLabel: "รับงานเข้า Stock",
        entityType: "stock_tag", entityId: tag.tagId,
        summary: `รับ Tag ${tag.tagId} · ${tag.materialCode} จำนวน ${receivedQty} ชิ้น${ngQty ? ` · NG ${ngQty} ชิ้น` : ""}`,
        details: { tagId: tag.tagId, materialCode: tag.materialCode, jobNo: tag.jobNo, productionDate, originalQty: tag.qty, receivedQty, ngQty },
      }, request);
      return Response.json({ action: "received", tag: { ...updated, partName: part?.partName || "", customer: part?.customer || "", receivedQty, ngQty }, receivedQty, ngQty }, { status: 201 });
    }


    if (action === "manual_receive") {
      if (!hasPermission(user, "manual-stock")) {
        return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์คีย์รับงานเข้า Stock" }, { status: 403 });
      }
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const qty = Number(body.qty || 0);
      const jobNo = clean(body.jobNo, 160).toUpperCase();
      const productionDate = clean(body.productionDate, 10);
      const referenceNo = clean(body.referenceNo, 160);
      const note = clean(body.note, 500);
      const confirmDuplicateJob = body.confirmDuplicateJob === true;
      if (!materialCode || !Number.isInteger(qty) || qty <= 0 || !jobNo || !/^\d{4}-\d{2}-\d{2}$/.test(productionDate)) {
        return Response.json({ error: "กรุณาเลือก Part ระบุจำนวน Job/เอกสารอ้างอิง และวันที่ผลิตให้ครบ" }, { status: 400 });
      }
      const part = await runtimeDb.prepare(`
        SELECT material_code AS materialCode, part_name AS partName, customer,
          standard_qty AS standardQty
        FROM stock_parts WHERE material_code = ?1 AND active = 1 LIMIT 1
      `).bind(materialCode).first<{ materialCode: string; partName: string; customer: string; standardQty: number }>();
      if (!part) return Response.json({ error: "ไม่พบ Part นี้ในทะเบียน หรือ Part ถูกยกเลิก" }, { status: 404 });
      const packQty = Number(part.standardQty || 0);
      if (!Number.isInteger(packQty) || packQty <= 0) {
        return Response.json({
          error: `Part ${materialCode} ยังไม่ได้กำหนดจำนวนบรรจุต่อกล่อง กรุณาตั้งค่าในทะเบียน Part ก่อน`,
        }, { status: 409 });
      }

      const conflictingPart = await runtimeDb.prepare(`
        SELECT material_code AS materialCode, tag_id AS tagId
        FROM stock_tags WHERE upper(job_no) = ?1 AND material_code <> ?2
        ORDER BY id DESC LIMIT 1
      `).bind(jobNo, materialCode).first<{ materialCode: string; tagId: string }>();
      if (conflictingPart) {
        return Response.json({
          code: "job_used_by_other_part",
          error: `Job ${jobNo} ถูกใช้กับ Part ${conflictingPart.materialCode} แล้ว กรุณาตรวจสอบ Part และ Job ก่อนรับเข้า`,
        }, { status: 409 });
      }
      const existing = await runtimeDb.prepare(`
        SELECT coalesce(sum(qty), 0) AS receivedQty, count(*) AS tagCount,
          max(received_at) AS lastReceivedAt
        FROM stock_manual_receipts
        WHERE material_code = ?1 AND upper(job_no) = ?2
      `).bind(materialCode, jobNo).first<{ receivedQty: number; tagCount: number; lastReceivedAt: string | null }>();
      const previousQty = Number(existing?.receivedQty || 0);
      const previousTagCount = Number(existing?.tagCount || 0);
      if (previousTagCount > 0 && !confirmDuplicateJob) {
        return Response.json({
          code: "duplicate_job_confirmation_required",
          error: `Job ${jobNo} ของ Part ${materialCode} เคยรับเข้าแล้ว กรุณายืนยันก่อนรับเพิ่ม`,
          duplicate: {
            materialCode, partName: part.partName, jobNo,
            previousQty, previousTagCount, incomingQty: qty,
            incomingTagCount: Math.ceil(qty / packQty),
            totalAfter: previousQty + qty,
            lastReceivedAt: existing?.lastReceivedAt || "",
          },
        }, { status: 409 });
      }

      const boxCount = Math.ceil(qty / packQty);
      if (boxCount > 200) {
        return Response.json({
          error: `จำนวน ${qty} ชิ้นต้องสร้าง ${boxCount} Tag เกินขีดจำกัด 200 Tag ต่อครั้ง กรุณาแบ่งรับเข้าเป็นหลายรายการ`,
        }, { status: 400 });
      }
      const tagQtys = Array.from({ length: boxCount }, (_, index) =>
        index < boxCount - 1 ? packQty : qty - (packQty * (boxCount - 1)),
      );
      if (tagQtys.some((item) => item <= 0) || tagQtys.reduce((sum, item) => sum + item, 0) !== qty) {
        return Response.json({ error: "ผลรวมจำนวนของ Tag ไม่ตรงกับจำนวนรับเข้า ระบบจึงยกเลิกรายการ" }, { status: 500 });
      }

      const batchCode = createTagBatchCode();
      const transactionNo = `RCV-${batchCode}`;
      const tagIds: string[] = [];
      const statements: D1PreparedStatement[] = [
        runtimeDb.prepare(`
          INSERT INTO stock_manual_receive_transactions
            (transaction_no, material_code, total_qty, pack_qty, tag_count, job_no,
             production_date, reference_no, note, duplicate_confirmed,
             received_by_name, received_by_code, received_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)
        `).bind(transactionNo, materialCode, qty, packQty, boxCount, jobNo,
          productionDate, referenceNo, note, previousTagCount > 0 ? 1 : 0,
          user.displayName, user.employeeCode),
      ];
      for (let boxNo = 1; boxNo <= boxCount; boxNo += 1) {
        const boxQty = tagQtys[boxNo - 1];
        const tagId = createTagId(batchCode, boxNo, boxCount);
        tagIds.push(tagId);
        statements.push(
          runtimeDb.prepare(`
            INSERT INTO stock_tags
              (tag_id, material_code, qty, remaining_qty, job_no, production_date, status,
               printed_by_name, received_by_name, received_by_code, received_at, created_at)
            VALUES (?1, ?2, ?3, ?3, ?4, ?5, 'in_stock', ?6, ?6, ?7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).bind(tagId, materialCode, boxQty, jobNo, productionDate, user.displayName, user.employeeCode),
          runtimeDb.prepare(`
            INSERT INTO stock_manual_receipts
              (stock_tag_id, tag_id, material_code, qty, job_no, production_date,
               reference_no, note, received_by_name, received_by_code, received_at, transaction_id)
            SELECT t.id, t.tag_id, t.material_code, t.qty, t.job_no, t.production_date,
              ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP, tx.id
            FROM stock_tags t
            INNER JOIN stock_manual_receive_transactions tx ON tx.transaction_no = ?6
            WHERE t.tag_id = ?1
          `).bind(tagId, referenceNo, note, user.displayName, user.employeeCode, transactionNo),
          runtimeDb.prepare(`
            INSERT INTO stock_receipt_adjustments
              (stock_tag_id, tag_id, original_qty, received_qty, ng_qty,
               received_by_name, received_by_code, received_at)
            SELECT id, tag_id, qty, qty, 0, ?2, ?3, CURRENT_TIMESTAMP
            FROM stock_tags WHERE tag_id = ?1
          `).bind(tagId, user.displayName, user.employeeCode),
        );
      }
      await runtimeDb.batch(statements);
      const inserted = await runtimeDb.prepare(`
        SELECT id, tag_id AS tagId, material_code AS materialCode, qty, remaining_qty AS remainingQty,
          job_no AS jobNo, production_date AS productionDate, status, printed_by_name AS printedByName,
          received_by_name AS receivedByName, received_at AS receivedAt, created_at AS createdAt
        FROM stock_tags WHERE tag_id LIKE ?1 ORDER BY id ASC
      `).bind(`${batchCode}-%`).all();
      if ((inserted.results || []).length !== boxCount) {
        return Response.json({ error: "จำนวน Tag ที่สร้างไม่ครบ กรุณาติดต่อผู้ดูแลระบบพร้อมเลขที่ " + transactionNo }, { status: 500 });
      }
      const tags = (inserted.results || []).map((tag) => ({
        ...tag, partName: part.partName, customer: part.customer, reservedQty: 0,
        receivedQty: Number(tag.qty), ngQty: 0,
      }));
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "manual_receive_stock", actionLabel: "คีย์รับงานเข้า Stock",
        entityType: "stock_receive_transaction", entityId: transactionNo,
        summary: `คีย์รับ ${materialCode} จำนวน ${qty} ชิ้น · ${boxCount} Tag · Job ${jobNo}${previousTagCount ? " · ยืนยัน Job ซ้ำ" : ""}`,
        details: { transactionNo, tagIds, materialCode, totalQty: qty, packQty, boxCount, jobNo, productionDate, referenceNo, note, duplicateConfirmed: previousTagCount > 0, previousQty },
      }, request);
      return Response.json({
        success: true, transactionNo, tag: tags[0], tags, totalQty: qty, packQty, boxCount,
        duplicateConfirmed: previousTagCount > 0,
      }, { status: 201 });
    }

    if (action === "preview_tag_count" || action === "confirm_tag_count") {
      if (!hasPermission(user, "stock-count")) {
        return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ตรวจนับและปรับยอด Stock" }, { status: 403 });
      }
      let tagId = "";
      try {
        tagId = parseInternalTag(clean(body.rawPayload, 1000));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Tag ไม่ถูกต้อง" }, { status: 400 });
      }
      const countDate = clean(body.countDate, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(countDate)) {
        return Response.json({ error: "กรุณาระบุวันที่ตรวจนับให้ถูกต้อง" }, { status: 400 });
      }
      const tag = await runtimeDb.prepare(`
        SELECT t.id, t.tag_id AS tagId, t.material_code AS materialCode,
          p.part_name AS partName, p.customer, t.job_no AS jobNo,
          t.production_date AS productionDate, t.status,
          t.remaining_qty AS remainingQty,
          coalesce((SELECT sum(sp.picked_qty - sp.dispatched_qty) FROM stock_picks sp
            WHERE sp.stock_tag_id = t.id AND sp.status IN ('staged', 'partial')), 0) AS stagedQty,
          coalesce((SELECT sum(sa.qty) FROM stock_allocations sa
            WHERE sa.stock_tag_id = t.id AND sa.status = 'reserved'), 0) AS legacyReservedQty
        FROM stock_tags t
        INNER JOIN stock_parts p ON p.material_code = t.material_code
        WHERE t.tag_id = ?1 LIMIT 1
      `).bind(tagId).first<{
        id: number; tagId: string; materialCode: string; partName: string; customer: string;
        jobNo: string; productionDate: string; status: string; remainingQty: number;
        stagedQty: number; legacyReservedQty: number;
      }>();
      if (!tag) return Response.json({ error: "ไม่พบ KIT Stock Tag นี้ในระบบ" }, { status: 404 });
      if (!['in_stock', 'depleted'].includes(tag.status)) {
        return Response.json({
          error: tag.status === "printed" ? "Tag นี้ยังไม่ได้รับเข้า Stock" : "Tag นี้ไม่อยู่ในสถานะที่ตรวจนับได้",
        }, { status: 409 });
      }
      const systemQty = Number(tag.remainingQty || 0);
      const reservedQty = Number(tag.stagedQty || 0) + Number(tag.legacyReservedQty || 0);
      const stockAreaSystemQty = Math.max(systemQty - reservedQty, 0);
      const hasCountedQty = body.countedQty !== undefined && body.countedQty !== "";
      // ผู้ตรวจนับกรอกเฉพาะของที่พบในพื้นที่ Stock งานที่จัด/จองถูกย้ายออกไปแล้ว
      // และระบบนำยอดนั้นกลับมารวมให้เอง ห้ามผู้ตรวจแก้ยอดจองจากหน้านี้
      const stockAreaCountedQty = hasCountedQty ? Number(body.countedQty) : stockAreaSystemQty;
      if (!Number.isInteger(stockAreaCountedQty) || stockAreaCountedQty < 0) {
        return Response.json({ error: "ยอดที่นับได้ในพื้นที่ Stock ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
      }
      const countedQty = stockAreaCountedQty + reservedQty;
      const totalRow = await runtimeDb.prepare(`
        SELECT coalesce(sum(remaining_qty), 0) AS totalQty
        FROM stock_tags WHERE material_code = ?1 AND status IN ('in_stock', 'depleted')
      `).bind(tag.materialCode).first<{ totalQty: number }>();
      const materialTotalQty = Number(totalRow?.totalQty || 0);
      const difference = countedQty - systemQty;
      const materialTotalAfter = materialTotalQty + difference;
      const preview = {
        action: "preview_tag_count" as const,
        tagId: tag.tagId, materialCode: tag.materialCode, partName: tag.partName,
        customer: tag.customer || "", jobNo: tag.jobNo, productionDate: tag.productionDate,
        status: tag.status, systemQty, countedQty: stockAreaCountedQty, difference, reservedQty,
        stockAreaSystemQty, stockAreaCountedQty, newTotalQty: countedQty,
        availableQty: stockAreaSystemQty, materialTotalQty,
        materialTotalAfter, countDate,
      };
      if (action === "preview_tag_count") return Response.json(preview);

      const reason = clean(body.reason, 500);
      if (!reason) return Response.json({ error: "กรุณาระบุสาเหตุการปรับยอด" }, { status: 400 });
      const adjustmentNo = createAdjustmentNo("TAGCOUNT");
      await runtimeDb.batch([
        runtimeDb.prepare(`
          INSERT INTO stock_count_adjustments
            (adjustment_no, count_date, material_code, system_qty, counted_qty,
             difference, reason, adjusted_by_name, adjusted_by_code, adjusted_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
        `).bind(adjustmentNo, countDate, tag.materialCode, systemQty, countedQty, difference, reason, user.displayName, user.employeeCode),
        runtimeDb.prepare(`
          UPDATE stock_tags
          SET remaining_qty = ?1,
            status = CASE WHEN ?1 = 0 THEN 'depleted' ELSE 'in_stock' END
          WHERE id = ?2
        `).bind(countedQty, tag.id),
        runtimeDb.prepare(`
          INSERT INTO stock_count_adjustment_lines
            (adjustment_id, stock_tag_id, stock_tag_code, qty_change, before_qty, after_qty, created_at)
          SELECT id, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP
          FROM stock_count_adjustments WHERE adjustment_no = ?1
        `).bind(adjustmentNo, tag.id, tag.tagId, difference, systemQty, countedQty),
      ]);
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "tag_stock_count_adjustment", actionLabel: "ตรวจนับและปรับยอด Tag",
        entityType: "stock_tag", entityId: tag.tagId,
        summary: `ตรวจนับ Tag ${tag.tagId} · พื้นที่ Stock ${stockAreaSystemQty} เป็น ${stockAreaCountedQty} ชิ้น · รวมงานจัด/จอง ${reservedQty} ชิ้น · ยอดรวมใหม่ ${countedQty} ชิ้น (${difference >= 0 ? "+" : ""}${difference})`,
        details: { adjustmentNo, tagId: tag.tagId, materialCode: tag.materialCode, jobNo: tag.jobNo, countDate, systemQty, stockAreaSystemQty, stockAreaCountedQty, reservedQty, newTotalQty: countedQty, difference, materialTotalQty, materialTotalAfter, reason },
        before: { tagId: tag.tagId, remainingQty: systemQty, stockAreaQty: stockAreaSystemQty, reservedQty, materialTotalQty },
        after: { tagId: tag.tagId, remainingQty: countedQty, stockAreaQty: stockAreaCountedQty, reservedQty, materialTotalQty: materialTotalAfter },
      }, request);
      return Response.json({
        ...preview, success: true, action: "tag_stock_count_adjusted", adjustmentNo, materialTotalAfter,
      }, { status: 201 });
    }

    if (action === "preview_stock_count" || action === "confirm_stock_count") {
      if (user.role !== "admin" || !hasPermission(user, "stock")) {
        return Response.json({ error: "เฉพาะผู้ดูแลระบบที่มีสิทธิ์ Stock เท่านั้นที่ปรับยอดตรวจนับได้" }, { status: 403 });
      }
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const countDate = clean(body.countDate, 10);
      const countedQty = Number(body.countedQty);
      const reason = clean(body.reason, 500);
      if (!materialCode || !/^\d{4}-\d{2}-\d{2}$/.test(countDate) || !Number.isInteger(countedQty) || countedQty < 0) {
        return Response.json({ error: "กรุณาเลือก Part วันที่ตรวจนับ และระบุยอดนับจริงเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" }, { status: 400 });
      }
      if (action === "confirm_stock_count" && !reason) {
        return Response.json({ error: "กรุณาระบุสาเหตุการปรับยอดเพื่อใช้ตรวจสอบย้อนหลัง" }, { status: 400 });
      }
      const part = await runtimeDb.prepare(`
        SELECT material_code AS materialCode, part_name AS partName
        FROM stock_parts WHERE material_code = ?1 AND active = 1 LIMIT 1
      `).bind(materialCode).first<{ materialCode: string; partName: string }>();
      if (!part) return Response.json({ error: "ไม่พบ Part นี้ในทะเบียน หรือ Part ถูกยกเลิก" }, { status: 404 });
      const snapshot = await getMaterialStockSnapshot(runtimeDb, materialCode);
      const difference = countedQty - snapshot.systemQty;
      if (difference < 0 && Math.abs(difference) > snapshot.reducibleQty) {
        return Response.json({
          error: `ไม่สามารถปรับเหลือ ${countedQty} ชิ้นได้ เพราะมีงานจัดรอขาย/จองอยู่ ${snapshot.reservedQty} ชิ้น กรุณายกเลิกหรือขายงานที่จัดไว้ก่อน`,
          systemQty: snapshot.systemQty, countedQty, difference,
          reservedQty: snapshot.reservedQty, reducibleQty: snapshot.reducibleQty,
        }, { status: 409 });
      }
      let remainingReduction = Math.max(-difference, 0);
      const deductionLines: Array<{ id: number; tagId: string; beforeQty: number; afterQty: number; qtyChange: number }> = [];
      for (const tag of snapshot.tags) {
        if (!remainingReduction) break;
        const canReduce = Math.max(tag.remainingQty - tag.stagedQty - tag.legacyReservedQty, 0);
        const reduceBy = Math.min(canReduce, remainingReduction);
        if (!reduceBy) continue;
        deductionLines.push({ id: tag.id, tagId: tag.tagId, beforeQty: tag.remainingQty, afterQty: tag.remainingQty - reduceBy, qtyChange: -reduceBy });
        remainingReduction -= reduceBy;
      }
      if (action === "preview_stock_count") {
        return Response.json({
          action: "preview_stock_count", materialCode, partName: part.partName,
          countDate, systemQty: snapshot.systemQty, countedQty, difference,
          reservedQty: snapshot.reservedQty, reducibleQty: snapshot.reducibleQty,
          affectedTagCount: difference > 0 ? 1 : deductionLines.length,
          affectedTags: deductionLines.slice(0, 20).map((line) => ({ stockTagCode: line.tagId, qtyChange: line.qtyChange, beforeQty: line.beforeQty, afterQty: line.afterQty })),
        });
      }
      const adjustmentNo = createAdjustmentNo();
      const statements: D1PreparedStatement[] = [
        runtimeDb.prepare(`
          INSERT INTO stock_count_adjustments
            (adjustment_no, count_date, material_code, system_qty, counted_qty,
             difference, reason, adjusted_by_name, adjusted_by_code, adjusted_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
        `).bind(adjustmentNo, countDate, materialCode, snapshot.systemQty, countedQty, difference, reason, user.displayName, user.employeeCode),
      ];
      let createdTagId = "";
      if (difference < 0) {
        for (const line of deductionLines) {
          statements.push(
            runtimeDb.prepare(`
              UPDATE stock_tags
              SET remaining_qty = ?1, status = CASE WHEN ?1 = 0 THEN 'depleted' ELSE 'in_stock' END
              WHERE id = ?2 AND remaining_qty = ?3
            `).bind(line.afterQty, line.id, line.beforeQty),
            runtimeDb.prepare(`
              INSERT INTO stock_count_adjustment_lines
                (adjustment_id, stock_tag_id, stock_tag_code, qty_change, before_qty, after_qty, created_at)
              SELECT id, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP
              FROM stock_count_adjustments WHERE adjustment_no = ?1
            `).bind(adjustmentNo, line.id, line.tagId, line.qtyChange, line.beforeQty, line.afterQty),
          );
        }
      } else if (difference > 0) {
        createdTagId = createTagId(createTagBatchCode(), 1, 1);
        statements.push(
          runtimeDb.prepare(`
            INSERT INTO stock_tags
              (tag_id, material_code, qty, remaining_qty, job_no, production_date, status,
               printed_by_name, received_by_name, received_by_code, received_at, created_at)
            VALUES (?1, ?2, ?3, ?3, ?4, ?5, 'in_stock', ?6, ?6, ?7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).bind(createdTagId, materialCode, difference, `STOCK-ADJUST-${countDate}`, countDate, user.displayName, user.employeeCode),
          runtimeDb.prepare(`
            INSERT INTO stock_count_adjustment_lines
              (adjustment_id, stock_tag_id, stock_tag_code, qty_change, before_qty, after_qty, created_at)
            SELECT a.id, t.id, t.tag_id, ?3, 0, ?3, CURRENT_TIMESTAMP
            FROM stock_count_adjustments a, stock_tags t
            WHERE a.adjustment_no = ?1 AND t.tag_id = ?2
          `).bind(adjustmentNo, createdTagId, difference),
          runtimeDb.prepare(`
            INSERT INTO stock_receipt_adjustments
              (stock_tag_id, tag_id, original_qty, received_qty, ng_qty,
               received_by_name, received_by_code, received_at)
            SELECT id, tag_id, ?2, ?2, 0, ?3, ?4, CURRENT_TIMESTAMP
            FROM stock_tags WHERE tag_id = ?1
          `).bind(createdTagId, difference, user.displayName, user.employeeCode),
        );
      }
      await runtimeDb.batch(statements);
      await writeAuditLog(user, {
        module: "stock", moduleLabel: "Stock", action: "stock_count_adjustment", actionLabel: "ปรับยอดตรวจนับ Stock",
        entityType: "stock_count_adjustment", entityId: adjustmentNo,
        summary: `ปรับยอด ${materialCode} จาก ${snapshot.systemQty} เป็น ${countedQty} ชิ้น (${difference >= 0 ? "+" : ""}${difference})`,
        details: { adjustmentNo, materialCode, countDate, systemQty: snapshot.systemQty, countedQty, difference, reason, affectedTagCount: difference > 0 ? 1 : deductionLines.length },
        before: { materialCode, qty: snapshot.systemQty }, after: { materialCode, qty: countedQty },
      }, request);
      return Response.json({
        success: true, action: "stock_count_adjusted", adjustmentNo,
        materialCode, partName: part.partName, countDate,
        systemQty: snapshot.systemQty, countedQty, difference,
        affectedTagCount: difference > 0 ? 1 : deductionLines.length,
        affectedTags: difference > 0
          ? [{ stockTagCode: createdTagId, qtyChange: difference, beforeQty: 0, afterQty: difference }]
          : deductionLines.map((line) => ({ stockTagCode: line.tagId, qtyChange: line.qtyChange, beforeQty: line.beforeQty, afterQty: line.afterQty })),
      }, { status: 201 });
    }

    if (action === "stage") {
      if (!hasPermission(user, "arrange")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดงาน" }, { status: 403 });
      const requestedDueLineId = Number(body.dueLineId || 0);
      const deliveryDate = clean(body.deliveryDate, 10);
      const tagId = parseInternalTag(clean(body.rawPayload, 1000));
      const requestedQty = Number(body.qty || 0);
      const hasLegacyDueId = Number.isInteger(requestedDueLineId) && requestedDueLineId > 0;
      if ((!hasLegacyDueId && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) || !Number.isInteger(requestedQty) || requestedQty < 0) {
        return Response.json({ error: "กรุณาเลือกวันที่ Due และระบุจำนวนให้ถูกต้อง" }, { status: 400 });
      }
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const tag = await DB.prepare(`
        SELECT t.id, t.tag_id AS tagId, t.material_code AS materialCode,
          t.qty, t.remaining_qty AS remainingQty, t.job_no AS jobNo,
          t.production_date AS productionDate, t.status,
          t.received_by_name AS receivedByName, t.received_at AS receivedAt,
          coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
            WHERE p.stock_tag_id = t.id AND p.status IN ('staged', 'partial')), 0) AS stagedQty,
          coalesce((SELECT sum(a.qty) FROM stock_allocations a
            WHERE a.stock_tag_id = t.id AND a.status = 'reserved'), 0) AS legacyReservedQty
        FROM stock_tags t WHERE t.tag_id = ?1 LIMIT 1
      `).bind(tagId).first<{
        id: number; tagId: string; materialCode: string; qty: number; remainingQty: number;
        jobNo: string; productionDate: string; status: string; receivedByName: string;
        receivedAt: string | null; stagedQty: number; legacyReservedQty: number;
      }>();
      if (!tag) return Response.json({ error: "ไม่พบ Tag Stock นี้ในระบบ" }, { status: 404 });
      if (tag.status !== "in_stock") return Response.json({ error: tag.status === "printed" ? "Tag นี้ยังไม่ได้สแกนรับเข้า Stock" : "Tag นี้ขายออกหมดแล้ว" }, { status: 409 });
      const dueSelect = `
        SELECT d.id, d.do_no AS doNo, d.seq, d.material_code AS materialCode,
          d.material_description AS materialDescription, d.fact, d.line, d.shop,
          d.req_qty AS reqQty, d.delivery_date AS deliveryDate, d.delivery_time AS deliveryTime,
          coalesce((SELECT sum(s.qty) FROM delivery_tag_scans s WHERE s.due_line_id = d.id), 0) AS scannedQty,
          coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
            WHERE p.due_line_id = d.id AND p.status IN ('staged', 'partial')), 0) AS arrangedQty
        FROM delivery_due_lines d
      `;
      type StageDue = {
        id: number; doNo: string; seq: number; materialCode: string; materialDescription: string;
        fact: string; line: string; shop: string; reqQty: number; deliveryDate: string;
        deliveryTime: string; scannedQty: number; arrangedQty: number;
      };
      const due = hasLegacyDueId
        ? await DB.prepare(dueSelect + " WHERE d.id = ?1 LIMIT 1").bind(requestedDueLineId).first<StageDue>()
        : await DB.prepare(dueSelect + `
          WHERE d.delivery_date = ?1 AND d.material_code = ?2
            AND d.req_qty > coalesce((SELECT sum(s.qty) FROM delivery_tag_scans s WHERE s.due_line_id = d.id), 0)
              + coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
                  WHERE p.due_line_id = d.id AND p.status IN ('staged', 'partial')), 0)
          ORDER BY d.delivery_time, d.id
          LIMIT 1
        `).bind(deliveryDate, tag.materialCode).first<StageDue>();
      if (!due) return Response.json({ error: hasLegacyDueId ? "ไม่พบ Due ที่เลือก หรือข้อมูลถูกลบไปแล้ว" : `ไม่พบ Due ของ Part ${tag.materialCode} ที่ยังจัดไม่ครบในวันที่ ${deliveryDate}` }, { status: 404 });
      if (tag.materialCode !== due.materialCode) return Response.json({ error: `Part ไม่ตรงกัน: Due ต้องการ ${due.materialCode} แต่ Tag Stock เป็น ${tag.materialCode}` }, { status: 409 });
      const dueOpenQty = Math.max(Number(due.reqQty) - Number(due.scannedQty) - Number(due.arrangedQty), 0);
      const tagAvailableQty = Math.max(Number(tag.remainingQty) - Number(tag.stagedQty) - Number(tag.legacyReservedQty), 0);
      if (!dueOpenQty) return Response.json({ error: "Due นี้จัดงานครบแล้ว หรือส่งออกครบแล้ว" }, { status: 409 });
      if (!tagAvailableQty) return Response.json({ error: "Tag Stock นี้ไม่มีจำนวนพร้อมจัดเหลืออยู่" }, { status: 409 });
      const pickedQty = requestedQty > 0 ? requestedQty : Math.min(dueOpenQty, tagAvailableQty);
      if (pickedQty > dueOpenQty) return Response.json({ error: `จำนวนเกิน Due ที่จับคู่อัตโนมัติ เหลือจัดได้ ${dueOpenQty} ชิ้น` }, { status: 409 });
      if (pickedQty > tagAvailableQty) return Response.json({ error: `Tag Stock นี้พร้อมจัดเพียง ${tagAvailableQty} ชิ้น` }, { status: 409 });
      const result = await DB.prepare(`
        INSERT INTO stock_picks
          (due_line_id, stock_tag_id, picked_qty, dispatched_qty, status,
           picked_by_name, picked_by_code, picked_at, updated_at)
        VALUES (?1, ?2, ?3, 0, 'staged', ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(due.id, tag.id, pickedQty, user.displayName, user.employeeCode).run();
      await writeAuditLog(user, {
        module: "arrange", moduleLabel: "จัดงาน", action: "stage_stock", actionLabel: "จัดงานเข้า Due",
        entityType: "stock_pick", entityId: Number(result.meta.last_row_id || 0),
        summary: `จัด Tag ${tag.tagId} · ${tag.materialCode} จำนวน ${pickedQty} ชิ้น เข้า Due ${due.deliveryDate}`,
        details: { stockTagCode: tag.tagId, materialCode: tag.materialCode, jobNo: tag.jobNo, dueLineId: due.id, deliveryDate: due.deliveryDate, pickedQty },
      }, request);
      return Response.json({
        action: "staged",
        pick: { id: result.meta.last_row_id, dueLineId: due.id, pickedQty, dispatchedQty: 0,
          status: "staged", pickedByName: user.displayName, stockTagCode: tag.tagId,
          materialCode: tag.materialCode, jobNo: tag.jobNo, productionDate: tag.productionDate,
          receivedAt: tag.receivedAt, doNo: due.doNo, fact: due.fact, line: due.line },
        tag,
        due: { ...due, arrangedQty: Number(due.arrangedQty) + pickedQty,
          remainingToArrange: Math.max(dueOpenQty - pickedQty, 0),
          remainingQty: Math.max(Number(due.reqQty) - Number(due.scannedQty), 0) },
      }, { status: 201 });
    }

    return Response.json({ error: "ไม่รู้จักคำสั่ง Stock" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึก Stock ไม่สำเร็จ" }, { status: 500 });
  }
}
