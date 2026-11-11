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

test("keeps the shelf selected while every KIT tag is scanned and records it", () => {
  assert.match(app, /setStockLocationActivity\(Date\.now\(\)\)/);
  assert.match(app, /สแกน KIT Tag ทุกใบทีละใบ/);
  assert.match(app, /รับเฉพาะ Tag ที่สแกน/);
  assert.match(app, /เปลี่ยนชั้นวาง/);
  assert.match(app, /5 \* 60 \* 1000/);
  assert.match(api, /locationCode: selectedLocation/);
  assert.match(api, /details: \{ tagId: tag\.tagId, materialCode: tag\.materialCode, jobNo: tag\.jobNo, locationCode: selectedLocation/);
  assert.match(css, /\.stock-location-session/);
});

test("each scan previews and receives only that exact KIT tag", () => {
  assert.match(app, /mode: "preview", rawPayload, locationCode: stockLocation\.code/);
  assert.match(app, /ยืนยันรับ Tag ใบนี้/);
  assert.doesNotMatch(app, /mode: "pallet_preview"|pallet_confirm|ยืนยันรับทั้งพาเลท/);
  assert.doesNotMatch(api, /pallet_receive_preview|pallet_received|receive_pallet/);
  assert.match(api, /eq\(stockTags\.id, tag\.id\), eq\(stockTags\.status, "printed"\)/);
  assert.match(api, /Tag นี้เพิ่งถูกสแกนรับเข้า Stock ไปแล้ว/);
});

test("can print QR labels only from existing Part master locations", () => {
  assert.match(app, /async function printStockLocationQrs\(\)/);
  assert.match(app, /stock\.parts\.filter\(\(part\) => part\.active\).*part\.location\.trim\(\)\.toUpperCase\(\).*filter\(Boolean\)/);
  assert.match(app, /qrcode\.toDataURL\(`KITLOC\|\$\{code\}`/);
});
