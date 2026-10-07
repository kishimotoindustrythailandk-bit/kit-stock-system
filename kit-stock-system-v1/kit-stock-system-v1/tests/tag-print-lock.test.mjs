import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const routeSource = await readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function routeFixture({ permitted = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE stock_tags(tag_id TEXT PRIMARY KEY);
    CREATE TABLE audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, action_key TEXT, entity_id TEXT, detail_json TEXT, created_at TEXT);
    INSERT INTO stock_tags VALUES('KITSTK-ORIGINAL');
  `);
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...args) }; },
          };
        },
      };
    },
  };
  const testModule = { exports: {} };
  const imports = {
    "drizzle-orm": { and() {}, desc() {}, eq() {}, sql() {} },
    "../../cloudflare-auth": {
      getCurrentUser: async () => ({ id: 1, role: "delivery", permissions: permitted ? ["tags"] : [] }),
      hasPermission: (user, permission) => user.role === "admin" || user.permissions.includes(permission),
    },
    "../../../db": { getDb: () => ({}) },
    "../../../db/schema": { stockAllocations: {}, stockParts: {}, stockTags: {} },
    "../../../runtime/env": { getRuntimeEnv: () => ({ DB }) },
    "../../audit-log": { writeAuditLog: async () => true },
    "../../api-error": { safeErrorMessage: (_, fallback) => fallback },
    "../../arrangement-warning": { arrangementWarningEvent: () => ({}) },
  };
  new Function("require", "module", "exports", compiled)((name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, testModule, testModule.exports);
  const authorize = async (tagIds) => {
    const response = await testModule.exports.POST(new Request("https://kit.test/api/stock", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "authorize_tag_print", tagIds }),
    }));
    return { status: response.status, data: await response.json() };
  };
  return { sqlite, authorize };
}

test("server allows an original Tag before it has split labels", async () => {
  const { sqlite, authorize } = routeFixture();
  try {
    const result = await authorize(["KITSTK-ORIGINAL"]);
    assert.equal(result.status, 200);
    assert.equal(result.data.allowed, true);
  } finally { sqlite.close(); }
});

test("server blocks an original Tag after split labels are issued and returns the latest split set", async () => {
  const { sqlite, authorize } = routeFixture();
  try {
    const detail = JSON.stringify({ snapshot: { tag: { tagId: "KITSTK-ORIGINAL" } } });
    sqlite.prepare("INSERT INTO audit_logs(action_key,entity_id,detail_json,created_at) VALUES('issue_split_labels',?,?,?)")
      .run("SPLIT-OLD", detail, "2026-10-07 09:00:00");
    sqlite.prepare("INSERT INTO audit_logs(action_key,entity_id,detail_json,created_at) VALUES('issue_split_labels',?,?,?)")
      .run("SPLIT-LATEST", detail, "2026-10-07 10:00:00");
    const result = await authorize(["KITSTK-ORIGINAL"]);
    assert.equal(result.status, 409);
    assert.equal(result.data.blockedTagId, "KITSTK-ORIGINAL");
    assert.equal(result.data.splitLabelId, "SPLIT-LATEST");
    assert.match(result.data.error, /พิมพ์ Tag ต้นฉบับไม่ได้/);
  } finally { sqlite.close(); }
});

test("server rejects missing Tags and users without Tag access", async () => {
  const allowed = routeFixture();
  const denied = routeFixture({ permitted: false });
  try {
    assert.equal((await allowed.authorize(["KITSTK-NOT-FOUND"])).status, 404);
    assert.equal((await denied.authorize(["KITSTK-ORIGINAL"])).status, 403);
  } finally { allowed.sqlite.close(); denied.sqlite.close(); }
});

test("Tag page replaces original printing with split-label history and checks the server before rendering", () => {
  const printFunction = appSource.slice(appSource.indexOf("async function printStockTags"), appSource.indexOf("const dates = useMemo"));
  assert.match(printFunction, /action: "authorize_tag_print"/);
  assert.ok(printFunction.indexOf("authorize_tag_print") < printFunction.indexOf('import("qrcode")'));
  assert.match(appSource, /ถูกแบ่งแล้ว · ล็อก Tag ต้นฉบับ/);
  assert.match(appSource, /ดู Tag แบ่ง/);
  assert.match(appSource, /setSplitTagRequest\(\{ labelId: item\.splitLabelId \}\)/);
});
