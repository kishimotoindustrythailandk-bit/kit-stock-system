import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import xlsx from "xlsx";

const source = await readFile(new URL("../app/stock-all-page.tsx", import.meta.url), "utf8");
const compile = (value) => ts.transpileModule(value, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const compiledModule = { exports: {} };
new Function("require", "module", "exports", compile(source))(createRequire(import.meta.url), compiledModule, compiledModule.exports);
const { summarizeAllStock, createAllStockWorkbook, default: Page } = compiledModule.exports;
const parts = [{ materialCode: "A", partName: "Part A", customer: "Customer", active: true },
  { materialCode: "ZERO", partName: "Zero Part", customer: "Customer", active: false }];
const base = { id: 1, tagId: "TAG-A", materialCode: "A", jobNo: "JOB1", productionDate: "2026-10-06", remainingQty: 80, reservedQty: 50, status: "in_stock" };
const tags = [base, { ...base, id: 2, remainingQty: 500, status: "created" },
  { ...base, id: 3, remainingQty: 500, status: "ng" }, { ...base, id: 4, remainingQty: 0, status: "depleted" }];

test("all registered Parts include zero Stock and reservations are counted once after dispatch", () => {
  const rows = summarizeAllStock(parts, tags);
  assert.deepEqual(rows.map(({ materialCode, availableQty, arrangedQty, totalQty, tagCount }) =>
    ({ materialCode, availableQty, arrangedQty, totalQty, tagCount })), [
    { materialCode: "A", availableQty: 30, arrangedQty: 50, totalQty: 80, tagCount: 1 },
    { materialCode: "ZERO", availableQty: 0, arrangedQty: 0, totalQty: 0, tagCount: 0 },
  ]);
  const overReserved = summarizeAllStock(parts, [{ ...base, reservedQty: 100 }])[0];
  assert.equal(overReserved.availableQty, 0);
  assert.equal(overReserved.arrangedQty, 80);
});

test("overview renders zero Parts and viewing/export controls without receiving or adjustment controls", () => {
  const html = renderToStaticMarkup(createElement(Page, { parts, tags, loading: false, exporting: false, onRefresh() {}, onExport() {} }));
  for (const text of ["ZERO", "Zero Part", "Stock พร้อมใช้", "จัดงานรอส่ง", "คงเหลือรวม", "Excel ทุก Part", "ดู Tag / Job", "ทุกยอด (รวม 0)"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /สแกน|ยืนยันรับเข้า|ปรับยอด/);
});

test("Excel export preserves zero Parts, numeric quantities, and only remaining received Tags", () => {
  const book = createAllStockWorkbook(xlsx, parts, tags, "06/10/2026 07:00");
  const reopened = xlsx.read(xlsx.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const summary = reopened.Sheets["Stock ทุก Part"], details = reopened.Sheets["Tag คงเหลือ"];
  assert.equal(summary.A5.v, "ZERO");
  assert.equal(summary.E5.t, "n");
  assert.equal(summary.E5.v, 0);
  assert.deepEqual([summary.E4.v, summary.F4.v, summary.G4.v], [30, 50, 80]);
  assert.equal(summary["!autofilter"].ref, "A3:H5");
  assert.equal(details.B2.v, "TAG-A");
  assert.equal(details["!ref"], "A1:H2");
});

test("stock-all permission is independent and grants Stock reading without receipt or count access", async () => {
  const auth = await readFile(new URL("../app/cloudflare-auth.ts", import.meta.url), "utf8");
  const section = auth.slice(auth.indexOf("export const PERMISSION_KEYS"), auth.indexOf("type CloudUserRow"));
  const authModule = { exports: {} };
  new Function("module", "exports", compile(section))(authModule, authModule.exports);
  const permissions = authModule.exports.normalizePermissions(["stock-all"], "employee");
  assert.deepEqual(permissions, ["stock-all"]);
  const user = { role: "employee", permissions };
  assert.equal(authModule.exports.hasPermission(user, "stock"), false);
  assert.equal(authModule.exports.hasPermission(user, "stock-count"), false);
  const api = await readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8");
  const reads = JSON.parse(api.match(/const fullStockPermissions = (\[[^;]+\]) as const/)[1]);
  assert.equal(reads.some((key) => authModule.exports.hasPermission(user, key)), true);
});
