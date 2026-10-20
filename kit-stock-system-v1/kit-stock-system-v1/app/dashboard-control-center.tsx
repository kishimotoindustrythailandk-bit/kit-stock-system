"use client";

import { MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import styles from "./dashboard-control-center.module.css";
import DashboardOperationsFloor, { DashboardTargetPage } from "./dashboard-operations-floor";

type DashboardData = {
  selectedDate: string;
  stock: { availableQty: number; arrangedQty: number; totalQty: number; replacementQty: number; anomalyCount: number };
  alerts: { shortagePartCount: number; dueSoonCount: number; overdueCount: number };
  updatedAt: string;
};

type DetailFilter = { date?: string; fact?: string; status?: "all" | "completed" | "pending" | "over" };
const fmt = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value || 0));
const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const thaiClock = (value: Date) => new Intl.DateTimeFormat("th-TH", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "Asia/Bangkok",
}).format(value);
const thaiUpdated = (value: string) => new Intl.DateTimeFormat("th-TH", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "Asia/Bangkok",
}).format(new Date(value));

export default function DashboardControlCenter({ userName, userRole, signOutPath, onSignOut, canOpen, onNavigate }: {
  userName: string;
  userRole: string;
  signOutPath: string;
  onSignOut: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  canOpen: (page: DashboardTargetPage) => boolean;
  onNavigate: (page: DashboardTargetPage, filter?: DetailFilter) => void;
}) {
  const [selectedDate] = useState(() => today());
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?date=${encodeURIComponent(selectedDate)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as DashboardData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "โหลด Dashboard ไม่สำเร็จ");
        setData(payload);
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "โหลด Dashboard ไม่สำเร็จ");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedDate, refreshKey]);

  const refresh = () => { setLoading(true); setError(""); setRefreshKey((value) => value + 1); };
  if (loading && !data) return <div className={styles.state}><span /><b>กำลังโหลดข้อมูลจริงจากระบบ…</b><small>ระบบไม่ใช้ตัวเลขตัวอย่าง</small></div>;
  if (error && !data) return <div className={`${styles.state} ${styles.error}`}><b>โหลดหน้าหลักไม่สำเร็จ</b><small>{error}</small><button onClick={refresh}>ลองใหม่</button></div>;
  if (!data) return <div className={styles.state}><b>ยังไม่มีข้อมูลสำหรับแสดงผล</b></div>;

  const open = (page: DashboardTargetPage, filter?: DetailFilter) => canOpen(page) && onNavigate(page, filter);
  const activeNotificationCount = [data.alerts.shortagePartCount, data.alerts.dueSoonCount, data.alerts.overdueCount].filter((value) => value > 0).length;
  const kpis = [
    { label: "Stock พร้อมใช้", value: data.stock.availableQty, unit: "ชิ้น", tone: "blue", icon: "▣", page: "stock-all" as DashboardTargetPage, note: "อยู่ในพื้นที่ Stock และยังไม่ถูกจัดงาน" },
    { label: "จัดงานรอส่ง", value: data.stock.arrangedQty, unit: "ชิ้น", tone: "orange", icon: "▤", page: "stock-all" as DashboardTargetPage, note: "ถูกจัดงานแล้ว แต่ยังไม่ขายออก" },
    { label: "คงเหลือรวม", value: data.stock.totalQty, unit: "ชิ้น", tone: "red", icon: "▦", page: "stock-all" as DashboardTargetPage, note: "Stock พร้อมใช้ + จัดงานรอส่ง" },
    { label: "Part เสี่ยงขาด", value: data.alerts.shortagePartCount, unit: "Part", tone: "purple", icon: "!", page: "forecast" as DashboardTargetPage, note: "Forecast คงค้างมากกว่า Stock พร้อมใช้" },
  ];

  return <div className={styles.dashboard}>
    <section className={styles.hero} aria-label="ข้อมูลผู้ใช้งานและเวลาปัจจุบัน">
      <div className={styles.brand}><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <div className={styles.welcome}><small>ภาพรวมการทำงานวันนี้</small><h2>สวัสดีครับ {userName}</h2></div>
      <div className={styles.heroActions}>
        <div className={styles.time}><small>วันที่และเวลาปัจจุบัน</small><b>{thaiClock(clock)}</b></div>
        <button type="button" className={styles.notification} onClick={() => open("forecast")} disabled={!canOpen("forecast")} aria-label={`มีแจ้งเตือน ${activeNotificationCount} ประเภท`}><span>♧</span>{activeNotificationCount > 0 && <i>{activeNotificationCount}</i>}</button>
        <div className={styles.user}><i>{userName.slice(0, 1).toUpperCase()}</i><span><b>{userName}</b><small>{userRole}</small></span></div>
        <a href={signOutPath} onClick={onSignOut}>ออกจากระบบ</a>
      </div>
    </section>

    <section className={styles.kpis} aria-label="สรุป KPI Stock">
      {kpis.map((kpi) => <button key={kpi.label} type="button" className={styles[kpi.tone]} onClick={() => open(kpi.page)} disabled={!canOpen(kpi.page)}>
        <i>{kpi.icon}</i><span><small>{kpi.label}</small><b>{fmt(kpi.value)}</b><em>{kpi.unit}</em><p>{kpi.note}</p></span><strong>›</strong>
      </button>)}
    </section>

    <DashboardOperationsFloor data={data} canOpen={canOpen} onOpen={open} />

    <footer className={styles.updated}>
      <span>{loading ? "กำลังรีเฟรชข้อมูล…" : error ? `รีเฟรชไม่สำเร็จ: ${error}` : `อัปเดตล่าสุด ${thaiUpdated(data.updatedAt)}`}</span>
      <button type="button" onClick={refresh} disabled={loading}>↻ รีเฟรชข้อมูล</button>
    </footer>
  </div>;
}
