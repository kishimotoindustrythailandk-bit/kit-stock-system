import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { repairFirstLoginPin } from "../app/first-login-pin.ts";

const migrations = await Promise.all((await readdir(new URL("../migrations/", import.meta.url)))
  .filter((name) => name.endsWith(".sql")).sort()
  .map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const sql of migrations) sqlite.exec(sql);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...values) {
        const args = Object.fromEntries(values.map((value, i) => [`?${i + 1}`, value]));
        return { run: async () => statement.run(args), first: async () => statement.get(args) ?? null };
      } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const create = (code, flag = 0) => {
    const id = Number(sqlite.prepare("INSERT INTO app_users(employee_code, display_name, pin_hash, must_change_pin) VALUES (?, ?, 'HASH', ?) RETURNING id").get(code, code, flag).id);
    return { id, employeeCode: code, mustChangePin: flag };
  };
  return { sqlite, db, create };
}

test("both reported accounts must change their PIN, and the repair runs only once", async () => {
  const { sqlite, db, create } = setup();
  try {
    for (const code of ["62043", "62052"]) {
      const user = create(code);
      assert.equal(await repairFirstLoginPin(db, user), true);
      assert.equal(sqlite.prepare("SELECT must_change_pin FROM app_users WHERE id = ?").get(user.id).must_change_pin, 1);
      assert.equal(await repairFirstLoginPin(db, user), true);
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE entity_id = ? AND action_key = 'first_login_pin_repair_20261005'").get(String(user.id)).n, 1);
      // Successful change-pin clears the flag; next login must stay unrestricted.
      sqlite.prepare("UPDATE app_users SET must_change_pin = 0 WHERE id = ?").run(user.id);
      assert.equal(await repairFirstLoginPin(db, user), false);
    }
  } finally { sqlite.close(); }
});

test("repair does not flag unrelated users or clear a required first-login/reset flag", async () => {
  const { sqlite, db, create } = setup();
  try {
    assert.equal(await repairFirstLoginPin(db, create("OTHER")), false);
    assert.equal(await repairFirstLoginPin(db, create("NEW", 1)), true);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE action_key = 'first_login_pin_repair_20261005'").get().n, 0);
  } finally { sqlite.close(); }
});

test("a repair marker failure rolls back the flag instead of leaving a partial repair", async () => {
  const { sqlite, db, create } = setup();
  try {
    const user = create("62043");
    sqlite.exec("CREATE TRIGGER fail_marker BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'marker failed'); END");
    await assert.rejects(repairFirstLoginPin(db, user), /marker failed/);
    assert.equal(sqlite.prepare("SELECT must_change_pin FROM app_users WHERE id = ?").get(user.id).must_change_pin, 0);
  } finally { sqlite.close(); }
});

test("new users and HR resets require rotation; provisional sessions cannot use normal APIs", async () => {
  const users = await readFile(new URL("../app/api/users/route.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/cloudflare-auth.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(users, /pinHash: await hashPin\(pin\), mustChangePin: true/);
  assert.match(users, /if \(pin\) \{[\s\S]*?values.mustChangePin = true/);
  assert.match(users, /if \(!updated.active \|\| pin\).*delete\(appSessions\)/);
  assert.match(schema, /mustChangePin: integer\("must_change_pin", \{ mode: "boolean" \}\)/);
  assert.match(auth, /if \(mustChangePin && !options.allowPinChange\) return null/);
  for (const path of ["app/api/auth/change-pin/route.ts", "app/change-pin/page.tsx"]) {
    assert.match(await readFile(new URL(`../${path}`, import.meta.url), "utf8"), /getCurrentUser\(\{ allowPinChange: true \}\)/);
  }
});
