import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("legacy-part-images", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const context = { waitUntil() {}, passThroughOnException() {} };

function imageRow(materialCode, objectKey) {
  return {
    materialCode,
    objectKey,
    originalName: `${materialCode}.jpg`,
    contentType: "image/jpeg",
    updatedByName: "Tester",
    updatedAt: "2026-09-06 00:00:00",
  };
}

test("authenticated users without Parts or Settings permission retain the list 403", { concurrency: false }, async () => {
  const db = createDb({
    user: {
      id: 2,
      employeeCode: "PRODUCTION",
      displayName: "Production User",
      email: "production@example.test",
      role: "production",
      permissionCsv: "dashboard",
      mustChangePin: 0,
    },
  });
  const response = await apiFetch("/api/part-images?slot=actual", { db, bucket: createBucket() });

  assert.equal(response.status, 403);
  assert.equal(imageQueries(db).length, 0, "authorization must run before image queries");
});

test("an invalid slot retains the existing Master default", { concurrency: false }, async () => {
  const legacy = imageRow("DUAL-001", "part-images/DUAL-001/master.jpg");
  const actual = imageRow("DUAL-001", "part-actual-images/DUAL-001/actual.jpg");
  const db = createDb({ legacy: [legacy], actual: [actual], master: [legacy] });

  const response = await apiFetch("/api/part-images?slot=unexpected", { db, bucket: createBucket() });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.slot, "master");
  assert.deepEqual(payload.images.map((row) => row.objectKey), [legacy.objectKey]);
});

function createDb({
  legacy = [],
  actual = [],
  master = [],
  user = {
    id: 1,
    employeeCode: "ADMIN",
    displayName: "Admin",
    email: "admin@example.test",
    role: "admin",
    permissionCsv: "",
    mustChangePin: 0,
  },
} = {}) {
  const legacyByCode = new Map(legacy.map((row) => [row.materialCode, row]));
  const actualByCode = new Map(actual.map((row) => [row.materialCode, row]));
  const masterByCode = new Map(master.map((row) => [row.materialCode, row]));
  const calls = [];
  const mutations = [];

  return {
    calls,
    mutations,
    prepare(sql) {
      let bindings = [];
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalizedSql, bindings });

      const statement = {
        bind(...values) {
          bindings = values;
          calls.at(-1).bindings = values;
          return statement;
        },
        async first() {
          if (normalizedSql.includes("FROM app_sessions")) {
            return user;
          }

          const materialCode = String(bindings[0] || "");
          if (normalizedSql.includes("FROM part_master_images")) {
            return masterByCode.get(materialCode) || null;
          }
          if (normalizedSql.includes("WITH effective_image AS")) {
            return actualByCode.get(materialCode) || legacyByCode.get(materialCode) || null;
          }
          if (normalizedSql.includes("INNER JOIN part_actual_images explicit_actual")) {
            return actualByCode.has(materialCode) ? legacyByCode.get(materialCode) || null : null;
          }
          throw new Error(`Unexpected first() query: ${normalizedSql}`);
        },
        async all() {
          if (normalizedSql.includes("FROM part_master_images")) {
            return { results: [...masterByCode.values()].map((row) => ({ ...row, materialDescription: "" })) };
          }
          if (normalizedSql.includes("WITH effective_images AS")) {
            const results = [
              ...actualByCode.values(),
              ...[...legacyByCode.values()].filter((row) => !actualByCode.has(row.materialCode)),
            ].map((row) => ({ ...row, materialDescription: "" }));
            return { results };
          }
          if (normalizedSql.includes("INNER JOIN part_actual_images explicit_actual")) {
            const results = [...legacyByCode.values()]
              .filter((row) => actualByCode.has(row.materialCode))
              .map((row) => ({ ...row, materialDescription: "" }));
            return { results };
          }
          throw new Error(`Unexpected all() query: ${normalizedSql}`);
        },
        async run() {
          mutations.push({ sql: normalizedSql, bindings });
          throw new Error("Part-image GET must not mutate D1");
        },
      };
      return statement;
    },
  };
}

function createBucket(objects = {}) {
  const gets = [];
  const puts = [];
  const deletes = [];
  return {
    gets,
    puts,
    deletes,
    async get(key) {
      gets.push(key);
      const value = objects[key];
      if (value === undefined) return null;
      return {
        body: new Blob([value]).stream(),
        httpEtag: `"etag-${key}"`,
        writeHttpMetadata(headers) {
          headers.set("content-type", "image/jpeg");
        },
      };
    },
    async put(...args) {
      puts.push(args);
      throw new Error("Part-image GET must not write R2");
    },
    async delete(...args) {
      deletes.push(args);
      throw new Error("Part-image GET must not delete R2 objects");
    },
  };
}

async function apiFetch(path, { db, bucket, authenticated = true, headers = {} }) {
  const requestHeaders = new Headers(headers);
  if (authenticated) requestHeaders.set("cookie", "kit_session=test-session");
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: requestHeaders }),
    { DB: db, BUCKET: bucket, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    context,
  );
}

function imageQueries(db) {
  return db.calls.filter((call) => !call.sql.includes("FROM app_sessions"));
}

