"use client";

import styles from "./dashboard-operations-floor.module.css";

export type DashboardTargetPage = "plan" | "tags" | "stock" | "stock-all" | "arrange" | "dispatch" | "exports" | "forecast" | "history";

type FloorData = {
  stock: { availableQty: number; arrangedQty: number; totalQty: number };
  alerts: { shortagePartCount: number; dueSoonCount: number; overdueCount: number };
};

const fmt = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value || 0));

type Station = {
  number: number;
  label: string;
  sub: string;
  page?: DashboardTargetPage;
  tone: string;
  value?: string;
};

export default function DashboardOperationsFloor({ data, canOpen, onOpen }: {
  data: FloorData;
  canOpen: (page: DashboardTargetPage) => boolean;
  onOpen: (page: DashboardTargetPage) => void;
}) {
  const stations: Station[] = [
    { number: 1, label: "Forecast", sub: "วางแผนความต้องการลูกค้า", page: "forecast", tone: "blue", value: `${fmt(data.alerts.shortagePartCount)} Part เสี่ยงขาด` },
    { number: 2, label: "Production / ออก Tag", sub: "พิมพ์ Tag · ระบบผลิตเตรียมพัฒนา", page: "tags", tone: "purple" },
    { number: 3, label: "รับเข้า Stock", sub: "สแกน Tag รับงานเข้า Stock", page: "stock", tone: "green" },
    { number: 4, label: "Stock", sub: "คลังสินค้าและยอดคงเหลือ", page: "stock-all", tone: "cyan", value: `${fmt(data.stock.totalQty)} ชิ้น` },
    { number: 5, label: "จัดงาน", sub: "ตาม Due / รอบ / FAC", page: "arrange", tone: "orange" },
    { number: 6, label: "ตรวจและขายออก", sub: "ตรวจสอบ Tag ก่อนตัด Stock", page: "dispatch", tone: "red" },
    { number: 7, label: "Delivery", sub: "รายการส่งออก", page: "exports", tone: "violet" },
  ];
  const alerts = [
    { label: "Part ที่ Stock ไม่เพียงพอ", value: data.alerts.shortagePartCount, page: "forecast" as DashboardTargetPage, tone: "danger" },
    { label: "งาน Due ภายใน 3 วัน", value: data.alerts.dueSoonCount, page: "plan" as DashboardTargetPage, tone: "warning" },
    { label: "งานค้างส่งหรือส่งไม่ครบ", value: data.alerts.overdueCount, page: "plan" as DashboardTargetPage, tone: "info" },
  ].filter((item) => item.value > 0).slice(0, 3);

  return <section className={styles.shell} aria-labelledby="operations-floor-title">
    <header className={styles.heading}>
      <div><small>KIT 3D OPERATIONS FLOOR</small><h3 id="operations-floor-title">ภาพรวมกระบวนการทำงาน</h3><p>เลือกสถานีเพื่อเปิดหน้าการทำงานที่เกี่ยวข้อง</p></div>
      <span><i /> ข้อมูลจริงจากระบบ</span>
    </header>

    <div className={styles.viewport}>
      <div className={styles.floor} role="img" aria-label="โรงงานสามมิติแสดงกระบวนการ Forecast ถึง Delivery จำนวน 7 สถานี">
        {stations.map((station) => {
          const enabled = Boolean(station.page && canOpen(station.page));
          return <button
            key={station.number}
            type="button"
            className={`${styles.hotspot} ${styles[`station${station.number}`]} ${styles[station.tone]}`}
            disabled={!enabled}
            onClick={() => station.page && onOpen(station.page)}
            aria-label={station.page ? `เปิดหน้า ${station.label}` : `${station.label} เตรียมพัฒนาในอนาคต`}
          >
            <b>{station.number}</b>
            <span><strong>{station.label}</strong><small>{station.sub}</small>{station.value && <em>{station.value}</em>}</span>
          </button>;
        })}
      </div>
    </div>

    <aside className={styles.alerts} aria-label="รายการแจ้งเตือนล่าสุด">
      <header><div><i>!</i><h4>รายการแจ้งเตือนล่าสุด</h4></div><button type="button" onClick={() => onOpen("forecast")} disabled={!canOpen("forecast")}>ดูทั้งหมด →</button></header>
      <div>{alerts.length ? alerts.map((alert) => <button type="button" key={alert.label} onClick={() => onOpen(alert.page)} disabled={!canOpen(alert.page)}>
        <i className={styles[alert.tone]}>!</i><span>{alert.label}</span><b>{fmt(alert.value)} รายการ</b><em>›</em>
      </button>) : <p>✓ ไม่มีรายการแจ้งเตือน</p>}</div>
    </aside>
  </section>;
}
