import { eq } from "drizzle-orm";
import { getCurrentUser } from "../../cloudflare-auth";
import { getDb } from "../../../db";
import { deliveryImports } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";

type ImportRow = {
  sourceKey?: string;
  doNo?: string;
  seq?: number;
  materialCode?: string;
  materialDescription?: string;
  site?: string;
  fact?: string;
  line?: string;
  shop?: string;
  reqQty?: number;
  deliveryDate?: string;
  deliveryTime?: string;
};

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

const JSON_IMPORT_CHUNK_SIZE = 250;

async function insertDueRows(importId: number, rows: Required<ImportRow>[]) {
  const { DB } = getRuntimeEnv();
  if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");

  const sql = `
    INSERT INTO delivery_due_lines (
      import_id, source_key, do_no, seq, material_code, material_description,
      site, fact, line, shop, req_qty, delivery_date, delivery_time, status, created_at
    )
    SELECT
      ?1,
      json_extract(value, '$.sourceKey'),
      json_extract(value, '$.doNo'),
      CAST(json_extract(value, '$.seq') AS INTEGER),
      json_extract(value, '$.materialCode'),
      json_extract(value, '$.materialDescription'),
      json_extract(value, '$.site'),
      json_extract(value, '$.fact'),
      json_extract(value, '$.line'),
      json_extract(value, '$.shop'),
      CAST(json_extract(value, '$.reqQty') AS INTEGER),
      json_extract(value, '$.deliveryDate'),
      json_extract(value, '$.deliveryTime'),
      'pending',
      CURRENT_TIMESTAMP
    FROM json_each(?2)
  `;

  for (let offset = 0; offset < rows.length; offset += JSON_IMPORT_CHUNK_SIZE) {
    await DB.prepare(sql)
      .bind(importId, JSON.stringify(rows.slice(offset, offset + JSON_IMPORT_CHUNK_SIZE)))
      .run();
  }
}

