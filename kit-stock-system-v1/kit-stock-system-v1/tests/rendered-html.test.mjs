import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

function sourceSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing source marker after ${startMarker}: ${endMarker}`);
  return text.slice(start, end);
}

function assertBefore(text, firstPattern, secondPattern) {
  const first = text.search(firstPattern);
  const second = text.search(secondPattern);
  assert.notEqual(first, -1, `Missing earlier pattern: ${firstPattern}`);
  assert.notEqual(second, -1, `Missing later pattern: ${secondPattern}`);
  assert.ok(first < second, `${firstPattern} must appear before ${secondPattern}`);
}

test("renders the standalone employee login page", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
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

test("uses DeliveryControlApp as the production UI entry", async () => {
  const pageSource = await source("../app/page.tsx");
  assert.match(pageSource, /import DeliveryControlApp from "\.\/delivery-control-app"/);
  assert.match(pageSource, /<DeliveryControlApp/);
  assert.doesNotMatch(pageSource, /stock-app|employee-manager/i);
});

test("includes the mobile navigation and card layouts", async () => {
  const [appSource, css] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/globals.css"),
  ]);
  assert.match(appSource, /mobile-bottom-nav/);
  assert.match(appSource, /mobile-filter-toggle/);
  assert.match(appSource, /mobile-card-table/);
  assert.match(appSource, /function isDeliveryOverdue/);
  assert.match(appSource, /timeZone: "Asia\/Bangkok"/);
  assert.match(appSource, /เกินดิวจัดส่งงาน/);
  assert.match(appSource, /const overdueDues = useMemo/);
  assert.match(appSource, /showOverduePlan/);
  assert.match(appSource, /playOverdueAlertTone/);
  assert.match(appSource, /const existingContext = audioContextRef\.current/);
  assert.match(appSource, /existingContext && existingContext\.state !== "closed" \? existingContext : new AudioContextClass\(\)/);
  assert.match(appSource, /previousOverdueIdsRef/);
  assert.match(appSource, /aria-pressed=\{overdueSoundEnabled\}/);
  assert.match(appSource, /overdue-sound-shortcut/);
  assert.match(css, /\.overdue-alert/);
  assert.match(css, /\.overdue-sound-toggle/);
  assert.match(css, /\.top-user \.overdue-sound-shortcut/);
  assert.match(css, /\.plan-modern-row\.overdue/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("includes the active Stock Job traceability workflow", async () => {
  const [appSource, dueApi, stockApi, migration] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/due/route.ts"),
    source("../app/api/stock/route.ts"),
    source("../migrations/0009_stock_traceability.sql"),
  ]);
  assert.match(appSource, /จัดงานด้วย KIT Tag/);
  assert.match(appSource, /arrange-summary-grid/);
  assert.match(appSource, /stageStockTag/);
  assert.match(appSource, /Traceability: Tag ลูกค้า ↔ KIT Tag \/ Job/);
  assert.match(stockApi, /action === "stage"/);
  assert.match(stockApi, /hasPermission\(user, "arrange"\)/);
  assert.match(dueApi, /stock_dispatch_links/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `stock_picks`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `stock_dispatch_links`/);
});

test("includes Admin-safe Part deletion", async () => {
  const [appSource, stockApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
  ]);
  assert.match(appSource, /function deleteStockPart/);
  assert.match(appSource, /มีประวัติ Stock/);
  assert.match(stockApi, /action === "delete_part"/);
  assert.match(stockApi, /action === "delete_unused_parts"/);
  assert.match(stockApi, /Part นี้มี Tag หรือประวัติ Stockแล้ว|Part นี้มี Tag หรือประวัติ Stock แล้ว/);
  assert.match(stockApi, /เพื่อรักษาข้อมูลย้อนหลัง/);
});

test("prints the Stock receiving Tag with the part image", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  assert.match(appSource, /STOCK RECEIVING TAG/);
  assert.match(appSource, /const imageBlob = await imageResponse\.blob\(\)/);
  assert.match(appSource, /reader\.readAsDataURL\(imageBlob\)/);
  assert.match(appSource, /<img class="photo"/);
  assert.match(appSource, /PART NO\. \/ MATERIAL/);
  assert.match(appSource, /TAG ISSUE DATE \/ วันที่ออก TAG/);
  assert.match(appSource, /ยิง QR เพื่อรับงานเข้า Stock/);
  assert.match(appSource, /KITSTOCK\|/);
});

test("prints up to eight unique Stock Tags per A4 page and safely deletes unused Tags", async () => {
  const [appSource, stockApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
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

test("prints eight high-contrast Tags with larger readable text", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  assert.match(appSource, /grid-template-rows:repeat\(4,1fr\)/);
  assert.match(appSource, /border:1\.6px solid #003f98/);
  assert.match(appSource, /\.main b\{[^}]*font-size:9px/);
  assert.match(appSource, /\.grid b\{[^}]*font-size:6\.4px/);
  assert.match(appSource, /\.qty,\.box-cell b\{font-size:11\.5px!important/);
  assert.match(appSource, /print-color-adjust:exact/);
});

test("labels full and remainder boxes on every printed Tag", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  assert.match(appSource, /const tagPart = stock\.parts\.find/);
  assert.match(appSource, /const packQty = Number\(tagPart\?\.standardQty/);
  assert.match(appSource, /const isFullBox/);
  assert.match(appSource, /FULL BOX \/ กล่องเต็ม/);
  assert.match(appSource, /REMAINDER BOX \/ กล่องเศษ/);
  assert.match(appSource, /\.box-type\.full/);
  assert.match(appSource, /\.box-type\.remainder/);
  assert.match(appSource, /const tagsPerPage = 8/);
});

test("searches created Tags and reprints the original Tag ID without creating Stock", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  assert.match(appSource, /Tag ที่สร้างแล้ว/);
  assert.match(appSource, /ค้นหา Tag ID, Part No\., Job, ลูกค้า หรือวันที่ออก Tag/);
  assert.match(appSource, /const visibleTags = stock\.tags\.filter/);
  for (const field of ["tagId", "materialCode", "partName", "customer", "jobNo", "productionDate", "createdAt"]) {
    assert.match(appSource, new RegExp(`item\\.${field}`));
  }
  assert.match(appSource, /printStockTags\(item\)/);
  assert.match(appSource, /การพิมพ์ซ้ำใช้ Tag ID เดิมและไม่เพิ่มยอด Stock/);
});

test("places Job close and NG management on Print Tag with Stock authorization", async () => {
  const [appSource, stockApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
  ]);
  const tagsSection = sourceSection(appSource, "function renderTags()", "function renderStock()");
  const stockSection = sourceSection(appSource, "function renderStock()", "function renderPlan()");
  const pageAccess = sourceSection(appSource, "const canPrintTags", "const restoredPageRef");
  const closeJobAction = sourceSection(stockApi, 'if (action === "close_job")', 'if (action === "reopen_ng_job")');
  const reopenJobAction = sourceSection(stockApi, 'if (action === "reopen_ng_job")', 'if (action === "receive")');

  assert.match(tagsSection, /const jobGroupMap = new Map/);
  assert.match(tagsSection, /current\.totalQty \+= Number\(tag\.qty/);
  assert.match(tagsSection, /current\.tagCount \+= 1/);
  assert.match(tagsSection, /ปิดรับเข้า Job \/ จัดการงาน NG/);
  assert.match(tagsSection, /\{canPrintTags && <Card className="tag-create-card"/);
  assert.match(tagsSection, /\{canPrintTags && <Card className="tag-list-card"/);
  assert.match(tagsSection, /allowedPages\.has\("stock"\) && <Card className="stock-job-close-card"/);
  assert.match(pageAccess, /const canPrintTags = user\.role === "admin" \|\| user\.permissions\?\.includes\("tags"\)/);
  assert.match(pageAccess, /new Set<PageKey>/);
  assert.doesNotMatch(pageAccess, /\.add\("tags"\)|\.add\("replacement"\)/);
  assert.doesNotMatch(stockSection, /ปิดรับเข้า Job \/ จัดการงาน NG/);
  assert.doesNotMatch(stockSection, /const jobGroupMap = new Map/);

  assert.match(closeJobAction, /if \(!hasPermission\(user, "stock"\)\)/);
  assert.doesNotMatch(closeJobAction, /requireStockRole|user\.role/);
  assertBefore(closeJobAction, /hasPermission\(user, "stock"\)/, /UPDATE stock_tags SET status = 'ng'/);
  assert.match(reopenJobAction, /user\.role !== "admin" \|\| !hasPermission\(user, "stock"\)/);
  assertBefore(reopenJobAction, /user\.role !== "admin"/, /UPDATE stock_tags SET status = 'printed'/);
});

test("splits a Job into full and remainder boxes in the authoritative API", async () => {
  const [appSource, stockApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
  ]);
  assert.match(appSource, /จำนวนสูงสุดต่อกล่อง/);
  assert.match(appSource, /Math\.ceil\(plannedTotalQty \/ selectedStockPart\.standardQty\)/);
  assert.match(appSource, /BOX \/ กล่อง/);
  assert.doesNotMatch(appSource, /<small>STATUS<\/small>/);
  assert.match(stockApi, /function createTagId\(batchCode: string, boxNo: number, boxCount: number\)/);
  assert.match(stockApi, /const boxCount = Math\.ceil\(totalQty \/ packQty\)/);
  assert.match(stockApi, /const boxQty = boxNo < boxCount \? packQty/);
  assert.match(stockApi, /createTagId\(batchCode, boxNo, boxCount\)/);
  assert.match(stockApi, /deliveryQty: totalQty/);
});

test("imports Parts from Excel and prints complete Stock Tag data", async () => {
  const [appSource, stockApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
  ]);
  assert.match(appSource, /นำเข้าทะเบียน Part จาก Excel/);
  assert.match(appSource, /Max Qty per Box/);
  assert.match(appSource, /QR \/ BARCODE/);
  assert.match(appSource, /DELIVERY QTY \/ จำนวนงานรวม/);
  assert.match(appSource, /QTY IN BOX \/ จำนวนในกล่อง/);
  assert.match(appSource, /CUSTOMER/);
  assert.match(stockApi, /action === "import_parts"/);
  assert.match(stockApi, /deliveryQty: totalQty/);
});

test("previews and imports a Part register with matched Master and box images", async () => {
  const [appSource, stockApi, css] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
    source("../app/globals.css"),
  ]);
  const bundleFlow = sourceSection(appSource, "async function previewPartBundle", "async function syncDueParts");
  const partsPage = sourceSection(appSource, "function renderParts()", "function renderTags()");

  assert.match(bundleFlow, /parsePartExcel\(partBundleExcel\)/);
  assert.match(bundleFlow, /matchBundleImages/);
  assert.match(bundleFlow, /action: "import_parts"/);
  assert.match(bundleFlow, /importContract: "preserve_existing_v1"/);
  assert.match(bundleFlow, /skippedMaterialCodes/);
  assert.match(bundleFlow, /candidateUploads\.filter/);
  assert.match(bundleFlow, /form\.set\("slot", upload\.slot\)/);
  assert.match(stockApi, /body\.importContract !== "preserve_existing_v1"/);
  assert.match(stockApi, /ON CONFLICT\(material_code\) DO NOTHING/);
  assert.match(stockApi, /skippedMaterialCodes/);
  assert.match(partsPage, /นำเข้าทะเบียน Part จาก Excel/);
  assert.match(partsPage, /ดาวน์โหลด Template/);
  assert.match(partsPage, /ดาวน์โหลดข้อมูล Part/);
  assert.match(partsPage, /รูปตัวอย่าง \(Master\) · ชื่อไฟล์ต้องตรงกับ Part No\./);
  assert.match(partsPage, /รูปชิ้นงานในกล่อง · ชื่อไฟล์ต้องตรงกับ Part No\./);
  assert.match(partsPage, /รูปตัวอย่าง \(Master\)/);
  assert.match(partsPage, /รูปชิ้นงานในกล่อง/);
  assert.match(partsPage, /const masterImage = partImages\.find/);
  assert.match(partsPage, /const actualImage = partActualImages\.find/);
  assert.match(partsPage, /<PartImagePair materialCode=\{part\.materialCode\} masterVersion=\{masterImage\?\.updatedAt\} actualVersion=\{actualImage\?\.updatedAt\} masterAvailable=\{Boolean\(masterImage\)\} actualAvailable=\{Boolean\(actualImage\)\}/);
  assert.match(partsPage, /ในกล่อง: \{actualImage \? "มีรูป" : "ยังไม่มี"\} · Master: \{masterImage \? "มีรูป" : "ยังไม่มี"\}/);
  assert.match(appSource, /const key = `\$\{slot\}:\$\{materialCode\}:\$\{version \|\| "unversioned"\}`/);
  assert.match(appSource, /loading="lazy" decoding="async"/);
  assert.match(appSource, /actualAvailable \? <PartImage materialCode=\{materialCode\} slot="actual"/);
  assert.match(appSource, /masterAvailable \? <PartImage materialCode=\{materialCode\} slot="master"/);
  assert.match(partsPage, /ตรวจสอบข้อมูลและจับคู่รูป/);
  assert.match(css, /\.part-code-cell>\.part-image-pair/);
  assert.match(css, /\.part-modern-head,\.part-modern-row\{grid-template-columns:minmax\(250px,1\.8fr\).*\.9fr\}/s);
  assert.match(css, /@media\(max-width:760px\).*\.part-code-cell>\.part-image-pair.*height:110px/s);
  assert.match(css, /\.part-bundle-form/);
  assert.match(css, /@media\(max-width:760px\).*\.part-bundle-form\{grid-template-columns:1fr\}/s);
});

test("separates Stock receiving from Tag printing and Job management", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  const tagsSection = sourceSection(appSource, "function renderTags()", "function renderStock()");
  const stockSection = sourceSection(appSource, "function renderStock()", "function renderPlan()");

  assert.match(appSource, /key: "stock", label: "Stock"/);
  assert.match(appSource, /key: "tags", label: "พิมพ์ Tag"/);
  assert.match(tagsSection, /Tag ที่สร้างแล้ว/);
  assert.match(tagsSection, /ปิดรับเข้า Job \/ จัดการงาน NG/);
  assert.doesNotMatch(tagsSection, /สแกน Tag เพื่อรับเข้า Stock/);
  assert.match(stockSection, /สแกน Tag เพื่อรับเข้า Stock/);
  assert.doesNotMatch(stockSection, /ปิดรับเข้า Job \/ จัดการงาน NG/);
});

test("connects camera Stock receipt preview to explicit confirmation", async () => {
  const [appSource, stockApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/stock/route.ts"),
  ]);
  const scannerFlow = sourceSection(
    appSource,
    "function updateStockScannerValue",
    "async function receiveStockTag",
  );
  const previewFlow = sourceSection(
    appSource,
    "async function receiveStockTag",
    "async function confirmReceiveStockTag",
  );
  const confirmFlow = sourceSection(
    appSource,
    "async function confirmReceiveStockTag",
    "async function closeStockJob",
  );
  const receiveModal = sourceSection(
    appSource,
    "{stockReceivePreview &&",
    "{dispatchConfirmation &&",
  );
  const receiveAction = sourceSection(
    stockApi,
    'if (action === "receive")',
    'if (action === "manual_receive")',
  );

  assert.match(scannerFlow, /receiveStockTag\(value\)/);
  assert.match(previewFlow, /JSON\.stringify\(\{ action: "receive", mode: "preview", rawPayload \}\)/);
  assert.match(previewFlow, /setStockReceivePreview\(data\)/);
  assert.match(confirmFlow, /JSON\.stringify\(\{ action: "receive", rawPayload: stockReceivePreview\.rawPayload, receivedQty \}\)/);
  assert.doesNotMatch(confirmFlow, /mode: "preview"/);
  assert.match(receiveModal, /onClick=\{\(\) => void confirmReceiveStockTag\(\)\}/);

  assertBefore(receiveAction, /hasPermission\(user, "stock"\)/, /db\.update\(stockTags\)/);
  assert.match(receiveAction, /clean\(body\.mode, 20\) === "preview"/);
  assert.match(receiveAction, /action: "receive_preview"/);
  assert.match(receiveAction, /INSERT INTO stock_receipt_adjustments/);
});

test("supports canonical user roles with explicit page permissions", async () => {
  const [appSource, authSource, usersApi, schema, migration] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/cloudflare-auth.ts"),
    source("../app/api/users/route.ts"),
    source("../db/schema.ts"),
    source("../migrations/0005_user_permissions.sql"),
  ]);
  const pageAccess = sourceSection(appSource, "const canPrintTags", "const restoredPageRef");
  const userEditor = sourceSection(appSource, "{userEditorOpen &&", "</form></div>}");

  for (const [value, label] of [["production", "Production"], ["stock", "Stock"], ["qc", "QC"], ["delivery", "Delivery"]]) {
    assert.match(userEditor, new RegExp(`<option value="${value}">${label}</option>`));
    assert.match(usersApi, new RegExp(`"${value}"`));
  }
  assert.match(appSource, /const ROLE_LABELS/);
  assert.match(userEditor, /setUserForm\(\(current\) => \(\{ \.\.\.current, role \}\)\)/);
  assert.doesNotMatch(appSource, /ROLE_PERMISSIONS/);
  assert.match(userEditor, /รวมถึงหน้าหลัก/);
  assert.doesNotMatch(userEditor, /disabled=\{item\.key === "dashboard"\}/);
  assert.match(userEditor, /disabled=\{userSaving \|\| !userForm\.permissions\.length\}/);
  assert.match(usersApi, /กรุณาเลือกสิทธิ์เข้าใช้งานอย่างน้อย 1 หน้า/);
  assert.match(usersApi, /if \(user\.role !== "admin"\)/);
  assert.match(usersApi, /const LEGACY_ROLES = new Set\(\["dispatcher", "inspector"\]\)/);
  assert.match(usersApi, /else if \(!roleUnchanged\)/);
  assert.match(usersApi, /defaultPermissions\(target\.role\)/);
  assertBefore(usersApi, /defaultPermissions\(target\.role\)/, /getDb\(\)\.update\(appUsers\)/);

  assert.match(pageAccess, /new Set<PageKey>/);
  assert.doesNotMatch(pageAccess, /\.add\("dashboard"\)|\.add\("tags"\)|\.add\("replacement"\)/);
  assert.match(appSource, /const firstAllowedPage = NAV\.find/);
  assert.match(appSource, /savedPage && allowedPages\.has\(savedPage\) \? savedPage : firstAllowedPage/);
  assert.match(authSource, /dispatcher: \["dashboard", "stock", "parts", "tags", "arrange", "replacement", "history"\]/);
  assert.match(authSource, /inspector: \["dashboard", "replacement", "dispatch", "history"\]/);
  assert.match(authSource, /ROLE_DEFAULTS\[role\] \|\| \[\]/);
  assert.doesNotMatch(authSource, /normalized\.unshift\("dashboard"\)/);

  assert.match(schema, /appUserPermissions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS app_user_permissions/);
});

test("uses page permissions for normal workflows while preserving Admin-only operations", async () => {
  const [appSource, dueApi, stockApi, replacementsApi, usersApi] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/api/due/route.ts"),
    source("../app/api/stock/route.ts"),
    source("../app/api/replacements/route.ts"),
    source("../app/api/users/route.ts"),
  ]);
  const duePost = sourceSection(dueApi, "export async function POST", "} catch (error)");
  const stockGet = sourceSection(stockApi, "export async function GET", "export async function POST");
  const closeJobAction = sourceSection(stockApi, 'if (action === "close_job")', 'if (action === "reopen_ng_job")');
  const manualReceiveAction = sourceSection(stockApi, 'if (action === "manual_receive")', 'if (action === "preview_stock_count"');

  assert.match(appSource, /const hasDueDataPermission/);
  assert.match(appSource, /if \(!hasDueDataPermission\)/);
  assert.match(appSource, /const workflowPage: PageKey \| null = allowedPages\.has\("dispatch"\)/);
  assert.match(dueApi, /const DUE_READ_PERMISSIONS = \["dashboard", "plan", "arrange", "dispatch", "exports", "reports", "history"\]/);
  assert.match(duePost, /hasPermission\(user, "dispatch"\)/);
  assert.doesNotMatch(duePost, /user\.role|inspector/);

  assert.doesNotMatch(stockApi, /requireStockRole/);
  assert.match(stockGet, /const canReadFullStock = fullStockPermissions\.some/);
  assert.match(stockGet, /const canReadPartsOnly = hasPermission\(user, "parts"\) \|\| hasPermission\(user, "replacement"\)/);
  assertBefore(stockGet, /if \(!canReadFullStock\)/, /const db = getDb\(\)/);
  assert.match(stockGet, /parts, tags: \[\], allocations: \[\], picks: \[\], dispatchLinks: \[\], jobClosures: \[\]/);
  assert.match(closeJobAction, /if \(!hasPermission\(user, "stock"\)\)/);
  assert.doesNotMatch(closeJobAction, /user\.role/);
  assert.match(manualReceiveAction, /if \(!hasPermission\(user, "stock"\)\)/);
  assert.doesNotMatch(manualReceiveAction, /user\.role/);

  assert.match(replacementsApi, /function canAccess[\s\S]*return hasPermission\(user, "replacement"\)/);
  assert.doesNotMatch(replacementsApi, /hasPermission\(user, "arrange"\) \|\||hasPermission\(user, "dispatch"\) \|\||hasPermission\(user, "stock"\) \|\|/);
  assert.match(usersApi, /if \(user\.role !== "admin"\)/);
  assert.match(stockApi, /user\.role !== "admin" \|\| !hasPermission\(user, "stock"\)/);
  assert.match(stockApi, /user\.role !== "admin" \|\| !hasPermission\(user, "tags"\)/);
});

test("separates arranging and dispatching with guards before mutations", async () => {
  const [appSource, authSource, dueApi, stockApi, css, migration] = await Promise.all([
    source("../app/delivery-control-app.tsx"),
    source("../app/cloudflare-auth.ts"),
    source("../app/api/due/route.ts"),
    source("../app/api/stock/route.ts"),
    source("../app/globals.css"),
    source("../migrations/0006_split_workflow_permissions.sql"),
  ]);
  const stageAction = sourceSection(
    stockApi,
    'if (action === "stage")',
    'return Response.json({ error: "ไม่รู้จักคำสั่ง Stock"',
  );
  const duePost = sourceSection(
    dueApi,
    "export async function POST",
    "} catch (error)",
  );

  assert.match(appSource, /key: "arrange", label: "จัดงาน"/);
  assert.match(appSource, /key: "dispatch", label: "ตรวจและขายออก"/);
  assert.match(appSource, /renderScan\("arrange"\)/);
  assert.match(appSource, /renderScan\("dispatch"\)/);
  assert.match(appSource, /fetch\(signOutPath, \{ method: "POST" \}\)/);
  assert.match(appSource, /bottom-logout/);
  assert.doesNotMatch(appSource, /key: "scan", label: "สแกนและตัดยอด"/);
  assert.match(authSource, /PERMISSION_KEYS/);
  assert.match(authSource, /"arrange"/);
  assert.match(authSource, /"dispatch"/);

  assertBefore(stageAction, /hasPermission\(user, "arrange"\)/, /INSERT INTO stock_picks/);
  assert.match(stageAction, /status: 403/);
  assert.match(duePost, /if \(!user\).*status: 401/);
  assertBefore(duePost, /hasPermission\(user, "dispatch"\)/, /const payload = await request\.json/);
  assertBefore(duePost, /hasPermission\(user, "dispatch"\)/, /DB\.batch/);
  assert.doesNotMatch(duePost, /user\.role !== "admin" && user\.role !== "inspector"/);
  assert.doesNotMatch(duePost, /inspector/);
  assert.match(duePost, /status: 403/);

  assert.match(css, /\.mobile-bottom-nav \.bottom-logout/);
  assert.match(migration, /permission_key = 'scan'/);
});

test("keeps the Stock receiving popup Actual and Master sources on their labelled panels", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  const pair = sourceSection(appSource, "const EFFECTIVE_IMAGE_PROJECTION_VERSION", "export default function DeliveryControlApp");
  const stockPopup = sourceSection(appSource, "{stockReceivePreview &&", "{dispatchConfirmation &&");

  assert.match(pair, /projectionVersion = EFFECTIVE_IMAGE_PROJECTION_VERSION/);
  assert.match(pair, /รูปชิ้นงานในกล่อง[\s\S]*slot="actual" version=\{actualVersion \|\| projectionVersion\}/);
  assert.match(pair, /รูปตัวอย่าง \(Master\)[\s\S]*slot="master" version=\{masterVersion \|\| projectionVersion\}/);
  assert.match(stockPopup, /<PartImagePair materialCode=\{stockReceivePreview\.tag\.materialCode\}/);
  assert.match(stockPopup, /masterVersion=\{partImages\.find\(\(item\) => item\.materialCode === stockReceivePreview\.tag\.materialCode\)\?\.updatedAt\}/);
  assert.match(stockPopup, /actualVersion=\{partActualImages\.find\(\(item\) => item\.materialCode === stockReceivePreview\.tag\.materialCode\)\?\.updatedAt\}/);
  assert.match(stockPopup, /actualVersion=\{partActualImages[\s\S]*strictSlots/);
  assert.match(pair, /strict=\{strictSlots\}/);
  assertBefore(stockPopup, /masterVersion=\{partImages\.find/, /actualVersion=\{partActualImages\.find/);
});

test("keeps the ตรวจและขายออก popup Actual and Master sources on their labelled panels", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  const pair = sourceSection(appSource, "const EFFECTIVE_IMAGE_PROJECTION_VERSION", "export default function DeliveryControlApp");
  const dispatchPopup = sourceSection(appSource, "{dispatchConfirmation &&", "{cameraOpen &&");

  assert.match(pair, /projectionVersion = EFFECTIVE_IMAGE_PROJECTION_VERSION/);
  assert.match(pair, /รูปชิ้นงานในกล่อง[\s\S]*slot="actual" version=\{actualVersion \|\| projectionVersion\}/);
  assert.match(pair, /รูปตัวอย่าง \(Master\)[\s\S]*slot="master" version=\{masterVersion \|\| projectionVersion\}/);
  assert.match(dispatchPopup, /<PartImagePair materialCode=\{dispatchConfirmation\.tag\?\.materialCode \|\| dispatchConfirmation\.master\?\.materialCode \|\| ""\}/);
  assert.match(dispatchPopup, /masterVersion=\{partImages\.find/);
  assert.match(dispatchPopup, /actualVersion=\{partActualImages\.find/);
  assertBefore(dispatchPopup, /masterVersion=\{partImages\.find/, /actualVersion=\{partActualImages\.find/);
});


test("Stock popup strict image mode reads each saved image table directly", async () => {
  const routeSource = await source("../app/api/part-images/route.ts");
  assert.match(routeSource, /const strictSlots = \["1", "true", "yes"\]/);
  assert.match(routeSource, /strictSlots[\s\S]*FROM \$\{tableForSlot\(slot\)\} p/);
  assert.match(routeSource, /images: result\.results, slot, strict: strictSlots/);
});


test("Stock scanner unlocks after slow requests and refreshes Stock in the background", async () => {
  const appSource = await source("../app/delivery-control-app.tsx");
  const previewScan = sourceSection(appSource, "async function receiveStockTag", "async function confirmReceiveStockTag");
  const confirmScan = sourceSection(appSource, "async function confirmReceiveStockTag", "async function closeStockJob");

  assert.match(previewScan, /new AbortController\(\)/);
  assert.match(previewScan, /controller\.abort\(\), 10000/);
  assert.match(previewScan, /signal: controller\.signal/);
  assert.match(previewScan, /caught\.name === "AbortError"/);
  assert.match(previewScan, /setStockScan\(""\)/);
  assert.match(previewScan, /stockScanInputRef\.current\?\.focus\(\)/);
  assert.match(confirmScan, /void loadStock\(\)/);
  assert.doesNotMatch(confirmScan, /await loadStock\(\)/);
});
