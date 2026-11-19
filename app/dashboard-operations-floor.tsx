"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import styles from "./dashboard-operations-floor.module.css";

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

type CameraView = { yaw: number; pitch: number; zoom: number };

const DEFAULT_CAMERA: CameraView = { yaw: 0, pitch: 0, zoom: 1 };
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function Worker({ task }: { task: Station["motion"] }) {
  return <svg className={`${styles.worker} ${styles[task]}`} viewBox="0 0 90 92" aria-hidden="true">
    <ellipse className={styles.shadow} cx="45" cy="86" rx="24" ry="5" />
    <g className={styles.workerBody}>
      <circle className={styles.helmet} cx="45" cy="19" r="10" />
      <path className={styles.helmetRim} d="M32 18h26" />
      <rect className={styles.shirt} x="34" y="29" width="22" height="30" rx="8" />
      <path className={styles.legLeft} d="M40 57 35 80" />
      <path className={styles.legRight} d="M50 57 56 80" />
      <path className={styles.armLeft} d="M36 35 22 50" />
      <path className={styles.armRight} d="M54 35 68 49" />
    </g>
    {(task === "scanner" || task === "verify") && <><rect className={styles.handScanner} x="66" y="45" width="10" height="6" rx="2" /><path className={styles.scanBeam} d="M76 48h13" /></>}
    {task === "machine" && <><rect className={styles.machineUnit} x="63" y="42" width="24" height="34" rx="4" /><rect className={styles.machineScreen} x="68" y="47" width="14" height="8" rx="1" /><path className={styles.tagPaper} d="M70 76v12h14V76" /></>}
    {task === "office" && <><rect className={styles.desk} x="3" y="56" width="31" height="7" rx="2" /><rect className={styles.monitor} x="9" y="34" width="22" height="17" rx="2" /><path className={styles.chartLine} d="m12 47 5-5 4 3 7-7" /></>}
    {(task === "packing" || task === "loading") && <rect className={styles.movingBox} x="66" y="53" width="20" height="18" rx="2" />}
  </svg>;
}

function Forklift() {
  return <svg className={styles.forklift} viewBox="0 0 132 74" aria-hidden="true">
    <ellipse className={styles.shadow} cx="64" cy="67" rx="53" ry="5" />
    <path className={styles.forkBody} d="M22 33h51l12 22H17z" />
    <path className={styles.forkCab} d="M48 12h27l11 32H47z" />
    <path className={styles.forkWindow} d="M54 17h16l8 21H53z" />
    <circle className={styles.wheel} cx="35" cy="57" r="10" /><circle className={styles.wheel} cx="77" cy="57" r="10" />
    <path className={styles.mast} d="M94 6v52m7-52v52m0-8h27" />
    <rect className={styles.forkBox} x="106" y="30" width="22" height="20" rx="2" />
  </svg>;
}

function MotionScene({ station, running }: { station: Station; running: boolean }) {
  const motionClass = `${styles.motion} ${styles[`motion${station.number}`]} ${station.active ? styles.motionActive : styles.motionIdle} ${running ? styles.motionRunning : styles.motionStopped}`;
  return <div className={motionClass} aria-hidden="true">
    <span className={styles.activityGlow} />
    {station.motion === "forklift" ? <Forklift /> : <Worker task={station.motion} />}
  </div>;
}

