import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const baseUrl = String(__ENV.BENCHMARK_BASE_URL || "").replace(/\/+$/, "");
const session = String(__ENV.BENCHMARK_SESSION || "");
const profile = String(__ENV.BENCHMARK_PROFILE || "mixed-10-percent");

if (!baseUrl) throw new Error("BENCHMARK_BASE_URL is required");
if (!session) throw new Error("BENCHMARK_SESSION is required");

const requestParams = {
  headers: {
    Accept: "application/json",
    Cookie: `kit_session=${session}`,
  },
  tags: { benchmark_profile: profile },
};

const actualDuration = new Trend("actual_list_duration", true);
const masterDuration = new Trend("master_list_duration", true);
const projectionDuration = new Trend("metadata_projection_duration", true);
const actualErrors = new Rate("actual_list_errors");
const masterErrors = new Rate("master_list_errors");
const projectionErrors = new Rate("metadata_projection_errors");
const actualSamples = new Counter("actual_list_samples");
const masterSamples = new Counter("master_list_samples");
const projectionSamples = new Counter("metadata_projection_samples");
const actualPayloadBytes = new Trend("actual_list_payload_bytes");
const masterPayloadBytes = new Trend("master_list_payload_bytes");
const projectionPayloadBytes = new Trend("metadata_projection_payload_bytes");

export const options = {
  discardResponseBodies: false,
  summaryTrendStats: ["count", "avg", "med", "p(95)", "max"],
  scenarios: {
    actual_list: {
      executor: "shared-iterations",
      exec: "actualList",
      vus: 4,
      iterations: 100,
      maxDuration: "10m",
    },
    master_list: {
      executor: "shared-iterations",
      exec: "masterList",
      vus: 4,
      iterations: 100,
      maxDuration: "10m",
    },
    metadata_projection: {
      executor: "shared-iterations",
      exec: "metadataProjection",
      vus: 2,
      iterations: 100,
      maxDuration: "10m",
    },
  },
  thresholds: {
    actual_list_duration: ["p(95)<1000"],
    master_list_duration: ["p(95)<1000"],
    metadata_projection_duration: ["p(95)<1000"],
    actual_list_errors: ["rate==0"],
    master_list_errors: ["rate==0"],
    metadata_projection_errors: ["rate==0"],
    actual_list_samples: ["count>=100"],
    master_list_samples: ["count>=100"],
    metadata_projection_samples: ["count>=100"],
    http_req_failed: ["rate==0"],
  },
};

function responseBytes(response) {
  const contentLength = Number(response.headers["Content-Length"] || response.headers["content-length"] || 0);
  return contentLength > 0 ? contentLength : String(response.body || "").length;
}

function parseImageList(response, expectedSlot) {
  let payload;
  try {
    payload = response.json();
  } catch {
    return { ok: false, images: [] };
  }
  return {
    ok: response.status === 200 && payload?.slot === expectedSlot && Array.isArray(payload?.images),
    images: Array.isArray(payload?.images) ? payload.images : [],
  };
}

function requestList(slot) {
  return http.get(`${baseUrl}/api/part-images?slot=${slot}`, requestParams);
}

export function setup() {
  for (let index = 0; index < 5; index += 1) {
    const actual = requestList("actual");
    const master = requestList("master");
    parseImageList(actual, "actual");
    parseImageList(master, "master");
  }
  return { profile };
}

export function actualList() {
  const response = requestList("actual");
  const parsed = parseImageList(response, "actual");
  const ok = check(parsed, { "Actual list returns an image array": (result) => result.ok });
  actualDuration.add(response.timings.duration, { profile });
  actualPayloadBytes.add(responseBytes(response), { profile });
  actualSamples.add(1, { profile });
  actualErrors.add(!ok, { profile });
}

export function masterList() {
  const response = requestList("master");
  const parsed = parseImageList(response, "master");
  const ok = check(parsed, { "Master list returns an image array": (result) => result.ok });
  masterDuration.add(response.timings.duration, { profile });
  masterPayloadBytes.add(responseBytes(response), { profile });
  masterSamples.add(1, { profile });
  masterErrors.add(!ok, { profile });
}

export function metadataProjection() {
  const response = requestList("actual");
  const payloadBytes = responseBytes(response);
  const startedAt = Date.now();
  const parsed = parseImageList(response, "actual");
  const searchTerm = "BENCH-PART-049";
  const projected = parsed.images.filter((image) => {
    const searchable = `${image.materialCode || ""} ${image.materialDescription || ""}`.toUpperCase();
    return searchable.includes(searchTerm);
  });
  const elapsed = Date.now() - startedAt;
  const ok = check({ parsed, projected }, {
    "metadata projection parses and filters an image array": (result) => result.parsed.ok && Array.isArray(result.projected),
  });
  projectionDuration.add(elapsed, { profile });
  projectionPayloadBytes.add(payloadBytes, { profile });
  projectionSamples.add(1, { profile });
  projectionErrors.add(!ok, { profile });
}

function metricLine(data, metricName) {
  const values = data.metrics?.[metricName]?.values || {};
  const fields = [
    ["count", "count"],
    ["med", "p50"],
    ["p(95)", "p95"],
    ["rate", "errorRate"],
    ["avg", "avg"],
  ]
    .filter(([key]) => values[key] !== undefined)
    .map(([key, label]) => `${label}=${values[key]}`)
    .join(" ");
  return `${metricName}: ${fields || "no values"}`;
}

export function handleSummary(data) {
  const summaryPath = String(__ENV.BENCHMARK_SUMMARY_PATH || `part-images-50k-${profile}-summary.json`);
  const metricNames = [
    "actual_list_duration",
    "actual_list_samples",
    "actual_list_errors",
    "actual_list_payload_bytes",
    "master_list_duration",
    "master_list_samples",
    "master_list_errors",
    "master_list_payload_bytes",
    "metadata_projection_duration",
    "metadata_projection_samples",
    "metadata_projection_errors",
    "metadata_projection_payload_bytes",
  ];
  const report = {
    benchmark: "part-images-50k",
    profile,
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: `Part-image benchmark profile: ${profile}\n${metricNames.map((name) => metricLine(data, name)).join("\n")}\n`,
    [summaryPath]: `${JSON.stringify(report, null, 2)}\n`,
  };
}
