import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { arrangementWarningEvent } from "../app/arrangement-warning.ts";
import { safeErrorMessage } from "../app/api-error.ts";

const source = await readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8");
const begin = source.indexOf('    if (action === "stage") {');
const section = source.slice(begin, source.indexOf('    return Response.json({ error: "ไม่รู้จักคำสั่ง Stock"', begin));
const compiled = ts.transpileModule(`async function stage() { ${section} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const parseSource = source.slice(source.indexOf("function parseInternalTag("), source.indexOf("function createTagBatchCode("));
const parseCompiled = ts.transpileModule(parseSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const parseInternalTag = new Function(parseCompiled + "return parseInternalTag;")();

async function attempt(options = {}) {
  const logs = [];
  let mutations = 0;
  const user = { id: 7, employeeCode: "62043", displayName: "Tester", email: "", role: "delivery" };
  const body = { deliveryDate: "2026-10-07", deliveryTime: "09:00", fact: "FAC1", rawPayload: "KITSTK-TEST", ...options.body };
  const tag = { id: 1, tagId: "KITSTK-TEST", materialCode: "PART", status: "in_stock", remainingQty: 100, stagedQty: 0, legacyReservedQty: 0, jobNo: "JOB", ...options.tag };
  const due = { id: 2, materialCode: "PART", reqQty: 100, scannedQty: 0, arrangedQty: 0, deliveryDate: "2026-10-07", deliveryTime: "09:00", fact: "FAC1", ...options.due };
  const DB = { prepare(sql) { return { bind() { return {
    async first() {
      if (options.failure) throw new Error(options.failure);
      if (sql.includes("FROM stock_tags t WHERE")) return options.missingTag ? null : tag;
      if (sql.includes("SELECT count(*)")) return { openCount: options.complete ? 0 : 1 };
      return options.missingPart ? null : due;
    },
    async run() { mutations++; return { meta: { last_row_id: 3 } }; },
  }; } }; } };
  const values = { action: "stage", body, user, request: new Request("https://kit.test/api/stock"),
    clean: (v, max) => String(v ?? "").trim().slice(0, max),
    hasPermission: () => options.permitted !== false, getRuntimeEnv: () => ({ DB }), parseInternalTag,
    arrangementWarningEvent, safeErrorMessage,
    writeAuditLog: async (actor, event) => { logs.push({ actor, event }); return true; },
  };
  const stage = new Function(...Object.keys(values), compiled + "return stage;")(...Object.values(values));
  const responses = [];
  for (let i = 0; i < (options.repeat || 1); i++) {
    const response = await stage();
    responses.push({ status: response.status, data: await response.json() });
  }
  return { logs, responses, user, mutations };
}

test("each scan of a completed scope warns and audits the actor and exact scope", async () => {
  const { logs, responses, user } = await attempt({ complete: true, repeat: 2 });
  assert.equal(logs.length, 2);
  for (const response of responses) {
    assert.equal(response.status, 409);
    assert.match(response.data.error, /ไม่มี Part เหลือ/);
    assert.equal(response.data.warningLogged, true);
  }
  for (const { actor, event } of logs) {
    assert.deepEqual(actor, user);
    assert.equal(event.action, "arrange_warning");
    assert.equal(event.details.deliveryTime, "09:00");
    assert.equal(event.details.fact, "FAC1");
    assert.equal(event.details.deliveryDate, "2026-10-07");
    assert.equal(event.details.stockTagCode, "KITSTK-TEST");
    assert.equal(event.details.warningMessage, responses[0].data.error);
  }
});

test("invalid, missing, unreceived Tags, wrong Parts and excess quantity all audit their warning", async () => {
  for (const options of [
    { body: { rawPayload: "invalid" } }, { missingTag: true },
    { tag: { status: "printed" } }, { missingPart: true },
    { body: { qty: 101 } }, { tag: { stagedQty: 100 } },
    { body: { deliveryTime: "25:00" } },
  ]) {
    const { logs, responses } = await attempt(options);
    assert.ok(responses[0].status >= 400);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event.action, "arrange_warning");
    assert.equal(logs[0].event.details.warningMessage, responses[0].data.error);
  }
});

test("a successful arrangement retains its matched round/FAC and records success", async () => {
  const { logs, responses } = await attempt();
  assert.equal(responses[0].status, 201);
  assert.equal(responses[0].data.due.deliveryTime, "09:00");
  assert.equal(responses[0].data.due.fact, "FAC1");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event.action, "stage_stock");
});

test("unexpected database errors return a safe message and audit that same warning", async () => {
  const { logs, responses } = await attempt({ failure: "SQLITE schema details" });
  assert.equal(responses[0].status, 500);
  assert.doesNotMatch(responses[0].data.error, /SQLITE/);
  assert.equal(logs[0].event.details.warningMessage, responses[0].data.error);
});

const clientSource = await readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8");
const clientStart = clientSource.indexOf("  async function stageStockTag(");
const clientCompiled = ts.transpileModule(clientSource.slice(clientStart, clientSource.indexOf("  async function submitManualStockReceipt", clientStart)), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function clientAttempt(response, options = {}) {
  const warnings = [], audits = [], requests = [], chosenDates = [];
  const noop = () => {};
  const values = {
    effectiveArrangeDueDate: "2026-10-07", arrangeDueTime: "09:00", arrangeDueFact: "FAC1",
    arrangeConfirmation: null, arrangeRequestRef: { current: false }, setArrangeConfirmation: noop,
    arrangeTag: "KITSTK-TEST", arrangeQty: "", checkingTag: false, arrangeWarning: null,
    setArrangeWarning: (value) => warnings.push(value), setNotice: noop, setArrangeTag: noop,
    recordClientAudit: async (...args) => audits.push(args),
    setArrangeDueDate: (date) => chosenDates.push(date), setCheckingTag: noop,
    setArrangementPreview: noop, setArrangeQty: noop, fmt: String,
    loadDue: async () => {}, loadStock: async () => {}, window: { setTimeout: noop },
    fetch: async (_, request) => {
      requests.push(JSON.parse(request.body));
      if (response instanceof Error) throw response;
      return { ok: !response.error, json: async () => response };
    }, ...options,
  };
  const stage = new Function(...Object.keys(values), clientCompiled + "return stageStockTag;")(...Object.values(values));
  return { stage, warnings, audits, requests, chosenDates };
}

test("repeated failed scans open a popup every time and do not duplicate server warning history", async () => {
  const client = clientAttempt({ error: "ไม่มี Part เหลือ", warningLogged: true });
  await client.stage("KITSTK-TEST");
  await client.stage("KITSTK-TEST");
  assert.equal(client.warnings.length, 2);
  assert.equal(client.audits.length, 0);
  assert.deepEqual(client.chosenDates, ["2026-10-07", "2026-10-07"]);
  for (const request of client.requests) {
    assert.equal(request.deliveryTime, "09:00");
    assert.equal(request.fact, "FAC1");
  }
  assert.deepEqual(client.warnings[0], { message: "ไม่มี Part เหลือ", date: "2026-10-07", time: "09:00", fact: "FAC1" });
});

test("network errors show a popup and submit warning history through the authenticated endpoint", async () => {
  const client = clientAttempt(new Error("Network failed"));
  await client.stage("KITSTK-TEST");
  assert.equal(client.warnings.length, 1);
  assert.equal(client.audits.length, 1);
  assert.equal(client.audits[0][0], "arrange_warning");
  assert.equal(client.audits[0][2].warningMessage, "Network failed");
});

test("acknowledgement is required before accepting another scan", async () => {
  const client = clientAttempt({}, { arrangeWarning: { message: "Previous warning" } });
  await client.stage("KITSTK-TEST");
  assert.equal(client.requests.length, 0);
});


test("permission denial is audited before any stock mutation", async () => {
  const { logs, responses } = await attempt({ permitted: false });
  assert.equal(responses[0].status, 403);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event.action, "arrange_warning");
});

 test("preview validates scope and quantities without creating picks or success audit", async () => {
  const result = await attempt({ body: { preview: true, qty: 30 } });
  assert.equal(result.responses[0].data.action, "preview_stage");
  assert.equal(result.responses[0].data.pickedQty, 30);
  assert.equal(result.responses[0].data.remainingAfter, 70);
  assert.equal(result.mutations, 0);
  assert.equal(result.logs.length, 0);
});
 test("preview still rejects invalid quantities and audits warning", async () => {
  const result = await attempt({ body: { preview: true, qty: 101 } });
  assert.equal(result.responses[0].status, 409);
  assert.equal(result.mutations, 0);
  assert.equal(result.logs.length, 1);
});

 test("scanning requests a read-only preview and opens confirmation", async () => {
  const confirmations = [];
  const client = clientAttempt({ action: "preview_stage", tag: { tagId: "KITSTK-TEST" }, due: { id: 2 }, pickedQty: 30 }, { setArrangeConfirmation: value => confirmations.push(value) });
  await client.stage("KITSTK-TEST");
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0].preview, true);
  assert.equal(confirmations[0].rawPayload, "KITSTK-TEST");
  assert.equal(confirmations[0].deliveryTime, "09:00");
  assert.equal(confirmations[0].fact, "FAC1");
  assert.equal(client.warnings.length, 0);
});
 test("confirmation submits the displayed quantity and pinned Due scope", async () => {
  const confirmation = { rawPayload: "KITSTK-TEST", pickedQty: 30, due: { id: 2 }, deliveryDate: "2026-10-07", deliveryTime: "09:00", fact: "FAC1" };
  const client = clientAttempt({ action: "staged", pick: { pickedQty: 30 }, tag: { jobNo: "JOB" } }, { arrangeConfirmation: confirmation, arrangeDueTime: "11:00", arrangeDueFact: "FAC2" });
  await client.stage("KITSTK-TEST", confirmation);
  assert.equal(client.requests[0].preview, false);
  assert.equal(client.requests[0].qty, 30);
  assert.equal(client.requests[0].dueLineId, 2);
  assert.equal(client.requests[0].deliveryTime, "09:00");
  assert.equal(client.requests[0].fact, "FAC1");
  assert.equal(client.warnings.length, 0);
});
