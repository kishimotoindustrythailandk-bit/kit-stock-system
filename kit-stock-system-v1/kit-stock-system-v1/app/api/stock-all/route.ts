import { getCurrentUser, hasPermission } from '../../cloudflare-auth';
import { getRuntimeEnv } from '../../../runtime/env';
import { safeErrorMessage } from '../../api-error';
import { AVAILABLE_STOCK_SQL, STOCK_OVERVIEW_CTE, overviewFilters } from '../../stock-quantities';
import { writeAuditLog } from '../../audit-log';

const TAG_SELECT = `SELECT tag.id, tag.tag_id AS tagId, tag.material_code AS materialCode,
 tag.job_no AS jobNo, tag.qty, tag.production_date AS productionDate, tag.received_at AS receivedAt,
 tag.status, tag.remaining_qty AS remainingQty,
 CASE WHEN tag.status IN ('in_stock','depleted') AND tag.remaining_qty > 0 THEN ${AVAILABLE_STOCK_SQL} ELSE 0 END AS availableQty,
 CASE WHEN tag.status IN ('in_stock','depleted') AND tag.remaining_qty > 0 THEN tag.remaining_qty - ${AVAILABLE_STOCK_SQL} ELSE 0 END AS arrangedQty,
 COALESCE((SELECT r.received_qty FROM stock_receipt_adjustments r WHERE r.stock_tag_id=tag.id ORDER BY r.id DESC LIMIT 1), CASE WHEN tag.received_at IS NOT NULL THEN tag.qty ELSE 0 END) AS receivedQty,
 p.location FROM stock_tags tag JOIN stock_parts p ON p.material_code=tag.material_code`;
const MOVEMENTS = `SELECT 'receive-'||t.id AS id, 'รับเข้า' AS action, t.tag_id AS tagId, t.job_no AS jobNo,
 COALESCE((SELECT r.received_qty FROM stock_receipt_adjustments r WHERE r.stock_tag_id=t.id ORDER BY r.id DESC LIMIT 1),t.qty) AS qty,
 t.received_at AS occurredAt,t.received_by_name AS actor FROM stock_tags t WHERE t.material_code=?1 AND t.received_at IS NOT NULL
 UNION ALL SELECT 'pick-'||p.id,'จัดงาน',t.tag_id,t.job_no,p.picked_qty,p.picked_at,p.picked_by_name FROM stock_picks p JOIN stock_tags t ON t.id=p.stock_tag_id WHERE t.material_code=?1
 UNION ALL SELECT 'allocation-'||a.id,'จัดงาน (เดิม)',t.tag_id,t.job_no,a.qty,a.reserved_at,a.reserved_by_name FROM stock_allocations a JOIN stock_tags t ON t.id=a.stock_tag_id WHERE t.material_code=?1
 UNION ALL SELECT 'adjust-'||l.id,'ปรับยอด: '||a.reason,l.stock_tag_code,t.job_no,l.qty_change,a.adjusted_at,a.adjusted_by_name FROM stock_count_adjustment_lines l JOIN stock_count_adjustments a ON a.id=l.adjustment_id JOIN stock_tags t ON t.id=l.stock_tag_id WHERE t.material_code=?1
 UNION ALL SELECT 'dispatch-'||l.id,'ขายออก',t.tag_id,t.job_no,l.qty,l.dispatched_at,l.dispatched_by_name FROM stock_dispatch_links l JOIN stock_tags t ON t.id=l.stock_tag_id WHERE t.material_code=?1
 UNION ALL SELECT 'legacy-dispatch-'||a.id,'ขายออก (เดิม)',t.tag_id,t.job_no,a.qty,a.dispatched_at,a.dispatched_by_name FROM stock_allocations a JOIN stock_tags t ON t.id=a.stock_tag_id WHERE t.material_code=?1 AND a.status='dispatched'
 UNION ALL SELECT 'replacement-'||r.id,'เบิกงานทดแทน',t.tag_id,t.job_no,r.qty,r.issued_at,r.issued_by_name FROM replacement_issues r JOIN stock_tags t ON t.id=r.stock_tag_id WHERE t.material_code=?1`;
