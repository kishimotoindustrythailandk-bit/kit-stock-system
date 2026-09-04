import { redirect } from "next/navigation";
import { getCurrentUser } from "../cloudflare-auth";
import ChangePinForm from "./change-pin-form";

export const dynamic = "force-dynamic";

export default async function ChangePinPage() {
  // ใช้ getCurrentUser ไม่ใช่ requireCloudUser เพราะ requireCloudUser จะ redirect
  // มาที่หน้านี้เมื่อ mustChangePin เป็นจริง ซึ่งจะกลายเป็นวนซ้ำไม่รู้จบ
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <div className="login-copy">
        <span>ความปลอดภัยบัญชี</span>
        <h1>{user.mustChangePin ? "ตั้ง PIN ของคุณ" : "เปลี่ยน PIN"}</h1>
        <p>
          {user.mustChangePin
            ? `บัญชี ${user.employeeCode} ยังใช้ PIN ตั้งต้นของระบบอยู่ กรุณาตั้ง PIN ใหม่ 6 หลักก่อนเริ่มใช้งาน`
            : `ตั้ง PIN ใหม่ 6 หลักสำหรับบัญชี ${user.employeeCode} เมื่อเปลี่ยนแล้วเครื่องอื่นที่ค้างล็อกอินไว้จะถูกเตะออกทั้งหมด`}
        </p>
      </div>
      <ChangePinForm canSkip={!user.mustChangePin} />
    </section>
    <aside className="login-visual">
      <div>
        <span>ACCOUNT SECURITY</span>
        <h2>PIN ของคุณ<br />ไม่มีใครเห็นได้</h2>
        <p>ระบบเก็บ PIN เป็นค่าที่เข้ารหัสด้วย PBKDF2 120,000 รอบ ไม่ได้เก็บตัวเลขจริง แม้ผู้ดูแลระบบก็อ่านไม่ได้</p>
      </div>
    </aside>
  </main>;
}
