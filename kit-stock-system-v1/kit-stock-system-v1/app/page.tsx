import { requireEmployee } from "./employee-auth";
import StockApp from "./stock-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireEmployee("/");

  return (
    <StockApp
      user={{ displayName: user.fullName, email: `${user.employeeCode} · ${roleLabel(user.role)}`, role: user.role }}
      signOutPath="/api/auth/logout"
    />
  );
}

function roleLabel(role: string) {
  return ({ admin: "ผู้ดูแลระบบ", sender: "ผู้ส่งงาน", inspector: "ผู้ตรวจงาน", receiver: "ผู้รับงาน", viewer: "ผู้ดูรายงาน" } as Record<string, string>)[role] ?? role;
}
