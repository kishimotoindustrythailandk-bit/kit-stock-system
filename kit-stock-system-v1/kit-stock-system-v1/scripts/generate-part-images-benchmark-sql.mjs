import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_COUNT = 50_000;
const DEFAULT_EXPLICIT_RATIO = 0.1;
const DEFAULT_OUTPUT = ".benchmark/part-images-50k.sql";
const BATCH_SIZE = 250;
const MATERIAL_PREFIX = "BENCH-PART-";
const IMPORT_TOKEN = "benchmark:part-images:v1";

function parseInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseRatio(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("--explicit-ratio must be between 0 and 1");
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    explicitRatio: DEFAULT_EXPLICIT_RATIO,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--count", "--explicit-ratio", "--output"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (flag === "--count") options.count = parseInteger(value, flag);
    if (flag === "--explicit-ratio") options.explicitRatio = parseRatio(value);
    if (flag === "--output") {
      if (!value.trim()) throw new Error("--output must not be empty");
      options.output = value;
    }
    index += 1;
  }

  return options;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function materialCode(index, width) {
  return `${MATERIAL_PREFIX}${String(index).padStart(width, "0")}`;
}

function batchedInsert(table, columns, rows, conflictClause) {
  const statements = [];
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    statements.push(
      `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES\n` +
        `${batch.map((row) => `  (${row.join(", ")})`).join(",\n")}\n` +
        `${conflictClause};`,
    );
  }
  return statements.join("\n\n");
}

export function createManifest({ count, explicitRatio }) {
  return {
    version: 1,
    dataset: "part-images-50k",
    syntheticMaterialPrefix: MATERIAL_PREFIX,
    deliveryDueLines: count,
    legacyPartImages: count,
    explicitActualImages: Math.round(count * explicitRatio),
    explicitRatio,
    batchSize: BATCH_SIZE,
    containsR2BinaryData: false,
  };
}

export function generateSql(options) {
  const manifest = createManifest(options);
  const width = Math.max(6, String(options.count).length);
  const dueRows = [];
  const legacyRows = [];
  const actualRows = [];

  for (let index = 1; index <= options.count; index += 1) {
    const code = materialCode(index, width);
    const suffix = String(index).padStart(width, "0");
    dueRows.push([
      `(SELECT id FROM delivery_imports WHERE import_token = ${quote(IMPORT_TOKEN)})`,
      quote(`benchmark:part-images:${suffix}`),
      quote(`BENCH-DO-${suffix}`),
      String(index),
      quote(code),
      quote(`Synthetic benchmark part ${suffix}`),
      quote("BENCH"),
      quote("BENCH"),
      quote("PERF"),
      quote("PERF"),
      "1",
      quote("2099-01-01"),
      quote("00:00"),
      quote("pending"),
    ]);
    legacyRows.push([
      quote(code),
      quote(`benchmark/part-images/${code}.jpg`),
      quote(`${code}.jpg`),
      quote("image/jpeg"),
      quote("Synthetic Benchmark"),
      quote("2026-01-01 00:00:00"),
    ]);
  }

  for (let index = 1; index <= manifest.explicitActualImages; index += 1) {
    const code = materialCode(index, width);
    actualRows.push([
      quote(code),
      quote(`benchmark/part-actual-images/${code}.jpg`),
      quote(`${code}-actual.jpg`),
      quote("image/jpeg"),
      quote("Synthetic Benchmark"),
      quote("2026-01-01 00:00:00"),
    ]);
  }

  const dueInsert = batchedInsert(
    "delivery_due_lines",
    ["import_id", "source_key", "do_no", "seq", "material_code", "material_description", "site", "fact", "line", "shop", "req_qty", "delivery_date", "delivery_time", "status"],
    dueRows,
    "ON CONFLICT(source_key) DO UPDATE SET material_code = excluded.material_code, material_description = excluded.material_description",
  );
  const imageColumns = ["material_code", "object_key", "original_name", "content_type", "updated_by_name", "updated_at"];
  const imageConflict = "ON CONFLICT(material_code) DO UPDATE SET object_key = excluded.object_key, original_name = excluded.original_name, content_type = excluded.content_type, updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at";
  const legacyInsert = batchedInsert("part_images", imageColumns, legacyRows, imageConflict);
  const actualInsert = actualRows.length ? batchedInsert("part_actual_images", imageColumns, actualRows, imageConflict) : "-- No explicit Actual rows requested.";

  return `-- Deterministic synthetic Part-image benchmark dataset.\n-- ${JSON.stringify(manifest)}\n-- Apply only to an isolated preview/staging D1 database. No R2 binaries are included.\nPRAGMA foreign_keys = ON;\nBEGIN IMMEDIATE;\n\nDELETE FROM part_actual_images WHERE material_code LIKE ${quote(`${MATERIAL_PREFIX}%`)};\nDELETE FROM part_images WHERE material_code LIKE ${quote(`${MATERIAL_PREFIX}%`)};\nDELETE FROM delivery_due_lines WHERE source_key LIKE ${quote("benchmark:part-images:%")};\nDELETE FROM delivery_imports WHERE import_token = ${quote(IMPORT_TOKEN)};\n\nINSERT INTO delivery_imports (import_token, file_name, row_count, total_qty, imported_by_name, imported_by_email)\nVALUES (${quote(IMPORT_TOKEN)}, ${quote("synthetic-part-images-benchmark.sql")}, ${options.count}, ${options.count}, ${quote("Synthetic Benchmark")}, ${quote("benchmark@example.invalid")});\n\n${dueInsert}\n\n${legacyInsert}\n\n${actualInsert}\n\nCOMMIT;\n`;
}

export async function writeBenchmarkFiles(options) {
  const outputPath = resolve(options.output);
  const manifestPath = `${outputPath}.manifest.json`;
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, generateSql(options), "utf8"),
    writeFile(manifestPath, `${JSON.stringify(createManifest(options), null, 2)}\n`, "utf8"),
  ]);
  return { outputPath, manifestPath, manifest: createManifest(options) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await writeBenchmarkFiles(options);
  console.log(JSON.stringify({
    output: result.outputPath,
    manifest: result.manifestPath,
    rows: result.manifest,
  }));
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
