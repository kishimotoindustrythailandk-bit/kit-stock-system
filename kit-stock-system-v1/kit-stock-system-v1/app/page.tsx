import { requireCloudUser } from "./cloudflare-auth";
import DeliveryControlApp from "./delivery-control-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireCloudUser();

  return (
    <DeliveryControlApp
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath="/api/auth/logout"
    />
  );
}
