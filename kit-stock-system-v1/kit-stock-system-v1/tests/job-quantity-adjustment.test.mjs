import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE stock_parts(material_code TEXT PRIMARY KEY,part_name TEXT,customer TEXT,location TEXT,standard_qty INTEGER,active INTEGER);
    CREATE TABLE stock_tags(id INTEGER PRIMARY KEY AUTOINCREMENT,tag_id TEXT UNIQUE,material_code TEXT,qty INTEGER,remaining_qty INTEGER,job_no TEXT,production_date TEXT,status TEXT,printed_by_name TEXT,received_by_name TEXT,received_by_code TEXT,received_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE stock_job_closures(id INTEGER PRIMARY KEY AUTOINCREMENT,job_no TEXT,material_code TEXT,total_qty INTEGER,received_qty INTEGER,ng_qty INTEGER,ng_tag_count INTEGER,reason TEXT,closed_by_name TEXT,closed_by_code TEXT,closed_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,action_key TEXT,entity_id TEXT,detail_json TEXT,created_at TEXT);
    INSERT INTO stock_parts VALUES('PART-A','Part A','Customer','MCP',100,1);
  `);
  const insert = sqlite.prepare(`INSERT INTO stock_tags(tag_id,material_code,qty,remaining_qty,job_no,production_date,status,printed_by_name,received_by_name,received_by_code,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 1; index <= 10; index += 1) insert.run(`KITSTK-BASE-B${String(index).padStart(2, "0")}OF10`, "PART-A", 100, 100, "JOB-A", "2026-10-08", "printed", "Operator", "", "", null);
  function prepared(sql, args = []) {
    return {
      sql, args,
      bind(...nextArgs) { return prepared(sql, nextArgs); },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }; },
    };
  }
  const DB = {
    prepare: (sql) => prepared(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          if (/^\s*SELECT/i.test(statement.sql)) results.push({ results: sqlite.prepare(statement.sql).all(...statement.args), meta: { changes: 0 } });
          else { const result = sqlite.prepare(statement.sql).run(...statement.args); results.push({ results: [], meta: { changes: result.changes } }); }
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const logs = [];
  const testModule = { exports: {} };
  const imports = {
    "drizzle-orm": { and() {}, desc() {}, eq() {}, sql() {} },
    "../../cloudflare-auth": { getCurrentUser: async () => ({ id: 1, employeeCode: "62043", displayName: "Operator", role: "stock", permissions: ["stock", "stock-edit", "tags"] }), hasPermission: (user, permission) => user.role === "admin" || user.permissions.includes(permission) },
    "../../../db": { getDb: () => ({}) },
    "../../../db/schema": { stockAllocations: {}, stockParts: {}, stockTags: {} },
    "../../../runtime/env": { getRuntimeEnv: () => ({ DB }) },
    "../../audit-log": { writeAuditLog: async (user, event) => { logs.push({ user, event }); return true; } },
    "../../api-error": { safeErrorMessage: (_, fallback) => fallback },
    "../../arrangement-warning": { arrangementWarningEvent: () => ({}) },
  };
  new Function("require", "module", "exports", compiled)((name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, testModule, testModule.exports);
  const call = async (body) => {
    const response = await testModule.exports.POST(new Request("https://kit.test/api/stock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  };
  return { sqlite, logs, call };
}

test("reducing actual output cancels only pending tail Tags and creates a replacement remainder", async () => {
  const { sqlite, logs, call } = fixture();
  try {
    const preview = await call({ action: "preview_job_qty_adjustment", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 930 });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.data.preview.newTagQtys, [30]);
    assert.equal(preview.data.preview.cancelledTags.length, 1);
    const cancelledTagId = preview.data.preview.cancelledTags[0].tagId;
    const adjusted = await call({ action: "adjust_job_qty", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 930, expectedCurrentQty: 1000, reason: "ผลิตไม่ครบ" });
    assert.equal(adjusted.status, 200);
    assert.equal(adjusted.data.tags.length, 1);
    assert.equal(adjusted.data.tags[0].qty, 30);
    assert.equal(sqlite.prepare("SELECT coalesce(sum(qty),0) qty FROM stock_tags WHERE status <> 'cancelled'").get().qty, 930);
    assert.equal(sqlite.prepare("SELECT status FROM stock_tags WHERE tag_id=?").get(cancelledTagId).status, "cancelled");
    const print = await call({ action: "authorize_tag_print", tagIds: [cancelledTagId] });
    assert.equal(print.status, 409);
    assert.match(print.data.error, /ถูกยกเลิก/);
    assert.equal(logs.at(-1).event.action, "adjust_job_actual_qty");
  } finally { sqlite.close(); }
});

test("increasing actual output keeps existing Tags and creates only the excess", async () => {
  const { sqlite, call } = fixture();
  try {
    const adjusted = await call({ action: "adjust_job_qty", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 1050, expectedCurrentQty: 1000, reason: "ผลิตเกินแผน" });
    assert.equal(adjusted.status, 200);
    assert.deepEqual(adjusted.data.preview.newTagQtys, [50]);
    assert.equal(adjusted.data.preview.cancelledTags.length, 0);
    assert.equal(sqlite.prepare("SELECT sum(qty) qty FROM stock_tags WHERE status <> 'cancelled'").get().qty, 1050);
  } finally { sqlite.close(); }
});

test("received quantities, closed Jobs and stale previews cannot be reduced or overwritten", async () => {
  const locked = fixture();
  const closed = fixture();
  const stale = fixture();
  try {
    locked.sqlite.exec("UPDATE stock_tags SET status='in_stock',received_at='2026-10-08 01:00:00' WHERE id=1");
    const belowReceived = await locked.call({ action: "preview_job_qty_adjustment", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 50 });
    assert.equal(belowReceived.status, 409);
    assert.match(belowReceived.data.error, /รับเข้า\/จัดงานแล้ว/);
    const validReduction = await locked.call({ action: "adjust_job_qty", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 150, expectedCurrentQty: 1000, reason: "ผลิตจริง 150" });
    assert.equal(validReduction.status, 200);
    assert.deepEqual(validReduction.data.preview.newTagQtys, [50]);
    assert.equal(locked.sqlite.prepare("SELECT status FROM stock_tags WHERE id=1").get().status, "in_stock");
    assert.equal(locked.sqlite.prepare("SELECT sum(qty) qty FROM stock_tags WHERE status <> 'cancelled'").get().qty, 150);
    closed.sqlite.exec("INSERT INTO stock_job_closures(job_no,material_code,total_qty,received_qty,ng_qty,ng_tag_count,reason,closed_by_name,closed_by_code) VALUES('JOB-A','PART-A',1000,900,100,1,'ปิด','Admin','1')");
    assert.equal((await closed.call({ action: "preview_job_qty_adjustment", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 1100 })).status, 409);
    const staleResult = await stale.call({ action: "adjust_job_qty", jobNo: "JOB-A", materialCode: "PART-A", targetQty: 1050, expectedCurrentQty: 900, reason: "ยอดเก่า" });
    assert.equal(staleResult.status, 409);
    assert.equal(stale.sqlite.prepare("SELECT sum(qty) qty FROM stock_tags WHERE status <> 'cancelled'").get().qty, 1000);
  } finally { locked.sqlite.close(); closed.sqlite.close(); stale.sqlite.close(); }
});

test("the UI exposes preview, confirmation and printing only newly created Tags", async () => {
  const app = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
  assert.match(app, /ปรับจำนวนผลิตจริง/);
  assert.match(app, /preview_job_qty_adjustment/);
  assert.match(app, /adjust_job_qty/);
  assert.match(app, /พิมพ์ Tag ใหม่/);
  assert.match(app, /printStockTags\(jobQtyCreatedTags\)/);
  assert.match(app, /ห้ามใช้ Tag ใบนี้/);
});
