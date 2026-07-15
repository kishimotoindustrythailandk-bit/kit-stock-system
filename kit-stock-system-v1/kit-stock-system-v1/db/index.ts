import { drizzle } from "drizzle-orm/d1";
import { getRuntimeEnv } from "../runtime/env";
import * as schema from "./schema";

export function getDb() {
  const { DB } = getRuntimeEnv();
  if (!DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Check the D1 binding in wrangler.jsonc."
    );
  }

  return drizzle(DB, { schema });
}
