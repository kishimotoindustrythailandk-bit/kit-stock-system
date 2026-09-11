import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";

type ForecastRow = {
  sourceKey: string;
  materialCode: string;
  description: string;
  deliveryDate: string;
  deliveryTime: string;
  prodQty: number;
  deliverySpot?: string;
  factory?: string;
  shop?: string;
  line?: string;
};

type ImportRecord = {
  id: number;
  importToken: string;
  fileName: string;
  sourceCalculatedAt: string;
  rowCount: number;
  materialCount: number;
  totalQty: number;
  status: string;
  importedByName: string;
  importedByCode: string;
  createdAt: string;
  activatedAt: string | null;
};

type LineRecord = {
  materialCode: string;
  description: string;
  deliveryDate: string;
  deliveryTime: string;
  prodQty: number;
};

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function integer(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value: string) {
  return /^\d{2}:\d{2}:\d{2}$/.test(value);
}

function toSqliteUtc(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function bangkokNowKey() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function mapImport(row: Record<string, unknown>): ImportRecord {
  return {
    id: Number(row.id),
    importToken: String(row.importToken ?? ""),
    fileName: String(row.fileName ?? ""),
    sourceCalculatedAt: String(row.sourceCalculatedAt ?? ""),
    rowCount: Number(row.rowCount ?? 0),
    materialCount: Number(row.materialCount ?? 0),
    totalQty: Number(row.totalQty ?? 0),
    status: String(row.status ?? ""),
    importedByName: String(row.importedByName ?? ""),
    importedByCode: String(row.importedByCode ?? ""),
    createdAt: String(row.createdAt ?? ""),
    activatedAt: row.activatedAt ? String(row.activatedAt) : null,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "forecast")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดู Forecast Stock" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1" }, { status: 500 });

    const [activeRow, historyResult] = await Promise.all([
      DB.prepare(`
        SELECT id, import_token AS importToken, file_name AS fileName,
          source_calculated_at AS sourceCalculatedAt, row_count AS rowCount,
          material_count AS materialCount, total_qty AS totalQty, status,
          imported_by_name AS importedByName, imported_by_code AS importedByCode,
          created_at AS createdAt, activated_at AS activatedAt
        FROM forecast_imports WHERE status = 'active'
        ORDER BY activated_at DESC, id DESC LIMIT 1
      `).first<Record<string, unknown>>(),
      DB.prepare(`
        SELECT id, import_token AS importToken, file_name AS fileName,
          source_calculated_at AS sourceCalculatedAt, row_count AS rowCount,
          material_count AS materialCount, total_qty AS totalQty, status,
          imported_by_name AS importedByName, imported_by_code AS importedByCode,
          created_at AS createdAt, activated_at AS activatedAt
        FROM forecast_imports WHERE status IN ('active', 'archived')
        ORDER BY created_at DESC LIMIT 20
      `).all<Record<string, unknown>>(),
    ]);

    const imports = (historyResult.results || []).map(mapImport);
    if (!activeRow) return Response.json({ activeImport: null, imports, coverage: [], summary: null });
    const activeImport = mapImport(activeRow);

    const [lineResult, stockResult, dispatchResult] = await Promise.all([
      DB.prepare(`
        SELECT material_code AS materialCode, description, delivery_date AS deliveryDate,
          delivery_time AS deliveryTime, SUM(prod_qty) AS prodQty
        FROM forecast_lines WHERE import_id = ?1
        GROUP BY material_code, description, delivery_date, delivery_time
        ORDER BY material_code, delivery_date, delivery_time
      `).bind(activeImport.id).all<LineRecord>(),
      DB.prepare(`
        SELECT material_code AS materialCode, SUM(remaining_qty) AS stockQty
        FROM stock_tags
        WHERE status IN ('in_stock', 'depleted') AND remaining_qty > 0
        GROUP BY material_code
      `).all<{ materialCode: string; stockQty: number }>(),
      DB.prepare(`
        SELECT due.material_code AS materialCode, SUM(scan.qty) AS dispatchedQty
        FROM delivery_tag_scans scan
        INNER JOIN delivery_due_lines due ON due.id = scan.due_line_id
        WHERE datetime(scan.created_at) > datetime(?1)
        GROUP BY due.material_code
      `).bind(activeImport.sourceCalculatedAt).all<{ materialCode: string; dispatchedQty: number }>(),
    ]);

    const stockRows = (stockResult.results || []) as Array<{ materialCode: string; stockQty: number }>;
    const dispatchRows = (dispatchResult.results || []) as Array<{ materialCode: string; dispatchedQty: number }>;
    const lineRows = (lineResult.results || []) as LineRecord[];
    const stockByMaterial = new Map<string, number>(stockRows.map((row) => [row.materialCode, Number(row.stockQty || 0)]));
    const dispatchedByMaterial = new Map<string, number>(dispatchRows.map((row) => [row.materialCode, Number(row.dispatchedQty || 0)]));
    const grouped = new Map<string, LineRecord[]>();
    for (const row of lineRows) {
      const rows = grouped.get(row.materialCode) || [];
      rows.push({ ...row, prodQty: Number(row.prodQty || 0) });
      grouped.set(row.materialCode, rows);
    }

    const nowKey = bangkokNowKey();
    const coverage = [...grouped.entries()].map(([materialCode, rows]) => {
      const stockQty = stockByMaterial.get(materialCode) || 0;
      const dispatchedAfterImport = dispatchedByMaterial.get(materialCode) || 0;
      let dispatchToApply = dispatchedAfterImport;
      let stockToApply = stockQty;
      let outstandingQty = 0;
      let overdueQty = 0;
      let totalShortage = 0;
      let coveredThroughDate = "";
      let coveredThroughTime = "";
      let shortageDate = "";
      let shortageTime = "";
      let firstShortageQty = 0;

      for (const row of rows) {
        const original = Math.max(0, Number(row.prodQty || 0));
        const dispatched = Math.min(original, dispatchToApply);
        dispatchToApply -= dispatched;
        const remainingDemand = original - dispatched;
        outstandingQty += remainingDemand;
        if (`${row.deliveryDate}T${row.deliveryTime}` < nowKey) overdueQty += remainingDemand;
        if (remainingDemand === 0) {
          if (!shortageDate) {
            coveredThroughDate = row.deliveryDate;
            coveredThroughTime = row.deliveryTime;
          }
          continue;
        }
        const covered = Math.min(remainingDemand, stockToApply);
        stockToApply -= covered;
        if (covered === remainingDemand && !shortageDate) {
          coveredThroughDate = row.deliveryDate;
          coveredThroughTime = row.deliveryTime;
        } else {
          const shortage = remainingDemand - covered;
          totalShortage += shortage;
          if (!shortageDate) {
            shortageDate = row.deliveryDate;
            shortageTime = row.deliveryTime;
            firstShortageQty = shortage;
          }
        }
      }

      return {
        materialCode,
        description: rows.find((row) => row.description)?.description || "",
        stockQty,
        forecastQty: rows.reduce((sum, row) => sum + Number(row.prodQty || 0), 0),
        dispatchedAfterImport,
        outstandingQty,
        overdueQty,
        coveredThroughDate,
        coveredThroughTime,
        shortageDate,
        shortageTime,
        firstShortageQty,
        totalShortage,
        remainingStockAfterForecast: stockToApply,
        status: totalShortage > 0 ? (stockQty > 0 ? "shortage" : "no_stock") : "covered",
      };
    }).sort((left, right) =>
      Number(right.overdueQty > 0) - Number(left.overdueQty > 0)
      || Number(right.totalShortage > 0) - Number(left.totalShortage > 0)
      || left.materialCode.localeCompare(right.materialCode)
    );

    const summary = coverage.reduce((total, row) => {
      total.materialCount += 1;
      total.stockQty += row.stockQty;
      total.outstandingQty += row.outstandingQty;
      total.overdueQty += row.overdueQty;
      total.totalShortage += row.totalShortage;
      if (row.status === "covered") total.coveredMaterials += 1;
      else total.shortageMaterials += 1;
      return total;
    }, { materialCount: 0, stockQty: 0, outstandingQty: 0, overdueQty: 0, totalShortage: 0, coveredMaterials: 0, shortageMaterials: 0 });

    return Response.json({ activeImport, imports, coverage, summary });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "โหลด Forecast ไม่สำเร็จ";
    const migrationHint = /no such table/i.test(message) ? " กรุณารัน migration 0019 ก่อนใช้งาน" : "";
    return Response.json({ error: `${message}${migrationHint}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (user.role !== "admin" || !hasPermission(user, "forecast")) {
      return Response.json({ error: "เฉพาะ Admin ที่มีสิทธิ์ Forecast เท่านั้นที่นำเข้าไฟล์ได้" }, { status: 403 });
    }
    const { DB } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1" }, { status: 500 });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 40);

    if (action === "begin_import") {
      const importToken = clean(body.importToken, 220);
      const fileName = clean(body.fileName, 220);
      const sourceCalculatedAt = toSqliteUtc(body.sourceCalculatedAt);
      if (!importToken || !fileName || !sourceCalculatedAt) return Response.json({ error: "ข้อมูลไฟล์ Forecast ไม่ครบ" }, { status: 400 });
      const existing = await DB.prepare("SELECT id, status FROM forecast_imports WHERE import_token = ?1 LIMIT 1").bind(importToken).first<{ id: number; status: string }>();
      if (existing) return Response.json({ error: existing.status === "uploading" ? "ไฟล์นี้กำลังถูกนำเข้าอยู่ กรุณาลองใหม่" : "ไฟล์ Forecast นี้เคยนำเข้าแล้ว" }, { status: 409 });
      const result = await DB.prepare(`
        INSERT INTO forecast_imports
          (import_token, file_name, source_calculated_at, status, imported_by_name, imported_by_code)
        VALUES (?1, ?2, ?3, 'uploading', ?4, ?5)
      `).bind(importToken, fileName, sourceCalculatedAt, user.displayName, user.employeeCode).run();
      return Response.json({ importId: Number(result.meta.last_row_id) });
    }

    const importId = integer(body.importId);
    if (!importId) return Response.json({ error: "ไม่พบเลขที่การนำเข้า Forecast" }, { status: 400 });
    const pending = await DB.prepare("SELECT id FROM forecast_imports WHERE id = ?1 AND status = 'uploading' LIMIT 1").bind(importId).first();
    if (!pending) return Response.json({ error: "รายการนำเข้านี้ไม่พร้อมรับข้อมูล" }, { status: 409 });

    if (action === "append_rows") {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 100) as ForecastRow[] : [];
      if (!rows.length) return Response.json({ error: "ไม่พบข้อมูล Forecast ในชุดนี้" }, { status: 400 });
      const statements = rows.map((raw) => {
        const row = {
          sourceKey: clean(raw.sourceKey, 300),
          materialCode: clean(raw.materialCode, 100).toUpperCase(),
          description: clean(raw.description, 300),
          deliveryDate: clean(raw.deliveryDate, 10),
          deliveryTime: clean(raw.deliveryTime, 8),
          prodQty: integer(raw.prodQty),
          deliverySpot: clean(raw.deliverySpot, 100),
          factory: clean(raw.factory, 100),
          shop: clean(raw.shop, 100),
          line: clean(raw.line, 100),
        };
        if (!row.sourceKey || !row.materialCode || !validDate(row.deliveryDate) || !validTime(row.deliveryTime) || row.prodQty <= 0) {
          throw new Error(`ข้อมูล Forecast ไม่ถูกต้อง: ${row.materialCode || "ไม่ระบุ Material"} ${row.deliveryDate} ${row.deliveryTime}`);
        }
        return DB.prepare(`
          INSERT INTO forecast_lines
            (import_id, source_key, material_code, description, delivery_date, delivery_time,
             prod_qty, delivery_spot, factory, shop, line)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        `).bind(importId, row.sourceKey, row.materialCode, row.description, row.deliveryDate, row.deliveryTime,
          row.prodQty, row.deliverySpot, row.factory, row.shop, row.line);
      });
      await DB.batch(statements);
      return Response.json({ inserted: rows.length });
    }

    if (action === "finalize_import") {
      const counts = await DB.prepare(`
        SELECT COUNT(*) AS rowCount, COUNT(DISTINCT material_code) AS materialCount,
          COALESCE(SUM(prod_qty), 0) AS totalQty
        FROM forecast_lines WHERE import_id = ?1
      `).bind(importId).first<{ rowCount: number; materialCount: number; totalQty: number }>();
      if (!counts || Number(counts.rowCount) === 0) return Response.json({ error: "ไฟล์ Forecast ไม่มีรายการที่นำเข้าได้" }, { status: 400 });
      await DB.batch([
        DB.prepare("UPDATE forecast_imports SET status = 'archived' WHERE status = 'active'"),
        DB.prepare(`
          UPDATE forecast_imports SET status = 'active', row_count = ?2, material_count = ?3,
            total_qty = ?4, activated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND status = 'uploading'
        `).bind(importId, Number(counts.rowCount), Number(counts.materialCount), Number(counts.totalQty)),
      ]);
      return Response.json({ success: true, rowCount: Number(counts.rowCount), materialCount: Number(counts.materialCount), totalQty: Number(counts.totalQty) });
    }

    if (action === "cancel_import") {
      await DB.prepare("DELETE FROM forecast_imports WHERE id = ?1 AND status = 'uploading'").bind(importId).run();
      return Response.json({ success: true });
    }

    return Response.json({ error: "ไม่รู้จักคำสั่ง Forecast" }, { status: 400 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "นำเข้า Forecast ไม่สำเร็จ";
    const migrationHint = /no such table/i.test(message) ? " กรุณารัน migration 0019 ก่อนใช้งาน" : "";
    return Response.json({ error: `${message}${migrationHint}` }, { status: 500 });
  }
}
