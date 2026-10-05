import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { normalizeDueExcelDate } from "../app/due-excel-date.ts";

test("FAC A2 serial 46302 remains 7 October despite US display formatting", () => {
  for (const format of ["m/d/yy", "dd/mm/yyyy", "m-d-yy"]) {
    const sheet = XLSX.utils.aoa_to_sheet([["Due"], [46302]]);
    sheet.A2.z = format;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "02.00");
    const loaded = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellDates: false });
    const cell = loaded.Sheets["02.00"].A2;
    if (format === "m/d/yy") assert.equal(cell.w, "10/7/26");
    assert.equal(normalizeDueExcelDate(cell.v, XLSX), "2026-10-07");
  }
});

test("calendar serials preserve month boundaries and date1904 workbooks", () => {
  const serial = 46302;
  assert.equal(normalizeDueExcelDate(serial + 25, XLSX), "2026-11-01");
  assert.equal(normalizeDueExcelDate(serial - 1462, XLSX, true), "2026-10-07");
  assert.equal(normalizeDueExcelDate(serial + 0.875, XLSX), "2026-10-07");
});

test("Thai text dates retain day/month ordering, short years, BE and ISO", () => {
  for (const value of ["7/10/2026", "07-10-26", "7/10/2569", "2026-10-07"]) {
    assert.equal(normalizeDueExcelDate(value, XLSX), "2026-10-07");
  }
  assert.equal(normalizeDueExcelDate("10/7/2026", XLSX), "2026-07-10");
});

test("invalid dates and empty cells are rejected instead of silently rolling over", () => {
  for (const value of [null, "", "31/2/2026", "2026-13-07", NaN, Infinity, -1, 0.5]) {
    assert.equal(normalizeDueExcelDate(value, XLSX), "");
  }
});
