"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./dashboard-control-center.module.css";

type DashboardData = {
  selectedDate: string;
  kpis: { dueTotal: number; completed: number; pending: number; overdue: number; successRate: number };
  dueStatus: { completed: number; waiting: number; overdue: number; total: number };
  upcoming: Array<{ id: number; deliveryDate: string; deliveryTime: string; materialCode: string; partName: string; remainingQty: number }>;
  stock: { availableQty: number; arrangedQty: number; replacementQty: number; anomalyCount: number };
  process: { planQty: number; tagQty: number; receivedQty: number; arrangedQty: number; checkedQty: number; exportedQty: number };
  fac: Array<{ fact: string; dueTotal: number; completed: number; pending: number; overdue: number }>;
  forecast: Array<{ date: string; forecastQty: number; availableQty: number }>;
  activities: Array<{ id: number; type: string; actor: string; detail: string; createdAt: string }>;
  updatedAt: string;
};

type TargetPage = "plan" | "tags" | "stock" | "arrange" | "dispatch" | "exports" | "forecast" | "history";
type DetailFilter = { date?: string; fact?: string; status?: "all" | "completed" | "pending" | "over" };

const fmt = (value: unknown) => new Intl.NumberFormat("th-TH").format(Number(value || 0));
const pct = (value: number, total: number) => total ? Math.round(value / total * 1000) / 10 : 0;
const thaiDate = (value: string) => value ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(`${value}T00:00:00+07:00`)) : "—";
const thaiDateTime = (value: string | Date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));