function pageNumber(value: string | null) { const number=Number(value); return Number.isFinite(number) ? Math.min(1000000, Math.max(1, Math.floor(number))) : 1; }
function json(data: unknown, status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store'}}); }
export async function GET(request: Request) {
 try {
  const user = await getCurrentUser();
  if (!user) return json({error:'กรุณาเข้าสู่ระบบ'},401);
  if (!hasPermission(user,'stock-all')) return json({error:'บัญชีนี้ไม่มีสิทธิ์ Stock ทั้งหมด'},403);
  const params = new URL(request.url).searchParams;
  const detail = params.get('part'); const exporting = params.get('export') === '1';
  if (detail && !hasPermission(user,'stock-all-details')) return json({error:'ไม่มีสิทธิ์ดู Tag / Job'},403);
  if (exporting && !hasPermission(user,'stock-all-export')) return json({error:'ไม่มีสิทธิ์ส่งออก Excel'},403);
  const { DB } = getRuntimeEnv(); if (!DB) throw new Error('ไม่พบการเชื่อมต่อ D1');
  if (detail) {
   const tab = params.get('tab') || 'tag';
   const page = pageNumber(params.get('page')); const size=25;
   const queries = tab === 'movement' ? `SELECT * FROM (${MOVEMENTS})` : tab === 'job'
    ? `SELECT jobNo, SUM(receivedQty) AS receivedQty, SUM(CASE WHEN status IN ('in_stock','depleted') THEN remainingQty ELSE 0 END) AS remainingQty, MIN(receivedAt) AS receivedAt FROM (${TAG_SELECT} WHERE tag.material_code=?1 AND tag.received_at IS NOT NULL) GROUP BY jobNo`
    : `${TAG_SELECT} WHERE tag.material_code=?1 AND tag.status IN ('in_stock','depleted') AND tag.remaining_qty > 0`;
   const results=await DB.batch([
    DB.prepare(`${STOCK_OVERVIEW_CTE} SELECT * FROM overview WHERE materialCode=?1`).bind(detail),
    DB.prepare(`SELECT COUNT(*) AS count FROM (${queries})`).bind(detail),
    DB.prepare(`${queries} ORDER BY ${tab==='movement' ? 'occurredAt DESC,id' : tab==='job' ? 'jobNo' : 'id DESC'} LIMIT ?2 OFFSET ?3`).bind(detail,size,(page-1)*size),
   ]);
   if (!results[0].results.length) return json({error:'ไม่พบ Part'},404);
   return json({part:results[0].results[0],rows:results[2].results,total:Number((results[1].results[0] as {count:number} | undefined)?.count || 0),page,pageSize:size,loadedAt:new Date().toISOString()});
  }
  const {where,values}=overviewFilters(params);
  const pageSize=[10,25,50,100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 10;
  const requestedPage=pageNumber(params.get('page'));
  const query=`${STOCK_OVERVIEW_CTE} SELECT * FROM overview ${where} ORDER BY materialCode`;
  const queries=[
   DB.prepare(`${STOCK_OVERVIEW_CTE} SELECT COUNT(*) AS partCount, COALESCE(SUM(availableQty),0) AS availableQty, COALESCE(SUM(arrangedQty),0) AS arrangedQty, COALESCE(SUM(totalQty),0) AS totalQty FROM overview`),
   DB.prepare(`${STOCK_OVERVIEW_CTE} SELECT COUNT(*) AS count FROM overview ${where}`).bind(...values),
   DB.prepare(exporting ? query : `${query} LIMIT ? OFFSET ?`).bind(...values,...(exporting ? [] : [pageSize,(requestedPage-1)*pageSize])),
   DB.prepare(`SELECT DISTINCT customer,location,substr(material_code,1,4) AS partGroup FROM stock_parts ORDER BY customer,location`),
  ];
  const results=await DB.batch(queries); const total=Number((results[1].results[0] as {count:number} | undefined)?.count || 0);
  const page=Math.min(requestedPage,Math.max(1,Math.ceil(total/pageSize)));
  const rows=page===requestedPage || exporting ? results[2].results : (await DB.prepare(`${query} LIMIT ? OFFSET ?`).bind(...values,pageSize,(page-1)*pageSize).all()).results;
  const loadedAt=new Date().toISOString();
  if (exporting) await writeAuditLog(user,{module:'stock',moduleLabel:'Stock ทั้งหมด',action:'export_stock_all',actionLabel:'ส่งออก Stock Excel',summary:`ส่งออก Stock ${total} Part ตามตัวกรอง`,details:{filters:Object.fromEntries(params),partCount:total,loadedAt}},request);
  return json({rows,total,page,pageSize,summary:results[0].results[0],options:results[3].results,loadedAt});
 } catch(error) { console.error('stock-all GET',error); return json({error:safeErrorMessage(error,'โหลด Stock ไม่สำเร็จ')},500); }
}
