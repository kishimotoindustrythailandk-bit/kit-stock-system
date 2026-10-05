import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

// Execute the actual route SQL, with the deployed migration schema.
const source = await readFile(new URL("../app/api/stock/route.ts", import.meta.url), "utf8");
const section = source.slice(source.indexOf('const adjustmentNo = createAdjustmentNo("TAGCOUNT")'), source.indexOf('if (action === "preview_stock_count"'));
const statements = [...section.matchAll(/runtimeDb\.prepare\(`([\s\S]*?)`\)/g)].map((match) => match[1]);
assert.equal(statements.length, 3);
const migrations = await Promise.all((await readdir(new URL("../migrations/", import.meta.url)))
  .filter((name) => name.endsWith(".sql")).sort()
  .map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));

function database() {
  const db = new DatabaseSync(":memory:");
  for (const sql of migrations) db.exec(sql);
  db.exec(`INSERT INTO stock_parts(material_code) VALUES ('TEST');
    INSERT INTO stock_tags(id, tag_id, material_code, qty, remaining_qty, job_no, production_date, status, printed_by_name)
    VALUES (1, 'KITSTK-TEST', 'TEST', 100, 100, 'JOB', '2026-10-05', 'in_stock', 'Tester');`);
  return db;
}

function run(db, sql, values) {
  return db.prepare(sql).run(Object.fromEntries(values.map((value, index) => [`?${index + 1}`, value])));
}

function count(db, countedQty, stagedQty = 0, legacyQty = 0, expectedQty = 100, expectedStatus = "in_stock") {
  db.exec("BEGIN");
  try {
    run(db, statements[0], ["COUNT-TEST", "2026-10-05", "TEST", expectedQty, countedQty,
      countedQty - expectedQty, "Count", "Tester", "TESTER", 1, expectedStatus, stagedQty, legacyQty]);
    run(db, statements[1], [countedQty, 1]);
    run(db, statements[2], ["COUNT-TEST", 1, "KITSTK-TEST", countedQty - expectedQty, expectedQty, countedQty]);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function noHistory(db) {
  assert.equal(db.prepare("SELECT count(*) AS n FROM stock_count_adjustments").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM stock_count_adjustment_lines").get().n, 0);
}

test("a dispatch between count read and write cannot restore dispatched stock", () => {
  const db = database();
  try {
    db.exec("UPDATE stock_tags SET remaining_qty = 80 WHERE id = 1");
    assert.throws(() => count(db, 100), /NOT NULL constraint failed: stock_count_adjustments.material_code/);
    assert.equal(db.prepare("SELECT remaining_qty FROM stock_tags WHERE id = 1").get().remaining_qty, 80);
    noHistory(db);
  } finally { db.close(); }
});

test("arranging or cancelling a reservation invalidates the count snapshot", () => {
  for (const legacy of [false, true]) {
    const db = database();
    try {
      const due = db.prepare("SELECT id FROM delivery_due_lines LIMIT 1").get().id;
      if (legacy) {
        db.prepare("INSERT INTO stock_allocations(customer_tag_id, stock_tag_id, due_line_id, qty, reserved_by_name) VALUES ('CUSTOMER', 1, ?, 20, 'Tester')").run(due);
      } else {
        db.prepare("INSERT INTO stock_picks(due_line_id, stock_tag_id, picked_qty, picked_by_name, picked_by_code) VALUES (?, 1, 20, 'Tester', 'TESTER')").run(due);
      }
      assert.throws(() => count(db, 100), /NOT NULL constraint failed/);
      noHistory(db);
      // The reverse race (reservation cancelled after reading) must fail too.
      db.exec(legacy ? "UPDATE stock_allocations SET status = 'cancelled'" : "UPDATE stock_picks SET status = 'cancelled'");
      assert.throws(() => count(db, 100, legacy ? 0 : 20, legacy ? 20 : 0), /NOT NULL constraint failed/);
      noHistory(db);
    } finally { db.close(); }
  }
});

test("a changed tag status cannot be overwritten by a count", () => {
  const db = database();
  try {
    db.exec("UPDATE stock_tags SET status = 'ng' WHERE id = 1");
    assert.throws(() => count(db, 100), /NOT NULL constraint failed/);
    assert.equal(db.prepare("SELECT status FROM stock_tags WHERE id = 1").get().status, "ng");
    noHistory(db);
  } finally { db.close(); }
});

test("an unchanged reservation stays included in the adjusted total", () => {
  const db = database();
  try {
    const due = db.prepare("SELECT id FROM delivery_due_lines LIMIT 1").get().id;
    db.prepare("INSERT INTO stock_picks(due_line_id, stock_tag_id, picked_qty, picked_by_name, picked_by_code) VALUES (?, 1, 20, 'Tester', 'TESTER')").run(due);
    // 70 physically counted plus 20 already arranged = 90 total.
    count(db, 90, 20);
    assert.equal(db.prepare("SELECT remaining_qty FROM stock_tags WHERE id = 1").get().remaining_qty, 90);
    assert.equal(db.prepare("SELECT picked_qty FROM stock_picks").get().picked_qty, 20);
    assert.equal(db.prepare("SELECT difference FROM stock_count_adjustments").get().difference, -10);
  } finally { db.close(); }
});

test("a later batch failure rolls back both the stock change and adjustment header", () => {
  const db = database();
  try {
    db.exec("CREATE TRIGGER fail_line BEFORE INSERT ON stock_count_adjustment_lines BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => count(db, 80), /test failure/);
    assert.equal(db.prepare("SELECT remaining_qty FROM stock_tags WHERE id = 1").get().remaining_qty, 100);
    noHistory(db);
  } finally { db.close(); }
});

test("unchanged snapshots allow decreases, increases, zero counts and reopening depleted tags", () => {
  for (const [expectedQty, expectedStatus, countedQty] of [[100, "in_stock", 80], [100, "in_stock", 120], [100, "in_stock", 0], [0, "depleted", 20]]) {
    const db = database();
    try {
      db.prepare("UPDATE stock_tags SET remaining_qty = ?, status = ? WHERE id = 1").run(expectedQty, expectedStatus);
      count(db, countedQty, 0, 0, expectedQty, expectedStatus);
      const row = db.prepare("SELECT remaining_qty, status FROM stock_tags WHERE id = 1").get();
      assert.equal(row.remaining_qty, countedQty);
      assert.equal(row.status, countedQty === 0 ? "depleted" : "in_stock");
      const history = db.prepare("SELECT before_qty, after_qty, qty_change FROM stock_count_adjustment_lines").get();
      assert.equal(history.before_qty, expectedQty);
      assert.equal(history.after_qty, countedQty);
      assert.equal(history.qty_change, countedQty - expectedQty);
    } finally { db.close(); }
  }
});
