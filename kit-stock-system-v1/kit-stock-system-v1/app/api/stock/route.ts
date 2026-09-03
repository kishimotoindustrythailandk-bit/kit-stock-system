import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getDb } from "../../../db";
import { stockAllocations, stockParts, stockTags } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function requireStockRole(role: string) {
  return role === "admin" || role === "dispatcher";
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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!["stock", "tags", "arrange", "dispatch", "reports", "history"].some((key) => hasPermission(user, key as "stock" | "tags" | "arrange" | "dispatch" | "reports" | "history"))) {
      return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูข้อมูล Stock" }, { status: 403 });
    }
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const partColumns = await DB.prepare("PRAGMA table_info(stock_parts)").all<{ name: string }>();
    if (!(partColumns.results || []).some((column) => column.name === "location")) {
      try {
        await DB.prepare("ALTER TABLE stock_parts ADD COLUMN location TEXT NOT NULL DEFAULT ''").run();
      } catch {
        const refreshedColumns = await DB.prepare("PRAGMA table_info(stock_parts)").all<{ name: string }>();
        if (!(refreshedColumns.results || []).some((column) => column.name === "location")) throw new Error("เพิ่มช่อง Location ในทะเบียน Part ไม่สำเร็จ");
      }
    }
    const partsResult = await DB.prepare(`
      SELECT material_code AS materialCode, part_name AS partName, customer, location,
        standard_qty AS standardQty, active, created_at AS createdAt, updated_at AS updatedAt
      FROM stock_parts ORDER BY material_code ASC
    `).all();
    const parts = partsResult.results;
    const db = getDb();
    const tags = await db.select({
      id: stockTags.id,
      tagId: stockTags.tagId,
      materialCode: stockTags.materialCode,
      partName: stockParts.partName,
      customer: stockParts.customer,
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
      createdAt: stockTags.createdAt,
    }).from(stockTags)
      .innerJoin(stockParts, eq(stockParts.materialCode, stockTags.materialCode))
      .leftJoin(stockAllocations, eq(stockAllocations.stockTagId, stockTags.id))
      .groupBy(stockTags.id)
      .orderBy(desc(stockTags.id)).limit(250);
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
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS stock_job_closures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_no TEXT NOT NULL,
        material_code TEXT NOT NULL,
        total_qty INTEGER NOT NULL,
        received_qty INTEGER NOT NULL,
        ng_qty INTEGER NOT NULL,
        ng_tag_count INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        closed_by_name TEXT NOT NULL,
        closed_by_code TEXT NOT NULL,
        closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const jobClosures = await DB.prepare(`
      SELECT id, job_no AS jobNo, material_code AS materialCode, total_qty AS totalQty,
        received_qty AS receivedQty, ng_qty AS ngQty, ng_tag_count AS ngTagCount,
        reason, closed_by_name AS closedByName, closed_by_code AS closedByCode,
        closed_at AS closedAt
      FROM stock_job_closures ORDER BY id DESC LIMIT 50
    `).all();
    return Response.json({ parts, tags, allocations, picks: picks.results, dispatchLinks: dispatchLinks.results, jobClosures: jobClosures.results });
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
    const partColumns = await runtimeDb.prepare("PRAGMA table_info(stock_parts)").all<{ name: string }>();
    if (!(partColumns.results || []).some((column) => column.name === "location")) {
      try {
        await runtimeDb.prepare("ALTER TABLE stock_parts ADD COLUMN location TEXT NOT NULL DEFAULT ''").run();
      } catch {
        const refreshedColumns = await runtimeDb.prepare("PRAGMA table_info(stock_parts)").all<{ name: string }>();
        if (!(refreshedColumns.results || []).some((column) => column.name === "location")) throw new Error("เพิ่มช่อง Location ในทะเบียน Part ไม่สำเร็จ");
      }
    }

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
      await runtimeDb.prepare(`
        INSERT INTO stock_parts (material_code, part_name, customer, location, standard_qty, active, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(material_code) DO UPDATE SET
          part_name = excluded.part_name, customer = excluded.customer, location = excluded.location,
          standard_qty = excluded.standard_qty, active = 1, updated_at = CURRENT_TIMESTAMP
      `).bind(materialCode, partName, customer, location, standardQty).run();
      return Response.json({ success: true, materialCode });
    }

    if (action === "import_parts") {
      if (user.role !== "admin" || !hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์นำเข้า Part" }, { status: 403 });
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
        ON CONFLICT(material_code) DO UPDATE SET
          part_name = excluded.part_name,
          customer = excluded.customer,
          location = excluded.location,
          standard_qty = excluded.standard_qty,
          active = 1,
          updated_at = CURRENT_TIMESTAMP
      `).bind(part.materialCode, part.partName, part.customer, part.location, part.standardQty));
      for (let index = 0; index < statements.length; index += 100) {
        await DB.batch(statements.slice(index, index + 100));
      }
      return Response.json({ success: true, imported: parts.length });
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
      return Response.json({ success: true, deleted: result.meta.changes });
    }

    if (action === "clear_test_stock") {
      if (user.role !== "admin" || !hasPermission(user, "stock")) {
        return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ล้างข้อมูล Stock" }, { status: 403 });
      }
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const results = await DB.batch([
        DB.prepare("DELETE FROM stock_dispatch_links"),
        DB.prepare("DELETE FROM stock_allocations"),
        DB.prepare("DELETE FROM stock_picks"),
        DB.prepare("DELETE FROM stock_tags"),
      ]);
      return Response.json({
        success: true,
        deleted: {
          dispatchLinks: results[0].meta.changes,
          allocations: results[1].meta.changes,
          picks: results[2].meta.changes,
          tags: results[3].meta.changes,
        },
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
      return Response.json({ success: true, deleted: 1, tagId: tag.tagId });
    }

    if (!requireStockRole(user.role)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการ Stock" }, { status: 403 });

    if (action === "create_tag") {
      if (!hasPermission(user, "tags")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์สร้างและพิมพ์ Tag" }, { status: 403 });
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const jobNo = clean(body.jobNo, 120).toUpperCase();
      const productionDate = clean(body.productionDate, 10);
      const totalQty = Number(body.qty);
      if (!materialCode || !jobNo || !/^\d{4}-\d{2}-\d{2}$/.test(productionDate) || !Number.isInteger(totalQty) || totalQty <= 0) {
        return Response.json({ error: "กรุณาระบุ Part, จำนวนงานรวม, Job และวันที่ผลิตให้ครบ" }, { status: 400 });
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
      const tags = [];
      for (let boxNo = 1; boxNo <= boxCount; boxNo += 1) {
        const boxQty = boxNo < boxCount ? packQty : totalQty - (packQty * (boxCount - 1));
        const tagId = createTagId(batchCode, boxNo, boxCount);
        const [tag] = await db.insert(stockTags).values({
          tagId, materialCode, qty: boxQty, remainingQty: boxQty, jobNo, productionDate,
          status: "printed", printedByName: user.displayName,
        }).returning();
        tags.push({
          ...tag,
          boxNo,
          boxCount,
          deliveryQty: totalQty,
          partName: part.partName,
          customer: part.customer,
          payload: `KITSTOCK|${tagId}|${materialCode}|${boxQty}|${jobNo}|${productionDate}`,
        });
      }
      return Response.json({
        tags,
        totalQty,
        packQty,
        boxCount,
      }, { status: 201 });
    }

    if (action === "close_job") {
      if (!hasPermission(user, "stock") || !requireStockRole(user.role)) {
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
      await DB.prepare(`
        CREATE TABLE IF NOT EXISTS stock_job_closures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_no TEXT NOT NULL,
          material_code TEXT NOT NULL,
          total_qty INTEGER NOT NULL,
          received_qty INTEGER NOT NULL,
          ng_qty INTEGER NOT NULL,
          ng_tag_count INTEGER NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          closed_by_name TEXT NOT NULL,
          closed_by_code TEXT NOT NULL,
          closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      const summary = await DB.prepare(`
        SELECT coalesce(sum(qty), 0) AS totalQty,
          coalesce(sum(CASE WHEN status IN ('in_stock', 'depleted') THEN qty ELSE 0 END), 0) AS receivedQty,
          coalesce(sum(CASE WHEN status = 'printed' THEN qty ELSE 0 END), 0) AS ngQty,
          coalesce(sum(CASE WHEN status = 'printed' THEN 1 ELSE 0 END), 0) AS ngTagCount
        FROM stock_tags WHERE job_no = ?1 AND material_code = ?2
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
      return Response.json({ success: true, reopenedTags: result.meta.changes });
    }

    if (action === "receive") {
      if (!hasPermission(user, "stock")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์รับงานเข้า Stock" }, { status: 403 });
      const tagId = parseInternalTag(clean(body.rawPayload, 1000));
      const [tag] = await db.select().from(stockTags).where(eq(stockTags.tagId, tagId)).limit(1);
      if (!tag) return Response.json({ error: "ไม่พบ Tag Stock นี้ในระบบ" }, { status: 404 });
      if (tag.status !== "printed") return Response.json({ error: tag.status === "ng" ? "Tag นี้ถูกปิดรับเข้าและตีเป็น NG แล้ว กรุณาให้ Admin เปิด Job คืนก่อน" : tag.status === "depleted" ? "Tag นี้ถูกขายออกหมดแล้ว" : "Tag นี้รับเข้า Stock แล้ว" }, { status: 409 });
      const [updated] = await db.update(stockTags).set({
        status: "in_stock", receivedByName: user.displayName, receivedByCode: user.employeeCode,
        receivedAt: sql`CURRENT_TIMESTAMP`,
      }).where(and(eq(stockTags.id, tag.id), eq(stockTags.status, "printed"))).returning();
      // ถ้ามีคนสแกน Tag ใบเดียวกันแซงไปเสี้ยววินาที เงื่อนไข status = 'printed'
      // จะไม่ตรงแล้ว returning() คืนอาเรย์ว่าง เดิมโค้ดยังตอบ 201 พร้อม tag: undefined
      // ทำให้หน้างานเห็นว่าสแกนสำเร็จ ทั้งที่ระบบไม่ได้บันทึกอะไรเลย
      if (!updated) {
        return Response.json({ error: "Tag นี้เพิ่งถูกสแกนรับเข้า Stock ไปแล้ว กรุณารีเฟรชหน้าจอ" }, { status: 409 });
      }
      return Response.json({ action: "received", tag: updated }, { status: 201 });
    }

    if (action === "stage") {
      if (!hasPermission(user, "arrange")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดงาน" }, { status: 403 });
      const dueLineId = Number(body.dueLineId);
      const tagId = parseInternalTag(clean(body.rawPayload, 1000));
      const requestedQty = Number(body.qty || 0);
      if (!Number.isInteger(dueLineId) || dueLineId <= 0 || !Number.isInteger(requestedQty) || requestedQty < 0) {
        return Response.json({ error: "กรุณาเลือก Due และระบุจำนวนให้ถูกต้อง" }, { status: 400 });
      }
      const { DB } = getRuntimeEnv();
      if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
      const due = await DB.prepare(`
        SELECT d.id, d.do_no AS doNo, d.seq, d.material_code AS materialCode,
          d.material_description AS materialDescription, d.fact, d.line, d.shop,
          d.req_qty AS reqQty, d.delivery_date AS deliveryDate, d.delivery_time AS deliveryTime,
          coalesce((SELECT sum(s.qty) FROM delivery_tag_scans s WHERE s.due_line_id = d.id), 0) AS scannedQty,
          coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
            WHERE p.due_line_id = d.id AND p.status IN ('staged', 'partial')), 0) AS arrangedQty
        FROM delivery_due_lines d WHERE d.id = ?1 LIMIT 1
      `).bind(dueLineId).first<{
        id: number; doNo: string; seq: number; materialCode: string; materialDescription: string;
        fact: string; line: string; shop: string; reqQty: number; deliveryDate: string;
        deliveryTime: string; scannedQty: number; arrangedQty: number;
      }>();
      if (!due) return Response.json({ error: "ไม่พบ Due ที่เลือก หรือข้อมูลถูกลบไปแล้ว" }, { status: 404 });
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
      if (tag.status !== "in_stock") {
        return Response.json({ error: tag.status === "printed" ? "Tag นี้ยังไม่ได้สแกนรับเข้า Stock" : "Tag นี้ขายออกหมดแล้ว" }, { status: 409 });
      }
      if (tag.materialCode !== due.materialCode) {
        return Response.json({ error: `Part ไม่ตรงกัน: Due ต้องการ ${due.materialCode} แต่ Tag Stock เป็น ${tag.materialCode}` }, { status: 409 });
      }
      const dueOpenQty = Math.max(Number(due.reqQty) - Number(due.scannedQty) - Number(due.arrangedQty), 0);
      const tagAvailableQty = Math.max(Number(tag.remainingQty) - Number(tag.stagedQty) - Number(tag.legacyReservedQty), 0);
      if (!dueOpenQty) return Response.json({ error: "Due นี้จัดงานครบแล้ว หรือส่งออกครบแล้ว" }, { status: 409 });
      if (!tagAvailableQty) return Response.json({ error: "Tag Stock นี้ไม่มีจำนวนพร้อมจัดเหลืออยู่" }, { status: 409 });
      const pickedQty = requestedQty > 0 ? requestedQty : Math.min(dueOpenQty, tagAvailableQty);
      if (pickedQty > dueOpenQty) return Response.json({ error: `จำนวนเกิน Due ที่ยังไม่ได้จัด เหลือจัดได้ ${dueOpenQty} ชิ้น` }, { status: 409 });
      if (pickedQty > tagAvailableQty) return Response.json({ error: `Tag Stock นี้พร้อมจัดเพียง ${tagAvailableQty} ชิ้น` }, { status: 409 });
      const result = await DB.prepare(`
        INSERT INTO stock_picks
          (due_line_id, stock_tag_id, picked_qty, dispatched_qty, status,
           picked_by_name, picked_by_code, picked_at, updated_at)
        VALUES (?1, ?2, ?3, 0, 'staged', ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(due.id, tag.id, pickedQty, user.displayName, user.employeeCode).run();
      return Response.json({
        action: "staged",
        pick: {
          id: result.meta.last_row_id, dueLineId: due.id, pickedQty, dispatchedQty: 0,
          status: "staged", pickedByName: user.displayName, stockTagCode: tag.tagId,
          materialCode: tag.materialCode, jobNo: tag.jobNo, productionDate: tag.productionDate,
          receivedAt: tag.receivedAt, doNo: due.doNo, fact: due.fact, line: due.line,
        },
        tag,
        due: {
          ...due,
          arrangedQty: Number(due.arrangedQty) + pickedQty,
          remainingToArrange: Math.max(dueOpenQty - pickedQty, 0),
          remainingQty: Math.max(Number(due.reqQty) - Number(due.scannedQty), 0),
        },
      }, { status: 201 });
    }

    return Response.json({ error: "ไม่รู้จักคำสั่ง Stock" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึก Stock ไม่สำเร็จ" }, { status: 500 });
  }
}
