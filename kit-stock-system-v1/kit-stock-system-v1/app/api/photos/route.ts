import { getRuntimeEnv } from "../../../runtime/env";
import { getEmployeeUser } from "../../employee-auth";

export async function GET(request: Request) {
  const user = await getEmployeeUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const key = new URL(request.url).searchParams.get("key");
  if (!key || (!key.startsWith("evidence/") && !key.startsWith("products/"))) {
    return new Response("Not found", { status: 404 });
  }

  const { BUCKET } = getRuntimeEnv();
  if (!BUCKET) return new Response("Storage unavailable", { status: 503 });
  const object = await BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
