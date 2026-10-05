import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const app = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
const compile = (value) => ts.transpileModule(value, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const clockStart = app.indexOf("const BANGKOK_DATE_TIME_FORMATTER");
const clockEnd = app.indexOf("\n}\n", app.indexOf("function bangkokDateTimeKey", clockStart)) + 3;
const predicate = app.slice(app.indexOf("function isDeliveryOverdue"), app.indexOf("function stateOf"));
const isOverdue = new Function(compile(app.slice(clockStart, clockEnd) + predicate) + "return isDeliveryOverdue;")();

const base = { id: 1, materialCode: "PART-A", materialDescription: "Part A", deliveryDate: "2026-10-04", deliveryTime: "09:00", fact: "FAC1", line: "L1", doNo: "DO1", seq: 1, reqQty: 100, scannedQty: 20, arrangedQty: 80 };

test("the overdue view includes unfinished arranged work across Parts, rounds and factories", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  const rows = [base, { ...base, id: 2, materialCode: "PART-B", fact: "FAC3", deliveryTime: "15:00" },
    { ...base, id: 3, scannedQty: 100 }, { ...base, id: 4, status: "cancelled" },
    { ...base, id: 5, deliveryDate: "2026-10-07" }];
  assert.deepEqual(rows.filter((due) => isOverdue(due, now)).map((due) => due.id), [1, 2]);
  assert.equal(isOverdue({ ...base, deliveryDate: "2026-10-05", deliveryTime: "17:00" }, now), false);
  assert.equal(isOverdue({ ...base, deliveryDate: "2026-10-05", deliveryTime: "16:59" }, now), true);
});

test("the new page shows every supplied round/FAC and counts arranged but unshipped quantity as outstanding", async () => {
  const source = await readFile(new URL("../app/overdue-work-page.tsx", import.meta.url), "utf8");
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", compile(source))(createRequire(import.meta.url), compiledModule, compiledModule.exports);
  const html = renderToStaticMarkup(createElement(compiledModule.exports.default, {
    dues: [base, { ...base, id: 2, materialCode: "PART-B", fact: "FAC3", deliveryTime: "15:00" }],
    refreshing: false, updatedAt: null, onRefresh() {}, onBack() {}, onOpenWindow() {},
  }));
  for (const text of ["PART-A", "PART-B", "09:00", "15:00", "FAC1", "FAC3", "ทุกวันที่", "เปิดหน้าต่างใหม่"]) assert.ok(html.includes(text));
  assert.match(html, /ยอดค้างส่งรวม<\/small><b>160<\/b>/);
  assert.match(html, /Part ที่ค้างส่ง<\/small><b>2<\/b>/);
});

test("the additional page inherits Due permission without granting access to other users", () => {
  const start = app.indexOf("  const allowedPages = useMemo");
  const section = app.slice(start, app.indexOf("  const firstAllowedPage", start));
  const permission = new Function("user", "NAV", "useMemo", compile(section) + "return allowedPages;");
  const navigation = [{ key: "stock" }, { key: "plan" }];
  assert.equal(permission({ role: "employee", permissions: ["plan"] }, navigation, (fn) => fn()).has("overdue"), true);
  assert.equal(permission({ role: "employee", permissions: ["stock"] }, navigation, (fn) => fn()).has("overdue"), false);
  assert.equal(permission({ role: "admin", permissions: [] }, navigation, (fn) => fn()).has("overdue"), true);
});