export default function DashboardOperationsFloor({ data, canOpen, onOpen }: {
  data: FloorData;
  canOpen: (page: DashboardTargetPage) => boolean;
  onOpen: (page: DashboardTargetPage) => void;
}) {
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [camera, setCamera] = useState<CameraView>(DEFAULT_CAMERA);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const changeAnimation = () => setAnimationEnabled((current) => !current);
  const resetCamera = () => setCamera(DEFAULT_CAMERA);
  const rotateCamera = (amount: number) => setCamera((current) => ({ ...current, yaw: clamp(current.yaw + amount, -16, 16) }));
  const zoomCamera = (amount: number) => setCamera((current) => ({ ...current, zoom: clamp(current.zoom + amount, .78, 1.28) }));
  const beginCameraDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCamera((current) => ({
      ...current,
      yaw: clamp(drag.yaw + (event.clientX - drag.x) * .035, -16, 16),
      pitch: clamp(drag.pitch - (event.clientY - drag.y) * .025, -8, 8),
    }));
  };
  const endCameraDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const wheelCamera = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomCamera(event.deltaY > 0 ? -.06 : .06);
  };
  const keyboardCamera = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") rotateCamera(-2);
    else if (event.key === "ArrowRight") rotateCamera(2);
    else if (event.key === "+" || event.key === "=") zoomCamera(.06);
    else if (event.key === "-") zoomCamera(-.06);
    else if (event.key === "0") resetCamera();
    else return;
    event.preventDefault();
  };
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
        <span className={styles.interactiveBadge}>360° Interactive</span>
        <button type="button" className={styles.animationToggle} aria-pressed={animationEnabled} onClick={changeAnimation}><span>{animationEnabled ? "Ⅱ" : "▶"}</span>{animationEnabled ? "ปิด Animation" : "เปิด Animation"}</button>
      </div>
    </header>

    <div className={styles.cameraToolbar} aria-label="ตัวควบคุมมุมมองโรงงานสามมิติ">
      <span>ลากพื้นที่ว่างเพื่อหมุน · เลื่อนเมาส์หรือกดปุ่มเพื่อซูม</span>
      <div>
        <button type="button" onClick={() => rotateCamera(-3)} aria-label="หมุนมุมมองไปทางซ้าย">↶</button>
        <button type="button" onClick={() => zoomCamera(-.08)} aria-label="ซูมออก">−</button>
        <button type="button" onClick={resetCamera} aria-label="คืนมุมมองเริ่มต้น">⌂</button>
        <button type="button" onClick={() => zoomCamera(.08)} aria-label="ซูมเข้า">＋</button>
        <button type="button" onClick={() => rotateCamera(3)} aria-label="หมุนมุมมองไปทางขวา">↷</button>
      </div>
    </div>

    <div
      className={`${styles.viewport} ${dragging ? styles.dragging : ""}`}
      tabIndex={0}
      onPointerDown={beginCameraDrag}
      onPointerMove={moveCamera}
      onPointerUp={endCameraDrag}
      onPointerCancel={endCameraDrag}
      onWheel={wheelCamera}
      onKeyDown={keyboardCamera}
      aria-label="โรงงานสามมิติแบบโต้ตอบ ใช้ปุ่มลูกศรซ้ายขวาเพื่อหมุน ปุ่มบวกและลบเพื่อซูม และเลขศูนย์เพื่อคืนมุมมอง"
    >
      <div className={styles.cameraFrame} style={{ transform: `perspective(1150px) rotateX(${camera.pitch}deg) rotateY(${camera.yaw}deg) scale(${camera.zoom})` }}>
      <div className={`${styles.floor} ${animationEnabled ? styles.sceneAlive : ""}`} role="img" aria-label="โรงงานสามมิติแบบเคลื่อนไหว แสดงกระบวนการ Forecast ถึง Delivery จำนวน 7 สถานี">
        <div className={styles.motionLayer}>{stations.map((station) => <MotionScene key={station.number} station={station} running={animationEnabled && station.active} />)}</div>
        {stations.map((station) => {
          const enabled = canOpen(station.page);
          return <button
            key={station.number}
            type="button"
            className={`${styles.hotspot} ${styles[`station${station.number}`]} ${styles[station.tone]} ${station.active ? styles.stationActive : styles.stationIdle}`}
            disabled={!enabled}
            onClick={() => onOpen(station.page)}
            aria-label={`เปิดหน้า ${station.label} · ${station.active ? "มีงาน" : "ไม่มีงานขณะนี้"}`}
          >
            <b>{station.number}</b>
            <span><strong>{station.label}</strong><small>{station.sub}</small>{station.value && <em>{station.value}</em>}<i>{station.active ? "● กำลังทำงาน" : "○ หยุดรอ"}</i></span>
          </button>;
        })}
      </div>
      </div>
    </div>
    <div className={styles.floorLegend}><span><i className={styles.legendActive} />มีงาน — Animation ทำงาน</span><span><i />ไม่มีงาน — หยุดอัตโนมัติ</span><small>มือถือใช้ปุ่มควบคุมมุมมอง หรือใช้นิ้วลากบริเวณพื้นที่ว่าง</small></div>
  </section>;
}
