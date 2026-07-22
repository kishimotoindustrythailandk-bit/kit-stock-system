import { drizzle } from "drizzle-orm/d1";
import { getRuntimeEnv } from "../runtime/env";
import * as schema from "./schema";

export function getDb() {
  const { DB } = getRuntimeEnv();
  if (!DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Create the database and add binding `DB` in wrangler.jsonc."
    );
  }

  return drizzle(DB, { schema });
}
