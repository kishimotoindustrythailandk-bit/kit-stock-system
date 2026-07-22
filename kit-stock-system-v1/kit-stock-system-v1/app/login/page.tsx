import { redirect } from "next/navigation";
import { getCurrentUser } from "../cloudflare-auth";
import LoginForm from "./login-form";

/* eslint-disable @next/next/no-img-element */

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <div className="login-copy"><span>ระบบควบคุมการส่งงาน</span><h1>ยินดีต้อนรับ</h1><p>เข้าสู่ระบบด้วยรหัสพนักงานและ PIN เพื่อจัดการ Due สแกน QR Tag และตัดยอด</p></div>
      <LoginForm />
      <footer><i /> ระบบ Cloudflare พร้อมใช้งาน</footer>
    </section>
    <aside className="login-visual"><div><span>DELIVERY DUE CONTROL</span><h2>ส่งงานตรงเวลา<br />ตรวจสอบได้ทุกขั้นตอน</h2><p>ข้อมูล Due และประวัติการตัดยอดจัดเก็บบน Cloud อย่างปลอดภัย</p></div><img src="/kit-due-hero.png" alt="รถส่งสินค้าและกล่อง QR" /></aside>
  </main>;
}
