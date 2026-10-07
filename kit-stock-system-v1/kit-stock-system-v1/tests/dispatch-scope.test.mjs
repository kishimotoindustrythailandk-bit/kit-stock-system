import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, app, css] = await Promise.all([
  readFile(new URL("../app/api/due/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("dispatch requires and revalidates selected date, round and FAC", () => {
  assert.match(api, /dispatchScopeFromPayload/);
  assert.match(api, /row\.deliveryDate === scope\.deliveryDate/);
  assert.match(api, /row\.deliveryTime === scope\.deliveryTime/);
  assert.match(api, /row\.fact === scope\.fact/);
  assert.match(api, /mode === "dispatch_verify"/);
  assert.match(api, /resolveCustomerDue\(tag, dispatchScope\)/);
  assert.match(api, /selectedScope: dispatchScope/);
});

test("dispatch page selects scope before enabling scanners", () => {
  assert.match(app, /วันที่ส่งงานสำหรับตรวจและขายออก/);
  assert.match(app, /รอบส่งงานสำหรับตรวจและขายออก/);
  assert.match(app, /FAC สำหรับตรวจและขายออก/);
  assert.match(app, /mode: "dispatch_verify", deliveryDate: effectiveDispatchDueDate, deliveryTime: dispatchDueTime, fact: dispatchDueFact/);
  assert.match(app, /disabled=\{!effectiveDispatchDueDate \|\| checkingTag\}/);
  assert.match(css, /\.dispatch-scope-panel/);
});
