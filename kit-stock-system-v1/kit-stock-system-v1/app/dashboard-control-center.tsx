"use client";

import { MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import styles from "./dashboard-control-center.module.css";
import DashboardOperationsFloor, { DashboardTargetPage } from "./dashboard-operations-floor";

type DashboardDue = {
  id: number; materialCode: string; partName: string; fact: string; deliveryDate: string;
  deliveryTime: string; reqQty: number; sentQty: number; arrangedQty: number; remainingQty: number;
};
type DashboardActivity = { id: number; type: string; actor: string; detail: string; createdAt: string };
type DashboardData = {
  selectedDate: string;
  kpis: { dueTotal: number; completed: number; pending: number; overdue: number; successRate: number };
  dueStatus: { completed: number; waiting: number; overdue: number; total: number };
  upcoming: DashboardDue[];
  stock: { availableQty: number; arrangedQty: number; totalQty: number; replacementQty: number; anomalyCount: number };
  alerts: { shortagePartCount: number; dueSoonCount: number; overdueCount: number };
  process: { planQty?: number; tagQty?: number; receivedQty?: number; arrangedQty?: number; checkedQty?: number; exportedQty?: number };
  forecast: Array<{ date: string; forecastQty: number; availableQty: number }>;
  activities: DashboardActivity[];
  updatedAt: string;
};

type DetailFilter = { date?: string; fact?: string; status?: "all" | "completed" | "pending" | "over" };
const fmt = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value || 0));
const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const thaiUpdated = (value: string) => new Intl.DateTimeFormat("th-TH", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "Asia/Bangkok",
}).format(new Date(value));
const shortDate = (value: string) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : "—";
const activityTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(date);
};

