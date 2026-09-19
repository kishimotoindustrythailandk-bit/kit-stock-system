import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import {
  createManifest,
  generateSql,
  parseArgs,
  writeBenchmarkFiles,
} from "../scripts/generate-part-images-benchmark-sql.mjs";

const execFileAsync = promisify(execFile);
const generatorPath = new URL("../scripts/generate-part-images-benchmark-sql.mjs", import.meta.url);
const k6Path = new URL("./performance/part-images-50k.js", import.meta.url);

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test("default benchmark profile describes 50k legacy and 10% explicit Actual rows", () => {
  const options = parseArgs([]);
  const manifest = createManifest(options);

  assert.equal(options.count, 50_000);
  assert.equal(options.explicitRatio, 0.1);
  assert.equal(manifest.deliveryDueLines, 50_000);
  assert.equal(manifest.legacyPartImages, 50_000);
  assert.equal(manifest.explicitActualImages, 5_000);
  assert.equal(manifest.containsR2BinaryData, false);
});

test("SQL generation is deterministic, batched, synthetic, and transaction wrapped", () => {
  const options = { count: 501, explicitRatio: 0.1, output: "unused.sql" };
  const first = generateSql(options);
  const second = generateSql(options);

  assert.equal(first, second);
  assert.match(first, /BEGIN IMMEDIATE;/);
  assert.match(first, /COMMIT;/);
  assert.equal(occurrences(first, /INSERT INTO `delivery_due_lines`/g), 3);
  assert.equal(occurrences(first, /INSERT INTO `part_images`/g), 3);
  assert.equal(occurrences(first, /benchmark\/part-images\/BENCH-PART-/g), 501);
  assert.equal(occurrences(first, /benchmark\/part-actual-images\/BENCH-PART-/g), 50);
  assert.doesNotMatch(first, /kit_session|BENCHMARK_SESSION|password|api[_-]?token/i);
  assert.doesNotMatch(first, /DY02J073G01-F|M101-100840/);
  assert.match(first, /No R2 binaries are included/);
});

test("generator writes repeatable SQL and a deterministic manifest", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "part-images-benchmark-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const firstOutput = join(directory, "first.sql");
  const secondOutput = join(directory, "second.sql");
  const options = { count: 1_000, explicitRatio: 0.1, output: firstOutput };

  await writeBenchmarkFiles(options);
  await writeBenchmarkFiles({ ...options, output: secondOutput });

  const [firstSql, secondSql, firstManifest, secondManifest] = await Promise.all([
    readFile(firstOutput, "utf8"),
    readFile(secondOutput, "utf8"),
    readFile(`${firstOutput}.manifest.json`, "utf8"),
    readFile(`${secondOutput}.manifest.json`, "utf8"),
  ]);
  assert.equal(firstSql, secondSql);
  assert.equal(firstManifest, secondManifest);
  assert.deepEqual(JSON.parse(firstManifest), {
    version: 1,
    dataset: "part-images-50k",
    syntheticMaterialPrefix: "BENCH-PART-",
    deliveryDueLines: 1_000,
    legacyPartImages: 1_000,
    explicitActualImages: 100,
    explicitRatio: 0.1,
    batchSize: 250,
    containsR2BinaryData: false,
  });
});

test("generator rejects unsafe or ambiguous CLI options", async () => {
  assert.throws(() => parseArgs(["--count", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--explicit-ratio", "1.1"]), /between 0 and 1/);
  assert.throws(() => parseArgs(["--unknown", "value"]), /Unknown argument/);

  await assert.rejects(
    execFileAsync(process.execPath, [fileURLToPath(generatorPath), "--count", "invalid"]),
    (error) => error.code === 1 && /positive integer/.test(error.stderr),
  );
});

test("k6 harness enforces credentials, 4/4/2 VUs, samples, thresholds, and evidence metrics", async () => {
  const source = await readFile(k6Path, "utf8");

  assert.match(source, /BENCHMARK_BASE_URL is required/);
  assert.match(source, /BENCHMARK_SESSION is required/);
  assert.match(source, /BENCHMARK_PROFILE/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:session|BENCHMARK_SESSION)/i);

  assert.match(source, /actual_list:[\s\S]*?vus: 4,[\s\S]*?iterations: 100/);
  assert.match(source, /master_list:[\s\S]*?vus: 4,[\s\S]*?iterations: 100/);
  assert.match(source, /metadata_projection:[\s\S]*?vus: 2,[\s\S]*?iterations: 100/);
  for (const metric of ["actual_list_duration", "master_list_duration", "metadata_projection_duration"]) {
    assert.ok(source.includes(`${metric}: ["p(95)<1000"]`));
  }
  for (const metric of ["actual_list_errors", "master_list_errors", "metadata_projection_errors"]) {
    assert.ok(source.includes(`${metric}: ["rate==0"]`));
  }
  for (const metric of ["actual_list_samples", "master_list_samples", "metadata_projection_samples"]) {
    assert.ok(source.includes(`${metric}: ["count>=100"]`));
  }
  assert.match(source, /for \(let index = 0; index < 5; index \+= 1\)/);
  assert.match(source, /summaryTrendStats: \["count", "avg", "med", "p\(95\)", "max"\]/);
  assert.match(source, /\["med", "p50"\]/);
  assert.match(source, /\["p\(95\)", "p95"\]/);
  assert.match(source, /payload_bytes/);
  assert.match(source, /BENCHMARK_SUMMARY_PATH/);
});