export async function POST(request: Request) {
  let importId = 0;
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const payload = await request.json() as {
      importToken?: string;
      fileName?: string;
      rows?: ImportRow[];
    };
    const importToken = clean(payload.importToken, 240);
    const fileName = clean(payload.fileName, 200);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!importToken || !fileName || !rows.length) {
      return Response.json({ error: "ไม่พบข้อมูล Due ที่จะนำเข้า" }, { status: 400 });
    }
    if (rows.length > 2500) {
      return Response.json({ error: "ไฟล์มีรายการมากเกิน 2,500 รายการ" }, { status: 400 });
    }

    const normalized = rows.map((row, index) => {
      const seq = Number(row.seq);
      const reqQty = Number(row.reqQty);
      const item = {
        sourceKey: clean(row.sourceKey, 500),
        doNo: clean(row.doNo, 100).toUpperCase(),
        seq,
        materialCode: clean(row.materialCode, 100).toUpperCase(),
        materialDescription: clean(row.materialDescription, 240),
        site: clean(row.site, 60).toUpperCase(),
        fact: clean(row.fact, 60).toUpperCase(),
        line: clean(row.line, 80).toUpperCase(),
        shop: clean(row.shop, 120).toUpperCase(),
        reqQty,
        deliveryDate: clean(row.deliveryDate, 10),
        deliveryTime: clean(row.deliveryTime, 30),
      };
      if (!item.sourceKey || !item.doNo || !item.materialCode || !item.fact || !item.deliveryDate || !item.deliveryTime || !Number.isInteger(seq) || !Number.isInteger(reqQty) || reqQty <= 0) {
        throw new Error(`ข้อมูลแถวที่ ${index + 1} ไม่ครบหรือจำนวนไม่ถูกต้อง`);
      }
      return item;
    });

    const db = getDb();
    const duplicate = await db.select({ id: deliveryImports.id }).from(deliveryImports)
      .where(eq(deliveryImports.importToken, importToken)).limit(1);
    if (duplicate.length) {
      return Response.json({ error: "ไฟล์นี้ถูกนำเข้าแล้ว ระบบจึงไม่บันทึกซ้ำ" }, { status: 409 });
    }

    const totalQty = normalized.reduce((sum, row) => sum + row.reqQty, 0);
    const [created] = await db.insert(deliveryImports).values({
      importToken,
      fileName,
      rowCount: normalized.length,
      totalQty,
      importedByName: user.displayName,
      importedByEmail: user.email,
    }).returning();
    importId = created.id;

    await insertDueRows(importId, normalized);

    return Response.json({ importId, rowCount: normalized.length, totalQty }, { status: 201 });
  } catch (error) {
    if (importId) {
      await getDb().delete(deliveryImports).where(eq(deliveryImports.id, importId)).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "นำเข้าไฟล์ไม่สำเร็จ";
    const duplicate = /unique|constraint/i.test(message);
    return Response.json({
      error: duplicate ? "มีรายการ Due นี้อยู่ในระบบแล้ว กรุณาตรวจสอบไฟล์ที่เคยนำเข้า" : message,
    }, { status: duplicate ? 409 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "เฉพาะ Admin เท่านั้นที่ลบข้อมูลนำเข้าได้" }, { status: 403 });
    const body = await request.json() as { id?: number; confirmActivity?: boolean };
    const importId = Number(body.id);
    if (!Number.isInteger(importId) || importId <= 0) return Response.json({ error: "ไม่พบชุดข้อมูลนำเข้า" }, { status: 400 });
    const { DB } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1" }, { status: 500 });
    const target = await DB.prepare(`
      SELECT id, file_name AS fileName, row_count AS rowCount, total_qty AS totalQty
      FROM delivery_imports WHERE id = ?1 LIMIT 1
    `).bind(importId).first<{ id: number; fileName: string; rowCount: number; totalQty: number }>();
    if (!target) return Response.json({ error: "ไม่พบชุดข้อมูลนี้ หรืออาจถูกลบไปแล้ว" }, { status: 404 });
    const activity = await DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM delivery_tag_scans s INNER JOIN delivery_due_lines d ON d.id = s.due_line_id WHERE d.import_id = ?1) AS scanCount,
        (SELECT COUNT(*) FROM delivery_tag_receipts r INNER JOIN delivery_due_lines d ON d.id = r.due_line_id WHERE d.import_id = ?1) AS receiptCount,
        ((SELECT COUNT(*) FROM stock_allocations a INNER JOIN delivery_due_lines d ON d.id = a.due_line_id WHERE d.import_id = ?1)
          + (SELECT COUNT(*) FROM stock_picks p INNER JOIN delivery_due_lines d ON d.id = p.due_line_id WHERE d.import_id = ?1)) AS stockCount
    `).bind(importId).first<{ scanCount: number; receiptCount: number; stockCount: number }>();
    const scanCount = Number(activity?.scanCount || 0);
    const receiptCount = Number(activity?.receiptCount || 0);
    const stockCount = Number(activity?.stockCount || 0);
    if ((scanCount > 0 || receiptCount > 0 || stockCount > 0) && !body.confirmActivity) {
      return Response.json({
        error: "ชุดข้อมูลนี้มีประวัติการสแกน กรุณายืนยันการลบอีกครั้ง",
        requiresConfirmation: true, scanCount, receiptCount, stockCount,
      }, { status: 409 });
    }
    const restored = await DB.prepare(`
      SELECT stockTagId, sum(qty) AS qty FROM (
        SELECT a.stock_tag_id AS stockTagId, a.qty AS qty
        FROM stock_allocations a
        INNER JOIN delivery_due_lines d ON d.id = a.due_line_id
        WHERE d.import_id = ?1 AND a.status = 'dispatched'
        UNION ALL
        SELECT l.stock_tag_id AS stockTagId, l.qty AS qty
        FROM stock_dispatch_links l
        INNER JOIN delivery_due_lines d ON d.id = l.due_line_id
        WHERE d.import_id = ?1
      ) GROUP BY stockTagId
    `).bind(importId).all<{ stockTagId: number; qty: number }>();
    await DB.batch([
      ...restored.results.map((row) => DB.prepare(`
        UPDATE stock_tags SET remaining_qty = remaining_qty + ?1, status = 'in_stock' WHERE id = ?2
      `).bind(Number(row.qty), row.stockTagId)),
      DB.prepare("DELETE FROM stock_dispatch_links WHERE due_line_id IN (SELECT id FROM delivery_due_lines WHERE import_id = ?1)").bind(importId),
      DB.prepare("DELETE FROM stock_picks WHERE due_line_id IN (SELECT id FROM delivery_due_lines WHERE import_id = ?1)").bind(importId),
      DB.prepare("DELETE FROM stock_allocations WHERE due_line_id IN (SELECT id FROM delivery_due_lines WHERE import_id = ?1)").bind(importId),
      DB.prepare("DELETE FROM delivery_tag_scans WHERE due_line_id IN (SELECT id FROM delivery_due_lines WHERE import_id = ?1)").bind(importId),
      DB.prepare("DELETE FROM delivery_tag_receipts WHERE due_line_id IN (SELECT id FROM delivery_due_lines WHERE import_id = ?1)").bind(importId),
      DB.prepare("DELETE FROM delivery_due_lines WHERE import_id = ?1").bind(importId),
      DB.prepare("DELETE FROM delivery_imports WHERE id = ?1").bind(importId),
    ]);
    return Response.json({ success: true, deleted: target, scanCount, receiptCount, stockCount });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ลบข้อมูลนำเข้าไม่สำเร็จ" }, { status: 500 });
  }
}
