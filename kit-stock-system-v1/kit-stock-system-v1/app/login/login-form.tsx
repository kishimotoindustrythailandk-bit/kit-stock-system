"use client";

import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeCode, pin }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "เข้าสู่ระบบไม่สำเร็จ");
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <label><span>รหัสพนักงาน</span><input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())} placeholder="เช่น ADMIN" autoComplete="username" autoFocus /></label>
    <label><span>PIN</span><input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="กรอก PIN" autoComplete="current-password" /></label>
    {error && <div className="login-error">! {error}</div>}
    <button className="button primary login-submit" disabled={loading || !employeeCode || !pin}>{loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
  </form>;
}
