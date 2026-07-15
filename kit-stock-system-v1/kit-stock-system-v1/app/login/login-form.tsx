"use client";

import { FormEvent, useState } from "react";

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeCode, pin, remember }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เข้าสู่ระบบไม่สำเร็จ");
      window.location.assign(returnTo.startsWith("/") ? returnTo : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <div className="factory-silhouette"><i /><i /><i /><span /></div>
        <div className="login-brand-copy">
          <span>FACTORY OPERATIONS</span>
          <h1>ตรวจงานให้ตรง Tag<br />ยืนยันทุกบ๊อคด้วยรูป</h1>
          <p>เชื่อมต่อ Part, Lot, จำนวน และผู้รับผิดชอบในระบบเดียว</p>
        </div>
      </section>
      <section className="login-side">
        <form className="login-card" onSubmit={submit}>
          <div className="kit-mark"><strong>K</strong><strong>I</strong><strong>T</strong></div>
          <p className="company-name">Kishimoto Industry (Thailand) Co., Ltd.</p>
          <p className="system-name">STOCK VERIFICATION SYSTEM</p>
          <div className="login-heading">
            <span>SECURE ACCESS</span>
            <h2>เข้าสู่ระบบ</h2>
            <p>ใช้รหัสพนักงานและ PIN ที่ผู้ดูแลระบบกำหนด</p>
          </div>
          <label className="login-field">
            <span>รหัสพนักงาน</span>
            <div><b>♙</b><input autoFocus autoComplete="username" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())} placeholder="เช่น 000123" required maxLength={20} /></div>
          </label>
          <label className="login-field">
            <span>PIN 6 หลัก</span>
            <div><b>▣</b><input type={showPin ? "text" : "password"} inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" required pattern="\d{6}" /><button type="button" onClick={() => setShowPin((value) => !value)} aria-label="แสดงหรือซ่อน PIN">{showPin ? "ซ่อน" : "ดู"}</button></div>
          </label>
          <label className="remember-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>จดจำการเข้าสู่ระบบบนอุปกรณ์นี้</span></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-button" disabled={loading || pin.length !== 6}>{loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}<span>›</span></button>
          <div className="secure-note"><b>✓</b><span>ระบบจะล็อกบัญชี 15 นาทีเมื่อใส่ PIN ผิดติดต่อกัน 5 ครั้ง</span></div>
          <p className="login-help">ติดต่อผู้ดูแลระบบ หากไม่สามารถเข้าสู่ระบบได้</p>
        </form>
      </section>
    </main>
  );
}
