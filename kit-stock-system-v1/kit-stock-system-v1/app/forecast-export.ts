type Coverage = {
  materialCode: string; description: string; factories: string[];
  stockQty: number; forecastQty: number; dispatchedAfterImport: number; outstandingQty: number;
  coveredThroughDate: string; coveredThroughTime: string; shortageDate: string; shortageTime: string;
  firstShortageQty: number; totalShortage: number; remainingStockAfterForecast: number; status: string;
  timeline?: Array<{ deliveryDate: string; deliveryTime: string; demandQty: number; projectedBalance: number }>;
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
  if (coverage.some((item) => item.timeline?.length)) {
    for (const mode of ["daily", "round"] as const) {
      const keys = [...new Set(coverage.flatMap((item) => (item.timeline || []).map((point) =>
        mode === "daily" ? point.deliveryDate : `${point.deliveryDate}T${point.deliveryTime}`)))].sort();
      if (keys.length > 16_379) throw new Error("Forecast มีรอบเกินขีดจำกัดคอลัมน์ Excel กรุณาลดช่วงวันที่ในไฟล์ Forecast");
      const matrixRows: Array<Array<string | number>> = [
        [mode === "daily" ? "KIT Forecast · ยอดคงเหลือสะสมรายวัน" : "KIT Forecast · ยอดคงเหลือสะสมรายรอบ"],
        ["ไฟล์ Forecast", meta.fileName, "Last Calculate DO", meta.cutoff],
        ["คำนวณ ณ", meta.calculatedAt, "ผู้ส่งออก", meta.exportedBy],
        ["วิธีอ่าน", "ยอดคงเหลือ = Stock พร้อมใช้ − Forecast คงค้างสะสม (หักยอดขายออกหลัง Cut-off แล้ว); ยอดติดลบสีแดง = จำนวนที่ยังขาดสะสม"],
        ["หมายเหตุ", mode === "daily" ? "แสดงยอดหลังรอบสุดท้ายของแต่ละวัน; ดูรอบที่เริ่มขาดในชีตรายรอบ/สรุป; ไม่รวมแผนผลิตรับเข้าในอนาคต" : "รวมทุก FAC ของ Part ในรอบเดียวกัน; คงยอดเดิมเมื่อไม่มีความต้องการในรอบนั้น; ไม่รวมแผนผลิตรับเข้าในอนาคต"],
        [],
        ["No.", "Part No.", "Item Description", "FAC", "Stock พร้อมใช้", ...keys.map((key) => mode === "daily" ? excelDate(key) : `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)} ${key.slice(11, 16)}`)],
        ...coverage.slice().sort((a, b) => a.materialCode.localeCompare(b.materialCode)).map((item, index) => {
          const points = (item.timeline || []).slice().sort((a, b) => `${a.deliveryDate}T${a.deliveryTime}`.localeCompare(`${b.deliveryDate}T${b.deliveryTime}`));
          let cursor = 0, balance = item.stockQty;
          return [index + 1, item.materialCode, item.description, item.factories.join(", "), item.stockQty, ...keys.map((key) => {
            while (cursor < points.length && (mode === "daily" ? points[cursor].deliveryDate : `${points[cursor].deliveryDate}T${points[cursor].deliveryTime}`) <= key) {
              balance = points[cursor++].projectedBalance;
            }
            return balance;
          })];
        }),
      ];
      const matrix = xlsx.utils.aoa_to_sheet(matrixRows);
      matrix["!cols"] = [8, 24, 36, 20, 20, ...keys.map(() => mode === "daily" ? 15 : 23)].map((wch) => ({ wch }));
      const lastColumn = xlsx.utils.encode_col(keys.length + 4);
      matrix["!autofilter"] = { ref: `A7:${lastColumn}${matrixRows.length}` };
      matrix["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(4, keys.length + 4) } }];
      for (let c = 5; c < keys.length + 5; c++) {
        if (mode === "daily") matrix[xlsx.utils.encode_cell({ r: 6, c })].z = "dd/mm/yyyy";
        for (let r = 7; r < matrixRows.length; r++) matrix[xlsx.utils.encode_cell({ r, c })].z = "#,##0;-#,##0;0";
      }
      xlsx.utils.book_append_sheet(workbook, matrix, mode === "daily" ? "ยอดคงเหลือรายวัน" : "ยอดคงเหลือรายรอบ");
    }
  }
  xlsx.utils.book_append_sheet(workbook, sheet, "Forecast Stock");
  return workbook;
}

// SheetJS CE writes cell values and number formats. Add standard OOXML
// conditional fills and frozen panes to the generated archive for Excel.
export function createForecastExportBinary(xlsx: typeof import("xlsx"), workbook: import("xlsx").WorkBook): Uint8Array {
  const cfb = xlsx.CFB as typeof import("cfb");
  const archive = cfb.read(new Uint8Array(xlsx.write(workbook, { type: "array", bookType: "xlsx" })), { type: "array" });
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  function edit(path: string, transform: (xml: string) => string) {
    const entry = cfb.find(archive, path);
    if (!entry) throw new Error(`ไม่พบองค์ประกอบ Excel: ${path}`);
    entry.content = encoder.encode(transform(decoder.decode(new Uint8Array(entry.content))));
    entry.size = entry.content.length;
  }
  edit("/xl/styles.xml", (xml) => xml.replace('<dxfs count="0"/>', '<dxfs count="3"><dxf><font><b/><color rgb="FF000000"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor rgb="FFFF0000"/></patternFill></fill></dxf><dxf><font><b/><color rgb="FFFFFFFF"/></font><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor rgb="FF17365D"/></patternFill></fill></dxf><dxf><font><color rgb="FF000000"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor rgb="FFFFF2CC"/></patternFill></fill></dxf></dxfs>'));
  workbook.SheetNames.forEach((name, index) => {
    const range = xlsx.utils.decode_range(workbook.Sheets[name]["!ref"] || "A1");
    const lastColumn = xlsx.utils.encode_col(range.e.c), lastRow = range.e.r + 1;
    const matrix = name !== "Forecast Stock";
    const split = matrix ? 5 : 3;
    const frozen = `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${split}" ySplit="7" topLeftCell="${xlsx.utils.encode_col(split)}8" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${xlsx.utils.encode_col(split)}8" sqref="${xlsx.utils.encode_col(split)}8"/></sheetView></sheetViews>`;
    let formatting = `<conditionalFormatting sqref="A7:${lastColumn}7"><cfRule type="expression" dxfId="1" priority="2"><formula>TRUE</formula></cfRule></conditionalFormatting>`;
    if (matrix && lastRow >= 8) {
      formatting += `<conditionalFormatting sqref="F8:${lastColumn}${lastRow}"><cfRule type="cellIs" dxfId="0" priority="1" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting><conditionalFormatting sqref="E8:E${lastRow}"><cfRule type="expression" dxfId="2" priority="3"><formula>TRUE</formula></cfRule></conditionalFormatting>`;
    }
    edit(`/xl/worksheets/sheet${index + 1}.xml`, (xml) => {
      let updated = xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/, frozen);
      if (updated === xml && !xml.includes("<sheetViews")) updated = xml.replace(/(<dimension[^>]*\/>)/, `$1${frozen}`);
      return updated.includes("<ignoredErrors") ? updated.replace("<ignoredErrors", `${formatting}<ignoredErrors`) : updated.replace("</worksheet>", `${formatting}</worksheet>`);
    });
  });
  return new Uint8Array(cfb.write(archive, { fileType: "zip", type: "array", compression: true }));
}
