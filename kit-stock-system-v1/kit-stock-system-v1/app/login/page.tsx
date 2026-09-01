import { redirect } from "next/navigation";
import { getCurrentUser } from "../cloudflare-auth";
import LoginForm from "./login-form";

/* eslint-disable @next/next/no-img-element */

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <main className="login-page login-v2">
    <section className="login-card">
      <div className="login-brand"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <div className="login-copy">
        <span>ระบบควบคุมการส่งงาน</span>
        <div className="login-welcome-row"><h1>ยินดีต้อนรับ</h1><i>👋</i><em>📋</em></div>
        <p>เข้าสู่ระบบด้วยรหัสพนักงานและ PIN<br />เพื่อจัดการ Due สแกน QR Tag และตัดยอด</p>
      </div>
      <LoginForm />
      <footer><span>☁</span> ระบบ Cloudflare พร้อมใช้งาน <i /></footer>
      <small className="login-copyright">© 2026 KISHIMOTO INDUSTRY (THAILAND) CO., LTD.</small>
    </section>
    <aside className="login-visual">
      <div className="login-glow one" /><div className="login-glow two" />
      <div className="login-route"><span>✦</span><b>●</b><i>⌁</i></div>
      <div className="login-visual-copy">
        <span>DELIVERY DUE CONTROL</span>
        <h2>ส่งงาน<span>ตรงเวลา</span><br />ตรวจสอบได้ทุกขั้นตอน</h2>
        <ul>
          <li><i className="green">☁</i><p><b>ข้อมูล Due อัปเดตแบบเรียลไทม์</b><small>มั่นใจได้ว่างานไม่ตกหล่น</small></p></li>
          <li><i className="pink">▦</i><p><b>สแกน QR Tag ง่าย รวดเร็ว</b><small>ด้วยเครื่องสแกนบาร์โค้ด</small></p></li>
          <li><i className="yellow">◈</i><p><b>ข้อมูลปลอดภัย</b><small>จัดเก็บบน Cloud</small></p></li>
        </ul>
      </div>
      <img src="/kit-due-hero.png" alt="รถส่งสินค้า KIT" />
      <div className="login-benefits">
        <div><i>◷</i><p><b>รวดเร็ว</b><small>ใช้งานง่ายไม่กี่ขั้นตอน</small></p></div>
        <div><i>◈</i><p><b>แม่นยำ</b><small>ลดความผิดพลาด</small></p></div>
        <div><i>▥</i><p><b>ตรวจสอบได้</b><small>ติดตามสถานะได้ตลอดเวลา</small></p></div>
      </div>
    </aside>
  </main>;
}
