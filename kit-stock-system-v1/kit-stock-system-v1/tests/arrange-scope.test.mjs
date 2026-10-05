import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

// Exercise the actual automatic matching SQL from the stage endpoint.
const source = await readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8");
const section = source.slice(source.indexOf('if (action === "stage")'));
const select = section.match(/const dueSelect = `([\s\S]*?)`;/)[1];
const where = section.match(/DB\.prepare\(dueSelect \+ `([\s\S]*?)`\)/)[1];

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE delivery_due_lines (
    id INTEGER PRIMARY KEY, do_no TEXT, seq INTEGER, material_code TEXT,
    material_description TEXT, fact TEXT, line TEXT, shop TEXT,
    req_qty INTEGER, delivery_date TEXT, delivery_time TEXT
  );
  CREATE TABLE delivery_tag_scans (due_line_id INTEGER, qty INTEGER);
  CREATE TABLE stock_picks (due_line_id INTEGER, picked_qty INTEGER, dispatched_qty INTEGER, status TEXT);`);
  const add = db.prepare("INSERT INTO delivery_due_lines VALUES (?, 'DO', 1, ?, '', ?, '', '', 100, ?, ?)");
  for (const [id, part, fac, date, time] of [
    [1, "PART", "FAC1", "2026-10-07", "02:00"],
    [2, "PART", "FAC1", "2026-10-07", "09:00"],
    [3, "PART", "FAC2", "2026-10-07", "09:00"],
    [4, "PART", "FAC2", "2026-10-08", "09:00"],
    [5, "OTHER", "FAC2", "2026-10-07", "09:00"],
  ]) add.run(id, part, fac, date, time);
  const match = (time = "", fact = "") => db.prepare(select + where).get({
    "?1": "2026-10-07", "?2": "PART", "?3": time, "?4": fact,
  });
  return { db, match };
}

test("same Part on different rounds and factories matches only the chosen scope", () => {
  const { db, match } = setup();
  try {
    assert.equal(match("09:00", "FAC2").id, 3);
    assert.equal(match("09:00", "FAC1").id, 2);
    assert.equal(match("02:00", "FAC1").id, 1);
  } finally { db.close(); }
});

test("all-round and all-factory options retain earliest-open matching", () => {
  const { db, match } = setup();
  try {
    assert.equal(match().id, 1);
    assert.equal(match("09:00").id, 2);
    assert.equal(match("", "FAC2").id, 3);
  } finally { db.close(); }
});

test("a missing or fully arranged scope never falls back to another round or FAC", () => {
  const { db, match } = setup();
  try {
    assert.equal(match("02:00", "FAC2"), undefined);
    assert.equal(match("15:00", "FAC1"), undefined);
    db.exec("INSERT INTO stock_picks VALUES (3, 100, 0, 'staged')");
    assert.equal(match("09:00", "FAC2"), undefined);
    assert.equal(match("09:00", "FAC1").id, 2);
  } finally { db.close(); }
});

test("dispatched and reserved quantities both reduce the selected Due's capacity", () => {
  const { db, match } = setup();
  try {
    db.exec("INSERT INTO delivery_tag_scans VALUES (3, 60); INSERT INTO stock_picks VALUES (3, 50, 10, 'partial')");
    assert.equal(match("09:00", "FAC2"), undefined);
    db.exec("UPDATE stock_picks SET picked_qty = 40");
    const due = match("09:00", "FAC2");
    assert.equal(due.id, 3);
    assert.equal(due.reqQty - due.scannedQty - due.arrangedQty, 10);
  } finally { db.close(); }
});
