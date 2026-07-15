"use client";

import { FormEvent, useState } from "react";

export default function SetupForm() {
  const [form, setForm] = useState({ setupKey: "", employeeCode: "ADMIN001", fullName: "", pin: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/auth/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setError(payload.error || "ตั้งค่าระบบไม่สำเร็จ");
      setSaving(false);
      return;
    }
    window.location.assign("/login");
  }

  return <main className="setup-page"><form className="setup-card" onSubmit={submit}>
    <div className="kit-mark"><strong>K</strong><strong>I</strong><strong>T</strong></div>
    <span className="setup-kicker">FIRST TIME SETUP</span>
    <h1>สร้างผู้ดูแลระบบคนแรก</h1>
    <p>หน้านี้ใช้งานได้เพียงครั้งเดียว ก่อนเริ่มใช้งานจริง</p>
    <label><span>Setup Key จาก Cloudflare</span><input type="password" value={form.setupKey} onChange={(e) => setForm({ ...form, setupKey: e.target.value })} required /></label>
    <label><span>รหัสพนักงานผู้ดูแล</span><input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })} required /></label>
    <label><span>ชื่อ–นามสกุล</span><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
    <label><span>PIN 6 หลัก</span><input type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} pattern="\d{6}" required /></label>
    {error && <div className="login-error">{error}</div>}
    <button className="login-button" disabled={saving || form.pin.length !== 6}>{saving ? "กำลังบันทึก..." : "สร้างบัญชี Admin"}</button>
  </form></main>;
}
