"use client";

import { useMemo, useState } from "react";

type Part = { materialCode: string; partName: string; customer: string; location?: string; active?: number | boolean };
type Tag = { id: number; tagId: string; materialCode: string; jobNo: string; productionDate: string; receivedAt?: string; remainingQty: number; reservedQty: number; status: string };
const fmt = (value: number) => Number(value || 0).toLocaleString("th-TH");
const dateLabel = (value: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";

export function summarizeAllStock(parts: Part[], tags: Tag[]) {
  const byPart = new Map<string, Tag[]>();
  for (const tag of tags) {
    if (!["in_stock", "depleted"].includes(tag.status) || Number(tag.remainingQty) <= 0) continue;
    const list = byPart.get(tag.materialCode) || [];
    list.push(tag);
    byPart.set(tag.materialCode, list);
  }
  return parts.map((part) => {
    const currentTags = byPart.get(part.materialCode) || [];
    const totalQty = currentTags.reduce((sum, tag) => sum + Math.max(Number(tag.remainingQty || 0), 0), 0);
    const arrangedQty = currentTags.reduce((sum, tag) => sum + Math.min(Math.max(Number(tag.reservedQty || 0), 0), Math.max(Number(tag.remainingQty || 0), 0)), 0);
    return { ...part, totalQty, arrangedQty, availableQty: totalQty - arrangedQty, tagCount: currentTags.length, currentTags };
  }).sort((a, b) => a.materialCode.localeCompare(b.materialCode));
}

export function createAllStockWorkbook(xlsx: typeof import("xlsx"), parts: Part[], tags: Tag[], calculatedAt: string) {
  const rows = summarizeAllStock(parts, tags);
  const book = xlsx.utils.book_new();
  const summary = xlsx.utils.aoa_to_sheet([
    ["KIT · Stock ทั้งหมดทุก Part (รวมยอด 0)", "ข้อมูล ณ", calculatedAt],
    ["คงเหลือรวม = Stock พร้อมใช้ + จัดงานรอส่ง; ไม่รวม Tag ที่ยังไม่รับเข้า / NG / ส่งหมดแล้ว"],
    ["Part No.", "ชื่อชิ้นงาน", "ลูกค้า", "Location", "Stock พร้อมใช้", "จัดงานรอส่ง", "คงเหลือรวม", "จำนวน Tag คงเหลือ"],
    ...rows.map((row) => [row.materialCode, row.partName, row.customer, row.location || "", row.availableQty, row.arrangedQty, row.totalQty, row.tagCount]),
  ]);
  summary["!cols"] = [25, 38, 25, 22, 20, 20, 20, 24].map((wch) => ({ wch }));
  summary["!autofilter"] = { ref: `A3:H${rows.length + 3}` };
  xlsx.utils.book_append_sheet(book, summary, "Stock ทุก Part");
  const details = xlsx.utils.aoa_to_sheet([
    ["Part No.", "Tag", "Job", "วันที่ผลิต", "วันที่รับเข้า", "Stock พร้อมใช้", "จัดงานรอส่ง", "คงเหลือรวม"],
    ...rows.flatMap((row) => row.currentTags.map((tag) => {
      const reserved = Math.min(Math.max(Number(tag.reservedQty || 0), 0), Number(tag.remainingQty));
      return [row.materialCode, tag.tagId, tag.jobNo, dateLabel(tag.productionDate), dateLabel(tag.receivedAt || ""), Number(tag.remainingQty) - reserved, reserved, Number(tag.remainingQty)];
    })),
  ]);
  details["!cols"] = [25, 48, 25, 18, 18, 20, 20, 20].map((wch) => ({ wch }));
  details["!autofilter"] = { ref: details["!ref"] || "A1:H1" };
  xlsx.utils.book_append_sheet(book, details, "Tag คงเหลือ");
  return book;
}

export default function StockAllPage({ parts, tags, loading, exporting, onRefresh, onExport }: {
  parts: Part[]; tags: Tag[]; loading: boolean; exporting: boolean; onRefresh: () => void; onExport: () => void;
}) {
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("all");
  const [customer, setCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [tagPage, setTagPage] = useState(1);
  const all = useMemo(() => summarizeAllStock(parts, tags), [parts, tags]);
  const needle = search.trim().toLowerCase();
  const rows = all.filter((row) => (!customer || row.customer === customer)
    && (quantity === "all" || (quantity === "zero" ? row.totalQty === 0 : row.totalQty > 0))
    && (!needle || [row.materialCode, row.partName, row.customer, row.location].join(" ").toLowerCase().includes(needle)));
  const total = all.reduce((sum, row) => ({ available: sum.available + row.availableQty, arranged: sum.arranged + row.arrangedQty, qty: sum.qty + row.totalQty }), { available: 0, arranged: 0, qty: 0 });
  const pages = Math.max(1, Math.ceil(rows.length / 50)), safePage = Math.min(page, pages);
  const detail = all.find((row) => row.materialCode === selected);
  const tagPages = Math.max(1, Math.ceil((detail?.currentTags.length || 0) / 50)), safeTagPage = Math.min(tagPage, tagPages);
  return <div className="stock-all-page">
    <section className="card stock-all-header"><div><h2>Stock ทั้งหมด</h2><p>ทุก Part ในทะเบียน รวมยอด 0 · ดูยอดคงเหลือและ Tag / Job</p></div><div className="stock-all-actions"><button className="button secondary" disabled={loading} onClick={onRefresh}>{loading ? "กำลังโหลด…" : "↻ รีเฟรช"}</button><button className="button primary" disabled={loading || exporting || !parts.length} onClick={onExport}>{exporting ? "กำลังส่งออก…" : "⇩ Excel ทุก Part"}</button></div></section>
    <section className="stock-all-metrics page-summary">{[["Part ทั้งหมด", all.length], ["Stock พร้อมใช้", total.available], ["จัดงานรอส่ง", total.arranged], ["คงเหลือรวม", total.qty]].map(([label, value]) => <article key={label}><small>{label}</small><b>{fmt(Number(value))}</b></article>)}</section>
    <section className="card"><div className="stock-all-filters"><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="ค้นหา Part / ชื่อชิ้นงาน / ลูกค้า / Location" aria-label="ค้นหา Stock ทุก Part"/><select value={quantity} onChange={(event) => { setQuantity(event.target.value); setPage(1); }}><option value="all">ทุกยอด (รวม 0)</option><option value="positive">มียอดคงเหลือ</option><option value="zero">ยอดคงเหลือ 0</option></select><select value={customer} onChange={(event) => { setCustomer(event.target.value); setPage(1); }}><option value="">ทุกลูกค้า</option>{[...new Set(all.map((row) => row.customer).filter(Boolean))].sort().map((name) => <option key={name}>{name}</option>)}</select></div>
      <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>Part / ชื่อชิ้นงาน</th><th>ลูกค้า / Location</th><th className="num">Stock พร้อมใช้</th><th className="num">จัดงานรอส่ง</th><th className="num">คงเหลือรวม</th><th className="num">Tag คงเหลือ</th><th>รายละเอียด</th></tr></thead><tbody>{rows.slice((safePage - 1) * 50, safePage * 50).map((row) => <tr key={row.materialCode}><td data-label="Part / ชื่อชิ้นงาน"><b>{row.materialCode}</b><small>{row.partName}</small></td><td data-label="ลูกค้า / Location">{row.customer || "—"}<small>{row.location || "—"}</small></td><td className="num" data-label="Stock พร้อมใช้">{fmt(row.availableQty)}</td><td className="num" data-label="จัดงานรอส่ง">{fmt(row.arrangedQty)}</td><td className="num" data-label="คงเหลือรวม"><b>{fmt(row.totalQty)}</b></td><td className="num" data-label="Tag คงเหลือ">{fmt(row.tagCount)}</td><td data-label="รายละเอียด"><button className="tiny-button" onClick={() => { setSelected(row.materialCode); setTagPage(1); }}>ดู Tag / Job</button></td></tr>)}</tbody></table></div>
      {!rows.length && <p>{loading ? "กำลังโหลดข้อมูล…" : "ไม่พบ Part ตามตัวกรอง"}</p>}
      <div className="stock-all-pagination"><span>{fmt(rows.length)} Part · หน้า {safePage} / {pages}</span><button className="button secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>ก่อนหน้า</button><button className="button secondary" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>ถัดไป</button></div>
    </section>
    {detail && <section className="card"><div className="stock-all-header"><h3>Tag / Job · {detail.materialCode}</h3><button className="button secondary" onClick={() => setSelected("")}>ปิดรายละเอียด</button></div><div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>Tag / Job</th><th>วันที่ผลิต / รับเข้า</th><th className="num">พร้อมใช้</th><th className="num">จัดรอส่ง</th><th className="num">คงเหลือรวม</th></tr></thead><tbody>{detail.currentTags.slice((safeTagPage - 1) * 50, safeTagPage * 50).map((tag) => {
      const reserved = Math.min(Math.max(Number(tag.reservedQty || 0), 0), Number(tag.remainingQty));
      return <tr key={tag.id}><td data-label="Tag / Job"><b>{tag.tagId}</b><small>{tag.jobNo}</small></td><td data-label="วันที่ผลิต / รับเข้า">{dateLabel(tag.productionDate)}<small>{dateLabel(tag.receivedAt || "")}</small></td><td className="num" data-label="พร้อมใช้">{fmt(Number(tag.remainingQty) - reserved)}</td><td className="num" data-label="จัดรอส่ง">{fmt(reserved)}</td><td className="num" data-label="คงเหลือรวม">{fmt(Number(tag.remainingQty))}</td></tr>;
    })}</tbody></table></div>{!detail.currentTags.length && <p>Part นี้ไม่มี Tag คงเหลือใน Stock / พื้นที่จัดงาน</p>}<div className="stock-all-pagination"><span>หน้า {safeTagPage} / {tagPages}</span><button className="button secondary" disabled={safeTagPage <= 1} onClick={() => setTagPage(safeTagPage - 1)}>ก่อนหน้า</button><button className="button secondary" disabled={safeTagPage >= tagPages} onClick={() => setTagPage(safeTagPage + 1)}>ถัดไป</button></div></section>}
    <p className="stock-all-note">คงเหลือรวม = Stock พร้อมใช้ + จัดงานรอส่ง · ไม่รวม Tag ที่ยังไม่รับเข้า งาน NG และงานที่ส่งออกหมดแล้ว</p>
  </div>;
}
