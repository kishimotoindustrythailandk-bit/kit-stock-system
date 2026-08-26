"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ChangePinForm({ canSkip }: { canSkip: boolean }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const ready = currentPin.length >= 4 && /^\d{6}$/.test(newPin) && newPin === confirmPin;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPin !== confirmPin) return setError("ยืนยัน PIN ไม่ตรงกัน");
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "เปลี่ยน PIN ไม่สำเร็จ");
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปลี่ยน PIN ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

  return <form className="login-form" onSubmit={submit}>
    <label>
      <span>PIN เดิม</span>
      <input type="password" inputMode="numeric" autoComplete="current-password" value={currentPin}
        onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 20))} autoFocus />
    </label>
    <label>
      <span>PIN ใหม่ (ตัวเลข 6 หลัก)</span>
      <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin}
        onChange={(event) => setNewPin(onlyDigits(event.target.value))} />
    </label>
    <label>
      <span>ยืนยัน PIN ใหม่</span>
      <input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin}
        onChange={(event) => setConfirmPin(onlyDigits(event.target.value))} />
    </label>
    {error && <div className="login-error">! {error}</div>}
    <button className="button primary login-submit" disabled={saving || !ready}>
      {saving ? "กำลังบันทึก…" : "บันทึก PIN ใหม่"}
    </button>
    {canSkip && <Link className="button ghost" href="/">ย้อนกลับโดยไม่เปลี่ยน</Link>}
  </form>;
}
