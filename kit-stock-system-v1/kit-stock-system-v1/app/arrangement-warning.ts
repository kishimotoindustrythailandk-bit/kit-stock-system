export function arrangementWarningEvent(message: string, scope: {
  deliveryDate?: unknown; deliveryTime?: unknown; fact?: unknown;
  rawPayload?: unknown; qty?: unknown;
}, status: number) {
  const date = String(scope.deliveryDate ?? "").slice(0, 10);
  const time = String(scope.deliveryTime ?? "").slice(0, 5);
  const fact = String(scope.fact ?? "").slice(0, 160);
  const input = String(scope.rawPayload ?? "").trim();
  const tag = input.startsWith("KITSTOCK|") ? input.split("|")[1] : input;
  const stockTagCode = /^KITSTK-[A-Z0-9-]+$/i.test(tag ?? "") ? tag.slice(0, 180).toUpperCase() : "[Tag ไม่ถูกต้อง]";
  return {
    module: "arrange", moduleLabel: "จัดงาน", action: "arrange_warning", actionLabel: "แจ้งเตือนจัดงาน",
    entityType: "stock_tag", entityId: stockTagCode,
    summary: `${message} · วันที่ ${date || "ยังไม่เลือก"} · รอบ ${time || "ทั้งหมด"} · ${fact || "ทุก FAC"}`,
    details: { warningMessage: message, deliveryDate: date, deliveryTime: time, fact, stockTagCode, requestedQty: scope.qty, status },
  };
}
