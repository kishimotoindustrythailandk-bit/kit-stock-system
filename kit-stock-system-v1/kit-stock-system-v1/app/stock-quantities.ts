/** Read projection only. The same tag source and available formula serve Forecast and Stock overview. */
export const AVAILABLE_STOCK_SQL = `MAX(tag.remaining_qty
  - COALESCE((SELECT SUM(MAX(pick.picked_qty - pick.dispatched_qty, 0)) FROM stock_picks pick
      WHERE pick.stock_tag_id = tag.id AND pick.status IN ('staged', 'partial')), 0)
  - COALESCE((SELECT SUM(allocation.qty) FROM stock_allocations allocation
      WHERE allocation.stock_tag_id = tag.id AND allocation.status = 'reserved'), 0), 0)`;
export const STOCK_OVERVIEW_CTE = `WITH balances AS (
 SELECT tag.material_code, SUM(tag.remaining_qty) AS totalQty,
 SUM(${AVAILABLE_STOCK_SQL}) AS availableQty, COUNT(*) AS tagCount
 FROM stock_tags tag WHERE tag.status IN ('in_stock', 'depleted') AND tag.remaining_qty > 0 GROUP BY tag.material_code
), overview AS (
 SELECT p.material_code AS materialCode, p.part_name AS partName, p.customer, p.location,
 substr(p.material_code,1,4) AS partGroup, p.active,
 COALESCE(b.availableQty,0) AS availableQty,
 COALESCE(b.totalQty,0)-COALESCE(b.availableQty,0) AS arrangedQty,
 COALESCE(b.totalQty,0) AS totalQty, COALESCE(b.tagCount,0) AS tagCount,
 (SELECT updated_at FROM part_master_images i WHERE i.material_code=p.material_code) AS imageVersion
 FROM stock_parts p LEFT JOIN balances b ON b.material_code=p.material_code
)`;
export type StockOverviewRow = { materialCode: string; partName: string; customer: string; location: string; partGroup: string; active: number; availableQty: number; arrangedQty: number; totalQty: number; tagCount: number; imageVersion?: string };
export function stockStatus(row: Pick<StockOverviewRow, 'availableQty' | 'arrangedQty' | 'totalQty'>) {
 return row.totalQty < 0 || row.availableQty < 0 ? 'Stock ติดลบ' : row.availableQty > 0 ? 'พร้อมใช้' : row.arrangedQty > 0 ? 'จัดงานรอส่ง' : 'Stock 0';
}
export function overviewFilters(params: URLSearchParams) {
 const clauses: string[] = [], values: string[] = [];
 const add = (clause: string, value?: string) => { clauses.push(clause); if (value !== undefined) values.push(value); };
 const search = (params.get('search') || '').trim().slice(0,200);
 const like = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
 if (search) { add(`(materialCode LIKE ? ESCAPE '\\' OR partName LIKE ? ESCAPE '\\' OR customer LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM stock_tags t WHERE t.material_code=overview.materialCode AND t.job_no LIKE ? ESCAPE '\\'))`); values.push(...Array(5).fill(like(search))); }
 for (const key of ['customer','location','partGroup'] as const) { const value = params.get(key); if (value) add(`${key} = ?`,value.slice(0,160)); }
 const job = params.get('job'); if (job) add(`EXISTS(SELECT 1 FROM stock_tags t WHERE t.material_code=overview.materialCode AND t.job_no LIKE ? ESCAPE '\\')`,like(job.slice(0,160)));
 const selected=params.get('selected');
 if(selected){const parts:unknown=JSON.parse(selected);if(!Array.isArray(parts)||parts.length>1000)throw new Error('เลือกรายการไม่ถูกต้อง');add('materialCode IN (SELECT value FROM json_each(?))',JSON.stringify(parts.map(v=>String(v).slice(0,160))));}
 const status = params.get('status');
 if (status === 'available') add('availableQty > 0');
 if (status === 'zero') add('totalQty = 0');
 if (status === 'arranged') add('arrangedQty > 0');
 if (status === 'remaining') add('totalQty > 0');
 if (params.get('availableOnly') === '1') add('availableQty > 0');
 return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}
