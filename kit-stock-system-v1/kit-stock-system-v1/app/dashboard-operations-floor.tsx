"use client";

import styles from "./dashboard-operations-floor.module.css";

type TargetPage = "plan" | "tags" | "stock" | "arrange" | "dispatch" | "exports" | "forecast" | "history";
type Tone = "good" | "warn" | "danger" | "idle";

type FloorData = {
  kpis: { dueTotal: number; completed: number; pending: number; overdue: number; successRate: number };
  stock: { availableQty: number; arrangedQty: number; replacementQty: number; anomalyCount: number };
  process: { planQty: number; tagQty: number; receivedQty: number; arrangedQty: number; checkedQty: number; exportedQty: number };
  forecast: Array<{ date: string; forecastQty: number; availableQty: number }>;
  activities: Array<{ id: number; type: string; actor: string; detail: string; createdAt: string }>;
};

const fmt = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value || 0));
const thaiTime = (value: string) => new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
}).format(new Date(value));

export default function DashboardOperationsFloor({ data, selectedDate, userName, canOpen, onOpen }: {
  data: FloorData;
  selectedDate: string;
  userName: string;
  canOpen: (page: TargetPage) => boolean;
  onOpen: (page: TargetPage) => void;
}) {
  const shortageDays = data.forecast.filter((row) => Number(row.availableQty) < Number(row.forecastQty)).length;
  const stationData: Array<{ page: TargetPage; label: string; sub: string; value: number; unit: string; icon: string; tone: Tone }> = [
    { page: "forecast", label: "FORECAST", sub: "วางแผนความต้องการ", value: shortageDays, unit: "วันเสี่ยงขาด", icon: "F", tone: shortageDays > 0 ? "warn" : "good" },
    { page: "tags", label: "TAG CENTER", sub: "สร้างและพิมพ์ Tag", value: data.process.tagQty, unit: "ชิ้น", icon: "T", tone: data.process.tagQty < data.process.planQty ? "warn" : "good" },
    { page: "stock", label: "STOCK", sub: "รับเข้าและพร้อมใช้", value: data.stock.availableQty, unit: "ชิ้น", icon: "S", tone: data.stock.anomalyCount > 0 ? "danger" : data.stock.availableQty > 0 ? "good" : "idle" },
    { page: "arrange", label: "จัดงาน", sub: "เตรียมตามรอบ / FAC", value: data.process.arrangedQty, unit: "ชิ้น", icon: "A", tone: data.process.arrangedQty < data.process.receivedQty ? "warn" : "good" },
    { page: "dispatch", label: "ตรวจและขายออก", sub: "ตรวจสอบก่อนส่ง", value: data.process.checkedQty, unit: "ชิ้น", icon: "Q", tone: data.kpis.overdue > 0 ? "danger" : data.kpis.pending > 0 ? "warn" : "good" },
    { page: "exports", label: "ส่งออก", sub: "Delivery Complete", value: data.process.exportedQty, unit: "ชิ้น", icon: "D", tone: data.kpis.overdue > 0 ? "danger" : "good" },
  ];
  const online = new Set(data.activities.map((item) => item.actor).filter(Boolean)).size;

  return <section className={styles.shell} aria-label="KIT Operations Floor">
    <header className={styles.header}>
      <div><small>LIVE OPERATIONS · {selectedDate}</small><h3>KIT Operations Floor</h3><p>ภาพรวมการทำงานจริงตั้งแต่ Forecast ถึงส่งออก</p></div>
      <div className={styles.live}><i /><span><b>{online || 1}</b> ผู้ปฏิบัติงานล่าสุด</span><em>LIVE</em></div>
    </header>

    <div className={styles.desktopLayout}>
      <div className={styles.room}>
        <div className={styles.wallBrand}><b>KIT</b><span>DELIVERY CONTROL</span></div>
        <div className={styles.floorGrid} />
        {stationData.map((station, index) => <button
          key={station.page}
          className={`${styles.station} ${styles[`station${index + 1}`]} ${styles[station.tone]}`}
          type="button"
          disabled={!canOpen(station.page)}
          onClick={() => onOpen(station.page)}
          aria-label={`เปิด ${station.label}`}
        >
          <span className={styles.bot}><i>{station.icon}</i><b /><em /></span>
          <span className={styles.desk}><i /><b /><em /></span>
          <span className={styles.stationCard}><strong>{station.label}</strong><small>{station.sub}</small><b>{fmt(station.value)} <em>{station.unit}</em></b></span>
        </button>)}
        <div className={styles.conveyor}><i /><i /><i /><i /><i /></div>
        <div className={styles.roomLegend}><span><i className={styles.goodDot}/>ปกติ</span><span><i className={styles.warnDot}/>ต้องติดตาม</span><span><i className={styles.dangerDot}/>เร่งดำเนินการ</span></div>
      </div>

      <aside className={styles.feed}>
        <header><span><i />กิจกรรมล่าสุด</span><button type="button" onClick={() => onOpen("history")} disabled={!canOpen("history")}>ดูทั้งหมด</button></header>
        <div>{data.activities.slice(0, 7).map((item) => <article key={item.id}>
          <i>{(item.actor || "S").slice(0, 1).toUpperCase()}</i><span><b>{item.actor || "System"}</b><small>{item.detail}</small></span><time>{thaiTime(item.createdAt)}</time>
        </article>)}{!data.activities.length && <p>ยังไม่มีกิจกรรมล่าสุด</p>}</div>
        <footer><span>ผู้ใช้งาน</span><b>{userName}</b></footer>
      </aside>
    </div>

    <div className={styles.mobileGrid}>
      {stationData.map((station) => <button key={station.page} type="button" className={styles[station.tone]} disabled={!canOpen(station.page)} onClick={() => onOpen(station.page)}>
        <i>{station.icon}</i><span><b>{station.label}</b><small>{station.sub}</small></span><strong>{fmt(station.value)}<small>{station.unit}</small></strong>
      </button>)}
    </div>
  </section>;
}
