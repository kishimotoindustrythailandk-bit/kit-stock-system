import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, app, css] = await Promise.all([
  readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("requires a verified shelf before receiving a KIT tag", () => {
  assert.match(api, /action === "validate_location"/);
  assert.match(api, /fields\[0\].*"KITLOC"/);
  assert.match(api, /กรุณาสแกน QR ชั้นจัดเก็บก่อนสแกน KIT Tag/);
  assert.match(app, /await selectStockLocation\(rawPayload\)/);
  assert.match(app, /locationCode: stockLocation\.code/);
});

test("blocks a KIT tag when its Part master location differs from the scanned shelf", () => {
  assert.match(api, /partLocation !== selectedLocation/);
  assert.match(api, /ผิดตำแหน่งจัดเก็บ/);
  assert.match(api, /Part .* ยังไม่ได้กำหนด Location ในทะเบียน Part/);
});

test("keeps the shelf selected for consecutive pallets and records it", () => {
  assert.match(app, /setStockLocationActivity\(Date\.now\(\)\)/);
  assert.match(app, /สแกน KIT Tag เพียง 1 ใบเพื่อรับทั้งพาเลท/);
  assert.match(app, /เปลี่ยนชั้นวาง/);
  assert.match(app, /5 \* 60 \* 1000/);
  assert.match(api, /locationCode: selectedLocation/);
  assert.match(api, /details: \{ tagId: tag\.tagId, materialCode: tag\.materialCode, jobNo: tag\.jobNo, locationCode: selectedLocation/);
  assert.match(css, /\.stock-location-session/);
});

test("one scanned tag previews and atomically receives every pending tag in the same Part and Job", () => {
  assert.match(api, /body\.mode, 30\) === "pallet_preview"/);
  assert.match(api, /material_code = \?1 AND job_no = \?2 AND status = 'printed'/);
  assert.match(api, /palletTags\.reduce/);
  assert.match(api, /body\.mode, 30\) === "pallet_confirm"/);
  assert.match(api, /AND \(SELECT count\(\*\) FROM stock_tags WHERE id IN/);
  assert.match(api, /runtimeDb\.batch\(\[updateStatement, insertStatement\]\)/);
  assert.match(app, /mode: "pallet_preview"/);
  assert.match(app, /tagIds: stockReceivePreview\.pallet\?\.tagIds/);
  assert.match(app, /ยืนยันรับทั้งพาเลท/);
});

test("can print QR labels only from existing Part master locations", () => {
  assert.match(app, /async function printStockLocationQrs\(\)/);
  assert.match(app, /stock\.parts\.filter\(\(part\) => part\.active\).*part\.location\.trim\(\)\.toUpperCase\(\).*filter\(Boolean\)/);
  assert.match(app, /qrcode\.toDataURL\(`KITLOC\|\$\{code\}`/);
});
