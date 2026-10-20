import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("home dashboard keeps exactly four real-data KPI cards", async () => {
  const source = await read("app/dashboard-control-center.tsx");
  for (const label of ["Stock พร้อมใช้", "จัดงานรอส่ง", "คงเหลือรวม", "Part เสี่ยงขาด"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /data\.stock\.totalQty/);
  assert.match(source, /data\.alerts\.shortagePartCount/);
});

test("3D floor exposes all seven stations and routes Tag work through Production", async () => {
  const source = await read("app/dashboard-operations-floor.tsx");
  const stations = [...source.matchAll(/number: (\d), label:/g)].map((match) => Number(match[1]));
  assert.deepEqual(stations, [1, 2, 3, 4, 5, 6, 7]);
  assert.match(source, /number: 2, label: "Production \/ ออก Tag"[^\n]+page: "tags"/);
  assert.match(source, /number: 3, label: "รับเข้า Stock"[^\n]+page: "stock"/);
  assert.match(source, /page: "stock-all"/);
});

test("dashboard API derives total Stock without double counting", async () => {
  const source = await read("app/api/dashboard/route.ts");
  assert.match(source, /totalQty: availableQty \+ arrangedQty/);
  assert.match(source, /shortagePartCount/);
  assert.match(source, /forecastQty - coalesce\(dispatched\.dispatchedQty, 0\)/);
});

test("responsive floor uses a compressed static WebP and horizontal mobile viewport", async () => {
  const css = await read("app/dashboard-operations-floor.module.css");
  const image = await readFile(new URL("public/dashboard/kit-operations-floor-v2.webp", root));
  assert.match(css, /kit-operations-floor-v2\.webp/);
  assert.match(css, /overflow-x:auto/);
  assert.ok(image.byteLength < 300_000, `dashboard asset is too large: ${image.byteLength} bytes`);
});
