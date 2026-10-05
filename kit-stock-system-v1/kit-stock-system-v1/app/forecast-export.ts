type Coverage = {
  materialCode: string; description: string; factories: string[];
  stockQty: number; forecastQty: number; dispatchedAfterImport: number; outstandingQty: number;
  coveredThroughDate: string; coveredThroughTime: string; shortageDate: string; shortageTime: string;
  firstShortageQty: number; totalShortage: number; remainingStockAfterForecast: number; status: string;
};

function excelDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export function createForecastExportWorkbook(xlsx: typeof import("xlsx"), coverage: Coverage[], meta: {
  fileName: string; cutoff: string; calculatedAt: string; exportedBy: string;
}) {
  const rows: Array<Array<string | number>> = [
    ["KIT Forecast · Stock รองรับและรอบเริ่มขาด (ทุก Part)"],
    ["ไฟล์ Forecast", meta.fileName, "Last Calculate DO", meta.cutoff],
    ["คำนวณ ณ", meta.calculatedAt, "ผู้ส่งออก", meta.exportedBy],
    ["หมายเหตุ", "รองรับครบถึง: รวมยอดขายออกหลัง Cut-off และ Stock พร้อมใช้; รอบเริ่มขาดอาจมี Stock รองรับได้เพียงบางส่วน"],
    ["หมายเหตุ", "วันที่ว่างในช่องรองรับครบถึง = ไม่พอตั้งแต่รอบแรก; วันที่เริ่มขาดว่าง = เพียงพอสำหรับ Forecast ชุดนี้ ไม่ได้ยืนยันวันถัดจากชุดนี้"],
    [],
    ["Part / Material", "ชื่อชิ้นงาน", "FAC", "Stock พร้อมใช้", "Forecast ตามไฟล์", "ขายออกหลัง Cut-off", "Forecast คงค้าง", "รองรับแผนครบถึงวันที่", "รองรับครบถึงรอบ", "เริ่มขาดวันที่", "เริ่มขาดรอบ", "ขาดในรอบแรก", "ต้องผลิตเพิ่มรวม", "Stock เหลือหลัง Forecast", "สถานะ"],
    ...coverage.slice().sort((a, b) => (a.shortageDate || "9999").localeCompare(b.shortageDate || "9999") || a.shortageTime.localeCompare(b.shortageTime) || a.materialCode.localeCompare(b.materialCode)).map((item) => [
      item.materialCode, item.description, (item.factories || []).join(", "), item.stockQty, item.forecastQty, item.dispatchedAfterImport,
      item.outstandingQty, excelDate(item.coveredThroughDate), item.coveredThroughTime, excelDate(item.shortageDate), item.shortageTime,
      item.firstShortageQty, item.totalShortage, item.remainingStockAfterForecast,
      item.status === "covered" ? "Stock เพียงพอตาม Forecast" : item.status === "no_stock" ? "ไม่มี Stock พร้อมใช้" : "Stock ไม่พอ",
    ]),
  ];
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [24, 36, 20, 18, 22, 22, 20, 26, 22, 20, 20, 20, 22, 28, 32].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: `A7:O${rows.length}` };
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];
  for (let r = 7; r < rows.length; r++) {
    for (const c of [7, 9]) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (cell?.t === "n") cell.z = "dd/mm/yyyy";
    }
    for (const c of [3, 4, 5, 6, 11, 12, 13]) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (cell?.t === "n") cell.z = "#,##0";
    }
  }
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Forecast Stock");
  return workbook;
}
