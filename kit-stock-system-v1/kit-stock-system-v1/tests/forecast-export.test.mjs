import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import xlsx from "xlsx";

async function loadHelper(name) {
  const source = await readFile(new URL(`../app/${name}.ts`, import.meta.url), "utf8");
  const compiledModule = { exports: {} };
  new Function("module", "exports", ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText)(compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { calculateForecastRoundCoverage: calculate } = await loadHelper("forecast-coverage");
const { createForecastExportWorkbook: workbook, createForecastExportBinary: binary } = await loadHelper("forecast-export");
const round = (time, qty, date = "2026-10-07") => ({ deliveryDate: date, deliveryTime: time, prodQty: qty });

test("coverage requires the entire Part round across FAC/DO lines and sorts chronologically", () => {
  const result = calculate([round("09:00", 20), round("15:00", 10), round("02:00", 40), round("09:00", 30)], 50, 0, "2026-10-07T10:00");
  assert.equal(result.coveredThroughTime, "02:00");
  assert.equal(result.shortageDate, "2026-10-07");
  assert.equal(result.shortageTime, "09:00");
  assert.equal(result.firstShortageQty, 40);
  assert.equal(result.totalShortage, 50);
  assert.equal(result.outstandingQty, 100);
  assert.equal(result.overdueQty, 90);
  assert.equal(result.remainingStockAfterForecast, 0);
  assert.deepEqual(result.timeline.map((point) => point.projectedBalance), [10, -40, -50]);
});

test("matrix export carries balances across missing rounds, aggregates daily endings, colors negatives and freezes headings", () => {
  const timelineA = calculate([round("02:00", 40), round("09:00", 50), round("15:00", 10, "2026-10-08")], 50, 0, "2026-10-07T00:00");
  const timelineB = calculate([round("15:00", 5, "2026-10-08")], 100, 0, "2026-10-07T00:00");
  const base = { description: "Part", factories: ["FAC1"], forecastQty: 100, dispatchedAfterImport: 0, status: "shortage" };
  const book = workbook(xlsx, [{ ...base, materialCode: "A", stockQty: 50, ...timelineA }, { ...base, materialCode: "B", stockQty: 100, ...timelineB }],
    { fileName: "source.xlsx", cutoff: "cutoff", calculatedAt: "now", exportedBy: "User" });
  const data = binary(xlsx, book);
  const reopened = xlsx.read(data, { type: "array", cellNF: true });
  assert.deepEqual(reopened.SheetNames, ["ยอดคงเหลือรายวัน", "ยอดคงเหลือรายรอบ", "Forecast Stock"]);
  const daily = reopened.Sheets[reopened.SheetNames[0]], rounds = reopened.Sheets[reopened.SheetNames[1]];
  assert.equal(xlsx.SSF.format(daily.F7.z, daily.F7.v), "07/10/2026");
  assert.equal(daily.F8.v, -40);
  assert.equal(daily.G8.v, -50);
  assert.equal(daily.F9.v, 100);
  assert.equal(daily.G9.v, 95);
  assert.deepEqual([rounds.F8.v, rounds.G8.v, rounds.H8.v], [10, -40, -50]);
  assert.deepEqual([rounds.F9.v, rounds.G9.v, rounds.H9.v], [100, 100, 95]);
  const zip = xlsx.CFB.read(data, { type: "array" });
  const xml = (path) => new TextDecoder().decode(xlsx.CFB.find(zip, path).content);
  assert.match(xml("/xl/styles.xml"), /<font><b\/><color rgb="FF9C0006"\/><\/font>/);
  assert.match(xml("/xl/styles.xml"), /fgColor rgb="FFFFC7CE"/);
  assert.match(xml("/xl/worksheets/sheet1.xml"), /sqref="F8:G9"/);
  assert.match(xml("/xl/worksheets/sheet1.xml"), /operator="lessThan"><formula>0<\/formula>/);
  assert.match(xml("/xl/worksheets/sheet1.xml"), /xSplit="5" ySplit="7" topLeftCell="F8"/);
  assert.equal(daily["!autofilter"].ref, "A7:G9");
});

test("post-cutoff dispatch is applied before available Stock and respects the forecast horizon", () => {
  const result = calculate([round("02:00", 40), round("09:00", 50), round("15:00", 10)], 70, 20, "2026-10-07T00:00");
  assert.equal(result.outstandingQty, 80);
  assert.equal(result.coveredThroughTime, "09:00");
  assert.equal(result.shortageTime, "15:00");
  assert.equal(result.firstShortageQty, 10);
  const enough = calculate([round("09:00", 50)], 60, 0, "2026-10-07T00:00");
  assert.equal(enough.shortageDate, "");
  assert.equal(enough.coveredThroughTime, "09:00");
  assert.equal(enough.remainingStockAfterForecast, 10);
  const none = calculate([round("09:00", 50)], 0, 0, "2026-10-07T00:00");
  assert.equal(none.coveredThroughDate, "");
  assert.equal(none.firstShortageQty, 50);
});

test("Excel export retains all Parts, numeric quantities and real day/month dates after roundtrip", () => {
  const base = { materialCode: "PART-A", description: "A", factories: ["FAC1", "FAC2"], stockQty: 50,
    forecastQty: 100, dispatchedAfterImport: 0, outstandingQty: 100, coveredThroughDate: "2026-10-07",
    coveredThroughTime: "02:00", shortageDate: "2026-10-07", shortageTime: "09:00", firstShortageQty: 40,
    totalShortage: 50, remainingStockAfterForecast: 0, status: "shortage" };
  const book = workbook(xlsx, [base, { ...base, materialCode: "PART-B", shortageDate: "", shortageTime: "", status: "covered" }],
    { fileName: "forecast.xlsx", cutoff: "05/10/2026 09:00", calculatedAt: "05/10/2026 10:00", exportedBy: "Test User" });
  const reopened = xlsx.read(xlsx.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true });
  const sheet = reopened.Sheets["Forecast Stock"];
  assert.equal(sheet.A8.v, "PART-A");
  assert.equal(sheet.A9.v, "PART-B");
  assert.equal(sheet.C8.v, "FAC1, FAC2");
  assert.equal(sheet.D8.t, "n");
  assert.equal(sheet.M8.v, 50);
  assert.equal(sheet.H8.t, "n");
  assert.equal(sheet.J8.t, "n");
  assert.equal(xlsx.SSF.format(sheet.J8.z, sheet.J8.v), "07/10/2026");
  assert.equal(sheet.K8.v, "09:00");
  assert.equal(sheet.J9?.v || "", "");
  assert.equal(sheet.B2.v, "forecast.xlsx");
  assert.equal(sheet.D3.v, "Test User");
  assert.equal(sheet["!autofilter"].ref, "A7:O9");
});
