"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./dashboard-operations-floor.module.css";
import type { FloorEngine } from "./dashboard-operations-floor-3d";

export type DashboardTargetPage = "plan" | "tags" | "stock" | "stock-all" | "arrange" | "dispatch" | "exports" | "forecast" | "history" | "overdue";

type FloorData = {
  kpis: { dueTotal: number; completed: number; pending: number; overdue: number };
  dueStatus: { completed: number; waiting: number; overdue: number; total: number };
  stock: { availableQty: number; arrangedQty: number; totalQty: number };
  alerts: { shortagePartCount: number; dueSoonCount: number; overdueCount: number };
  process: { planQty?: number; tagQty?: number; receivedQty?: number; arrangedQty?: number; checkedQty?: number; exportedQty?: number };
  forecast: Array<{ date: string; forecastQty: number; availableQty: number }>;
};

const fmt = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value || 0));

type Station = {
  number: number;
  label: string;
  sub: string;
  page: DashboardTargetPage;
  tone: string;
  value?: string;
  active: boolean;
  motion: "office" | "machine" | "scanner" | "forklift" | "packing" | "verify" | "loading";
};

export default function DashboardOperationsFloor({ data, canOpen, onOpen }: {
  data: FloorData;
  canOpen: (page: DashboardTargetPage) => boolean;
  onOpen: (page: DashboardTargetPage) => void;
}) {
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);
  const changeAnimation = () => setAnimationEnabled((current) => !current);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLElement | null)[]>([]);
  const engineRef = useRef<FloorEngine | null>(null);
  const latestRef = useRef<{ active: boolean[]; running: boolean }>({ active: [], running: true });
  const printedWaiting = Math.max(Number(data.process.tagQty || 0) - Number(data.process.receivedQty || 0), 0);
  const stations = useMemo<Station[]>(() => [
    { number: 1, label: "Forecast", sub: "วางแผนความต้องการ (Forecast / Due)", page: "forecast", tone: "blue", value: `${fmt(data.alerts.shortagePartCount)} Part เสี่ยงขาด`, active: data.forecast.length > 0, motion: "office" },
    { number: 2, label: "Production / ออก Tag", sub: "สร้างงานและพิมพ์ Tag", page: "tags", tone: "purple", value: printedWaiting ? `${fmt(printedWaiting)} ชิ้นรอรับเข้า` : undefined, active: printedWaiting > 0 || data.kpis.pending > 0, motion: "machine" },
    { number: 3, label: "รับเข้า Stock", sub: "สแกน Shelf + KIT Tag", page: "stock", tone: "green", value: printedWaiting ? `${fmt(printedWaiting)} ชิ้นรอรับเข้า` : undefined, active: printedWaiting > 0, motion: "scanner" },
    { number: 4, label: "Stock", sub: "จัดเก็บและเคลื่อนย้ายสินค้า", page: "stock-all", tone: "cyan", value: `${fmt(data.stock.totalQty)} ชิ้น`, active: data.stock.availableQty > 0, motion: "forklift" },
    { number: 5, label: "จัดงาน", sub: "เลือก Due / รอบ / FAC และจัดส่ง", page: "arrange", tone: "orange", value: data.kpis.pending ? `${fmt(data.kpis.pending)} Due รอจัด` : undefined, active: data.kpis.pending > 0, motion: "packing" },
    { number: 6, label: "ตรวจและขายออก", sub: "สแกน KIT Tag + Customer Tag", page: "dispatch", tone: "red", value: data.stock.arrangedQty ? `${fmt(data.stock.arrangedQty)} ชิ้นรอขายออก` : undefined, active: data.stock.arrangedQty > 0, motion: "verify" },
    { number: 7, label: "Delivery", sub: "ส่งมอบงานให้ลูกค้า", page: "exports", tone: "violet", value: data.kpis.completed ? `${fmt(data.kpis.completed)} Due ส่งแล้ว` : undefined, active: data.kpis.completed > 0, motion: "loading" },
  ], [data, printedWaiting]);

  // สร้างฉาก 3D ครั้งเดียว (โหลด three.js แบบ lazy เฉพาะฝั่ง browser)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    import("./dashboard-operations-floor-3d").then(({ createOperationsFloor }) => {
      if (cancelled) return;
      try {
        // ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวในเครื่อง → เริ่มแบบหยุดนิ่ง
        const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
        engineRef.current = createOperationsFloor(stage, {
          getLabels: () => labelRefs.current,
          onPick: (index) => engineRef.current?.focus(index),
          reducedMotion,
        });
        engineRef.current.setActive(latestRef.current.active);
        engineRef.current.setRunning(latestRef.current.running && !reducedMotion);
        if (reducedMotion) setAnimationEnabled(false);
      } catch {
        setWebglFailed(true);
      }
    }).catch(() => setWebglFailed(true));
    return () => { cancelled = true; engineRef.current?.dispose(); engineRef.current = null; };
  }, []);

  // สถานะจากข้อมูลระบบ → สถานีที่ไม่มีงานจะหยุดนิ่งในฉาก 3D
  useEffect(() => {
    latestRef.current = { active: stations.map((station) => station.active), running: animationEnabled };
    engineRef.current?.setActive(stations.map((station) => station.active));
    engineRef.current?.setRunning(animationEnabled);
  });

  const labelButton = (station: Station, index: number) => {
    const enabled = canOpen(station.page);
    const running = animationEnabled && station.active;
    return <button
      key={station.number}
      ref={(element) => { labelRefs.current[index] = element; }}
      type="button"
      className={`${styles.hotspot} ${styles[station.tone]} ${station.active ? styles.stationActive : styles.stationIdle}`}
      disabled={!enabled}
      onClick={() => onOpen(station.page)}
      aria-label={`เปิดหน้า ${station.label} · ${station.active ? "มีงาน" : "ไม่มีงานขณะนี้"}`}
    >
      <b>{station.number}</b>
      <span><strong>{station.label}</strong><small>{station.sub}</small>{station.value && <em>{station.value}</em>}<i>{running ? "● กำลังทำงาน" : station.active ? "● มีงาน (หยุด Animation)" : "○ หยุดรอ"}</i></span>
    </button>;
  };

  return <section className={styles.shell} aria-labelledby="operations-floor-title">
    <header className={styles.heading}>
      <div><small>KIT 3D OPERATIONS FLOOR</small><h3 id="operations-floor-title">ภาพรวมกระบวนการทำงาน Smart Factory</h3><p>ฉาก 3D อ้างอิงข้อมูลระบบ · ลากเพื่อหมุน · ล้อเลื่อนเพื่อซูม · คลิกพื้นสถานีเพื่อซูมเข้า · คลิกป้ายเพื่อเปิดหน้าการทำงาน</p></div>
      <div className={styles.headingActions}>
        <span className={styles.systemStatus}><i /> สถานะจากข้อมูลระบบ</span>
        <button type="button" className={styles.animationToggle} aria-pressed={animationEnabled} onClick={changeAnimation}><span>{animationEnabled ? "Ⅱ" : "▶"}</span>{animationEnabled ? "ปิด Animation" : "เปิด Animation"}</button>
      </div>
    </header>

    <div className={styles.stage} ref={stageRef} role="img" aria-label="โรงงานสามมิติแบบเคลื่อนไหว แสดงกระบวนการ Forecast ถึง Delivery จำนวน 7 สถานี">
      {webglFailed
        ? <div className={styles.fallback}><b>เบราว์เซอร์นี้แสดงภาพ 3D ไม่ได้ (WebGL ถูกปิด)</b><small>เลือกสถานีด้านล่างเพื่อเปิดหน้าการทำงาน</small><div className={styles.fallbackGrid}>{stations.map(labelButton)}</div></div>
        : <>
          <div className={styles.labels}>{stations.map(labelButton)}</div>
          <div className={styles.camTools}>
            <button type="button" onClick={() => engineRef.current?.home()}>⌂ ภาพรวม</button>
            <button type="button" onClick={() => engineRef.current?.top()}>▦ มุมบน</button>
          </div>
          <span className={styles.hint}>ลาก = หมุน · คลิกขวาลาก = เลื่อน · ล้อ = ซูม</span>
        </>}
    </div>
    <div className={styles.floorLegend}><span><i className={styles.legendActive} />มีงาน — Animation ทำงาน</span><span><i />ไม่มีงาน — หยุดอัตโนมัติ</span><small>ตัวเลขทุกจุดมาจาก /api/dashboard</small></div>
  </section>;
}
