"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Employee = { id: number; employeeCode: string; fullName: string; role: string; active: boolean; lastLoginAt: string | null; createdAt: string };

const roleLabels: Record<string, string> = { admin: "Admin", sender: "ผู้ส่งงาน", inspector: "ผู้ตรวจงาน", receiver: "ผู้รับงาน", viewer: "ผู้ดูรายงาน" };

export default function EmployeeManager({ currentUser }: { currentUser: { fullName: string; employeeCode: string } }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ employeeCode: "", fullName: "", role: "inspector", pin: "" });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/employees", { cache: "no-store" });
    const payload = await response.json() as { employees?: Employee[]; error?: string };
    if (response.ok) setEmployees(payload.employees || []); else setNotice(payload.error || "โหลดข้อมูลไม่สำเร็จ");
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice("");
    const response = await fetch("/api/employees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) setNotice(payload.error || "เพิ่มพนักงานไม่สำเร็จ");
    else { setNotice("เพิ่มบัญชีพนักงานเรียบร้อย"); setForm({ employeeCode: "", fullName: "", role: "inspector", pin: "" }); await load(); }
    setSaving(false);
  }

  async function update(employee: Employee, action: "toggle" | "reset") {
    const pin = action === "reset" ? window.prompt(`กำหนด PIN ใหม่ 6 หลักสำหรับ ${employee.employeeCode}`) : undefined;
    if (action === "reset" && !pin) return;
    const response = await fetch("/api/employees", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: employee.id, active: action === "toggle" ? !employee.active : undefined, pin }) });
    const payload = await response.json() as { error?: string };
    setNotice(response.ok ? (action === "toggle" ? "เปลี่ยนสถานะเรียบร้อย" : "ตั้ง PIN ใหม่เรียบร้อย") : payload.error || "ดำเนินการไม่สำเร็จ");
    if (response.ok) await load();
  }

  return <main className="employee-page">
    <header className="employee-header"><div><span>KIT STOCK VERIFICATION</span><h1>จัดการบัญชีพนักงาน</h1><p>ผู้ดูแล: {currentUser.fullName} ({currentUser.employeeCode})</p></div><Link href="/">← กลับหน้าระบบ</Link></header>
    <section className="employee-grid">
      <form className="employee-form panel" onSubmit={create}><span className="section-kicker">NEW USER</span><h2>เพิ่มพนักงาน</h2>
        <label><span>รหัสพนักงาน</span><input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })} required /></label>
        <label><span>ชื่อ–นามสกุล</span><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
        <label><span>หน้าที่</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>PIN 6 หลัก</span><input type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} pattern="\d{6}" required /></label>
        <button className="login-button" disabled={saving || form.pin.length !== 6}>{saving ? "กำลังบันทึก..." : "+ เพิ่มบัญชี"}</button>
        {notice && <div className="notice">{notice}</div>}
      </form>
      <section className="employee-list panel"><div className="panel-heading"><div><span className="section-kicker">USER ACCESS</span><h2>บัญชีในระบบ ({employees.length})</h2></div></div>
        <div className="employee-table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>หน้าที่</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th>จัดการ</th></tr></thead><tbody>
          {employees.map((employee) => <tr key={employee.id}><td><strong>{employee.employeeCode}</strong></td><td>{employee.fullName}</td><td><span className="role-badge">{roleLabels[employee.role] || employee.role}</span></td><td><span className={employee.active ? "status-active" : "status-off"}>{employee.active ? "ใช้งาน" : "ระงับ"}</span></td><td>{employee.lastLoginAt ? new Date(employee.lastLoginAt + (employee.lastLoginAt.endsWith("Z") ? "" : "Z")).toLocaleString("th-TH") : "-"}</td><td><div className="employee-actions"><button onClick={() => void update(employee, "reset")}>ตั้ง PIN</button><button className={employee.active ? "danger" : "success"} onClick={() => void update(employee, "toggle")}>{employee.active ? "ระงับ" : "เปิดใช้"}</button></div></td></tr>)}
        </tbody></table></div>
      </section>
    </section>
  </main>;
}
