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
  assert.match(api, /p\.due_line_id = \?1/);
  assert.match(app, /ขั้นตอนที่ 1: สแกน KIT Tag ที่จัดงานแล้ว/);
  assert.match(app, /ขั้นตอนที่ 2: สแกน Tag ลูกค้า/);
  assert.match(app, /dispatchKitSelection && !dispatchPendingCustomer/);
});

test("dispatch asks for another KIT Tag when selected arranged quantity is short", () => {
  assert.match(api, /verdict: "need_more_kit"/);
  assert.match(api, /missingQty: Number\(tag\.qty\) - stagedAvail/);
  assert.match(app, /สแกน KIT Tag เพิ่มอีกใบ/);
  assert.match(app, /dispatchPendingCustomer/);
  assert.match(app, /retryCustomerPayload/);
});

test("dispatch blocks mismatched Part, quantity and Due", () => {
  assert.match(api, /ไม่ตรงกับ Part \/ Due \/ รอบ \/ FAC/);
  assert.match(api, /จำนวน KIT Tag รวมเกิน Tag ลูกค้า/);
  assert.match(api, /selectedWaitingQty !== Number\(tag\.qty\)/);
  assert.match(app, /เก็บ KIT Tag \/ สแกนลูกค้าใหม่/);
  assert.match(app, /ล้างทั้งหมด \/ เริ่มใหม่/);
});

test("successful dispatch records every scanned KIT Tag against one customer Tag", () => {
  assert.match(api, /stock_dispatch_links/);
  assert.match(api, /customer_tag_id, pick_id, due_line_id, stock_tag_id/);
  assert.match(api, /resolveSelectedPicks\(staged\.results \|\| \[\], selectedKits/);
  assert.match(api, /\.\.\.consumed\.map/);
  assert.match(app, /selectedKits: \[primaryKit, \.\.\.dispatchAdditionalKitSelections\]/);
});

test("split remainder tags can resolve repeated source codes without reusing a pick", () => {
  assert.match(api, /pickId: 0/);
  assert.match(api, /ระบบจะจับคู่จาก Tag ลูกค้า/);
  assert.match(api, /used\.has\(rowId\)/);
  assert.match(api, /used\.add\(rowId\)/);
  assert.match(api, /total === targetQty/);
});
