import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the standalone employee login page", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker(
    new Request("http://localhost/login", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /รหัสพนักงาน/);
  assert.match(html, /DELIVERY DUE CONTROL/);
});

test("includes the mobile navigation and card layouts", async () => {
  const [appSource, css] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /mobile-bottom-nav/);
  assert.match(appSource, /mobile-filter-toggle/);
  assert.match(appSource, /mobile-card-table/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("includes v2.8 Stock Job traceability workflow", async () => {
  const [appSource, dueApi, stockApi, migration] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/due/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../database-upgrade-v2.8-traceability.sql", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /ผู้จัดงาน: เลือก Due แล้วยิง KIT Stock Tag/);
  assert.match(appSource, /Traceability: Tag ลูกค้า ↔ KIT Tag ↔ Job/);
  assert.match(appSource, /arrangedQty/);
  assert.match(stockApi, /action === "stage"/);
  assert.match(dueApi, /stock_dispatch_links/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `stock_picks`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `stock_dispatch_links`/);
});

test("includes Admin-safe Part deletion", async () => {
  const [appSource, stockApi] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /ลบ Part ที่ยังไม่ใช้งานทั้งหมด/);
  assert.match(stockApi, /action === "delete_part"/);
  assert.match(stockApi, /action === "delete_unused_parts"/);
  assert.match(stockApi, /เพื่อรักษาข้อมูลย้อนหลัง/);
});

test("prints the v2.8.2 Stock receiving Tag with the part image", async () => {
  const appSource = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /STOCK RECEIVING TAG/);
  assert.match(appSource, /imageResponse\.blob/);
  assert.match(appSource, /PART NO\. \/ MATERIAL/);
  assert.match(appSource, /PRODUCTION DATE \/ วันที่ผลิต/);
  assert.match(appSource, /ยิง QR เพื่อรับงานเข้า Stock/);
  assert.match(appSource, /KITSTOCK\|/);
});
