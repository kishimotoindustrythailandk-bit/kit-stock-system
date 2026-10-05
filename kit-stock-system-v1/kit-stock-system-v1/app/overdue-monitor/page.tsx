import Link from "next/link";
import { hasPermission, requireCloudUser } from "../cloudflare-auth";
import DeliveryControlApp from "../delivery-control-app";

export const dynamic = "force-dynamic";

export default async function OverdueMonitor() {
  const user = await requireCloudUser();
  if (!hasPermission(user, "plan")) {
    return <main><h1>บัญชีนี้ไม่มีสิทธิ์ดูงานติดลบ / ค้างส่ง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  }
  return <DeliveryControlApp
    user={{ id: user.id, employeeCode: user.employeeCode, displayName: user.displayName, email: user.email, role: user.role, permissions: user.permissions }}
    signOutPath="/api/auth/logout"
    monitorMode
  />;
}
