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

test("prints up to eight unique Stock Tags per A4 page and safely deletes unused Tags", async () => {
  const [appSource, stockApi] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /const tagsPerPage = 8/);
  assert.match(appSource, /Math\.ceil\(tagMarkups\.length \/ tagsPerPage\)/);
  assert.match(appSource, /grid-template-columns:repeat\(2,1fr\)/);
  assert.match(appSource, /grid-template-rows:repeat\(4,1fr\)/);
  assert.match(appSource, /A4 หนึ่งหน้าสูงสุด 8 Tag/);
  assert.match(appSource, /deleteStockTag/);
  assert.match(stockApi, /action === "delete_tag"/);
  assert.match(stockApi, /Tag นี้มีประวัติรับเข้า จัดงาน หรือขายออกแล้ว/);
});

test("v2.8.11 prints eight high-contrast Tags with larger readable text", async () => {
  const appSource = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /grid-template-rows:repeat\(4,1fr\)/);
  assert.match(appSource, /border:1\.6px solid #003f98/);
  assert.match(appSource, /\.main b\{[^}]*font-size:9px/);
  assert.match(appSource, /\.grid b\{[^}]*font-size:6\.4px/);
  assert.match(appSource, /\.qty,\.box-cell b\{font-size:11\.5px!important/);
  assert.match(appSource, /print-color-adjust:exact/);
});

test("v2.8.4 splits a Job into full and remainder boxes", async () => {
  const [appSource, stockApi] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /จำนวนสูงสุดต่อกล่อง/);
  assert.match(appSource, /Math\.ceil\(plannedTotalQty \/ selectedStockPart\.standardQty\)/);
  assert.match(appSource, /BOX \/ กล่อง/);
  assert.match(appSource, /กล่องสุดท้าย/);
  assert.doesNotMatch(appSource, /<small>STATUS<\/small>/);
  assert.match(stockApi, /const boxCount = Math\.ceil\(totalQty \/ packQty\)/);
  assert.match(stockApi, /boxNo < boxCount \? packQty/);
  assert.match(stockApi, /-B\$\{String\(boxNo\)/);
});

test("v2.8.5 imports Parts from Excel and prints complete Stock Tag data", async () => {
  const [appSource, stockApi] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /นำเข้า Part Excel/);
  assert.match(appSource, /Max Qty per Box/);
  assert.match(appSource, /QR \/ BARCODE/);
  assert.match(appSource, /DELIVERY QTY \/ จำนวนงานรวม/);
  assert.match(appSource, /QTY IN BOX \/ จำนวนในกล่อง/);
  assert.match(appSource, /CUSTOMER/);
  assert.match(stockApi, /action === "import_parts"/);
  assert.match(stockApi, /deliveryQty: totalQty/);
});

test("v2.8.6 separates Stock operations from Tag printing", async () => {
  const appSource = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /key: "stock", label: "Stock"/);
  assert.match(appSource, /key: "tags", label: "พิมพ์ Tag"/);
  assert.match(appSource, /function renderTags\(\)/);
  assert.match(appSource, /function renderStock\(\)/);
  assert.match(appSource, /Tag ที่สร้างแล้ว/);
  assert.match(appSource, /ยิง Tag รับงานเข้า Stock/);
});

test("v2.8.7 opens the camera from Stock receiving and receives immediately", async () => {
  const appSource = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /cameraPurpose/);
  assert.match(appSource, /เปิดกล้องยิง Tag/);
  assert.match(appSource, /cameraPurpose === "stock"/);
  assert.match(appSource, /receiveStockTag\(value\)/);
  assert.match(appSource, /สแกน Tag รับงานเข้า Stock/);
});

test("v2.8.8 supports per-user page permissions and server-side checks", async () => {
  const [appSource, authSource, usersApi, schema, migration] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cloudflare-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../database-upgrade-v2.8.8-user-permissions.sql", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /สิทธิ์เข้าใช้งานรายบุคคล/);
  assert.match(appSource, /allowedPages\.has/);
  assert.match(appSource, /บันทึกผู้ใช้งานและสิทธิ์/);
  assert.match(authSource, /PERMISSION_KEYS/);
  assert.match(authSource, /hasPermission/);
  assert.match(usersApi, /replacePermissions/);
  assert.match(schema, /appUserPermissions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS app_user_permissions/);
});

test("v2.8.9 separates arranging and dispatching and shows mobile logout", async () => {
  const [appSource, authSource, dueApi, stockApi, css, migration] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cloudflare-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/due/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../database-upgrade-v2.8.9-split-workflow-permissions.sql", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /key: "arrange", label: "จัดงาน"/);
  assert.match(appSource, /key: "dispatch", label: "ตรวจและขายออก"/);
  assert.match(appSource, /renderScan\("arrange"\)/);
  assert.match(appSource, /renderScan\("dispatch"\)/);
  assert.match(appSource, /bottom-logout/);
  assert.doesNotMatch(appSource, /key: "scan", label: "สแกนและตัดยอด"/);
  assert.match(authSource, /"arrange", "dispatch"/);
  assert.match(stockApi, /hasPermission\(user, "arrange"\)/);
  assert.match(dueApi, /hasPermission\(user, "dispatch"\)/);
  assert.match(css, /\.mobile-bottom-nav \.bottom-logout/);
  assert.match(migration, /permission_key = 'scan'/);
});
