import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the standalone employee login page", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker(
    new Request("http://localhost/login", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /รหัสพนักงาน/);
  assert.match(html, /DELIVERY DUE CONTROL/);
});

test("includes the v2.6 mobile navigation and card layouts", async () => {
  const [appSource, css] = await Promise.all([
    readFile(new URL("../app/delivery-control-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /mobile-bottom-nav/);
  assert.match(appSource, /mobile-filter-toggle/);
  assert.match(appSource, /mobile-card-table/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /safe-area-inset-bottom/);
});
