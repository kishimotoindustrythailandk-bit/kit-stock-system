import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";

function bangkokDate() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : bangkokDate();
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "dashboard")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูหน้าหลัก" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const selectedDate = validDate(new URL(request.url).searchParams.get("date"));
    const nowKey = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);

    type DashboardDue = {
      id: number; materialCode: string; partName: string; fact: string;
      deliveryDate: string; deliveryTime: string; reqQty: number; sentQty: number; arrangedQty: number;
    };
    const [dueResult, stockResult, processResult, facResult, forecastResult, activityResult] = await Promise.all([
      DB.prepare(`
        SELECT d.id, d.material_code AS materialCode, d.material_description AS partName,
          d.fact, d.delivery_date AS deliveryDate, d.delivery_time AS deliveryTime,
          d.req_qty AS reqQty,
          coalesce((SELECT sum(s.qty) FROM delivery_tag_scans s WHERE s.due_line_id = d.id), 0) AS sentQty,
          coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
            WHERE p.due_line_id = d.id AND p.status IN ('staged','partial')), 0) AS arrangedQty
        FROM delivery_due_lines d
        WHERE d.delivery_date = ?1
        ORDER BY d.delivery_time, d.id
      `).bind(selectedDate).all<DashboardDue>(),
      DB.prepare(`
        WITH tag_balance AS (
          SELECT t.id, t.status, t.qty, t.remaining_qty AS remainingQty,
            coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p
              WHERE p.stock_tag_id = t.id AND p.status IN ('staged','partial')), 0) AS stagedQty,
            coalesce((SELECT sum(a.qty) FROM stock_allocations a
              WHERE a.stock_tag_id = t.id AND a.status = 'reserved'), 0) AS reservedQty
          FROM stock_tags t
        )
        SELECT
          coalesce(sum(CASE WHEN status IN ('in_stock','depleted')
            THEN max(remainingQty - stagedQty - reservedQty, 0) ELSE 0 END), 0) AS availableQty,
          coalesce(sum(CASE WHEN status IN ('in_stock','depleted') THEN stagedQty + reservedQty ELSE 0 END), 0) AS arrangedQty,
          coalesce((SELECT sum(requested_qty - issued_qty) FROM replacement_requests
            WHERE status IN ('pending','partial')), 0) AS replacementQty,
          coalesce(sum(CASE WHEN status = 'ng' OR remainingQty < 0 OR remainingQty > qty THEN 1 ELSE 0 END), 0) AS anomalyCount
        FROM tag_balance
      `).all(),
      DB.prepare(`
        SELECT
          coalesce((SELECT sum(req_qty) FROM delivery_due_lines WHERE delivery_date = ?1), 0) AS planQty,
          coalesce((SELECT sum(qty) FROM stock_tags), 0) AS tagQty,
          coalesce((SELECT sum(received_qty) FROM (
            SELECT stock_tag_id, max(id) AS latestId FROM stock_receipt_adjustments GROUP BY stock_tag_id
          ) latest INNER JOIN stock_receipt_adjustments r ON r.id = latest.latestId), 0) AS receivedQty,
          coalesce((SELECT sum(picked_qty - dispatched_qty) FROM stock_picks WHERE status IN ('staged','partial')), 0) AS arrangedQty,
          coalesce((SELECT sum(qty) FROM stock_dispatch_links), 0) AS checkedQty,
          coalesce((SELECT sum(qty) FROM delivery_tag_scans), 0) AS exportedQty
      `).bind(selectedDate).all(),
      DB.prepare(`
        SELECT d.fact,
          count(*) AS dueTotal,
          sum(CASE WHEN coalesce(s.sentQty, 0) >= d.req_qty THEN 1 ELSE 0 END) AS completed,
          sum(CASE WHEN coalesce(s.sentQty, 0) < d.req_qty THEN 1 ELSE 0 END) AS pending,
          sum(CASE WHEN coalesce(s.sentQty, 0) < d.req_qty AND (d.delivery_date || 'T' || substr(d.delivery_time || ':00',1,5)) < ?2 THEN 1 ELSE 0 END) AS overdue
        FROM delivery_due_lines d
        LEFT JOIN (SELECT due_line_id, sum(qty) AS sentQty FROM delivery_tag_scans GROUP BY due_line_id) s ON s.due_line_id = d.id
        WHERE d.delivery_date = ?1
        GROUP BY d.fact ORDER BY d.fact
      `).bind(selectedDate, nowKey).all(),
      DB.prepare(`
        WITH active AS (SELECT id FROM forecast_imports WHERE status = 'active' ORDER BY activated_at DESC, id DESC LIMIT 1),
        stock AS (
          SELECT coalesce(sum(max(t.remaining_qty
            - coalesce((SELECT sum(p.picked_qty - p.dispatched_qty) FROM stock_picks p WHERE p.stock_tag_id=t.id AND p.status IN ('staged','partial')),0)
            - coalesce((SELECT sum(a.qty) FROM stock_allocations a WHERE a.stock_tag_id=t.id AND a.status='reserved'),0), 0)),0) AS available
          FROM stock_tags t WHERE t.status IN ('in_stock','depleted')
        ), daily AS (
          SELECT f.delivery_date AS date, sum(f.prod_qty) AS forecastQty
          FROM forecast_lines f INNER JOIN active a ON a.id=f.import_id
          WHERE f.delivery_date >= ?1 GROUP BY f.delivery_date ORDER BY f.delivery_date LIMIT 7
        )
        SELECT daily.date, daily.forecastQty,
          max(stock.available - coalesce(sum(daily.forecastQty) OVER (ORDER BY daily.date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0), 0) AS availableQty
        FROM daily CROSS JOIN stock
      `).bind(selectedDate).all(),
      DB.prepare(`
        SELECT id, module_label AS type, actor_name AS actor, summary AS detail, created_at AS createdAt
        FROM audit_logs
        WHERE module_key IN ('plan','due','tags','stock','arrange','replacement','dispatch','reports')
        ORDER BY id DESC LIMIT 8
      `).all(),
    ]);

    const dues = (dueResult.results || []).map((row) => ({ ...row, reqQty: Number(row.reqQty || 0), sentQty: Number(row.sentQty || 0), arrangedQty: Number(row.arrangedQty || 0) }));
    const dueTotal = dues.length;
    const completed = dues.filter((row) => row.sentQty >= row.reqQty).length;
    const overdue = dues.filter((row) => row.sentQty < row.reqQty && `${row.deliveryDate}T${String(row.deliveryTime).slice(0, 5)}` < nowKey).length;
    const pending = dueTotal - completed;
    const waiting = Math.max(pending - overdue, 0);
    const upcoming = dues.filter((row) => row.sentQty < row.reqQty).sort((a, b) =>
      `${a.deliveryDate}T${a.deliveryTime}`.localeCompare(`${b.deliveryDate}T${b.deliveryTime}`),
    ).slice(0, 6).map((row) => ({ ...row, remainingQty: Math.max(row.reqQty - row.sentQty, 0) }));

    return Response.json({
      selectedDate,
      kpis: { dueTotal, completed, pending, overdue, successRate: dueTotal ? Math.round(completed / dueTotal * 1000) / 10 : 0 },
      dueStatus: { completed, waiting, overdue, total: dueTotal },
      upcoming,
      stock: stockResult.results?.[0] || { availableQty: 0, arrangedQty: 0, replacementQty: 0, anomalyCount: 0 },
      process: processResult.results?.[0] || {},
      fac: facResult.results || [],
      forecast: forecastResult.results || [],
      activities: activityResult.results || [],
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลด Dashboard ไม่สำเร็จ" }, { status: 500 });
  }
}