export default function DashboardControlCenter({ userName, canOpen, onNavigate }: {
  userName: string;
  canOpen: (page: TargetPage) => boolean;
  onNavigate: (page: TargetPage, filter?: DetailFilter) => void;
}) {
  const initialDate = useMemo(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(initialDate);
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
    setLoading(true);
    setError("");
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
  }, [selectedDate]);

  if (loading && !data) return <div className={styles.state}><span /><b>กำลังรวบรวมข้อมูลจริงจากระบบ…</b></div>;
  if (error && !data) return <div className={`${styles.state} ${styles.error}`}><b>โหลด Control Center ไม่สำเร็จ</b><small>{error}</small><button onClick={() => setSelectedDate((value) => `${value}`)}>ลองใหม่</button></div>;
  if (!data) return null;

  const open = (page: TargetPage, filter?: DetailFilter) => canOpen(page) && onNavigate(page, filter);
  const total = data.dueStatus.total;
  const donut = total
    ? `conic-gradient(#24b469 0 ${pct(data.dueStatus.completed, total)}%, #f5a623 ${pct(data.dueStatus.completed, total)}% ${pct(data.dueStatus.completed + data.dueStatus.waiting, total)}%, #ef4056 ${pct(data.dueStatus.completed + data.dueStatus.waiting, total)}% 100%)`
    : "#e8eff8";
  const maxChart = Math.max(1, ...data.forecast.flatMap((item) => [Number(item.forecastQty), Number(item.availableQty)]));
  const alerts = [
    { label: "Due ค้างส่ง", value: data.kpis.pending, tone: "warn", page: "plan" as TargetPage, status: "pending" as const },
    { label: "ใกล้/เกินคิว", value: data.kpis.overdue, tone: "danger", page: "plan" as TargetPage, status: "over" as const },
    { label: "Stock ต่ำกว่า Forecast", value: data.forecast.filter((row) => Number(row.availableQty) < Number(row.forecastQty)).length, tone: "warn", page: "forecast" as TargetPage },
    { label: "รายการผิดปกติ", value: Number(data.stock.anomalyCount), tone: "danger", page: "stock" as TargetPage },
  ];

  return <div className={styles.dashboard}>
    <section className={styles.hero}>
      <div><small>KIT DELIVERY DUE CONTROL</small><h2>สวัสดีครับ {userName}</h2><p>Control Center ภาพรวมตั้งแต่แผนงานจนถึงส่งออก</p></div>
      <div className={styles.heroBrand}><b>Deliver Right</b><span>Move Forward</span></div>
      <div className={styles.clock}><small>วันที่และเวลา</small><b>{thaiDateTime(clock)}</b><label>วันที่ Due <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || initialDate)} /></label></div>
    </section>

    <section className={styles.kpis}>
      {[
        ["Due วันนี้", data.kpis.dueTotal, "blue", "▤", "all"],
        ["ส่งออกแล้ว", data.kpis.completed, "green", "✓", "completed"],
        ["ค้างส่ง", data.kpis.pending, "orange", "◷", "pending"],
        ["เกินคิวจัดส่ง", data.kpis.overdue, "red", "!", "over"],
        ["อัตราส่งสำเร็จ", `${data.kpis.successRate}%`, "purple", "▥", "completed"],
      ].map(([label, value, tone, icon, status]) => <button key={String(label)} className={`${styles.kpi} ${styles[String(tone)]}`} onClick={() => open("plan", { date: selectedDate, status: status as DetailFilter["status"] })} disabled={!canOpen("plan")}>
        <i>{icon}</i><span><small>{label}</small><b>{typeof value === "number" ? fmt(value) : value}</b><em>{label === "อัตราส่งสำเร็จ" ? "จาก Due ทั้งหมด" : "รายการ"}</em></span><strong>›</strong>
      </button>)}
    </section>

    <section className={styles.primaryGrid}>
      <article className={styles.panel}><header><h3>สถานะส่งงานตาม Due</h3><small>{thaiDate(selectedDate)}</small></header>
        <div className={styles.donutArea}><button className={styles.donut} style={{ background: donut }} onClick={() => open("plan", { date: selectedDate })}><span><b>{fmt(total)}</b><small>Due ทั้งหมด</small></span></button>
          <ul className={styles.legend}>
            {[["ส่งออกครบ", data.dueStatus.completed, "green"], ["ค้างส่ง", data.dueStatus.waiting, "orange"], ["เกินคิวจัดส่ง", data.dueStatus.overdue, "red"]].map(([label, value, tone]) => <li key={String(label)}><i className={styles[String(tone)]} /><span>{label}</span><b>{fmt(value)}</b><em>{pct(Number(value), total)}%</em></li>)}
          </ul>
        </div>
      </article>

      <article className={styles.panel}><header><h3>Due ที่กำลังตัดยอด</h3><button onClick={() => open("plan", { date: selectedDate, status: "pending" })}>ดูทั้งหมด →</button></header>
        <div className={styles.dueList}>{data.upcoming.length ? data.upcoming.map((due) => <button key={due.id} onClick={() => open("plan", { date: due.deliveryDate, status: "pending" })}>
          <time>{thaiDate(due.deliveryDate)} · {due.deliveryTime}</time><span><b>{due.materialCode}</b><small>{due.partName || "ไม่ระบุชื่อ Part"}</small></span><strong>{fmt(due.remainingQty)}</strong>
        </button>) : <p className={styles.normal}>✓ ไม่มี Due ค้างในวันที่เลือก</p>}</div>
      </article>

      <article className={`${styles.panel} ${styles.quickPanel}`}><header><h3>เมนูด่วน</h3></header><div className={styles.quick}>
        {[["plan","⇧","นำเข้าแผนงาน","blue"],["tags","▤","สร้าง/พิมพ์ Tag","purple"],["stock","▦","รับเข้า Stock","green"],["arrange","⌗","จัดงาน","orange"],["dispatch","✓","ตรวจและขายออก","red"],["exports","▱","รายการส่งออก","blue"]].map(([page, icon, label, tone]) => canOpen(page as TargetPage) && <button key={page} className={styles[String(tone)]} onClick={() => open(page as TargetPage)}><i>{icon}</i><span>{label}</span></button>)}
      </div></article>
    </section>

    <section className={styles.middleGrid}>
      <article className={styles.panel}><header><h3>สถานะ Stock</h3><button onClick={() => open("stock")}>ดูรายละเอียด →</button></header><div className={styles.stockGrid}>
        {[["พร้อมใช้",data.stock.availableQty,"blue","▣"],["ถูกจัดงานแล้ว",data.stock.arrangedQty,"green","▰"],["ทดแทน",data.stock.replacementQty,"orange","△"],["ผิดปกติ",data.stock.anomalyCount,"red","!"]].map(([label,value,tone,icon]) => <button key={String(label)} onClick={() => open(label === "ทดแทน" ? "stock" : "stock")}><i className={styles[String(tone)]}>{icon}</i><span><small>{label}</small><b>{fmt(value)}</b><em>{label === "ผิดปกติ" ? "Tag" : "ชิ้น"}</em></span></button>)}
      </div><p className={styles.ruleNote}>ยอดพร้อมใช้หักงานที่จัดออกจากพื้นที่ Stock และยอดจองแล้ว</p></article>

      <article className={`${styles.panel} ${styles.processPanel}`}><header><h3>สถานะกระบวนการ</h3></header><div className={styles.process}>
        {[["แผน",data.process.planQty,"plan"],["พิมพ์ Tag",data.process.tagQty,"tags"],["รับเข้า Stock",data.process.receivedQty,"stock"],["จัดงาน",data.process.arrangedQty,"arrange"],["ตรวจสอบ",data.process.checkedQty,"dispatch"],["ส่งออก",data.process.exportedQty,"exports"]].map(([label,value,page], index) => <div key={String(label)}><button onClick={() => open(page as TargetPage)} disabled={!canOpen(page as TargetPage)}><i>{index + 1}</i><span>{label}</span><b>{fmt(value)}</b></button>{index < 5 && <em>→</em>}</div>)}
      </div><small className={styles.processNote}>“ตรวจสอบ” ใช้ยอดจากรายการที่ตรวจและขายออกสำเร็จ เพราะระบบเดิมบันทึกสองขั้นตอนนี้ในธุรกรรมเดียวกัน</small></article>
    </section>

    <section className={styles.lowerGrid}>
      <article className={styles.panel}><header><h3>สรุปตามโรงงาน FAC</h3></header><div className={styles.tableWrap}><table><thead><tr><th>FAC</th><th>Due ทั้งหมด</th><th>ส่งออกแล้ว</th><th>ค้างส่ง</th><th>เกินคิว</th></tr></thead><tbody>
        {data.fac.map((row) => <tr key={row.fact} onClick={() => open("plan", { date: selectedDate, fact: row.fact })}><td>{row.fact || "ไม่ระบุ"}</td><td>{fmt(row.dueTotal)}</td><td className={styles.successText}>{fmt(row.completed)}</td><td className={styles.warningText}>{fmt(row.pending)}</td><td className={styles.dangerText}>{fmt(row.overdue)}</td></tr>)}
      </tbody><tfoot><tr><th>รวม</th><th>{fmt(data.fac.reduce((s,r)=>s+Number(r.dueTotal),0))}</th><th>{fmt(data.fac.reduce((s,r)=>s+Number(r.completed),0))}</th><th>{fmt(data.fac.reduce((s,r)=>s+Number(r.pending),0))}</th><th>{fmt(data.fac.reduce((s,r)=>s+Number(r.overdue),0))}</th></tr></tfoot></table></div></article>

      <article className={styles.panel}><header><h3>Forecast เทียบ Stock พร้อมใช้จริง</h3><button onClick={() => open("forecast")}>ดูทั้งหมด →</button></header><div className={styles.chartLegend}><span><i className={styles.blue}/>Forecast</span><span><i className={styles.green}/>Stock พร้อมใช้</span></div><div className={styles.barChart}>
        {data.forecast.length ? data.forecast.map((row) => <div key={row.date} title={`${thaiDate(row.date)} Forecast ${fmt(row.forecastQty)} / Stock ${fmt(row.availableQty)}`}><span><i className={styles.blue} style={{height:`${Math.max(Number(row.forecastQty)/maxChart*100,2)}%`}}/><i className={styles.green} style={{height:`${Math.max(Number(row.availableQty)/maxChart*100,2)}%`}}/></span><small>{thaiDate(row.date)}</small></div>) : <p className={styles.normal}>ยังไม่มี Forecast ชุดที่ใช้งาน</p>}
      </div></article>

      <article className={styles.panel}><header><h3>รายการที่ต้องดำเนินการ (Alert)</h3></header><div className={styles.alerts}>{alerts.map((alert) => <button key={alert.label} onClick={() => open(alert.page, { date: selectedDate, status: alert.status })}><i className={alert.value ? styles[alert.tone] : styles.green}>{alert.value ? "!" : "✓"}</i><span>{alert.label}</span><b>{alert.value ? `${fmt(alert.value)} รายการ` : "ปกติ"}</b><em>›</em></button>)}</div></article>
    </section>

    <article className={`${styles.panel} ${styles.activity}`}><header><h3>กิจกรรมล่าสุด</h3><button onClick={() => open("history")}>ดูทั้งหมด →</button></header><div className={styles.tableWrap}><table><thead><tr><th>เวลา</th><th>ประเภท</th><th>ผู้ดำเนินการ</th><th>รายละเอียด</th></tr></thead><tbody>
      {data.activities.length ? data.activities.map((item) => <tr key={item.id}><td>{thaiDateTime(item.createdAt)}</td><td>{item.type}</td><td>{item.actor || "System"}</td><td>{item.detail}</td></tr>) : <tr><td colSpan={4} className={styles.normal}>ยังไม่มีกิจกรรมล่าสุด</td></tr>}
    </tbody></table></div><footer>อัปเดตล่าสุด {thaiDateTime(data.updatedAt)}</footer></article>
  </div>;
}
