import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../../../../db";
import { employeeSessions } from "../../../../db/schema";
import { SESSION_COOKIE, sha256 } from "../../../employee-auth";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(employeeSessions).where(eq(employeeSessions.sessionHash, await sha256(token)));
  cookieStore.delete(SESSION_COOKIE);
  return Response.redirect(new URL("/login", request.url), 303);
}

export const POST = GET;
