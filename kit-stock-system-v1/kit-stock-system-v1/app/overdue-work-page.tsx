"use client";

import { useState } from "react";

type OverdueLine = {
  id: number; materialCode: string; materialDescription: string;
  deliveryDate: string; deliveryTime: string; fact: string; line: string;
  doNo: string; seq: number; reqQty: number; scannedQty: number; arrangedQty?: number;
};

const fmt = (value: number) => Number(value || 0).toLocaleString("th-TH");
const dateLabel = (value: string) => value.split("-").reverse().join("/");

export default function OverdueWorkPage({ dues, refreshing, updatedAt, onRefresh, onBack, onOpenWindow, monitorMode = false }: {
  dues: OverdueLine[]; refreshing: boolean; updatedAt: string | null;
  monitorMode?: boolean; onRefresh: () => void; onBack: () => void; onOpenWindow: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const needle = search.trim().toLowerCase();
  const rows = dues.filter((due) => !needle || [due.materialCode, due.materialDescription, due.fact, due.line, due.doNo, due.deliveryTime, dateLabel(due.deliveryDate)].join(" ").toLowerCase().includes(needle));
  const totalRemaining = dues.reduce((sum, due) => sum + Math.max(Number(due.reqQty) - Number(due.scannedQty), 0), 0);
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return <section className="overdue-work-page">
    <header className="overdue-work-header"><div><h2>งานติดลบ · เกินดิว / ค้างส่ง</h2><p>ทุก Part · ทุกวันที่ · ทุกรอบ · ทุก FAC — งานเลยกำหนดส่งและยังส่งไม่ครบ</p></div><div className="overdue-work-actions">{!monitorMode && <><button className="button secondary" onClick={onBack}>กลับหน้า Due</button><button className="button secondary" onClick={onOpenWindow}>↗ เปิดหน้าต่างใหม่</button></>}{monitorMode && <button className="button secondary" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else void document.documentElement.requestFullscreen?.().catch(() => undefined); }}>⛶ เต็มจอ / ออกจากเต็มจอ</button>}<button className="button primary" disabled={refreshing} onClick={onRefresh}>{refreshing ? "กำลังอัปเดต…" : "↻ รีเฟรช"}</button></div></header>
    <div className="overdue-work-totals page-summary"><article><small>Part ที่ค้างส่ง</small><b>{fmt(new Set(dues.map((due) => due.materialCode)).size)}</b><span>Part</span></article><article><small>รายการเกินดิว</small><b>{fmt(dues.length)}</b><span>รายการ</span></article><article><small>ยอดค้างส่งรวม</small><b>{fmt(totalRemaining)}</b><span>ชิ้น</span></article></div>
    <div className="overdue-work-toolbar"><label htmlFor="overdue-work-search">ค้นหา Part / FAC / รอบ / DO<input id="overdue-work-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="ค้นหางานค้างส่ง…" /></label><small>อัปเดตอัตโนมัติทุก 30 วินาที{updatedAt && <> · ล่าสุด {new Date(updatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</>}</small></div>
    <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วันที่ส่งงาน</th><th>รอบ</th><th>FAC / Line</th><th>Part / ชื่อชิ้นงาน</th><th>DO / Seq</th><th className="num">Due</th><th className="num">ส่งแล้ว</th><th className="num">จัดรอส่ง</th><th className="num">ค้างส่ง</th></tr></thead><tbody>{visible.map((due) => <tr key={due.id}>
      <td data-label="วันที่ส่งงาน"><b>{dateLabel(due.deliveryDate)}</b></td><td data-label="รอบ">{due.deliveryTime}</td><td data-label="FAC / Line"><b>{due.fact}</b><small>{due.line || "—"}</small></td><td data-label="Part / ชื่อชิ้นงาน"><b>{due.materialCode}</b><small>{due.materialDescription || "—"}</small></td><td data-label="DO / Seq"><b>{due.doNo}</b><small>Seq {due.seq}</small></td><td data-label="Due" className="num">{fmt(due.reqQty)}</td><td data-label="ส่งแล้ว" className="num">{fmt(due.scannedQty)}</td><td data-label="จัดรอส่ง" className="num">{fmt(due.arrangedQty || 0)}</td><td data-label="ค้างส่ง" className="num"><b className="red-text">{fmt(Math.max(Number(due.reqQty) - Number(due.scannedQty), 0))}</b></td>
    </tr>)}</tbody></table></div>
    {!visible.length && <p className="overdue-work-empty">{refreshing ? "กำลังโหลดข้อมูล…" : needle ? "ไม่พบงานเกินดิวตามคำค้นหา" : "ไม่มีงานเกินดิวที่ค้างส่ง"}</p>}
    <footer className="overdue-work-pagination"><span>พบ {fmt(rows.length)} รายการ · หน้า {safePage} / {pages}</span><div><button className="button secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>ก่อนหน้า</button><button className="button secondary" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>ถัดไป</button></div></footer>
    <p className="overdue-work-note">ยอดค้างส่ง = Due − ส่งออกแล้ว งานที่จัดไว้แต่ยังไม่ขายออกยังนับเป็นงานค้างส่ง</p>
  </section>;
}
