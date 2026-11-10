import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, app] = await Promise.all([
  readFile(new URL("../app/api/due/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
]);

test("dispatch requires a previously arranged KIT Tag before customer Tag", () => {
  assert.match(api, /mode === "dispatch_kit_verify"/);
  assert.match(api, /กรุณาสแกน KIT Tag ที่จัดงานแล้วก่อนสแกน Tag ลูกค้า/);
  assert.match(api, /p\.id = \?3 AND t\.tag_id = \?4/);
  assert.match(api, /p\.due_line_id = \?1/);
  assert.match(app, /ขั้นตอนที่ 1: สแกน KIT Tag ที่จัดงานแล้ว/);
  assert.match(app, /ขั้นตอนที่ 2: สแกน Tag ลูกค้า/);
  assert.match(app, /dispatchKitSelection \? previewDispatchTag/);
});

test("dispatch blocks mismatched Part, quantity and Due without auto-selecting another KIT Tag", () => {
  assert.match(api, /KIT Tag และ Tag ลูกค้าอยู่คนละ Due/);
  assert.match(api, /Part ไม่ตรงกัน/);
  assert.match(api, /จำนวนไม่ตรงกัน/);
  assert.match(api, /selectedWaitingQty !== tag\.qty/);
  assert.match(app, /เก็บ KIT Tag \/ สแกนลูกค้าใหม่/);
  assert.match(app, /ล้างทั้งคู่ \/ เริ่มใหม่/);
});

test("successful dispatch records the exact scanned KIT and customer Tag pair", () => {
  assert.match(api, /stock_dispatch_links/);
  assert.match(api, /customer_tag_id, pick_id, due_line_id, stock_tag_id/);
  assert.match(api, /selectedKit\.pickId/);
  assert.match(api, /selectedKit\.stockTagCode/);
  assert.match(app, /pickId: dispatchKitSelection\.pickId/);
  assert.match(app, /stockTagCode: dispatchKitSelection\.stockTagCode/);
});
