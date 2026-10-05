/** Numeric Excel cells are authoritative; formatted text is locale-dependent. */
export function normalizeDueExcelDate(value: unknown, xlsx: typeof import("xlsx"), date1904 = false): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1) return "";
    const parsed = xlsx.SSF.parse_date_code(value, { date1904 });
    return parsed ? calendarDate(parsed.y, parsed.m, parsed.d) : "";
  }
  const raw = String(value ?? "").trim().split(/\s/)[0];
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // Text entered in Thai templates uses day/month/year (including BE years).
  const thai = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (!thai) return "";
  const rawYear = Number(thai[3]);
  const year = rawYear > 2400 ? rawYear - 543 : rawYear < 100 ? rawYear + 2000 : rawYear;
  return calendarDate(year, Number(thai[2]), Number(thai[1]));
}

function calendarDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
