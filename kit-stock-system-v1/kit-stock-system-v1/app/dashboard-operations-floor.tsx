"use client";

import { lazy, Suspense, useMemo, useRef, useState } from "react";
import styles from "./dashboard-operations-floor.module.css";
import type { ThreeSceneHandle } from "./dashboard-three-scene";

const DashboardThreeScene = lazy(() => import("./dashboard-three-scene"));

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
  const sceneRef = useRef<ThreeSceneHandle>(null);
  const changeAnimation = () => setAnimationEnabled((current) => !current);
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

  return <section className={styles.shell} aria-labelledby="operations-floor-title">
    <header className={styles.heading}>
      <div><small>KIT 3D OPERATIONS FLOOR</small><h3 id="operations-floor-title">ภาพรวมกระบวนการทำงาน Smart Factory</h3><p>สถานะเคลื่อนไหวอ้างอิงข้อมูลระบบ · เลือกสถานีเพื่อเปิดหน้าการทำงาน</p></div>
      <div className={styles.headingActions}>
        <span className={styles.systemStatus}><i /> สถานะจากข้อมูลระบบ</span>
        <span className={styles.interactiveBadge}>WebGL 3D จริง</span>
        <button type="button" className={styles.animationToggle} aria-pressed={animationEnabled} onClick={changeAnimation}><span>{animationEnabled ? "Ⅱ" : "▶"}</span>{animationEnabled ? "ปิด Animation" : "เปิด Animation"}</button>
      </div>
    </header>

    <div className={styles.cameraToolbar} aria-label="ตัวควบคุมมุมมองโรงงานสามมิติ">
      <span>ลากพื้นที่ว่างเพื่อหมุน · เลื่อนเมาส์หรือกดปุ่มเพื่อซูม</span>
      <div>
        <button type="button" onClick={() => sceneRef.current?.rotate(-1)} aria-label="หมุนมุมมองไปทางซ้าย">↶</button>
        <button type="button" onClick={() => sceneRef.current?.zoom(-1)} aria-label="ซูมออก">−</button>
        <button type="button" onClick={() => sceneRef.current?.reset()} aria-label="คืนมุมมองเริ่มต้น">⌂</button>
        <button type="button" onClick={() => sceneRef.current?.zoom(1)} aria-label="ซูมเข้า">＋</button>
        <button type="button" onClick={() => sceneRef.current?.rotate(1)} aria-label="หมุนมุมมองไปทางขวา">↷</button>
      </div>
    </div>

    <Suspense fallback={<div className={styles.webglLoading}><span /><b>กำลังเตรียมโรงงาน 3D…</b></div>}>
      <DashboardThreeScene
        ref={sceneRef}
        stations={stations}
        animationEnabled={animationEnabled}
        canOpen={(page) => canOpen(page as DashboardTargetPage)}
        onOpen={(page) => onOpen(page as DashboardTargetPage)}
      />
    </Suspense>
    <div className={styles.floorLegend}><span><i className={styles.legendActive} />มีงาน — Animation ทำงาน</span><span><i />ไม่มีงาน — หยุดอัตโนมัติ</span><small>มือถือใช้ปุ่มควบคุมมุมมอง หรือใช้นิ้วลากบริเวณพื้นที่ว่าง</small></div>
  </section>;
}
