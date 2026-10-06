import Link from "next/link";
import { requireCloudUser, hasPermission } from "./cloudflare-auth";
import DeliveryControlApp from "./delivery-control-app";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireCloudUser();
  if ((await searchParams).page === "stock-all" && !hasPermission(user, "stock-all")) return <main><h1>ไม่มีสิทธิ์เข้าหน้า Stock ทั้งหมด</h1><Link href="/">กลับหน้าที่ได้รับสิทธิ์</Link></main>;

  return (
    <DeliveryControlApp
      user={{ id: user.id, employeeCode: user.employeeCode, displayName: user.displayName, email: user.email, role: user.role, permissions: user.permissions }}
      signOutPath="/api/auth/logout"
    />
  );
}
