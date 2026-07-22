import { getRuntimeEnv } from "../../../../runtime/env";
import { SESSION_COOKIE } from "../../../cloudflare-auth";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await getRuntimeEnv().DB?.prepare("DELETE FROM app_sessions WHERE id = ?1").bind(token).run().catch(() => undefined);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/login",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
