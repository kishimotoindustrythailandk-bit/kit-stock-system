import { requireCloudUser } from "./cloudflare-auth";
import DeliveryControlApp from "./delivery-control-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireCloudUser();

  return (
    <DeliveryControlApp
      user={{ id: user.id, employeeCode: user.employeeCode, displayName: user.displayName, email: user.email, role: user.role }}
      signOutPath="/api/auth/logout"
    />
  );
}