test("legacy-only image is Actual and is suppressed from Master lists", { concurrency: false }, async () => {
  const legacy = imageRow("LEGACY-001", "part-images/LEGACY-001/legacy.jpg");
  const db = createDb({ legacy: [legacy] });
  const bucket = createBucket();

  const actualResponse = await apiFetch("/api/part-images?slot=actual", { db, bucket });
  assert.equal(actualResponse.status, 200);
  const actualPayload = await actualResponse.json();
  assert.deepEqual(actualPayload.images.map((row) => row.objectKey), [legacy.objectKey]);

  const masterResponse = await apiFetch("/api/part-images", { db, bucket });
  assert.equal(masterResponse.status, 200);
  assert.deepEqual((await masterResponse.json()).images, []);

  const queries = imageQueries(db);
  assert.equal(queries.length, 2, "each list request must execute one set-based image query");
  assert.match(queries[0].sql, /WITH effective_images AS/);
  assert.match(queries[0].sql, /UNION ALL/);
  assert.match(queries[0].sql, /NOT EXISTS/);
  assert.match(queries[1].sql, /INNER JOIN part_actual_images explicit_actual/);
});

test("explicit Actual and explicit Master remain separate", { concurrency: false }, async () => {
  const legacy = imageRow("DUAL-001", "part-images/DUAL-001/master.jpg");
  const actual = imageRow("DUAL-001", "part-actual-images/DUAL-001/actual.jpg");
  const db = createDb({ legacy: [legacy], actual: [actual], master: [legacy] });
  const bucket = createBucket();

  const actualPayload = await (await apiFetch("/api/part-images?slot=actual", { db, bucket })).json();
  const masterPayload = await (await apiFetch("/api/part-images", { db, bucket })).json();

  assert.deepEqual(actualPayload.images.map((row) => row.objectKey), [actual.objectKey]);
  assert.deepEqual(masterPayload.images.map((row) => row.objectKey), [legacy.objectKey]);
});

test("Actual binary read falls back to the legacy R2 object without mutations", { concurrency: false }, async () => {
  const legacy = imageRow("LEGACY-001", "part-images/LEGACY-001/legacy.jpg");
  const db = createDb({ legacy: [legacy] });
  const bucket = createBucket({ [legacy.objectKey]: "legacy-bytes" });

  const response = await apiFetch("/api/part-images?slot=actual&materialCode=legacy-001", { db, bucket });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "legacy-bytes");
  assert.deepEqual(bucket.gets, [legacy.objectKey]);
  assert.deepEqual(db.mutations, []);
  assert.deepEqual(bucket.puts, []);
  assert.deepEqual(bucket.deletes, []);
  assert.match(imageQueries(db)[0].sql, /WITH effective_image AS/);
});

test("legacy-only Master binary read is unavailable and never reads R2", { concurrency: false }, async () => {
  const legacy = imageRow("LEGACY-001", "part-images/LEGACY-001/legacy.jpg");
  const db = createDb({ legacy: [legacy] });
  const bucket = createBucket({ [legacy.objectKey]: "legacy-bytes" });

  const response = await apiFetch("/api/part-images?materialCode=LEGACY-001", { db, bucket });

  assert.equal(response.status, 404);
  assert.deepEqual(bucket.gets, []);
});

test("explicit Actual and Master binary reads use their own R2 objects", { concurrency: false }, async () => {
  const legacy = imageRow("DUAL-001", "part-images/DUAL-001/master.jpg");
  const actual = imageRow("DUAL-001", "part-actual-images/DUAL-001/actual.jpg");
  const db = createDb({ legacy: [legacy], actual: [actual], master: [legacy] });
  const bucket = createBucket({ [legacy.objectKey]: "master-bytes", [actual.objectKey]: "actual-bytes" });

  const actualResponse = await apiFetch("/api/part-images?slot=actual&materialCode=DUAL-001", { db, bucket });
  const masterResponse = await apiFetch("/api/part-images?materialCode=DUAL-001", { db, bucket });

  assert.equal(await actualResponse.text(), "actual-bytes");
  assert.equal(await masterResponse.text(), "master-bytes");
  assert.deepEqual(bucket.gets, [actual.objectKey, legacy.objectKey]);
});

test("missing images and unauthenticated requests retain existing errors", { concurrency: false }, async () => {
  const db = createDb();
  const bucket = createBucket();

  const missingResponse = await apiFetch("/api/part-images?slot=actual&materialCode=NONE-001", { db, bucket });
  assert.equal(missingResponse.status, 404);

  const unauthorizedResponse = await apiFetch("/api/part-images?slot=actual", { db, bucket, authenticated: false });
  assert.equal(unauthorizedResponse.status, 401);
});

test("legacy Actual preserves ETag revalidation semantics", { concurrency: false }, async () => {
  const legacy = imageRow("LEGACY-001", "part-images/LEGACY-001/legacy.jpg");
  const db = createDb({ legacy: [legacy] });
  const bucket = createBucket({ [legacy.objectKey]: "legacy-bytes" });

  const response = await apiFetch("/api/part-images?slot=actual&materialCode=LEGACY-001", {
    db,
    bucket,
    headers: { "if-none-match": `"etag-${legacy.objectKey}"` },
  });

  assert.equal(response.status, 304);
  assert.equal(await response.text(), "");
});