export default function DashboardControlCenter({ canOpen, onNavigate }: {
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
  const maxStock = Math.max(1, ...data.forecast.map((item) => Number(item.availableQty || 0)));
  const alerts = [
    { label: "งานค้างส่ง", value: data.alerts.overdueCount, page: "overdue" as DashboardTargetPage, tone: "danger", icon: "!" },
    { label: "Part ติดลบ / เสี่ยงขาด", value: data.alerts.shortagePartCount, page: "forecast" as DashboardTargetPage, tone: "purple", icon: "▱" },
    { label: "ใกล้ Due (1–3 วัน)", value: data.alerts.dueSoonCount, page: "plan" as DashboardTargetPage, tone: "warning", icon: "◷" },
  ];
  const quickActions: Array<{ label: string; sub: string; page: DashboardTargetPage; tone: string; icon: string }> = [
    { label: "รับเข้า Stock", sub: "สแกน Shelf + KIT Tag", page: "stock", tone: "green", icon: "▥" },
    { label: "ตรวจและขายออก", sub: "สแกน KIT Tag + Customer Tag", page: "dispatch", tone: "purple", icon: "▣" },
    { label: "จัดงาน", sub: "เลือก Due / รอบ / FAC", page: "arrange", tone: "orange", icon: "▤" },
    { label: "พิมพ์ Tag", sub: "สร้างและพิมพ์ Tag", page: "tags", tone: "blue", icon: "▧" },
    { label: "Forecast Stock", sub: "เช็กงานขาด / ครอบคลุม", page: "forecast", tone: "lime", icon: "▥" },
    { label: "งานค้าง / ติดลบ", sub: "ตรวจสอบรายการ", page: "overdue", tone: "red", icon: "!" },
  ];

  return <div className={styles.dashboard}>
    <DashboardOperationsFloor data={data} canOpen={canOpen} onOpen={open} />

    <section className={styles.insights} aria-label="ข้อมูลสรุปหน้าแรก">
      <article className={`${styles.panel} ${styles.trendPanel}`}>
        <header><div><i>▥</i><h4>แนวโน้ม Stock (7 วัน)</h4></div><button type="button" onClick={() => open("forecast")} disabled={!canOpen("forecast")}>ดูทั้งหมด →</button></header>
        <div className={styles.chart}>
          {data.forecast.length ? data.forecast.slice(0, 7).map((item, index) => <div className={styles.barGroup} key={item.date} title={`${shortDate(item.date)} · Stock คาดการณ์ ${fmt(item.availableQty)} ชิ้น`}>
            {index === data.forecast.slice(0, 7).length - 1 && <b>{fmt(item.availableQty)}</b>}
            <span style={{ height: `${Math.max(8, Number(item.availableQty || 0) / maxStock * 100)}%` }} />
            <small>{shortDate(item.date)}</small>
          </div>) : <p>ยังไม่มี Forecast ที่เปิดใช้งาน</p>}
        </div>
      </article>

      <article className={`${styles.panel} ${styles.duePanel}`}>
        <header><div><i>▤</i><h4>งาน Due วันนี้</h4></div><button type="button" onClick={() => open("plan", { date: data.selectedDate })} disabled={!canOpen("plan")}>ดูทั้งหมด →</button></header>
        <div className={styles.dueHead}><span>No.</span><span>Part</span><span>จำนวน</span><span>รอบ</span><span>สถานะ</span></div>
        <div className={styles.dueRows}>{data.upcoming.length ? data.upcoming.slice(0, 3).map((due, index) => <button type="button" key={due.id} onClick={() => open("plan", { date: data.selectedDate, fact: due.fact })} disabled={!canOpen("plan")}>
          <span>{index + 1}</span><b>{due.materialCode}</b><span>{fmt(due.remainingQty)}</span><span>{String(due.deliveryTime || "—").slice(0, 5)}</span><em>{due.arrangedQty >= due.remainingQty ? "พร้อมส่ง" : due.arrangedQty > 0 ? "จัดบางส่วน" : "รอจัด"}</em>
        </button>) : <p>✓ ไม่มีงาน Due ที่ค้างในวันนี้</p>}</div>
      </article>

      <article className={`${styles.panel} ${styles.alertPanel}`}>
        <header><div><i>!</i><h4>แจ้งเตือนสำคัญ</h4></div><button type="button" onClick={() => open("overdue")} disabled={!canOpen("overdue")}>ดูทั้งหมด →</button></header>
        <div>{alerts.map((item) => <button type="button" key={item.label} className={styles[item.tone]} onClick={() => open(item.page)} disabled={!canOpen(item.page)}><i>{item.icon}</i><span>{item.label}</span><b>{fmt(item.value)} รายการ</b><em>›</em></button>)}</div>
      </article>

      <article className={`${styles.panel} ${styles.activityPanel}`}>
        <header><div><i>◷</i><h4>กิจกรรมล่าสุด</h4></div><button type="button" onClick={() => open("history")} disabled={!canOpen("history")}>ดูทั้งหมด →</button></header>
        <div>{data.activities.length ? data.activities.slice(0, 3).map((item, index) => <div key={item.id}><i>{index === 0 ? "↑" : index === 1 ? "▧" : "▤"}</i><span><b>{item.type}</b><small>{item.detail}</small></span><time>{activityTime(item.createdAt)} น.</time></div>) : <p>ยังไม่มีกิจกรรมล่าสุด</p>}</div>
      </article>
    </section>

    <section className={styles.quick} aria-labelledby="dashboard-quick-title">
      <header><i>▦</i><h3 id="dashboard-quick-title">เมนูการทำงานหลัก</h3></header>
      <div>{quickActions.map((item) => <button type="button" key={item.page} className={styles[item.tone]} onClick={() => open(item.page)} disabled={!canOpen(item.page)}><i>{item.icon}</i><span><b>{item.label}</b><small>{item.sub}</small></span><em>›</em></button>)}</div>
    </section>

    <footer className={styles.updated}>
      <span>{loading ? "กำลังรีเฟรชข้อมูล…" : error ? `รีเฟรชไม่สำเร็จ: ${error}` : `ข้อมูลล่าสุด ${thaiUpdated(data.updatedAt)} น.`}</span>
      <button type="button" onClick={refresh} disabled={loading}>↻ รีเฟรชข้อมูล</button>
    </footer>
  </div>;
}
