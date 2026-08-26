import { getCurrentUser } from "../cloudflare-auth";

export const dynamic = "force-dynamic";

/**
 * หน้าไล่ปัญหาชั่วคราว — ไม่ใช่ส่วนหนึ่งของระบบงาน
 *
 * Next ปิดข้อความ error ของ Server Components ในโหมด production
 * หน้านี้จึงลองทำทีละขั้นแล้วรายงานผลออกมาตรงๆ ว่าขั้นไหนพังและพังเพราะอะไร
 *
 * ลบทิ้งได้ทันทีหลังแก้ปัญหาเสร็จ
 */

type Step = { name: string; ok: boolean; detail: string };

function describe(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n\n${error.stack ?? "(ไม่มี stack)"}`;
  }
  return String(error);
}

export default async function DiagPage() {
  const steps: Step[] = [];

  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;

  try {
    user = await getCurrentUser();
    steps.push({
      name: "1. getCurrentUser() — อ่าน session และผู้ใช้จาก D1",
      ok: true,
      detail: user
        ? JSON.stringify(user, null, 2)
        : "คืนค่า null (ไม่มี session หรือ session หมดอายุ)",
    });
  } catch (error) {
    steps.push({ name: "1. getCurrentUser()", ok: false, detail: describe(error) });
  }

  // โหลดคอมโพเนนต์ฝั่ง client ทีละตัว เพื่อดูว่าตัวไหนพังตอน import
  const modules: Array<[string, () => Promise<unknown>]> = [
    ["2. import delivery-control-app.tsx", () => import("../delivery-control-app")],
    ["3. import change-pin/change-pin-form.tsx", () => import("../change-pin/change-pin-form")],
    ["4. import login/login-form.tsx", () => import("../login/login-form")],
    ["5. import login-throttle.ts", () => import("../login-throttle")],
    ["6. import pin-security.ts", () => import("../pin-security")],
  ];

  for (const [name, load] of modules) {
    try {
      const mod = await load();
      const keys = Object.keys(mod as object);
      steps.push({ name, ok: true, detail: `โหลดสำเร็จ · export: ${keys.join(", ") || "(ไม่มี named export)"}` });
    } catch (error) {
      steps.push({ name, ok: false, detail: describe(error) });
    }
  }

  const failed = steps.filter((step) => !step.ok);

  return (
    <main style={{ font: "14px/1.7 ui-monospace, Menlo, monospace", padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ font: "700 22px/1.3 system-ui, sans-serif", marginBottom: 4 }}>
        KIT Stock — หน้าไล่ปัญหา
      </h1>
      <p style={{ font: "14px/1.6 system-ui, sans-serif", color: "#555", marginTop: 0 }}>
        {failed.length === 0
          ? "ทุกขั้นผ่านหมด แปลว่าปัญหาอยู่ตอน render ไม่ใช่ตอนโหลดโมดูล"
          : `พบขั้นที่ล้มเหลว ${failed.length} ขั้น — ดูรายละเอียดสีแดงด้านล่าง`}
      </p>

      {steps.map((step) => (
        <section
          key={step.name}
          style={{
            border: "1px solid #ddd",
            borderLeft: `4px solid ${step.ok ? "#1d6f45" : "#b3261e"}`,
            padding: "12px 16px",
            marginTop: 12,
            background: step.ok ? "#fff" : "#fff5f4",
          }}
        >
          <b style={{ font: "600 14px system-ui, sans-serif", color: step.ok ? "#1d6f45" : "#b3261e" }}>
            {step.ok ? "ผ่าน" : "ล้มเหลว"} — {step.name}
          </b>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "8px 0 0", fontSize: 12.5 }}>
            {step.detail}
          </pre>
        </section>
      ))}
    </main>
  );
}
