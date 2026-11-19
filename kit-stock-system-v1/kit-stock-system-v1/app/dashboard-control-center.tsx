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
const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const thaiUpdated = (value: string) => new Intl.DateTimeFormat("th-TH", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "Asia/Bangkok",
}).format(new Date(value));

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
  return <div className={styles.dashboard}>
    <DashboardOperationsFloor data={data} canOpen={canOpen} onOpen={open} />

    <footer className={styles.updated}>
      <span>{loading ? "กำลังรีเฟรชข้อมูล…" : error ? `รีเฟรชไม่สำเร็จ: ${error}` : `อัปเดตล่าสุด ${thaiUpdated(data.updatedAt)}`}</span>
      <button type="button" onClick={refresh} disabled={loading}>↻ รีเฟรชข้อมูล</button>
    </footer>
  </div>;
}
