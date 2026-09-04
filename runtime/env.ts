export type KitRuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  INITIAL_ADMIN_PIN?: string;
};

declare global {
  // The Worker entry sets the platform bindings before handing the request to Vinext.
  var __KIT_RUNTIME_ENV__: KitRuntimeEnv | undefined;
}

export function getRuntimeEnv() {
  const runtime = globalThis.__KIT_RUNTIME_ENV__;
  if (!runtime) throw new Error("ไม่พบการเชื่อมต่อฐานข้อมูลของระบบ");
  return runtime;
}
