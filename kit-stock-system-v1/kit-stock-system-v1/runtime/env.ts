import { env } from "cloudflare:workers";

export type KitRuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  SETUP_KEY?: string;
};

export function getRuntimeEnv() {
  return env as unknown as KitRuntimeEnv;
}
