import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("separates page visibility from add and edit permissions", async () => {
  const [auth, app, users, stock, due, dueImport, forecast, images, replacements, splitTags] = await Promise.all([
    source("../app/cloudflare-auth.ts"),
    source("../app/delivery-control-app.tsx"),
    source("../app/api/users/route.ts"),
    source("../app/api/stock/route.ts"),
    source("../app/api/due/route.ts"),
    source("../app/api/due-import/route.ts"),
    source("../app/api/forecast/route.ts"),
    source("../app/api/part-images/route.ts"),
    source("../app/api/replacements/route.ts"),
    source("../app/api/split-tags/route.ts"),
  ]);

  assert.match(auth, /EDITABLE_PAGE_KEYS = \["stock", "manual-stock", "stock-count", "forecast", "parts", "tags", "plan", "arrange", "replacement", "dispatch"\]/);
  assert.doesNotMatch(auth.match(/EDITABLE_PAGE_KEYS = \[[^\]]+\]/)?.[0] || "", /reports|exports/);
  assert.match(auth, /permission-model-v2/);
  assert.match(app, /สิทธิ์ดูข้อมูลเท่านั้น/);
  assert.match(app, /เพิ่ม \/ แก้ไข/);
  assert.match(app, /permissions: \[\.\.\.new Set\(\[\.\.\.userForm\.permissions, "permission-model-v2"/);
  assert.match(users, /permission\.endsWith\("-edit"\)/);
  assert.match(users, /return selected\.has\(page\)/);

  for (const permission of ["stock-edit", "manual-stock-edit", "stock-count-edit", "parts-edit", "tags-edit", "arrange-edit"]) {
    assert.match(stock, new RegExp(`hasPermission\\(user, "${permission}"\\)`));
  }
  assert.match(due, /hasPermission\(user, "dispatch-edit"\)/);
  assert.match(dueImport, /hasPermission\(user, "plan-edit"\)/);
  assert.match(forecast, /hasPermission\(user, "forecast-edit"\)/);
  assert.match(images, /hasPermission\(user, "parts-edit"\)/);
  assert.match(replacements, /hasPermission\(user, "replacement-edit"\)/);
  assert.match(splitTags, /hasPermission\(user,\s*`\$\{page\}-edit`/);
});

test("keeps destructive deletes Admin-only", async () => {
  const [stock, dueImport, images] = await Promise.all([
    source("../app/api/stock/route.ts"),
    source("../app/api/due-import/route.ts"),
    source("../app/api/part-images/route.ts"),
  ]);
  assert.match(stock, /user\.role !== "admin" \|\| !hasPermission\(user, "stock"\)/);
  assert.match(stock, /user\.role !== "admin" \|\| !hasPermission\(user, "tags"\)/);
  assert.match(dueImport, /user\.role !== "admin"/);
  assert.match(images, /user\.role !== "admin"/);
});
