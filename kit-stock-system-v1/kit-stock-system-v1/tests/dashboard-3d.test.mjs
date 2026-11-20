import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("home dashboard omits the top KPI card strip", async () => {
  const source = await read("app/dashboard-control-center.tsx");
  assert.doesNotMatch(source, /styles\.kpis/);
  assert.doesNotMatch(source, /สรุป KPI Stock/);
  assert.match(source, /<DashboardOperationsFloor data=\{data\}/);
});

test("3D floor exposes all seven stations and routes Tag work through Production", async () => {
  const source = await read("app/dashboard-operations-floor.tsx");
  const stations = [...source.matchAll(/number: (\d), label:/g)].map((match) => Number(match[1]));
  assert.deepEqual(stations, [1, 2, 3, 4, 5, 6, 7]);
  assert.match(source, /number: 2, label: "Production \/ ออก Tag"[^\n]+page: "tags"/);
  assert.match(source, /number: 3, label: "รับเข้า Stock"[^\n]+page: "stock"/);
  assert.match(source, /page: "stock-all"/);
});

test("each 3D station pauses when idle and the user can disable animation", async () => {
  const [source, engine, css] = await Promise.all([
    read("app/dashboard-operations-floor.tsx"),
    read("app/dashboard-operations-floor-3d.ts"),
    read("app/dashboard-operations-floor.module.css"),
  ]);
  assert.match(source, /setAnimationEnabled\(\(current\) => !current\)/);
  assert.match(source, /animationEnabled && station\.active/);
  assert.match(source, /setActive\(stations\.map\(\(station\) => station\.active\)\)/);
  assert.match(source, /motion: "forklift"/);
  assert.match(source, /เปิด Animation/);
  assert.match(source, /ปิด Animation/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(engine, /if \(!this\.st\.active \|\| dt === 0\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("hybrid dashboard retains the requested operational panels and voice control", async () => {
  const [dashboard, app, voice] = await Promise.all([
    read("app/dashboard-control-center.tsx"),
    read("app/delivery-control-app.tsx"),
    read("app/voice-alert-control.tsx"),
  ]);
  for (const label of ["แนวโน้ม Stock (7 วัน)", "งาน Due วันนี้", "แจ้งเตือนสำคัญ", "กิจกรรมล่าสุด", "เมนูการทำงานหลัก"]) {
    assert.match(dashboard, new RegExp(label.replace(/[()]/g, "\\$&")));
  }
  assert.match(app, /<VoiceAlertControl enabled=\{settings\.sound\}/);
  assert.match(voice, /เปิด \/ ทดสอบเสียงพูด/);
});

test("dashboard API derives total Stock without double counting", async () => {
  const source = await read("app/api/dashboard/route.ts");
  assert.match(source, /totalQty: availableQty \+ arrangedQty/);
  assert.match(source, /shortagePartCount/);
  assert.match(source, /forecastQty - coalesce\(dispatched\.dispatchedQty, 0\)/);
});

test("3D floor loads three.js lazily, falls back without WebGL and cleans up", async () => {
  const [source, engine, pkg] = await Promise.all([
    read("app/dashboard-operations-floor.tsx"),
    read("app/dashboard-operations-floor-3d.ts"),
    read("package.json"),
  ]);
  assert.match(source, /import\("\.\/dashboard-operations-floor-3d"\)/);
  assert.doesNotMatch(source, /^import \* as THREE/m);
  assert.match(source, /setWebglFailed\(true\)/);
  assert.match(source, /engineRef\.current\?\.dispose\(\)/);
  assert.match(engine, /renderer\.dispose\(\)/);
  assert.match(JSON.parse(pkg).dependencies.three, /\d/);
});
