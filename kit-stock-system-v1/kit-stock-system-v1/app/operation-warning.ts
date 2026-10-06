export const WARNING_PAGES: Record<string, string> = {
 dashboard: 'หน้าหลัก', stock: 'รับเข้า Stock', 'stock-all': 'Stock ทั้งหมด',
 'manual-stock': 'รับเข้า Stock แบบคีย์เอง', 'stock-count': 'ตรวจนับและปรับยอด',
 forecast: 'Forecast', parts: 'Part Master', tags: 'พิมพ์ Tag', plan: 'แผนส่งงาน',
 overdue: 'ค้าง / ติดลบ', arrange: 'จัดงาน', replacement: 'เบิกงานทดแทน',
 verify: 'ตรวจสอบชิ้นงาน', dispatch: 'ตรวจและขายออก', exports: 'รายการส่งออก',
 reports: 'รายงาน', history: 'ประวัติ', settings: 'ตั้งค่า', users: 'ผู้ใช้งาน',
};
export type OperationWarning = { page: string; message: string; showPopup?: boolean; context?: Record<string, string | number> };
export function reportOperationWarning(warning: OperationWarning) {
 if (typeof window === 'undefined' || !warning.message.trim()) return;
 window.dispatchEvent(new CustomEvent('kit-operation-warning', { detail: warning }));
}
export function operationWarningEvent(page: string, message: string, context?: Record<string, unknown>) {
 const label = WARNING_PAGES[page];
 if (!label || !message.trim()) return null;
 return { module: page === 'verify' ? 'dispatch' : page, moduleLabel: label,
  action: 'operation_warning', actionLabel: `แจ้งเตือน ${label}`,
  summary: message.slice(0,1000), details: { page, warningMessage: message.slice(0,1000), context },
 };
}
