Warning: truncated output (original token count: 108818)
Total output lines: 4775

"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { validArrangementQuantity } from "./arrangement-quantity";
import SplitTagPopup from "./split-tag-popup";
import OperationWarningPopup from "./operation-warning-popup";
import { reportOperationWarning } from "./operation-warning";
import DashboardControlCenter from "./dashboard-control-center";
import OverdueWorkPage from "./overdue-work-page";
import StockAllPage from "./stock-all-page";
import { OverviewIcon, OverviewLogo, OverviewFactory, OVERVIEW_NAV_ICONS } from "./stock-overview-icons";
import { createForecastExportWorkbook, createForecastExportBinary } from "./forecast-export";
import { normalizeDueExcelDate } from "./due-excel-date";
import { speakThaiAlert } from "./voice-alert";
import VoiceAlertControl from "./voice-alert-control";

type PageKey = "stock-all" | "overdue" | "dashboard" | "stock" | "manual-stock" | "stock-count" | "forecast" | "parts" | "tags" | "plan" | "arrange" | "replacement" | "verify" | "dispatch" | "exports" | "reports" | "history" | "settings" | "users";

type EditablePageKey = "stock" | "manual-stock" | "stock-count" | "forecast" | "parts" | "tags" | "plan" | "arrange" | "replacement" | "dispatch";
type EditPermission = `${EditablePageKey}-edit`;
type AppPermission = PageKey | EditPermission | "stock-all-details" | "stock-all-export" | "parts-add" | "permission-model-v2";

const EDITABLE_PAGE_KEYS: EditablePageKey[] = ["stock", "manual-stock", "stock-count", "forecast", "parts", "tags", "plan", "arrange", "replacement", "dispatch"];

const STOCK_ACCESS_LABELS: Record<string,string> = { "stock-all-details": "Stock ทั้งหมด: ดู Tag / Job / Movement", "stock-all-export": "Stock ทั้งหมด: ส่งออก Excel", "parts-add": "ทะเบียน Part: เพิ่มข้อมูล Part ใหม่" };

type DueLine = {
  id: number;
  importId: number;
  doNo: string;
  seq: number;
  materialCode: string;
  materialDescription: string;
  site: string;
  fact: string;
  line: string;
  shop: string;
  reqQty: number;
  deliveryDate: string;
  deliveryTime: string;
  status: string;
  scannedQty: number;
  arrangedQty: number;
  tagCount: number;
};

type DueScan = {
  id: number;
  dueLineId: number;
  tagId: string;
  qty: number;
  unit: string;
  location: string;
  scannedByName: string;
  createdAt: string;
  materialCode: string;
  fact: string;
  deliveryDate: string;
  deliveryTime: string;
};

type DueImport = {
  id: number;
  fileName: string;
  rowCount: number;
  totalQty: number;
  importedByName: string;
  createdAt: string;
};
type DueReceipt = { id: number; dueLineId: number; tagId: string; qty: number; unit: string; location: string; receivedByName: string; createdAt: string; materialCode: string; fact: string };

type TagPreview = {
  tag: {
    tagId: string;
    qty: number;
    unit: string;
    materialCode: string;
    location: string;
    doNo: string;
    deliveryDate: string;
    line: string;
    shop: string;
    seq: number;
  };
  due: DueLine & {
    remainingQty: number;
    projectedQty: number;
    remainingAfter: number;
    projectedStatus: string;
  };
  stockAllocations?: Array<{
    stockTagId: number; stockTagCode?: string; qty: number; jobNo?: string;
    productionDate?: string; receivedAt?: string; pickedByName?: string; pickedAt?: string;
  }>;
};

type ImportRow = Omit<DueLine, "id" | "importId" | "status" | "scannedQty" | "arrangedQty" | "tagCount"> & { sourceKey: string };
type DuePayload = { dues: DueLine[]; imports: DueImport[]; scans: DueScan[]; receipts: DueReceipt[]; error?: string };
type SystemUser = { id: number; employeeCode: string; displayName: string; email: string; role: string; active: boolean; permissions: AppPermission[]; createdAt?: string };
type PartImageMapping = { materialCode: string; originalName: string; contentType: string; updatedByName: string; updatedAt: string; materialDescription?: string };
type StockPart = { materialCode: string; partName: string; customer: string; location: string; standardQty: number; active: boolean };
type PartImportItem = Pick<StockPart, "materialCode" | "partName" | "customer" | "location" | "standardQty">;
type PartBundleRow = { part: PartImportItem; masterFile?: File; actualFile?: File };
type PartBundlePreview = {
  fileName: string;
  rows: PartBundleRow[];
  unmatchedMaster: string[];
  unmatchedActual: string[];
  duplicateImages: string[];
};
type StockTag = { id: number; tagId: string; materialCode: string; partName: string; customer: string; qty: number; remainingQty: number; reservedQty: number; receivedQty?: number; ngQty?: number; jobNo: string; productionDate: string; status: string; printedByName: string; receivedByName: string; receivedAt?: string; createdAt: string; payload?: string; boxNo?: number; boxCount?: number; deliveryQty?: number; location?: string; splitLabelId?: string; splitIssuedAt?: string };
type StockReceivePreview = { action: "receive_preview"; rawPayload: string; tag: StockTag; master: { materialCode: string; partName: string; customer: string; hasImage: boolean } };
type StockAllocation = { id: number; customerTagId: string; stockTagCode: string; materialCode: string; qty: number; status: string; reservedByName: string; reservedAt: string; dispatchedByName: string; dispatchedAt?: string };
type StockPick = {
  id: number; dueLineId: number; pickedQty: number; dispatchedQty: number; status: string;
  pickedByName: string; pickedByCode: string; pickedAt: string; stockTagCode: string;
  materialCode: string; jobNo: string; productionDate: string; receivedAt?: string;
  doNo: string; seq: number; fact: string; line: string; shop: string;
  deliveryDate: string; deliveryTime: string;
};
type StockDispatchLink = {
  id: number; customerTagId: string; qty: number; dispatchedByName: string;
  dispatchedByCode: string; dispatchedAt: string; pickedByName: string; pickedAt: string;
  stockTagCode: string; materialCode: string; jobNo: string; productionDate: string;
  receivedAt?: string; doNo: string; fact: string; line: string;
};
type StockJobClosure = {
  id: number; jobNo: string; materialCode: string; totalQty: number; receivedQty: number;
  ngQty: number; ngTagCount: number; reason: string; closedByName: string;
  closedByCode: string; closedAt: string;
};
type JobQuantityAdjustmentPreview = {
  jobNo: string; materialCode: string; partName: string; customer: string; packQty: number;
  currentQty: number; targetQty: number; difference: number; lockedQty: number; pendingQty: number;
  productionDate: string; keptTagCount: number;
  cancelledTags: Array<{ id: number; tagId: string; qty: number }>;
  newTagQtys: number[];
};
type JobQuantityAdjustment = {
  jobNo: string; materialCode: string; partName: string; currentQty: number;
};
type StockManualReceipt = {
  id: number; stockTagId: number; tagId: string; materialCode: string; partName: string;
  qty: number; jobNo: string; productionDate: string; referenceNo: string; note: string;
  receivedByName: string; receivedByCode: string; receivedAt: string;
  transactionNo: string; transactionTotalQty: number; packQty: number; tagCount: number;
  duplicateConfirmed: number;
};
type ManualDuplicateJob = {
  materialCode: string; partName: string; jobNo: string; previousQty: number;
  previousTagCount: number; incomingQty: number; incomingTagCount: number;
  totalAfter: number; lastReceivedAt: string;
};
type ManualReceiptSuccess = {
  transactionNo: string; tags: StockTag[]; totalQty: number; packQty: number;
  boxCount: number; duplicateConfirmed: boolean;
};
type StockCountAdjustment = {
  id: number; adjustmentNo: string; countDate: string; materialCode: string; partName: string;
  systemQty: number; countedQty: number; difference: number; reason: string;
  adjustedByName: string; adjustedByCode: string; adjustedAt: string; affectedTagCount: number;
};
type StockCountAdjustmentLine = {
  id: number; adjustmentId: number; stockTagId: number; stockTagCode: string;
  qtyChange: number; beforeQty: number; afterQty: number; createdAt: string;
};
type StockMovementDay = { date: string; receivedQty: number; arrangedQty: number; adjustedQty: number };
type StockCountPreview = {
  action: "preview_tag_count"; tagId: string; materialCode: string; partName: string;
  customer: string; jobNo: string; productionDate: string; status: string;
  systemQty: number; countedQty: number; difference: number; reservedQty: number;
  stockAreaSystemQty: number; stockAreaCountedQty: number; newTotalQty: number;
  availableQty: number; materialTotalQty: number; materialTotalAfter: number; countDate: string;
};
type StockPayload = {
  parts: StockPart[]; tags: StockTag[]; allocations: StockAllocation[];
  picks: StockPick[]; dispatchLinks: StockDispatchLink[]; jobClosures: StockJobClosure[];
  manualReceipts: StockManualReceipt[]; countAdjustments: StockCountAdjustment[];
  countAdjustmentLines: StockCountAdjustmentLine[];
  movementDays: StockMovementDay[];
};
type ArrangementPreview = {
  action: "staged";
  pick: StockPick;
  tag: StockTag;
  due: DueLine & { remainingToArrange: number; remainingQty: number };
};
type ArrangeConfirmation = {
  action: "preview_stage"; tag: StockTag; due: DueLine;
  pickedQty: number; tagAvailableQty: number; dueOpenQty: number; remainingAfter: number;
  rawPayload: string; deliveryDate: string; deliveryTime: string; fact: string;
};
type ReplacementRequest = {
  id: number; requestNo: string; materialCode: string; partName: string; customer: string;
  requestedQty: number; issuedQty: number; remainingQty: number; reasonType: "defect" | "shortage" | "other";
  reasonDetail: string; neededDate: string; status: "pending" | "partial" | "completed" | "cancelled";
  requestedByName: string; requestedByCode: string; requestedAt: string; completedAt?: string;
};
type ReplacementIssue = {
  id: number; requestId: number; stockTagId: number; stockTagCode: string; qty: number;
  noticeNo: string; issuedByName: string; issuedByCode: string; issuedAt: string;
  printedByName?: string; printedByCode?: string; printedAt?: string; jobNo?: string; productionDate?: string;
};
type ReplacementPayload = { requests: ReplacementRequest[]; issues: ReplacementIssue[] };
type ReplacementIssuePreview = {
  action: "preview"; request: ReplacementRequest;
  tag: StockTag & { availableQty: number; stagedQty?: number; legacyReservedQty?: number; location?: string };
  suggestedQty: number;
};
type ForecastImport = {
  id: number; importToken: string; fileName: string; sourceCalculatedAt: string;
  rowCount: number; materialCount: number; totalQty: number; status: string;
  importedByName: string; importedByCode: string; createdAt: string; activatedAt?: string | null;
};
type ForecastCoverage = {
  materialCode: string; description: string; stockQty: number; forecastQty: number;
  dispatchedAfterImport: number; outstandingQty: number; overdueQty: number;
  coveredThroughDate: string; coveredThroughTime: string; shortageDate: string;
  shortageTime: string; firstShortageQty: number; totalShortage: number;
  remainingStockAfterForecast: number; status: "covered" | "shortage" | "no_stock";
  factories: string[]; daysToShortage: number | null;
  timeline?: Array<{ deliveryDate: string; deliveryTime: string; demandQty: number; projectedBalance: number }>;
  riskGroup: "overdue" | "within3" | "within7" | "within14" | "over14";
};
type ForecastSummary = {
  materialCount: number; stockQty: number; outstandingQty: number; overdueQty: number;
  totalShortage: number; coveredMaterials: number; shortageMaterials: number;
  riskGroups: Record<"overdue" | "within3" | "within7" | "within14" | "over14", number>;
};
type ForecastTrend = { date: string; demandQty: number; cumulativeDemand: number; projectedStock: number; shortageParts: number };
type ForecastPayload = {
  activeImport: ForecastImport | null; imports: ForecastImport[];
  coverage: ForecastCoverage[]; summary: ForecastSummary | null; trend?: ForecastTrend[]; calculatedAt?: string; error?: string;
};
type ForecastUploadRow = {
  sourceKey: string; materialCode: string; description: string; deliveryDate: string;
  deliveryTime: string; prodQty: number; deliverySpot: string; factory: string; shop: string; line: string;
};
type ForecastPreview = {
  fileName: string; sourceCalculatedAt: string; sourceLabel: string; sourceRowCount: number;
  materialCount: number; totalQty: number; duplicateRowCount: number; rows: ForecastUploadRow[];
};
type UserRole = "production" | "stock" | "qc" | "delivery" | "dispatcher" | "inspector";
type UserForm = { id?: number; employeeCode: string; displayName: string; email: string; role: UserRole; pin: string; active: boolean; permissions: AppPermission[] };
type AuditLog = {
  id: number; moduleKey: string; moduleLabel: string; actionKey: string; actionLabel: string;
  entityType: string; entityId: string; summary: string; detailJson: string;
  beforeJson: string; afterJson: string; actorCode: string; actorName: string;
  actorEmail: string; actorRole: string; ipAddress: string; createdAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  production: "Production",
  stock: "Stock",
  qc: "QC",
  delivery: "Delivery",
  dispatcher: "ผู้จัดงาน (Legacy)",
  inspector: "ผู้ตรวจงาน (Legacy)",
};
const EMPTY_USER: UserForm = { employeeCode: "", displayName: "", email: "", role: "production", pin: "", active: true, permissions: [] };

const NAV: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: "dashboard", label: "หน้าหลัก", icon: "⌂" },
  { key: "stock", label: "Stock", icon: "▦" },
  { key: "stock-all", label: "Stock ทั้งหมด", icon: "▦" },
  { key: "manual-stock", label: "รับเข้า Stock แบบคีย์เอง", icon: "＋" },
  { key: "stock-count", label: "ตรวจนับ/ปรับยอดสิ้นเดือน", icon: "≋" },
  { key: "forecast", label: "Forecast Stock", icon: "▧" },
  { key: "parts", label: "ทะเบียน Part", icon: "▦" },
  { key: "tags", label: "พิมพ์ Tag", icon: "▤" },
  { key: "plan", label: "แผนส่งงาน (Due)", icon: "▤" },
  { key: "overdue", label: "งานติดลบ / ค้างส่ง", icon: "!" },
  { key: "arrange", label: "จัดงาน", icon: "⇥" },
  { key: "replacement", label: "เบิกงานทดแทน", icon: "↺" },
  { key: "dispatch", label: "ตรวจและขายออก", icon: "⌗" },
  { key: "exports", label: "รายการส่งออก", icon: "▱" },
  { key: "reports", label: "รายงาน", icon: "▥" },
  { key: "history", label: "ประวัติ", icon: "◷" },
  { key: "settings", label: "ตั้งค่า", icon: "⚙" },
  { key: "users", label: "ผู้ใช้งาน", icon: "♙" },
];

const DUE_DATA_PAGES: PageKey[] = ["dashboard", "plan", "overdue", "arrange", "dispatch", "exports", "reports", "history"];

const PAGE_KEYS = new Set<PageKey>([...NAV.map((item) => item.key), "verify", "overdue"]);

function pageFromUrl(): PageKey | null {
  if (typeof window === "undefined") return null;
  const candidate = new URLSearchParams(window.location.search).get("page");
  return candidate && PAGE_KEYS.has(candidate as PageKey) ? candidate as PageKey : null;
}

function pageFromLocation(): PageKey | null {
  if (typeof window === "undefined") return null;
  const candidate = pageFromUrl() || window.localStorage.getItem("kit-current-page");
  return candidate && PAGE_KEYS.has(candidate as PageKey) ? candidate as PageKey : null;
}

function updatePageLocation(next: PageKey, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);
  if (next === "dashboard") url.searchParams.delete("page");
  else url.searchParams.set("page", next);
  window.localStorage.setItem("kit-current-page", next);
  const target = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "replace") window.history.replaceState({ kitPage: next }, "", target);
  else window.history.pushState({ kitPage: next }, "", target);
}

const PERMISSION_HELP: Record<PageKey, string> = {
  dashboard: "ภาพรวม Due และสถานะงาน",
  stock: "รับ Tag เข้า Stock และดูยอดคงเหลือ",
  "stock-all": "ดูภาพรวม Stock ทุก Part รวมยอด 0 (สิทธิ์รายละเอียดและ Excel เลือกแยกด้านล่าง)",
  "manual-stock": "คีย์รับงานเข้าและสร้าง Tag ตามจำนวนบรรจุต่อกล่อง",
  "stock-count": "สแกนตรวจนับและปรับยอดทีละ KIT Stock Tag",
  forecast: "นำเข้า Forecast ลูกค้าและตรวจว่ายอด Stock ส่งได้ถึงวันไหน",
  parts: "ทะเบียน Part และรูปชิ้นงาน",
  tags: "ทะเบียน Part สร้างและพิมพ์ Tag",
  overdue: "ดูงานติดลบ / ค้างส่งทุก Part ทุกรอบ ทุก FAC และเปิดจอแสดงงานค้าง",
  plan: "นำเข้า ตรวจสอบ และลบแผน Due",
  arrange: "เลือก Due และยิง KIT Tag เพื่อจัดงานรอขาย",
  replacement: "QC ขอเบิกงานเสีย/งานขาด และทีมจัดงานยิง KIT Tag เพื่อตัด Stock",
  verify: "สแกนเทียบรูป master ก่อนขายออก (ไม่ตัด Stock/Due)",
  dispatch: "ยิง Tag ลูกค้าเพื่อตัด Stock และ Due",
  exports: "ดูรายการที่ส่งออกแล้ว",
  reports: "ดูและส่งออกรายงาน",
  history: "ตรวจสอบประวัติรายการ",
  settings: "ตั้งค่าระบบและรูปชิ้นงาน",
  users: "เพิ่มผู้ใช้และกำหนดสิทธิ์",
};

const PAGE_SUBTITLE: Record<PageKey, string> = {
  dashboard: "ภาพรวมการส่งงานและสถานะล่าสุด",
  "stock-all": "ดู Stock ทุก Part รวมยอด 0 ดู Tag / Job และส่งออก Excel โดยแยกจากหน้ารับเข้า",
  stock: "สแกนรับเข้า ตรวจสอบยอดคงเหลือ และประวัติ Stock",
  "manual-stock": "คีย์รับเข้า แบ่งจำนวนตามบรรจุต่อกล่อง และสร้าง Tag อัตโนมัติ",
  "stock-count": "สแกนและบันทึกยอดจริงทีละ Tag พร้อมปรับยอด Stock รวม",
  forecast: "นำเข้า Forecast รายวันและตรวจสอบว่ายอด Stock ส่งได้ถึงวันไหน",
  parts: "เพิ่ม นำเข้า และจัดการรูปชิ้นงานของแต่ละ Part",
  tags: "ทะเบียน Part สร้าง Tag และพิมพ์ Tag รับงานเข้า Stock",
  overdue: "งานค้างส่งทุก Part ทุกวันที่ ทุกรอบ และทุก FAC",
  plan: "ตรวจสอบแผนส่งงานจากไฟล์ Excel",
  arrange: "ผู้จัดงานเลือก Due แล้วยิง KIT Stock Tag เพื่อบันทึกงานรอขาย",
  replacement: "QC แจ้งขอเบิกงานทดแทน ทีมจัดงานยิง KIT Tag และพิมพ์ใบแจ้งออก",
  verify: "สแกนชิ้นงานในกล่องเพื่อเทียบรูป master และงานที่ต้องส่งออก ก่อนยืนยันขายออก",
  dispatch: "ผู้ตรวจสแกน KIT Tag ที่จัดงานแล้วและ Tag ลูกค้าให้ตรงกันก่อนขายออก",
  exports: "รายการที่ตัดยอดและส่งออกแล้ว",
  reports: "สรุปผลการส่งงานตามวันและโรงงาน",
  history: "ตรวจสอบประวัติการสแกนและตัดยอด",
  settings: "กำหนดค่าการทำงานของระบบ",
  users: "ผู้ใช้งานที่มีสิทธิ์เข้าถึงระบบ",
};

type VerifyVerdict = "ready" | "ready_noimg" | "short" | "over" | "no_due" | "ambiguous" | "already" | "bad_tag" | "pair_mismatch";
type DispatchKitSelection = {
  pickId: number; dueLineId: number; waitingQty: number; pickedByName: string; pickedAt: string;
  stockTagId: number; stockTagCode: string; materialCode: string; jobNo: string;
  productionDate: string; doNo: string; seq: number; fact: string; line: string;
  shop: string; deliveryDate: string; deliveryTime: string;
};
type VerifyResult = {
  action: "verify";
  verdict: VerifyVerdict;
  message?: string;
  tag?: { rawPayload: string; tagId: string; materialCode: string; qty: number; unit: string; doNo: string; seq: number; deliveryDate: string; line: string; shop: string; location: string };
  master?: { materialCode: string; partName: string; customer: string; hasImage: boolean };
  due?: { id: number; doNo: string; seq: number; materialCode: string; materialDescription: string; fact: string; line: string; shop: string; site: string; reqQty: number; deliveryDate: string; deliveryTime: string; alreadyQty: number; remainingDue: number; projectedQty: number; remainingAfter: number };
  stagedAvail?: number;
  pairedKit?: { pickId?: number; stockTagId?: number; stockTagCode?: string; materialCode?: string; jobNo?: string; productionDate?: string; waitingQty?: number };
};

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDate(value: unknown, xlsx: typeof import("xlsx")) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value).split(" ")[0];
  const thai = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (thai) return `${thai[3]}-${thai[2].padStart(2, "0")}-${thai[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return "";
}

function normalizeTime(value: unknown) {
  if (value instanceof Date) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  return text(value).slice(0, 5);
}

function fmt(value: number) {
  return Number(value || 0).toLocaleString("th-TH");
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDateOnly(value: string) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return formatDate(value.slice(0, 10));
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** แปลงเวลาจากฐานข้อมูล (UTC ไม่มีโซนต่อท้าย) เป็น Date ตามเวลาเครื่องผู้ใช้ */
function toLocalDate(value: string) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string) {
  const date = toLocalDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** วันนี้ตามเวลาเครื่องผู้ใช้ ไม่ใช่ UTC มิฉะนั้นยอดตอนเย็นจะข้ามวันผิด */
function isToday(value: string) {
  const date = toLocalDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function html(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

const BANGKOK_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function bangkokDateTimeKey(value = new Date()) {
  const parts = Object.fromEntries(
    BANGKOK_DATE_TIME_FORMATTER.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseCsv(textValue: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = textValue.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeForecastDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeForecastTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

async function parseForecastFile(file: File): Promise<ForecastPreview> {
  const rows = parseCsv(await file.text());
  if (rows.length < 3) throw new Error("ไฟล์ Forecast ไม่มีข้อมูล");
  const sourceMatch = (rows[0][0] || "").match(/\((\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}:\d{2})\)/);
  if (!sourceMatch) throw new Error("ไม่พบเวลา Last Calculate DO ในไฟล์");
  const sourceDate = `${sourceMatch[3]}-${sourceMatch[2].padStart(2, "0")}-${sourceMatch[1].padStart(2, "0")}`;
  const sourceTime = normalizeForecastTime(sourceMatch[4]);
  const sourceCalculatedAt = new Date(`${sourceDate}T${sourceTime}+07:00`).toISOString();
  const headers = rows[1].map((value) => value.trim());
  const column = (name: string) => headers.indexOf(name);
  for (const required of ["Material", "Description", "Prod.Qty.", "Delivery Date", "Delivery Time"]) {
    if (column(required) < 0) throw new Error(`ไฟล์ไม่มีคอลัมน์ ${required}`);
  }
  const grouped = new Map<string, ForecastUploadRow>();
  let sourceRowCount = 0;
  let invalidRowCount = 0;
  let duplicateRowCount = 0;
  for (const cells of rows.slice(2)) {
    const materialCode = String(cells[column("Material")] || "").trim().toUpperCase();
    const deliveryDate = normalizeForecastDate(String(cells[column("Delivery Date")] || ""));
    const deliveryTime = normalizeForecastTime(String(cells[column("Delivery Time")] || ""));
    const prodQty = number(cells[column("Prod.Qty.")]);
    if (!cells.some((cell) => String(cell || "").trim())) continue;
    if (!materialCode || !deliveryDate || !deliveryTime || prodQty <= 0) {
      invalidRowCount += 1;
      continue;
    }
    sourceRowCount += 1;
    const sourceKey = `${materialCode}|${deliveryDate}|${deliveryTime}`;
    const existing = grouped.get(sourceKey);
    if (existing) { existing.prodQty += prodQty; duplicateRowCount += 1; }
    else grouped.set(sourceKey, {
      sourceKey, materialCode, deliveryDate, deliveryTime, prodQty,
      description: String(cells[column("Description")] || "").trim(),
      deliverySpot: String(cells[column("Delivery Spot")] || "").trim(),
      factory: String(cells[column("Factory")] || "").trim(),
      shop: String(cells[column("Shop")] || "").trim(),
      line: String(cells[column("Line")] || "").trim(),
    });
  }
  const uploadRows = [...grouped.values()].sort((left, right) =>
    left.materialCode.localeCompare(right.materialCode)
    || left.deliveryDate.localeCompare(right.deliveryDate)
    || left.deliveryTime.localeCompare(right.deliveryTime)
  );
  if (invalidRowCount > 0) throw new Error(`พบข้อมูลผิดรูปแบบ ${invalidRowCount} แถว กรุณาตรวจ Part No., วันที่, เวลา และ Quantity`);
  if (!uploadRows.length) throw new Error("ไม่พบรายการ Forecast ที่มียอดมากกว่า 0");
  return {
    fileName: file.name,
    sourceCalculatedAt,
    sourceLabel: `${sourceMatch[1].padStart(2, "0")}/${sourceMatch[2].padStart(2, "0")}/${sourceMatch[3]} ${sourceTime}`,
    sourceRowCount,
    materialCount: new Set(uploadRows.map((row) => row.materialCode)).size,
    totalQty: uploadRows.reduce((sum, row) => sum + row.prodQty, 0),
    duplicateRowCount,
    rows: uploadRows,
  };
}

function isDeliveryOverdue(due: DueLine, now = new Date()) {
  const status = String(due.status || "").trim().toLowerCase();
  if (["completed", "cancelled", "canceled"].includes(status)) return false;
  const required = Number(due.reqQty);
  const dispatched = Number(due.scannedQty);
  if (!Number.isFinite(required) || required <= 0 || !Number.isFinite(dispatched) || dispatched >= required) return false;

  const dateMatch = due.deliveryDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = due.deliveryTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!dateMatch || !timeMatch) return false;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const validDate = new Date(Date.UTC(year, month - 1, day));
  if (validDate.getUTCFullYear() !== year || validDate.getUTCMonth() !== month - 1 || validDate.getUTCDate() !== day) return false;

  return `${due.deliveryDate}T${due.deliveryTime}` < bangkokDateTimeKey(now);
}

function stateOf(due: DueLine, now = new Date()) {
  const scanned = Number(due.scannedQty);
  if (scanned >= Number(due.reqQty)) return "completed";
  if (isDeliveryOverdue(due, now)) return "over";
  if (scanned > 0) return "partial";
  return "pending";
}

function stateLabel(due: DueLine, now = new Date()) {
  const state = stateOf(due, now);
  if (state === "over") return "เกินดิวจัดส่งงาน";
  if (state === "completed") return "ครบตามแผน";
  if (Number(due.arrangedQty) > 0 && Number(due.scannedQty) > 0) return "ส่งบางส่วน / มีงานรอ";
  if (Number(due.arrangedQty) > 0) return "จัดแล้ว รอขายออก";
  if (state === "partial") return "ส่งบางส่วน";
  return "ยังไม่ส่ง";
}

async function playOverdueAlertTone(audioContextRef: { current: AudioContext | null }) {
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) return false;
    const existingContext = audioContextRef.current;
    const context = existingContext && existingContext.state !== "closed" ? existingContext : new AudioContextClass();
    audioContextRef.current = context;
    if (context.state !== "running") await context.resume();

    const startAt = context.currentTime + 0.02;
    [{ frequency: 880, offset: 0 }, { frequency: 660, offset: 0.2 }].forEach(({ frequency, offset }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = startAt + offset;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.12, toneStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + 0.18);
    });
    return true;
  } catch {
    return false;
  }
}

function MetricCard({ tone, icon, label, value, suffix, note }: { tone: string; icon: string; label: string; value: string; suffix?: string; note?: string }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span className="metric-icon">{icon}</span>
      <div><span className="metric-label">{label}</span><strong>{value}</strong><small>{suffix}{note ? ` · ${note}` : ""}</small></div>
    </article>
  );
}

function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && <header className="panel-head">{title && <h3>{title}</h3>}{action}</header>}
      {children}
    </section>
  );
}

function Empty({ title = "ยังไม่มีข้อมูล", text = "นำเข้าแผนส่งงานเพื่อเริ่มใช้งานระบบ" }: { title?: string; text?: string }) {
  return <div className="empty"><span>▦</span><strong>{title}</strong><p>{text}</p></div>;
}

/**
 * รูปชิ้นงาน
 *
 * version คือเวลาที่รูปถูกแก้ไขล่าสุด ใส่ต่อท้าย URL เพื่อให้เบราว์เซอร์รู้ว่า
 * เป็นคนละรูปกับที่เคยแคชไว้ มิฉะนั้นอัปโหลดรูปใหม่ทับแล้วจะยังเห็นรูปเก่า
 * เพราะ URL เดิมอ้างด้วย materialCode อย่างเดียว
 */
function PartImage({ materialCode, compact = false, version, slot = "master", strict = false }: { materialCode: string; compact?: boolean; version?: string; slot?: "master" | "actual"; strict?: boolean }) {
  const key = `${slot}:${materialCode}:${version || "unversioned"}:${strict ? "strict" : "compatible"}`;
  const [failedKey, setFailedKey] = useState("");
  if (failedKey === key) return <div className={`part-photo-fallback ${compact ? "compact" : ""}`}><span>◈</span><small>ยังไม่มีรูป</small></div>;
  const source = `/api/part-images?materialCode=${encodeURIComponent(materialCode)}${slot === "actual" ? "&slot=actual" : ""}${strict ? "&strict=1" : ""}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
  const imageLabel = slot === "actual" ? "รูปชิ้นงานในกล่อง" : "รูปตัวอย่าง Master";
  return <div className={`part-photo ${compact ? "compact" : ""}`}><img src={source} alt={`${imageLabel} ${materialCode}`} loading="lazy" decoding="async" onError={() => setFailedKey(key)} /></div>;
}

const EFFECTIVE_IMAGE_PROJECTION_VERSION = "separate-image-slots-v4";

/**
 * โชว์รูปคู่กันตามตำแหน่งที่ผู้ใช้งานคุ้นเคย: รูปชิ้นงานอยู่ซ้าย และรูปตัวอย่างอยู่ขวา
 * ใช้ตอนสแกนเพื่อให้ผู้ตรวจเทียบว่าชิ้นงานในกล่องตรงกับตัวอย่างจริง
 *
 * ผู้ใช้ Stock/Delivery ไม่มีสิทธิ์โหลด metadata รูป จึงไม่มี updatedAt สำหรับ cache busting
 * projectionVersion ทำให้ popup ไม่ใช้ URL unversioned ที่อาจค้างจาก semantics ก่อน legacy fallback
 */
function PartImagePair({ materialCode, masterVersion, actualVersion, masterAvailable = true, actualAvailable = true, projectionVersion = EFFECTIVE_IMAGE_PROJECTION_VERSION, strictSlots = false }: { materialCode: string; masterVersion?: string; actualVersion?: string; masterAvailable?: boolean; actualAvailable?: boolean; projectionVersion?: string; strictSlots?: boolean }) {
  const capStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6b7787", marginBottom: 5, textAlign: "center", letterSpacing: "0.02em" };
  const figStyle: React.CSSProperties = { margin: 0, flex: "1 1 130px", minWidth: 0 };
  const fallback = <div className="part-photo-fallback"><span>◈</span><small>ยังไม่มีรูป</small></div>;
  return <div className="part-image-pair" style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "100%" }}>
    <figure style={figStyle}><figcaption style={capStyle}>รูปชิ้นงานในกล่อง</figcaption>{actualAvailable ? <PartImage materialCode={materialCode} slot="actual" version={actualVersion || projectionVersion} strict={strictSlots} /> : fallback}</figure>
    <figure style={figStyle}><figcaption style={capStyle}>รูปตัวอย่าง (Master)</figcaption>{masterAvailable ? <PartImage materialCode={materialCode} slot="master" version={masterVersion || projectionVersion} strict={strictSlots} /> : fallback}</figure>
  </div>;
}

export default function DeliveryControlApp({ user, signOutPath, monitorMode = false }: { user: { id: number; employeeCode: string; displayName: string; email: string; role: string; permissions: AppPermission[] }; signOutPath: string; monitorMode?: boolean }) {
  // ออกจากระบบด้วย POST เท่านั้น ปุ่มยังเป็น <a> เพื่อให้สไตล์เดิม (.top-user a,
  // .mobile-logout) ใช้ได้ต่อโดยไม่ต้องแก้ CSS แต่ตัวคำขอจริงเป็น POST
  async function signOut(event: ReactMouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await fetch(signOutPath, { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const initialPage = monitorMode ? "overdue" : user.role === "admin"
    ? "dashboard"
    : NAV.find((item) => user.permissions.includes(item.key))?.key || "dashboard";
  const hasDueDataPermission = user.role === "admin" || DUE_DATA_PAGES.some((key) => user.permissions.includes(key));
  const [page, setPage] = useState<PageKey>(initialPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stockMenuCollapsed, setStockMenuCollapsed] = useState(false);
  const [stockOverviewSearch,setStockOverviewSearch]=useState("");
  useEffect(()=>{const sync=(event:Event)=>setStockOverviewSearch(String((event as CustomEvent).detail||""));window.addEventListener("stock-overview-search-value",sync);return()=>window.removeEventListener("stock-overview-search-value",sync);},[]);
  const [payload, setPayload] = useState<DuePayload>({ dues: [], imports: [], scans: [], receipts: [] });
  const [loading, setLoading] = useState(hasDueDataPermission);
  const [error, setErrorState] = useState("");
  const setError = (value: string) => { setErrorState(value); if(value) reportOperationWarning({page,message:value}); };
  const [notice, setNoticeState] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const setNotice = (value: { type: "success" | "error"; text: string; warningHandled?: boolean } | null) => {
    setNoticeState(value);
    if(value?.type === "error" && !value.warningHandled) reportOperationWarning({page,message:value.text});
  };
  const [dueLoadedAt, setDueLoadedAt] = useState<string | null>(null);
  const [deadlineClock, setDeadlineClock] = useState(() => Date.now());
  const [overdueSoundEnabled, setOverdueSoundEnabled] = useState(false);
  const overdueAudioContextRef = useRef<AudioContext | null>(null);
  const previousOverdueIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let timer: number | undefined;
    const refreshClock = () => setDeadlineClock(Date.now());
    const scheduleNextMinute = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(() => {
        refreshClock();
        scheduleNextMinute();
      }, delay);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      refreshClock();
      scheduleNextMinute();
    };
    scheduleNextMinute();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [forecast, setForecast] = useState<ForecastPayload>({ activeImport: null, imports: [], coverage: [], summary: null });
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastFile, setForecastFile] = useState<File | null>(null);
  const [forecastPreview, setForecastPreview] = useState<ForecastPreview | null>(null);
  const [forecastParsing, setForecastParsing] = useState(false);
  const [forecastImporting, setForecastImporting] = useState(false);
  const [forecastProgress, setForecastProgress] = useState(0);
  const [forecastSearch, setForecastSearch] = useState("");
  const [forecastExporting, setForecastExporting] = useState(false);
  const [forecastStatus, setForecastStatus] = useState<"all" | "overdue" | "within3" | "within7" | "within14" | "over14" | "shortage" | "covered">("all");
  const [forecastFactory, setForecastFactory] = useState("ALL");
  const [forecastRange, setForecastRange] = useState<7 | 14 | 30>(14);
  const [forecastDragActive, setForecastDragActive] = useState(false);
  const [rawTag, setRawTag] = useState("");
  const [tagPreview, setTagPreview] = useState<TagPreview | null>(null);
  const [dispatchConfirmation, setDispatchConfirmation] = useState<VerifyResult | null>(null);
  const [dispatchKitSelection, setDispatchKitSelection] = useState<DispatchKitSelection | null>(null);
  const [dispatchDueDate, setDispatchDueDate] = useState("");
  const [dispatchDueTime, setDispatchDueTime] = useState("");
  const [dispatchDueFact, setDispatchDueFact] = useState("");
  const [checkingTag, setCheckingTag] = useState(false);
  const [verifyRaw, setVerifyRaw] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [arrangeDueDate, setArrangeDueDate] = useState("");
  const [arrangeWarning, setArrangeWarning] = useState<{ message: string; date: string; time: string; fact: string } | null>(null);
  const [arrangeDueTime, setArrangeDueTime] = useState("");
  const [arrangeDueFact, setArrangeDueFact] = useState("");
  const [arrangeTag, setArrangeTag] = useState("");
  const [arrangeQty, setArrangeQty] = useState("");
  const [arrangeDueSearch, setArrangeDueSearch] = useState("");
  const [arrangeListPage, setArrangeListPage] = useState(1);
  const [arrangedSearch, setArrangedSearch] = useState("");
  const [arrangedPage, setArrangedPage] = useState(1);
  const [arrangeConfirmQty,setArrangeConfirmQty]=useState("");
  const [arrangeConfirmation, setArrangeConfirmation] = useState<ArrangeConfirmation | null>(null);
  const arrangeRequestRef = useRef(false);
  const arrangeConfirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (arrangeConfirmation) arrangeConfirmButtonRef.current?.focus(); }, [arrangeConfirmation]);
  const [splitTagRequest,setSplitTagRequest]=useState<{pickId?:number;stockTagCode?:string;labelId?:string}|null>(null);
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get("splitLabel");if(!id)return;const timer=window.setTimeout(()=>setSplitTagRequest({labelId:id}),0);return()=>window.clearTimeout(timer);},[]);
  function closeSplitTag() {
    setSplitTagRequest(null);
    const url=new URL(window.location.href);
    if(url.searchParams.has("splitLabel")){url.searchParams.delete("splitLabel");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);}
  }
  const [arrangementPreview, setArrangementPreview] = useState<ArrangementPreview | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<"all" | "completed" | "pending" | "over">("all");
  const [planPage, setPlanPage] = useState(1);
  const [planPageSize, setPlanPageSize] = useState(10);
  const [filterFact, setFilterFact] = useState("ALL");
  const [filterTime, setFilterTime] = useState("ALL");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPurpose, setCameraPurpose] = useState<"scan" | "stock" | "stock-count">("scan");
  const [cameraError, setCameraErrorState] = useState("");
  const setCameraError = (value:string) => { setCameraErrorState(value); if(value)reportOperationWarning({page,message:value}); };
  const [selectedScan, setSelectedScan] = useState<DueScan | null>(null);
  const [settings, setSettings] = useState({ partial: true, confirm: true, sound: true, autoFocus: true });
  function changeVoiceEnabled(sound:boolean) {
    const next={...settings,sound};
    setSettings(next);
    try {window.localStorage.setItem('kit-due-settings',JSON.stringify(next));} catch { /* settings remain active for this session */ }
  }
  useEffect(() => {
    if (notice) speakThaiAlert(notice.type, page, notice.text, settings.sound);
  }, [notice, page, settings.sound]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER);
  const [userEditorOpen, setUserEditorOpen] = useState(false);
  const [partImages, setPartImages] = useState<PartImageMapping[]>([]);
  const [partActualImages, setPartActualImages] = useState<PartImageMapping[]>([]);
  const [partActualImageFile, setPartActualImageFile] = useState<File | null>(null);
  const [partImagesLoading, setPartImagesLoading] = useState(false);
  const [partImageCode, setPartImageCode] = useState("");
  const [partImageFile, setPartImageFile] = useState<File | null>(null);
  const [partImageSaving, setPartImageSaving] = useState(false);
  const [bulkMasterImageFiles, setBulkMasterImageFiles] = useState<File[]>([]);
  const [bulkActualImageFiles, setBulkActualImageFiles] = useState<File[]>([]);
  const [bulkImageRunning, setBulkImageRunning] = useState(false);
  const [bulkImageProgress, setBulkImageProgress] = useState({ done: 0, total: 0 });
  const [bulkImageFailed, setBulkImageFailed] = useState<Array<{ name: string; reason: string }>>([]);
  const [partBundleExcel, setPartBundleExcel] = useState<File | null>(null);
  const [partBundleMasterFiles, setPartBundleMasterFiles] = useState<File[]>([]);
  const [partBundleActualFiles, setPartBundleActualFiles] = useState<File[]>([]);
  const [partBundlePreview, setPartBundlePreview] = useState<PartBundlePreview | null>(null);
  const [partBundleRunning, setPartBundleRunning] = useState(false);
  const [partBundleProgress, setPartBundleProgress] = useState({ done: 0, total: 0 });
  const [partBundleFailed, setPartBundleFailed] = useState<Array<{ name: string; reason: string }>>([]);
  const [partImageNeedle, setPartImageNeedle] = useState("");
  const [deletingImportId, setDeletingImportId] = useState<number | null>(null);
  const [stock, setStock] = useState<StockPayload>({ parts: [], tags: [], allocations: [], picks: [], dispatchLinks: [], jobClosures: [], manualReceipts: [], countAdjustments: [], countAdjustmentLines: [], movementDays: [] });
  const [stockListExpanded, setStockListExpanded] = useState(false);
  const [stockManualEntry, setStockManualEntry] = useState(false);
  const [lastStockReceipt, setLastStockReceipt] = useState<{ tagId: string; materialCode: string; jobNo: string; qty: number } | null>(null);
  const [manualStockForm, setManualStockForm] = useState({ materialCode: "", qty: "", jobNo: "", productionDate: new Date().toISOString().slice(0, 10), referenceNo: "", note: "" });
  const [manualDuplicateJob, setManualDuplicateJob] = useState<ManualDuplicateJob | null>(null);
  const [manualReceiptSuccess, setManualReceiptSuccess] = useState<ManualReceiptSuccess | null>(null);
  const [manualTransactionOpen, setManualTransactionOpen] = useState("");
  const [stockCountForm, setStockCountForm] = useState({ rawPayload: "", countedQty: "", countDate: new Date().toISOString().slice(0, 10), reason: "บันทึกยอดตรวจนับ Stock สิ้นเดือน" });
  const [stockCountPreview, setStockCountPreview] = useState<StockCountPreview | null>(null);
  const [stockCountConfirmOpen, setStockCountConfirmOpen] = useState(false);
  const [stockManagementSaving, setStockManagementSaving] = useState(false);
  const stockCountInputRef = useRef<HTMLInputElement>(null);
  const [replacement, setReplacement] = useState<ReplacementPayload>({ requests: [], issues: [] });
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementSaving, setReplacementSaving] = useState(false);
  const [replacementSearch, setReplacementSearch] = useState("");
  const [replacementSelectedId, setReplacementSelectedId] = useState("");
  const [replacementTag, setReplacementTag] = useState("");
  const [replacementQty, setReplacementQty] = useState("");
  const [replacementPreview, setReplacementPreview] = useState<ReplacementIssuePreview | null>(null);
  const [replacementForm, setReplacementForm] = useState({
    materialCode: "", customer: "", requestedQty: "", reasonType: "shortage", reasonDetail: "", neededDate: "",
  });
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const [jobClosingKey, setJobClosingKey] = useState("");
  const [jobQtyAdjustment, setJobQtyAdjustment] = useState<JobQuantityAdjustment | null>(null);
  const [jobQtyTarget, setJobQtyTarget] = useState("");
  const [jobQtyReason, setJobQtyReason] = useState("");
  const [jobQtyPreview, setJobQtyPreview] = useState<JobQuantityAdjustmentPreview | null>(null);
  const [jobQtySaving, setJobQtySaving] = useState(false);
  const [jobQtyCreatedTags, setJobQtyCreatedTags] = useState<StockTag[]>([]);
  const [jobQtyAdjusted, setJobQtyAdjusted] = useState(false);
  const [jobCloseSearch, setJobCloseSearch] = useState("");
  const [jobClosePage, setJobClosePage] = useState(1);
  const [stockLoading, setStockLoading] = useState(false);
  const [clearingTestStock, setClearingTestStock] = useState(false);
  const [stockPartForm, setStockPartForm] = useState({ materialCode: "", partName: "", customer: "", location: "", standardQty: "" });
  const [partSearch, setPartSearch] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyType, setHistoryType] = useState("all");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [partPage, setPartPage] = useState(1);
  const [partPageSize, setPartPageSize] = useState(10);
  const [tagSearch, setTagSearch] = useState("");
  const [tagPage, setTagPage] = useState(1);
  const [tagPageSize, setTagPageSize] = useState(10);
  const [deletingPartCode, setDeletingPartCode] = useState("");
  const [deletingStockTagId, setDeletingStockTagId] = useState("");
  const [stockTagForm, setStockTagForm] = useState({ materialCode: "", qty: "", jobNo: "", productionDate: new Date().toISOString().slice(0, 10) });
  const [stockScan, setStockScan] = useState("");
  const stockScanInputRef = useRef<HTMLInputElement>(null);
  const stockScanTimerRef = useRef<number | null>(null);
  const stockScanRequestRef = useRef(false);
  const dispatchScanTimerRef = useRef<number | null>(null);
  const dispatchScanRequestRef = useRef(false);
  const hardwareScanBufferRef = useRef("");
  const hardwareScanLastKeyRef = useRef(0);
  const hardwareScanTimerRef = useRef<number | null>(null);
  const [stockReceivePreview, setStockReceivePreview] = useState<StockReceivePreview | null>(null);
  const [stockReceiveQty, setStockReceiveQty] = useState("");
  const [stockReceiveProductionDate, setStockReceiveProductionDate] = useState("");
  const [stockSaving, setStockSaving] = useState(false);
  // Scanner/camera handlers live inside effects and can otherwise see an old Stock snapshot.
  // Keep the latest data in a ref so a known printed Tag can open its confirmation immediately.
  const stockDataRef = useRef(stock);
  stockDataRef.current = stock;
  const [createdStockTags, setCreatedStockTags] = useState<StockTag[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const partBundleExcelInput = useRef<HTMLInputElement>(null);
  const partBundleMasterInput = useRef<HTMLInputElement>(null);
  const partBundleActualInput = useRef<HTMLInputElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tagResultRef = useRef<HTMLElement>(null);
  const verifyInput = useRef<HTMLInputElement>(null);
  const verifyResultRef = useRef<HTMLElement>(null);
  const canEditPage = (target: EditablePageKey) => user.role === "admin" || user.permissions.includes(`${target}-edit`);
  const canPrintTags = user.role === "admin" || user.permissions?.includes("tags");
  const canCreateReplacement = canEditPage("replacement") && (user.role === "admin" || user.role === "qc" || user.role === "inspector");
  const canIssueReplacement = canEditPage("replacement") && (user.role === "admin" || user.role === "delivery" || user.role === "dispatcher");
  const allowedPages = useMemo(() => {
    const pages = new Set<PageKey>(NAV.filter((item) => user.role === "admin" || user.permissions.includes(item.key)).map((item) => item.key));
    return pages;
  }, [user.permissions, user.role]);
  const firstAllowedPage = NAV.find((item) => allowedPages.has(item.key))?.key || "dashboard";
  const workflowPage: PageKey | null = allowedPages.has("dispatch")
    ? "dispatch"
    : allowedPages.has("arrange") ? "arrange" : null;

  const restoredPageRef = useRef(false);
  useEffect(() => {
    if (restoredPageRef.current) return;
    restoredPageRef.current = true;
    const savedPage = monitorMode ? "overdue" : pageFromLocation();
    const nextPage = savedPage && allowedPages.has(savedPage) ? savedPage : firstAllowedPage;
    setPage(nextPage);
    if (!monitorMode) updatePageLocation(nextPage, "replace");
  }, [allowedPages, firstAllowedPage, monitorMode]);

  useEffect(() => {
    const onHistoryChange = () => {
      if (monitorMode) return;
      const requestedPage = pageFromUrl();
      const nextPage = requestedPage && allowedPages.has(requestedPage) ? requestedPage : firstAllowedPage;
      window.localStorage.setItem("kit-current-page", nextPage);
      setPage(nextPage);
      if (nextPage === "parts" || nextPage === "settings") void loadPartImages();
      setMenuOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onHistoryChange);
    return () => window.removeEventListener("popstate", onHistoryChange);
  }, [allowedPages, firstAllowedPage, monitorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDue() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/due", { cache: "no-store" });
      const data = await response.json() as DuePayload;
      if (!response.ok) throw new Error(data.error || "โหลดข้อมูล Due ไม่สำเร็จ");
      setPayload(data);
      setDueLoadedAt(new Date().toISOString());
      if (!filterDate && data.dues.length) {
        const dates = [...new Set(data.dues.map((due) => due.deliveryDate))].sort();
        const today = bangkokDateTimeKey().slice(0, 10);
        setFilterDate(dates.includes(today) ? today : dates.at(-1) || "");
      }
      if (!selectedScan && data.scans.length) setSelectedScan(data.scans[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดข้อมูล Due ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function loadStock() {
    setStockLoading(true);
    try {
      const response = await fetch("/api/stock", { cache: "no-store" });
      const data = await response.json() as StockPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "โหลด Stock ไม่สำเร็จ");
      setStock({
        parts: data.parts || [], tags: data.tags || [], allocations: data.allocations || [],
        picks: data.picks || [], dispatchLinks: data.dispatchLinks || [], jobClosures: data.jobClosures || [],
        manualReceipts: data.manualReceipts || [], countAdjustments: data.countAdjustments || [],
        countAdjustmentLines: data.countAdjustmentLines || [], movementDays: data.movementDays || [],
      });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลด Stock ไม่สำเร็จ" });
    } finally {
      setStockLoading(false);
    }
  }

  async function loadForecast() {
    setForecastLoading(true);
    try {
      const response = await fetch("/api/forecast", { cache: "no-store" });
      const data = await response.json() as ForecastPayload;
      if (!response.ok) throw new Error(data.error || "โหลด Forecast Stock ไม่สำเร็จ");
      setForecast({
        activeImport: data.activeImport || null,
        imports: data.imports || [],
        coverage: data.coverage || [],
        summary: data.summary || null,
        trend: data.trend || [],
        calculatedAt: data.calculatedAt,
      });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลด Forecast Stock ไม่สำเร็จ" });
    } finally {
      setForecastLoading(false);
    }
  }

  async function loadAuditLogs() {
    setAuditLogsLoading(true);
    try {
      const response = await fetch("/api/audit-logs?limit=2000", { cache: "no-store" });
      const data = await response.json() as { logs?: AuditLog[]; error?: string };
      if (!response.ok) throw new Error(data.error || "โหลดประวัติการดำเนินการไม่สำเร็จ");
      setAuditLogs(data.logs || []);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลดประวัติการดำเนินการไม่สำเร็จ" });
    } finally {
      setAuditLogsLoading(false);
    }
  }

  async function prepareForecastFile(selected: File | null) {
    setForecastFile(selected);
    setForecastPreview(null);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setForecastFile(null);
      setNotice({ type: "error", text: "รองรับเฉพาะไฟล์ Forecast .csv" });
      return;
    }
    setForecastParsing(true);
    try {
      const parsed = await parseForecastFile(selected);
      setForecastPreview(parsed);
    } catch (caught) {
      setForecastFile(null);
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "อ่านไฟล์ Forecast ไม่สำเร็จ" });
    } finally {
      setForecastParsing(false);
    }
  }

  async function selectForecastFile(event: ChangeEvent<HTMLInputElement>) {
    await prepareForecastFile(event.target.files?.[0] || null);
    event.target.value = "";
  }

  async function importForecast() {
    if (!forecastFile || !forecastPreview || forecastImporting) return;
    setForecastImporting(true);
    setForecastProgress(0);
    let importId = 0;
    try {
      const importToken = [forecastFile.name, forecastFile.size, forecastFile.lastModified, forecastPreview.sourceCalculatedAt].join("|");
      const beginResponse = await fetch("/api/forecast", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "begin_import", importToken, fileName: forecastFile.name,
          sourceCalculatedAt: forecastPreview.sourceCalculatedAt,
        }),
      });
      const begin = await beginResponse.json() as { importId?: number; error?: string };
      if (!beginResponse.ok || !begin.importId) throw new Error(begin.error || "เริ่มนำเข้า Forecast ไม่สำเร็จ");
      importId = begin.importId;
      const chunkSize = 100;
      for (let offset = 0; offset < forecastPreview.rows.length; offset += chunkSize) {
        const rows = forecastPreview.rows.slice(offset, offset + chunkSize);
        const response = await fetch("/api/forecast", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "append_rows", importId, rows }),
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || `นำเข้าข้อมูลชุดที่ ${Math.floor(offset / chunkSize) + 1} ไม่สำเร็จ`);
        setForecastProgress(Math.min(99, Math.round(((offset + rows.length) / forecastPreview.rows.length) * 100)));
      }
      const finalizeResponse = await fetch("/api/forecast", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "finalize_import", importId }),
      });
      const finalized = await finalizeResponse.json() as { error?: string };
      if (!finalizeResponse.ok) throw new Error(finalized.error || "ยืนยัน Forecast ชุดใหม่ไม่สำเร็จ");
      setForecastProgress(100);
      setForecastFile(null);
      setForecastPreview(null);
      setNotice({ type: "success", text: "นำเข้า Forecast ชุดใหม่และคำนวณระยะ Stock เรียบร้อย" });
      await loadForecast();
    } catch (caught) {
      if (importId) {
        await fetch("/api/forecast", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel_import", importId }),
        }).catch(() => undefined);
      }
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "นำเข้า Forecast ไม่สำเร็จ" });
    } finally {
      setForecastImporting(false);
    }
  }

  async function loadReplacements() {
    setReplacementLoading(true);
    try {
      const response = await fetch("/api/replacements", { cache: "no-store" });
      const data = await response.json() as ReplacementPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "โหลดใบขอเบิกงานทดแทนไม่สำเร็จ");
      setReplacement({ requests: data.requests || [], issues: data.issues || [] });
      setReplacementSelectedId((current) => {
        if (current && (data.requests || []).some((item) => String(item.id) === current && !["completed", "cancelled"].includes(item.status))) return current;
        const firstOpen = (data.requests || []).find((item) => item.status === "pending" || item.status === "partial");
        return firstOpen ? String(firstOpen.id) : "";
      });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลดใบขอเบิกงานทดแทนไม่สำเร็จ" });
    } finally {
      setReplacementLoading(false);
    }
  }

  useEffect(() => {
    if (!hasDueDataPermission) return;
    const timer = window.setTimeout(() => void loadDue(), 0);
    return () => window.clearTimeout(timer);
  }, [hasDueDataPermission]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page !== "overdue" || !allowedPages.has("overdue")) return;
    const refresh = () => { if (document.visibilityState === "visible") void loadDue(); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [page, allowedPages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!["stock", "manual-stock", "stock-count", "parts", "tags", "arrange", "replacement", "dispatch", "reports", "history"].includes(page)) return;
    const timer = window.setTimeout(() => void loadStock(), 0);
    return () => window.clearTimeout(timer);
  }, [page]);

  useEffect(() => {
    if (page !== "forecast") return;
    const timer = window.setTimeout(() => void loadForecast(), 0);
    return () => window.clearTimeout(timer);
  }, [page]);

  useEffect(() => {
    if (page !== "replacement") return;
    const timer = window.setTimeout(() => void loadReplacements(), 0);
    return () => window.clearTimeout(timer);
  }, [page]);

  useEffect(() => {
    if (page !== "history" || !allowedPages.has("history")) return;
    const timer = window.setTimeout(() => void loadAuditLogs(), 0);
    return () => window.clearTimeout(timer);
  }, [page, allowedPages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page !== "users" || user.role !== "admin" || !allowedPages.has("users")) return;
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [page, user.role, allowedPages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("kit-due-settings");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<typeof settings>;
          setSettings((current) => ({ ...current, ...parsed, sound: parsed.sound !== false }));
        } catch { /* use defaults */ }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function loadUsers() {
    if (user.role !== "admin" || !allowedPages.has("users")) return;
    setUsersLoading(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = await response.json() as { users?: SystemUser[]; error?: string };
      if (!response.ok) throw new Error(data.error || "โหลดผู้ใช้งานไม่สำเร็จ");
      setSystemUsers(data.users || []);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลดผู้ใช้งานไม่สำเร็จ" });
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadPartImages() {
    if (!allowedPages.has("parts") && !allowedPages.has("settings")) return;
    setPartImagesLoading(true);
    try {
      const [masterRes, actualRes] = await Promise.all([
        fetch("/api/part-images", { cache: "no-store" }),
        fetch("/api/part-images?slot=actual", { cache: "no-store" }),
      ]);
      const data = await masterRes.json() as { images?: PartImageMapping[]; error?: string };
      if (!masterRes.ok) throw new Error(data.error || "โหลดรายการรูปไม่สำเร็จ");
      setPartImages(data.images || []);
      const actualData = await actualRes.json() as { images?: PartImageMapping[]; error?: string };
      if (actualRes.ok) setPartActualImages(actualData.images || []);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลดรายการรูปไม่สำเร็จ" });
    } finally {
      setPartImagesLoading(false);
    }
  }

  async function uploadPartImage(event: FormEvent) {
    event.preventDefault();
    if (!partImageCode.trim() || !partImageFile) return;
    setPartImageSaving(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("materialCode", partImageCode.trim().toUpperCase());
      form.set("image", partImageFile);
      const response = await fetch("/api/part-images", { method: "POST", body: form });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");
      setNotice({ type: "success", text: `บันทึกรูป ${partImageCode.trim().toUpperCase()} แล้ว รูปจะแสดงทันทีเมื่อสแกน` });
      setPartImageCode("");
      setPartImageFile(null);
      await loadPartImages();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "อัปโหลดรูปไม่สำเร็จ" });
    } finally {
      setPartImageSaving(false);
    }
  }

  /**
   * แปลงชื่อไฟล์เป็น Material Code
   *
   * ตัดนามสกุลออก ตัดเลขสำเนาแบบ " (1)" ที่ Windows เติมให้เวลาชื่อซ้ำ
   * แล้วแปลงเป็นตัวพิมพ์ใหญ่ ให้ตรงกับที่ระบบเก็บ Part No.
   */
  function materialCodeFromFileName(name: string) {
    return name
      .replace(/\.[^.]+$/, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim()
      .toUpperCase();
  }

  /**
   * อัปโหลดรูป Master และรูปชิ้นงานในกล่องหลายไฟล์ในรอบเดียว
   * โดยใช้ชื่อไฟล์ (ไม่รวมนามสกุล) เป็น Material Code
   */
  async function uploadPartImagesBulk(event: FormEvent) {
    event.preventDefault();
    const uploads = [
      ...bulkMasterImageFiles.map((file) => ({ file, slot: "master" as const, label: "Master" })),
      ...bulkActualImageFiles.map((file) => ({ file, slot: "actual" as const, label: "รูปในกล่อง" })),
    ];
    if (!uploads.length) return;
    setBulkImageRunning(true);
    setNotice(null);
    setBulkImageFailed([]);
    setBulkImageProgress({ done: 0, total: uploads.length });

    const failed: Array<{ name: string; reason: string }> = [];
    let saved = 0;

    for (const [index, upload] of uploads.entries()) {
      const materialCode = materialCodeFromFileName(upload.file.name);
      try {
        if (!materialCode) throw new Error("ชื่อไฟล์ว่าง ตั้งชื่อไฟล์ให้ตรงกับ Part No.");
        if (!stock.parts.some((part) => part.materialCode === materialCode)) {
          throw new Error(`ไม่พบ Part ${materialCode} ในทะเบียน`);
        }
        const form = new FormData();
        form.set("materialCode", materialCode);
        form.set("slot", upload.slot);
        form.set("image", upload.file);
        const response = await fetch("/api/part-images", { method: "POST", body: form });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
        saved += 1;
      } catch (caught) {
        failed.push({ name: `${upload.label} · ${upload.file.name}`, reason: caught instanceof Error ? caught.message : "อัปโหลดไม่สำเร็จ" });
      }
      setBulkImageProgress({ done: index + 1, total: uploads.length });
    }

    setBulkImageFailed(failed);
    setNotice(failed.length
      ? { type: "error", text: `อัปโหลดสำเร็จ ${fmt(saved)} รูป ไม่สำเร็จ ${fmt(failed.length)} รูป ดูรายการด้านล่าง` }
      : { type: "success", text: `อัปโหลดรูป Master และรูปในกล่องสำเร็จทั้งหมด ${fmt(saved)} รูป` });
    setBulkMasterImageFiles([]);
    setBulkActualImageFiles([]);
    setBulkImageRunning(false);
    await loadPartImages();
  }

  async function deletePartImage(materialCode: string) {
    if (!window.confirm(`ลบรูปของ ${materialCode} ใช่หรือไม่?`)) return;
    const response = await fetch("/api/part-images", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialCode }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ type: "error", text: data.error || "ลบรูปไม่สำเร็จ" });
    setNotice({ type: "success", text: `ลบรูป ${materialCode} แล้ว` });
    await loadPartImages();
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!userForm.permissions.length) {
      setNotice({ type: "error", text: "กรุณาเลือกสิทธิ์เข้าใช้งานอย่างน้อย 1 หน้า" });
      return;
    }
    setUserSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/users", {
        method: userForm.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...userForm, permissions: [...new Set([...userForm.permissions, "permission-model-v2" as const])] }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "บันทึกผู้ใช้งานไม่สำเร็จ");
      setNotice({ type: "success", text: userForm.id ? "แก้ไขผู้ใช้งานเรียบร้อย" : "เพิ่มผู้ใช้งานเรียบร้อย สามารถเข้าสู่ระบบได้ทันที" });
      setUserForm(EMPTY_USER);
      setUserEditorOpen(false);
      await loadUsers();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "บันทึกผู้ใช้งานไม่สำเร็จ" });
    } finally {
      setUserSaving(false);
    }
  }

  function editUser(target: SystemUser) {
    setUserForm({
      id: target.id, employeeCode: target.employeeCode, displayName: target.displayName,
      email: target.email, role: target.role as UserRole, pin: "",
      active: target.active, permissions: [...(target.permissions || [])],
    });
    setUserEditorOpen(true);
  }

  async function toggleUser(target: SystemUser) {
    const response = await fetch("/api/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: target.id, active: !target.active }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ type: "error", text: data.error || "เปลี่ยนสถานะไม่สำเร็จ" });
    setNotice({ type: "success", text: `${target.active ? "ระงับ" : "เปิดใช้"}บัญชี ${target.employeeCode} แล้ว` });
    await loadUsers();
  }

  useEffect(() => {
    if (!cameraOpen) return;
    const videoElement = videoRef.current;
    let stopped = false;
    let scannerControls: { stop(): void } | null = null;
    const handleCameraValue = (value: string) => {
      setCameraOpen(false);
      if (cameraPurpose === "stock") {
        setStockScan(value);
        void receiveStockTag(value);
        return;
      }
      if (cameraPurpose === "stock-count") {
        setStockCountForm((current) => ({ ...current, rawPayload: value }));
        void loadStockCountTag(value);
        return;
      }
      if (page === "verify") {
        setVerifyRaw(value);
        setVerifyResult(null);
        void verifyTag(value);
        return;
      }
      if (page === "replacement") {
        setReplacementTag(value);
        setReplacementPreview(null);
        void previewReplacementIssue(value);
        return;
      }
      if (page === "arrange") {
        setArrangeTag(value);
        setArrangementPreview(null);
        void stageStockTag(value);
      } else {
        setRawTag(value);
        setTagPreview(null);
        void handleDispatchScan(value);
      }
    };
    async function start() {
      try {
        setCameraError("");
        if (!navigator.mediaDevices?.getUserMedia || !videoElement) …68818 tokens truncated…${item.totalShortage > 0 ? "danger" : ""}`}><b>{fmt(item.totalShortage)}</b></td>
          <td data-label="สถานะ"><span className={`forecast-status ${item.status}`}>{statusLabel(item)}</span></td>
        </tr>)}</tbody></table></div> : <Empty title="ไม่พบรายการตามตัวกรอง" text="ลองเปลี่ยนคำค้นหาหรือสถานะ" />}
      </Card>}

      {forecast.imports.length > 0 && <Card className="forecast-history-card" title="ประวัติไฟล์ Forecast">
        <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>ชื่อไฟล์</th><th>วันที่นำเข้า</th><th>ผู้นำเข้า</th><th>Last Calculate DO</th><th className="num">จำนวน Part</th><th>สถานะ</th></tr></thead><tbody>{forecast.imports.map((item) => <tr key={item.id}><td data-label="ชื่อไฟล์"><b>{item.fileName}</b></td><td data-label="วันที่นำเข้า">{formatDateTime(item.createdAt)}</td><td data-label="ผู้นำเข้า">{item.importedByName}</td><td data-label="Last Calculate DO">{formatDateTime(item.sourceCalculatedAt)}</td><td data-label="จำนวน Part" className="num">{fmt(item.materialCount)}</td><td data-label="สถานะ"><span className={`forecast-status ${item.status === "active" ? "covered" : "archived"}`}>{item.status === "active" ? "ใช้งานอยู่" : "ประวัติ"}</span></td></tr>)}</tbody></table></div>
      </Card>}
    </div>;
  }

  function renderExports() {
    const exported = filtered.filter((due) => Number(due.scannedQty) > 0);
    const full = exported.filter((due) => stateOf(due) === "completed").length;
    const part = exported.filter((due) => stateOf(due) === "partial").length;
    const over = exported.filter((due) => stateOf(due) === "over").length;
    return <div className="exports-page-redesign">
      <Card className="exports-filter-card"><Filters /></Card>
      <div className="metrics five reports-metrics exports-metrics page-summary"><MetricCard tone="blue" icon="▤" label="ส่งออกทั้งหมด" value={fmt(exported.length)} suffix="รายการ" /><MetricCard tone="green" icon="✓" label="ส่งออกครบ" value={fmt(full)} suffix="รายการ" /><MetricCard tone="orange" icon="◷" label="บางส่วน" value={fmt(part)} suffix="รายการ" /><MetricCard tone="red" icon="×" label="เกินดิวจัดส่ง" value={fmt(over)} suffix="รายการ" /><MetricCard tone="purple" icon="◇" label="รวมจำนวน" value={fmt(exported.reduce((sum, due) => sum + Number(due.scannedQty), 0))} suffix="ชิ้น" /></div>
      <Card className="exports-list-card" title={<span className="exports-list-title"><i>≡</i><span>รายการส่งออก<small>รายการสินค้าที่ส่งออกจากคลังไปยังลูกค้าหรือสายการผลิต</small></span></span>} action={<div className="exports-list-actions"><button className="button success" onClick={() => void exportDeliveryExcel()}>▦ ส่งออก Excel</button><button className="button primary" onClick={exportCsv}>▤ ส่งออก CSV</button></div>}>
        <DueTable rows={exported} />
        <footer className="exports-list-footer"><span>แสดง {fmt(exported.length)} รายการ</span><span>{filterDate ? formatDate(filterDate) : "ทุกวันที่"} · {filterFact === "ALL" ? "ทุก FAC" : filterFact} · {filterTime === "ALL" ? "ทุกเวลา" : filterTime}</span></footer>
      </Card>
      <footer className="settings-footer"><span>© 2026 KIT Delivery Due Control. All rights reserved.</span><span>Version 2.23.0&nbsp;&nbsp; | &nbsp;&nbsp;Bangkok, Thailand&nbsp;&nbsp; 🇹🇭</span></footer>
    </div>;
  }

  function renderReports() {
    const maxFac = Math.max(...facStats.map((item) => item.items), 1);
    const recentDays = dailyStats.slice(-7);
    const maxDaily = Math.max(...recentDays.map((item) => item.items), 1);
    return <div className="reports-page-redesign">
      <Card className="reports-filter-card" action={<button className="button primary reports-refresh-button" onClick={() => void loadDue()}>↻ รีเฟรช</button>}><Filters /></Card>
      <div className="metrics five reports-metrics page-summary"><MetricCard tone="blue" icon="▤" label="แผนทั้งหมด" value={fmt(summary.items)} suffix="รายการ" /><MetricCard tone="green" icon="✓" label="ครบตามแผน" value={fmt(summary.completed)} suffix="รายการ" /><MetricCard tone="orange" icon="◷" label="คงเหลือ" value={fmt(summary.partial + summary.pending)} suffix="รายการ" /><MetricCard tone="red" icon="!" label="เกินดิวจัดส่ง" value={fmt(summary.over)} suffix="รายการ" /><MetricCard tone="purple" icon="◇" label="ส่งแล้วรวม" value={fmt(summary.sent)} suffix="ชิ้น" /></div>
      <div className="reports-dashboard-grid">
        <Card className="reports-chart-card" title="สัดส่วนสถานะการส่งงาน"><div className="donut-layout"><div className="donut" style={{ "--complete": `${completePct * 3.6}deg` } as React.CSSProperties}><span><b>{summary.items}</b>รายการ</span></div><div className="legend"><p><i className="green" />ครบตามแผน <b>{summary.completed}</b></p><p><i className="orange" />คงเหลือ <b>{summary.partial + summary.pending}</b></p><p><i className="red" />เกินดิวจัดส่ง <b>{summary.over}</b></p><p><i className="purple" />ส่งแล้วรวม <b>{fmt(summary.sent)}</b></p></div></div></Card>
        <Card className="reports-chart-card" title="ส่งออกตาม FAC / Line"><div className="bar-chart reports-fac-chart">{facStats.length ? facStats.slice(0, 7).map((item) => <div key={item.fact}><b>{item.fact}</b><span><i style={{ width: `${Math.max(4, item.items / maxFac * 100)}%` }} /></span><strong>{item.items}</strong></div>) : <Empty title="ยังไม่มีข้อมูล" text="ลองปรับช่วงวันที่หรือโรงงาน" />}</div></Card>
        <Card className="reports-chart-card reports-trend-card" title="แนวโน้มการส่งงาน" action={<div className="reports-export-tools"><button className="export-button excel" onClick={() => void exportReportExcel()}><span>▦</span><b>Excel</b><small>.xlsx</small></button><button className="export-button pdf" onClick={exportReportPdf}><span>▤</span><b>PDF</b><small>พิมพ์ / บันทึก</small></button><button className="export-button csv" onClick={exportReportCsv}><span>≡</span><b>CSV</b><small>.csv</small></button></div>}>
          {recentDays.length ? <><div className="reports-trend-chart">{recentDays.map((row) => <div key={row.date}><span><i className="planned" style={{ height: `${Math.max(5, row.items / maxDaily * 100)}%` }} /><i className="finished" style={{ height: `${Math.max(row.completed ? 5 : 0, row.completed / maxDaily * 100)}%` }} /></span><small>{formatDate(row.date).slice(0, 5)}</small></div>)}</div><div className="reports-chart-legend"><span><i className="planned" />ตามแผน</span><span><i className="finished" />ส่งแล้ว</span></div></> : <Empty title="ยังไม่มีข้อมูล" text="เลือกช่วงวันที่เพื่อแสดงแนวโน้ม" />}
        </Card>
      </div>
      <div className="reports-tables-grid">
        <Card className="reports-table-card" title="สรุปการส่งออกตามวัน" action={<span className="reports-current-filter">◉ {filterDate ? formatDate(filterDate) : "ดูทั้งหมด"}</span>}>{dailyStats.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วันที่</th><th className="num">แผนทั้งหมด</th><th className="num">ส่งแล้ว</th><th className="num">คงเหลือ</th><th className="num">เกินคิว</th></tr></thead><tbody>{dailyStats.slice(0, 8).map((row) => <tr key={row.date}><td data-label="วันที่"><b>{formatDate(row.date)}</b></td><td data-label="แผนทั้งหมด" className="num">{row.items}</td><td data-label="ส่งแล้ว" className="num sent">{row.completed}</td><td data-label="คงเหลือ" className="num warning">{row.partial + row.pending}</td><td data-label="เกินคิว" className="num danger">{row.over}</td></tr>)}</tbody></table></div> : <Empty title="ยังไม่มีข้อมูล" text="ในช่วงวันที่ที่เลือก" />}</Card>
        <Card className="reports-table-card" title="รายการที่ยังไม่ครบ (สูงสุด)" action={<span className="reports-current-filter">◉ {filterFact === "ALL" ? "ดูทั้งหมด" : filterFact}</span>}><DueTable rows={filtered.filter((due) => ["pending", "partial", "over"].includes(stateOf(due))).sort((a, b) => (b.reqQty - b.scannedQty) - (a.reqQty - a.scannedQty))} limit={5} /></Card>
      </div>
      <footer className="settings-footer"><span>© 2026 KIT Delivery Due Control. All rights reserved.</span><span>Version 2.23.0&nbsp;&nbsp; | &nbsp;&nbsp;Bangkok, Thailand&nbsp;&nbsp; 🇹🇭</span></footer>
    </div>;
  }

  function renderHistory() {
    const activities: Array<{ id: string; createdAt: string; action: string; detail: string; actor: string; tone: string; kind: string }> = [];
    payload.imports.forEach((item) => activities.push({
      id: "import-" + item.id, createdAt: item.createdAt, action: "นำเข้าแผนส่งงาน",
      detail: item.fileName + " · " + fmt(item.rowCount) + " รายการ", actor: item.importedByName || "—", tone: "purple", kind: "import",
    }));
    stock.tags.forEach((item) => {
      activities.push({
        id: "tag-" + item.id, createdAt: item.createdAt, action: "ออกและพิมพ์ Tag",
        detail: item.tagId + " · " + item.materialCode + " · Job " + item.jobNo + " · " + fmt(item.qty) + " ชิ้น",
        actor: item.printedByName || "—", tone: "blue", kind: "tag",
      });
      if (item.receivedAt) activities.push({
        id: "receive-" + item.id, createdAt: item.receivedAt, action: "รับงานเข้า Stock",
        detail: item.tagId + " · " + item.materialCode + " · " + fmt(item.qty) + " ชิ้น",
        actor: item.receivedByName || "—", tone: "green", kind: "receive",
      });
    });
    stock.picks.forEach((item) => activities.push({
      id: "pick-" + item.id, createdAt: item.pickedAt, action: "จัดงาน",
      detail: item.stockTagCode + " · " + item.materialCode + " · Job " + item.jobNo + " · " + fmt(item.pickedQty) + " ชิ้น",
      actor: item.pickedByName || "—", tone: "orange", kind: "arrange",
    }));
    payload.scans.forEach((item) => activities.push({
      id: "dispatch-" + item.id, createdAt: item.createdAt, action: "ตรวจและขายออก",
      detail: item.tagId + " · " + item.materialCode + " · " + fmt(item.qty) + " " + item.unit,
      actor: item.scannedByName || "—", tone: "red", kind: "dispatch",
    }));
    const auditKind = (action: string) => {
      if (/warning/.test(action)) return "warning";
      if (/delete|remove|clear|cancel/.test(action)) return "delete";
      if (/permission|role|user_access/.test(action)) return "permission";
      if (/import/.test(action)) return "import";
      if (/login|logout|pin/.test(action)) return "security";
      if (/create|add|print|receive|stage|dispatch|issue/.test(action)) return "create";
      return "update";
    };
    const auditTone = (kind: string) => kind === "warning" ? "orange" : kind === "delete" ? "red" : kind === "permission" ? "purple" : kind === "import" ? "blue" : kind === "security" ? "orange" : kind === "create" ? "green" : "blue";
    const auditActivities = auditLogs.map((item) => {
      const kind = auditKind(item.actionKey);
      const identity = item.entityId ? ` · ${item.entityId}` : "";
      return {
        id: `audit-${item.id}`, createdAt: item.createdAt, action: item.actionLabel,
        detail: `${item.moduleLabel}${identity} · ${item.summary}`,
        actor: item.actorName ? `${item.actorName}${item.actorCode ? ` (${item.actorCode})` : ""}` : "ระบบ",
        tone: auditTone(kind), kind,
      };
    });
    if (auditActivities.length) {
      const oldestAudit = auditActivities.reduce((oldest, item) => item.createdAt < oldest ? item.createdAt : oldest, auditActivities[0].createdAt);
      const legacyActivities = activities.filter((item) => item.createdAt < oldestAudit);
      legacyActivities.forEach((item) => { if (item.kind !== "import") item.kind = "create"; });
      activities.length = 0;
      activities.push(...auditActivities, ...legacyActivities);
    } else activities.forEach((item) => { if (item.kind !== "import") item.kind = "create"; });
    activities.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const historyNeedle = historyQuery.trim().toLowerCase();
    const activityLocalDate = (value: string) => {
      const date = toLocalDate(value);
      if (!date) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const filteredActivities = activities.filter((item) =>
      (historyType === "all" || item.kind === historyType)
      && (!historyDate || activityLocalDate(item.createdAt) >= historyDate)
      && (!historyDateTo || activityLocalDate(item.createdAt) <= historyDateTo)
      && (!historyNeedle || [item.action, item.detail, item.actor, item.createdAt].some((value) => String(value || "").toLowerCase().includes(historyNeedle)))
    );
    const historyTabs = [
      { key: "all", label: "ทั้งหมด", count: activities.length },
      { key: "warning", label: "แจ้งเตือน", count: activities.filter((item) => item.kind === "warning").length },
      { key: "create", label: "เพิ่ม / ทำรายการ", count: activities.filter((item) => item.kind === "create").length },
      { key: "import", label: "นำเข้าไฟล์", count: activities.filter((item) => item.kind === "import").length },
      { key: "update", label: "แก้ไขข้อมูล", count: activities.filter((item) => item.kind === "update").length },
      { key: "delete", label: "ลบข้อมูล", count: activities.filter((item) => item.kind === "delete").length },
      { key: "permission", label: "สิทธิ์ผู้ใช้", count: activities.filter((item) => item.kind === "permission").length },
      { key: "security", label: "เข้าสู่ระบบ / PIN", count: activities.filter((item) => item.kind === "security").length },
    ];
    const shownActivities = filteredActivities.slice(0, 250);
    async function exportHistoryExcel() {
      try {
        const xlsx = await import("xlsx");
        const rows = [
          ["วันและเวลา", "ประเภท", "รายละเอียด", "ผู้ดำเนินการ", "สถานะ"],
          ...filteredActivities.map((item) => [formatDateTime(item.createdAt), item.action, item.detail, item.actor, "บันทึกแล้ว"]),
        ];
        const sheet = xlsx.utils.aoa_to_sheet(rows);
        sheet["!cols"] = [22, 24, 70, 24, 16].map((wch) => ({ wch }));
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, sheet, "ประวัติการดำเนินการ");
        xlsx.writeFile(workbook, `KIT-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
        void recordClientAudit("export_history", `ส่งออกประวัติ Excel ${filteredActivities.length} รายการ`, { itemCount: filteredActivities.length, historyType, historyDate, historyDateTo });
        setNotice({ type: "success", text: `ส่งออกประวัติแล้ว ${fmt(filteredActivities.length)} รายการ` });
      } catch (caught) {
        setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ส่งออกประวัติไม่สำเร็จ" });
      }
    }
    const summaryCards = [
      { tone: "purple", icon: "◎", label: "ประวัติทั้งหมด", value: activities.length, suffix: "รายการ", art: "▤" },
      { tone: "blue", icon: "⇧", label: "นำเข้าไฟล์", value: activities.filter((item) => item.kind === "import").length, suffix: "ครั้ง", art: "▥" },
      { tone: "green", icon: "+", label: "เพิ่ม / ทำรายการ", value: activities.filter((item) => item.kind === "create").length, suffix: "รายการ", art: "□" },
      { tone: "orange", icon: "✎", label: "แก้ไข / สิทธิ์", value: activities.filter((item) => item.kind === "update" || item.kind === "permission").length, suffix: "รายการ", art: "▣" },
      { tone: "red", icon: "×", label: "ลบข้อมูล", value: activities.filter((item) => item.kind === "delete").length, suffix: "รายการ", art: "▰" },
    ];
    return <div className="history-page-redesign">
      <div className="history-summary-grid page-summary">{summaryCards.map((item) => <article className={`history-summary-card ${item.tone}`} key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><b>{fmt(item.value)}</b><em>{item.suffix}</em></div><i>{item.art}</i></article>)}</div>
      <section className="history-log-card">
        <header><div><span>▤</span><div><h3>ประวัติการดำเนินการ</h3><p>บันทึกการเพิ่ม แก้ไข ลบ นำเข้าไฟล์ เปลี่ยนสิทธิ์ และกิจกรรมสำคัญจากทุกหน้า</p></div></div><div><button className="button secondary" disabled={auditLogsLoading} onClick={() => void Promise.all([loadDue(), loadStock(), loadAuditLogs()])}>↻ {auditLogsLoading ? "กำลังโหลด" : "รีเฟรช"}</button><button className="button history-excel-button" onClick={() => void exportHistoryExcel()}>▦ ส่งออก Excel</button></div></header>
        <div className="audit-history-controls history-redesign-controls">
          <div className="audit-history-tabs">{historyTabs.map((tab) => <button type="button" key={tab.key} className={historyType === tab.key ? "active" : ""} onClick={() => setHistoryType(tab.key)}><span>{tab.label}</span><b>{fmt(tab.count)}</b></button>)}</div>
          <div className="history-filter-line">
            <div className="audit-history-search"><span>⌕</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="ค้นหาชื่อผู้ทำรายการ, Tag ID, Part No., Job หรือชื่อไฟล์..." />{historyQuery && <button type="button" onClick={() => setHistoryQuery("")}>×</button>}</div>
            <div className="history-date-range"><b>วันที่ทำรายการ</b><label><span>▦</span><input aria-label="วันที่เริ่มต้น" type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /><i>–</i><input aria-label="วันที่สิ้นสุด" type="date" value={historyDateTo} onChange={(event) => setHistoryDateTo(event.target.value)} />{(historyDate || historyDateTo) && <button type="button" onClick={() => { setHistoryDate(""); setHistoryDateTo(""); }} aria-label="ล้างช่วงวันที่">×</button>}</label></div>
          </div>
        </div>
        {shownActivities.length ? <div className="table-wrap mobile-table-wrap history-table-wrap"><table className="mobile-card-table history-modern-table"><thead><tr><th>วันที่ / เวลา</th><th>ประเภท</th><th>รายละเอียด</th><th>ผู้ดำเนินการ</th><th>สถานะ</th></tr></thead><tbody>{shownActivities.map((item) => <tr key={item.id}><td data-label="วันที่ / เวลา"><b>{formatDateTime(item.createdAt)}</b></td><td data-label="ประเภท"><b>{item.action}</b></td><td data-label="รายละเอียด">{item.detail}</td><td data-label="ผู้ดำเนินการ"><b>{item.actor}</b></td><td data-label="สถานะ"><em className={"status completed audit-" + item.tone}>บันทึกแล้ว</em></td></tr>)}</tbody></table></div> : <div className="history-empty"><span>◇</span><b>{(historyQuery || historyDate || historyDateTo) ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีประวัติในขณะนี้"}</b><small>{(historyQuery || historyDate || historyDateTo) ? "ลองเปลี่ยนคำค้นหาหรือช่วงวันที่" : "เลือกเมนูด้านบนหรือปรับช่วงวันที่เพื่อดูข้อมูล"}</small></div>}
        <footer><span>แสดง {fmt(Math.min(filteredActivities.length, 250))} จาก {fmt(filteredActivities.length)} รายการ</span></footer>
      </section>
      <footer className="settings-footer"><span>© 2026 KIT Delivery Due Control. All rights reserved.</span><span>Version 2.23.0&nbsp;&nbsp; | &nbsp;&nbsp;Bangkok, Thailand&nbsp;&nbsp; 🇹🇭</span></footer>
    </div>;
  }

  function renderSettings() {
    // ตัวแปรธรรมดา ไม่ใช่ useMemo เพราะ renderSettings() เป็นฟังก์ชันที่ถูกเรียก
    // แบบมีเงื่อนไข ไม่ใช่คอมโพเนนต์ การเรียก hook ในนี้จะผิดกฎ Hooks
    const Toggle = ({ keyName, title, text: description, icon }: { keyName: keyof typeof settings; title: string; text: string; icon: string }) => <label className="setting-row"><span className="setting-row-icon">{icon}</span><div><b>{title}</b><small>{description}</small></div><input type="checkbox" checked={settings[keyName]} onChange={(e) => setSettings((current) => { const next={...current,[keyName]:e.target.checked}; if(keyName==='sound'){window.localStorage.setItem('kit-due-settings',JSON.stringify(next));if(e.target.checked)window.setTimeout(()=>speakThaiAlert('success','settings','เปิดเสียงพูดแล้ว',true),0);} return next; })} /><i /></label>;
    return <div className="settings-page-redesign">
      <section className="settings-block settings-system-block">
        <header><span>▤</span><h3>ข้อมูลระบบ</h3></header>
        <div className="system-card">
          <div className="system-logo">KiT<small>DELIVERY DUE CONTROL</small></div>
          <dl><div><dt>ชื่อระบบ</dt><dd>KIT Delivery Due Control</dd></div><div><dt>เวอร์ชัน</dt><dd>v2.23.0</dd></div><div><dt>เขตเวลา</dt><dd>(GMT+07:00) Bangkok, Thailand</dd></div><div><dt>ที่ตั้ง</dt><dd>● Bangkok, Thailand</dd></div><div><dt>ผู้ดูแลระบบ</dt><dd>♟ {user.displayName}</dd></div></dl>
          <div className="system-stats page-summary"><p className="blue"><span>▤</span><b>{fmt(payload.dues.length)}</b><strong>Due ทั้งหมด</strong><small>รายการ</small></p><p className="purple"><span>◇</span><b>{fmt(partImages.length)}</b><strong>รูปชิ้นงาน</strong><small>รายการ</small></p></div>
        </div>
      </section>

      <div className="settings-grid settings-feature-grid">
        <section className="settings-block settings-option-card teal">
          <header><span>▤</span><h3>ตั้งค่าการตัดยอด</h3><i>▰▱▱▱▰</i></header>
          <div><Toggle keyName="partial" icon="◆" title="อนุญาตให้ตัดยอดตามช่อง" text="Tag ที่ยังไม่สามารถตัดยอดในรอบ Due ได้" /><Toggle keyName="confirm" icon="⟳" title="ยืนยันก่อนตัดยอดทุกครั้ง" text="แสดงข้อความเตือนและให้ตรวจสอบก่อนบันทึก" /></div>
        </section>
        <section className="settings-block settings-option-card violet">
          <header><span>▣</span><h3>ตั้งค่าการสแกน</h3><i>▥▥▥</i></header>
          <div><Toggle keyName="autoFocus" icon="▥" title="โฟกัสช่องสแกนอัตโนมัติ" text="เหมาะสำหรับใช้งานร่วมกับเครื่องยิง Tag" /><Toggle keyName="sound" icon="🔊" title="เสียงพูดแจ้งเตือนภาษาไทย" text="พูดผลสำเร็จ และอ่านสาเหตุเมื่อ Tag ผิดหรือจำนวนไม่พอ" /></div>
        </section>
      </div>

      <section className="settings-block settings-display-block">
        <header><span>▣</span><h3>รูปแบบการแสดงผล</h3><div>Simple Setting<br /><b>Greater Productivity</b></div></header>
        <div className="settings-display-form">
          <label><span><i>●</i> ภาษา</span><select><option>ภาษาไทย</option></select></label>
          <label><span><i>◷</i> เขตเวลา</span><select><option>(GMT+07:00) Bangkok, Thailand</option></select></label>
          <label><span><i>▦</i> รูปแบบวันที่</span><select><option>DD/MM/YYYY</option></select></label>
          <label><span><i>◇</i> หน่วยเริ่มต้น</span><select><option>ชิ้น (PC)</option></select></label>
        </div>
        <div className="save-row"><button className="button primary settings-save-button" onClick={saveSettings}>▣ บันทึกการตั้งค่า</button></div>
      </section>

      {user.role === "admin" && <section className="settings-danger-strip"><span>◆</span><div><b>ล้างข้อมูลทดลอง</b><p>ลบ Tag Stock และประวัติการเข้า/ออกที่ทดลอง โดยไม่กระทบข้อมูล Part รูปชิ้นงาน แผน Due และผู้ใช้งานจริง</p></div><button className="button danger" disabled={clearingTestStock || stock.tags.length === 0} onClick={() => void clearTestStock()}>{clearingTestStock ? "กำลังล้างข้อมูล…" : `▧ ล้าง Stock ทดลอง ${fmt(stock.tags.length)} Tag`}</button></section>}
      <footer className="settings-footer"><span>© 2026 KIT Delivery Due Control. All rights reserved.</span><span>Version 2.23.0&nbsp;&nbsp; | &nbsp;&nbsp;Bangkok, Thailand&nbsp;&nbsp; 🇹🇭</span></footer>
    </div>;
  }

  function renderUsers() {
    const active = systemUsers.filter((item) => item.active).length;
    const productionUsers = systemUsers.filter((item) => item.role === "production").length;
    const stockUsers = systemUsers.filter((item) => item.role === "stock").length;
    const qcUsers = systemUsers.filter((item) => item.role === "qc").length;
    const deliveryUsers = systemUsers.filter((item) => item.role === "delivery").length;
    const needle = userSearch.trim().toLowerCase();
    const visibleUsers = systemUsers.filter((item) => !needle || [item.employeeCode, item.displayName, item.email, item.role, ROLE_LABELS[item.role], ...(item.permissions || [])].join(" ").toLowerCase().includes(needle));
    async function exportUsersExcel() {
      try {
        const xlsx = await import("xlsx");
        const rows = [
          ["รหัสพนักงาน", "ชื่อผู้ใช้งาน", "อีเมล", "บทบาท", "สิทธิ์หน้า", "สถานะ"],
          ...visibleUsers.map((item) => [item.employeeCode, item.displayName, item.email || "", ROLE_LABELS[item.role] || item.role, (item.role === "admin" ? NAV.map((nav) => nav.label) : (item.permissions || []).map((key) => NAV.find((nav) => nav.key === key)?.label || STOCK_ACCESS_LABELS[key] || key)).join(", "), item.active ? "ใช้งานปกติ" : "ระงับ"]),
        ];
        const sheet = xlsx.utils.aoa_to_sheet(rows);
        sheet["!cols"] = [16, 26, 30, 18, 70, 15].map((wch) => ({ wch }));
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, sheet, "ผู้ใช้งาน");
        xlsx.writeFile(workbook, `KIT-users-${new Date().toISOString().slice(0, 10)}.xlsx`);
        setNotice({ type: "success", text: `ส่งออกข้อมูลผู้ใช้งานแล้ว ${fmt(visibleUsers.length)} รายการ` });
      } catch (caught) {
        setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ส่งออกข้อมูลผู้ใช้งานไม่สำเร็จ" });
      }
    }
    const stats = [
      { tone: "blue", icon: "♟", label: "ผู้ใช้งานทั้งหมด", value: systemUsers.length, art: "♟" },
      { tone: "green", icon: "✓", label: "ใช้งานปกติ", value: active, art: "▥" },
      { tone: "purple", icon: "▤", label: "Production", value: productionUsers, art: "▦" },
      { tone: "orange", icon: "◇", label: "Stock", value: stockUsers, art: "□" },
      { tone: "pink", icon: "◈", label: "QC", value: qcUsers, art: "◆" },
      { tone: "teal", icon: "▣", label: "Delivery", value: deliveryUsers, art: "▰" },
    ];
    return <div className="users-page-redesign">
      <section className="users-overview-card">
        <header><div><span>▥</span><div><h3>ภาพรวมผู้ใช้งาน</h3><p>จำนวนผู้ใช้งานในแต่ละหน่วยงาน</p></div></div><div className="users-overview-actions"><small>▦ อัปเดตล่าสุด<br />{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</small><button className="button primary" onClick={() => { setUserForm({ ...EMPTY_USER, permissions: [...EMPTY_USER.permissions] }); setUserEditorOpen(true); }}>＋ เพิ่มผู้ใช้งาน</button></div></header>
        <div className="users-stat-grid page-summary">{stats.map((item) => <article className={`users-stat ${item.tone}`} key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><b>{fmt(item.value)}</b><em>คน</em></div><i>{item.art}</i></article>)}</div>
      </section>

      <section className="users-list-card">
        <header><div><span>♟</span><div><h3>ผู้ใช้งานระบบ</h3><p>จัดการบัญชีผู้ใช้งาน กำหนดสิทธิ์ และสถานะการใช้งาน</p></div></div><div className="users-list-tools"><label><span>⌕</span><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="ค้นหาชื่อ, รหัส, อีเมล หรือบทบาท..." /></label><button className="button secondary" onClick={() => void loadUsers()}>↻ รีเฟรช</button><button className="button users-excel-button" onClick={() => void exportUsersExcel()}>▦ ส่งออก Excel</button></div></header>
        {usersLoading ? <div className="loading-state"><span /><p>กำลังโหลดผู้ใช้งาน…</p></div> : visibleUsers.length ? <div className="table-wrap mobile-table-wrap users-table-wrap">
          <table className="mobile-card-table users-modern-table"><thead><tr><th>รหัส / ผู้ใช้งาน</th><th>ชื่อ–นามสกุล / อีเมล</th><th>บทบาท</th><th>สิทธิ์หน้า</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>{visibleUsers.map((item) => <tr key={item.id}>
              <td data-label="รหัส / ผู้ใช้งาน"><div className="user-cell"><span>{item.displayName.slice(0, 1).toUpperCase()}</span><div><b>{item.displayName}</b><small>{item.employeeCode}</small></div></div></td>
              <td data-label="ชื่อ–นามสกุล / อีเมล"><b>{item.displayName}</b><small>{item.email || "—"}</small></td>
              <td data-label="บทบาท"><span className={`role-pill role-${item.role}`}>{ROLE_LABELS[item.role] || item.role}</span></td>
              <td data-label="สิทธิ์หน้า"><div className="permission-summary">{(item.role === "admin" ? NAV.map((nav) => nav.key) : item.permissions || []).map((key) => <span key={key}>{NAV.find((nav) => nav.key === key)?.label || STOCK_ACCESS_LABELS[key] || key}</span>)}</div></td>
              <td data-label="สถานะ"><span className={`status ${item.active ? "completed" : "over"}`}>{item.active ? "ใช้งานปกติ" : "ระงับ"}</span></td>
              <td data-label="จัดการ">{item.role === "admin" ? <span className="muted">บัญชีหลัก</span> : <div className="user-actions"><button className="tiny-button" onClick={() => editUser(item)}>✎ แก้ไข</button><button className="tiny-button" onClick={() => editUser(item)}>⚿ สิทธิ์ / PIN</button><button className={`tiny-button ${item.active ? "danger-outline" : ""}`} onClick={() => void toggleUser(item)}>{item.active ? "▧ ระงับ" : "✓ เปิดใช้"}</button></div>}</td>
            </tr>)}</tbody>
          </table>
        </div> : <Empty title="ไม่พบผู้ใช้งาน" text="ลองเปลี่ยนคำค้นหา หรือกดเพิ่มผู้ใช้งานใหม่" />}
        <footer><span>แสดง {fmt(visibleUsers.length)} จาก {fmt(systemUsers.length)} รายการ</span></footer>
      </section>

      <div className="users-security-grid">
        <section><header><span>◇</span><div><h3>สิทธิ์รายบุคคล</h3><p>กำหนดสิทธิ์การเข้าถึงของแต่ละผู้ใช้งาน</p></div></header><div><span>⚙</span><p><b>Admin กำหนดสิทธิ์ทุกหน้า</b><small>บทบาทใช้ระบุทีมงาน ส่วนสิทธิ์หน้าแต่ละหน้าต้องเลือกให้ผู้ใช้แต่ละคนอย่างน้อย 1 หน้า</small></p></div></section>
        <section><header><span>▣</span><div><h3>ความปลอดภัย</h3><p>ตั้งค่าความปลอดภัยของผู้ใช้งานและการเข้าถึงระบบ</p></div></header><div><span>◆</span><p><b>ป้องกันทั้งเมนูและ API</b><small>หน้าที่ไม่ได้รับสิทธิ์จะไม่แสดงในเมนู และระบบจะปฏิเสธการเปิดหรือเรียกใช้งานโดยตรง</small></p></div></section>
      </div>
      <footer className="settings-footer"><span>© 2026 KIT Delivery Due Control. All rights reserved.</span><span>Version 2.23.0&nbsp;&nbsp; | &nbsp;&nbsp;Bangkok, Thailand&nbsp;&nbsp; 🇹🇭</span></footer>
    </div>;
  }

  const pageContent: Record<PageKey, () => ReactNode> = { "stock-all": () => <StockAllPage canDetails={user.role === "admin" || user.permissions.includes("stock-all-details")} canExport={user.role === "admin" || user.permissions.includes("stock-all-export")} />, overdue: renderOverdueWork, dashboard: renderDashboard, stock: renderStock, "manual-stock": renderManualStock, "stock-count": renderStockCount, forecast: renderForecast, parts: renderParts, tags: renderTags, plan: renderPlan, arrange: () => renderScan("arrange"), replacement: renderReplacement, verify: renderVerify, dispatch: () => renderScan("dispatch"), exports: renderExports, reports: renderReports, history: renderHistory, settings: renderSettings, users: renderUsers };
  const activeNav = (page === "overdue" ? { key: "overdue", label: "งานติดลบ / ค้างส่ง", icon: "!" } : NAV.find((item) => item.key === page)) || NAV.find((item) => item.key === firstAllowedPage) || NAV[0];

  if (monitorMode) return <main className="overdue-monitor-shell">
    {error && <div className="notice error">{error}</div>}
    {renderOverdueWork()}
    <OperationWarningPopup voiceEnabled={settings.sound}/>
  </main>;

  return <div onInvalidCapture={(event) => { event.preventDefault(); const field=event.target as HTMLInputElement; const label=field.closest("label")?.querySelector("span")?.textContent || field.getAttribute("aria-label") || "ข้อมูล"; reportOperationWarning({page,message:`${label}: ${field.validationMessage || "กรุณาตรวจสอบข้อมูล"}`}); }} className={`control-shell ${page === "stock-all" ? `stock-reference-shell ${stockMenuCollapsed ? "stock-sidebar-collapsed" : ""}` : ""}`}>
    <aside className={`control-sidebar ${menuOpen ? "open" : ""}`}>
      <button className="sidebar-close" onClick={() => setMenuOpen(false)}>×</button>
      <div className="kit-logo">{page === "stock-all" ? <OverviewLogo/> : <b>KiT</b>}<span>DELIVERY DUE CONTROL</span></div>
      <nav>{NAV.filter((item) => allowedPages.has(item.key)).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{page === "stock-all" ? <OverviewIcon name={OVERVIEW_NAV_ICONS[item.key]}/> : item.icon}</span>{item.label}</button>)}</nav>
      {page === "stock-all" && <OverviewFactory/>}
      <div className="sidebar-bottom">{allowedPages.has("settings") && <div className="help-box"><b>ต้องการความช่วยเหลือ?</b><button onClick={() => go("settings")}>◉ คู่มือและตั้งค่า</button></div>}<a className="mobile-logout" href={signOutPath} onClick={signOut}><span>↪</span><b>ออกจากระบบ</b></a><div className="mini-brand"><b>KiT</b><span>Delivery Due Control<br />© 2026 · v2.23.0</span></div></div>
    </aside>
    {menuOpen && <button className="menu-backdrop" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} />}
    <main className="control-main">
      <header className={`control-topbar settings-topbar ${page === "settings" || page === "users" || page === "history" || page === "reports" || page === "exports" ? "settings-banner-topbar" : ""} ${page === "users" ? "users-banner-topbar" : ""} ${page === "history" ? "history-banner-topbar" : ""} ${page === "reports" ? "reports-banner-topbar" : ""} ${page === "exports" ? "exports-banner-topbar" : ""}`}>
        <button className="menu-button" aria-label="เปิด/ปิดเมนู" onClick={() => page === "stock-all" && window.innerWidth > 720 ? setStockMenuCollapsed(value=>!value) : setMenuOpen(true)}>{page === "stock-all" ? <OverviewIcon name="menu"/> : "☰"}</button>
        {page === "stock-all" ? <div className="stock-reference-top-search"><OverviewIcon name="search"/><input type="search" aria-label="ค้นหา Stock จากแถบด้านบน" placeholder="ค้นหา Part No. / ชื่อชิ้นงาน / ลูกค้า / Job / Location ..." value={stockOverviewSearch} onChange={(event) => {setStockOverviewSearch(event.target.value);window.dispatchEvent(new CustomEvent("stock-overview-search", {detail:event.target.value}));}}/><kbd>Ctrl + K</kbd></div> : page === "settings" ? <div className="topbar-settings-banner">
          <div className="settings-hero-title"><span>⚙</span><div><h2>ตั้งค่า</h2><p>หน้าหลัก <b>›</b> ตั้งค่า</p></div></div>
          <div className="settings-hero-copy"><b>ตั้งค่าระบบให้ทำงานได้เต็มประสิทธิภาพ</b><span>เพื่อการส่งมอบที่ตรงเวลา</span><div><em>🚀 เร็วขึ้น</em><em>◎ แม่นยำ</em><em>◆ เชื่อถือได้</em></div></div>
          <div className="settings-hero-art"><strong>Control Today</strong><strong>Deliver Tomorrow</strong></div>
        </div> : page === "users" ? <div className="topbar-settings-banner topbar-users-banner">
          <div className="users-hero-title"><span>♟</span><div><h2>ผู้ใช้งาน</h2><p>หน้าหลัก <b>›</b> ผู้ใช้งาน</p></div></div>
          <div className="users-hero-copy"><b>People Drive</b><span>Better Operations</span></div>
          <div className="users-hero-art"><strong>“ทีมที่ดี<br />สร้างงานที่ดีขึ้นได้เสมอ”</strong></div>
        </div> : page === "history" ? <div className="topbar-settings-banner topbar-history-banner">
          <div className="history-hero-title"><span>◷</span><div><h2>ประวัติ</h2><p>หน้าหลัก <b>›</b> ประวัติ</p></div></div>
          <div className="history-hero-copy"><b>ตรวจสอบทุกการเคลื่อนไหว</b><span>ย้อนหลังได้อย่างชัดเจน</span></div>
          <div className="history-hero-art"><strong>Track Today</strong><strong>Deliver Tomorrow</strong></div>
        </div> : page === "reports" ? <div className="topbar-settings-banner topbar-reports-banner">
          <div className="reports-hero-title"><span>▥</span><div><h2>รายงาน</h2><p>หน้าหลัก <b>›</b> รายงาน</p></div></div>
          <div className="reports-hero-copy"><b>ข้อมูลชัดเจน</b><span>ช่วยให้การตัดสินใจแม่นยำขึ้น</span></div>
          <div className="reports-hero-art"><strong>Data Today</strong><strong>Better Tomorrow</strong></div>
        </div> : page === "exports" ? <div className="topbar-settings-banner topbar-exports-banner">
          <div className="exports-hero-title"><span>▰</span><div><h2>รายการส่งออก</h2><p>หน้าหลัก <b>›</b> รายการส่งออก</p></div></div>
          <div className="exports-hero-copy"><b>ควบคุมการส่งออก</b><span>ให้ถูกต้อง ตรงเวลา และตรวจสอบได้</span></div>
          <div className="exports-hero-art"><strong>Deliver Right</strong><strong>Move Forward</strong></div>
        </div> : <div><h1>{activeNav.label}</h1><p>หน้าหลัก <span>›</span> {PAGE_SUBTITLE[page]}</p></div>}
        <div className="top-user"><button type="button" className={`notification overdue-sound-shortcut ${overdueSoundEnabled ? "enabled" : ""}`} onClick={() => void toggleOverdueSound()} aria-label={overdueSoundEnabled ? "ปิดเสียงแจ้งเตือนงานเกิน Due" : "เปิดเสียงแจ้งเตือนงานเกิน Due"} aria-pressed={overdueSoundEnabled}>{overdueSoundEnabled ? "🔔" : "🔕"}</button><button className="notification" onClick={showOverduePlan} disabled={!overdueDues.length || !allowedPages.has("plan")} aria-label={`งานเกินดิวจัดส่ง ${overdueDues.length} รายการ`}>♧<i>{fmt(overdueDues.length)}</i></button><span className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><b>{user.displayName}</b><small>{ROLE_LABELS[user.role] || user.role}</small></div><a href={signOutPath} onClick={signOut}>ออกจากระบบ</a></div>
      </header>
      <div className="control-content">
        <VoiceAlertControl enabled={settings.sound} onEnabledChange={changeVoiceEnabled}/>
        {EDITABLE_PAGE_KEYS.includes(page as EditablePageKey) && !canEditPage(page as EditablePageKey) && <div className="read-only-permission-banner"><span>◉</span><div><b>สิทธิ์ดูข้อมูลเท่านั้น</b> — บัญชีนี้ค้นหาและตรวจสอบข้อมูลได้ แต่ไม่สามารถเพิ่มหรือแก้ไขรายการในหน้านี้</div></div>}
        {notice && <div className={`toast ${notice.type} auto-dismiss`}><span>{notice.type === "success" ? "✓" : "!"}</span><p>{notice.text}</p><button onClick={() => setNotice(null)}>×</button></div>}
        {error && <div className="toast error"><span>!</span><p>{error}</p><button onClick={() => void loadDue()}>ลองใหม่</button></div>}
        {loading && page !== "overdue" ? <div className="loading-state"><span /><p>กำลังโหลดข้อมูล Due…</p></div> : pageContent[page]()}
      </div>
    </main>
    <nav className="mobile-bottom-nav" aria-label="เมนูมือถือ">
      {NAV.filter((item) => allowedPages.has(item.key)).slice(0, 4).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span><small>{item.label.replace("แผนส่งงาน (Due)", "แผนงาน").replace("ตรวจและขายออก", "ขายออก")}</small></button>)}
      <button onClick={() => setMenuOpen(true)}><span>☰</span><small>เมนู</small></button>
      <a className="bottom-logout" href={signOutPath} onClick={signOut}><span>↪</span><small>ออกระบบ</small></a>
    </nav>
    {arrangeWarning && <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="arrange-warning-title" aria-describedby="arrange-warning-message"><section className="arrange-warning-modal" onKeyDown={(event) => { if (event.key === "Tab") event.preventDefault(); }}>
      <header><span>!</span><h3 id="arrange-warning-title">แจ้งเตือนจัดงาน</h3></header>
      <p id="arrange-warning-message">{arrangeWarning.message}</p>
      <dl><div><dt>วันที่ส่งงาน</dt><dd>{formatDate(arrangeWarning.date) || "ยังไม่เลือก"}</dd></div><div><dt>รอบส่งงาน</dt><dd>{arrangeWarning.time || "ทุกรอบ"}</dd></div><div><dt>FAC</dt><dd>{arrangeWarning.fact || "ทุก FAC"}</dd></div></dl>
      <small>ระบบคงวันที่ รอบ และ FAC ที่เลือกไว้ สามารถเปลี่ยนตัวเลือกก่อนสแกนต่อได้</small>
      <button type="button" className="button primary full" autoFocus onClick={() => { setArrangeWarning(null); window.setTimeout(() => tagInput.current?.focus(), 0); }}>รับทราบ</button>
    </section></div>}
    {replacementPreview && <div className="modal-backdrop replacement-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="replacement-confirm-title"><div className="replacement-confirm-modal">
      <header><div><span>↺</span><div><small>ตรวจพบ KIT Stock Tag</small><h3 id="replacement-confirm-title">ตรวจสอบก่อนเบิกงานทดแทน</h3></div></div><button type="button" onClick={() => { setReplacementPreview(null); setReplacementTag(""); setReplacementQty(""); }} aria-label="ปิด">×</button></header>
      <div className="replacement-confirm-content">
        <section className="replacement-confirm-photo dispatch-confirm-images"><PartImagePair materialCode={replacementPreview.request.materialCode} masterVersion={partImages.find((item) => item.materialCode === replacementPreview.request.materialCode)?.updatedAt} actualVersion={partActualImages.find((item) => item.materialCode === replacementPreview.request.materialCode)?.updatedAt} /></section>
        <section className="replacement-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{replacementPreview.request.materialCode}</b><p>{replacementPreview.request.partName || replacementPreview.tag.partName || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="replacement-confirm-details"><div><small>ใบขอ QC</small><b>{replacementPreview.request.requestNo}</b></div><div><small>ลูกค้า / Site</small><b>{replacementPreview.request.customer || "—"}</b></div><div><small>KIT Stock Tag</small><b>{replacementPreview.tag.tagId}</b></div><div><small>Job / Location</small><b>{replacementPreview.tag.jobNo || "—"} / {replacementPreview.tag.location || "—"}</b></div></div>
          <div className="replacement-qty-compare"><div><small>QC ขอเบิก</small><b>{fmt(replacementPreview.request.requestedQty)}</b><em>ชิ้น</em></div><div><small>เบิกแล้ว</small><b>{fmt(replacementPreview.request.issuedQty)}</b><em>ชิ้น</em></div><label><small>เบิกครั้งนี้</small><input type="number" inputMode="numeric" min={1} max={Math.min(replacementPreview.request.remainingQty, replacementPreview.tag.availableQty)} value={replacementQty} onChange={(event) => setReplacementQty(event.target.value.replace(/[^0-9]/g, ""))} /><em>แก้ไขจำนวนได้</em></label><div><small>คงเหลือหลังเบิก</small><b>{fmt(Math.max(replacementPreview.request.remainingQty - Number(replacementQty || 0), 0))}</b><em>ชิ้น</em></div></div>
          <p className="replacement-stock-note">Stock Tag นี้พร้อมใช้ {fmt(replacementPreview.tag.availableQty)} ชิ้น · ระบบจะตัด Stock เมื่อยืนยัน</p>
        </section>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => { setReplacementPreview(null); setReplacementTag(""); setReplacementQty(""); }}>ยกเลิก / สแกนใหม่</button><button type="button" className="button confirm-replacement-button" disabled={replacementSaving || !Number(replacementQty) || Number(replacementQty) > replacementPreview.request.remainingQty || Number(replacementQty) > replacementPreview.tag.availableQty} onClick={() => void confirmReplacementIssue()}>{replacementSaving ? "กำลังเบิกงาน…" : "✓ ยืนยันเบิกและตัดยอด"}</button></footer>
    </div></div>}
    {stockCountPreview && stockCountConfirmOpen && <div className="modal-backdrop stock-count-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-count-title"><div className="stock-count-modal">
      <header><div><span>≋</span><div><small>ตรวจนับ Stock สิ้นเดือนทีละ Tag</small><h3 id="stock-count-title">ยืนยันการปรับยอด Tag</h3></div></div><button type="button" onClick={() => setStockCountConfirmOpen(false)} aria-label="ปิด">×</button></header>
      <div className="stock-count-content">
        <section><small>KIT STOCK TAG</small><h4>{stockCountPreview.tagId}</h4><p>{stockCountPreview.materialCode} · {stockCountPreview.partName} · Job {stockCountPreview.jobNo}</p></section>
        <div className="stock-count-compare">
          <article><small>ควรอยู่ในพื้นที่ Stock</small><b>{fmt(stockCountPreview.stockAreaSystemQty)}</b><em>ชิ้น</em></article><span>→</span>
          <article><small>นับได้ในพื้นที่ Stock</small><b>{fmt(stockCountPreview.stockAreaCountedQty)}</b><em>ชิ้น</em></article>
          <article className={stockCountPreview.difference < 0 ? "negative" : stockCountPreview.difference > 0 ? "positive" : "equal"}><small>ผลต่าง Stock</small><b>{stockCountPreview.difference > 0 ? "+" : ""}{fmt(stockCountPreview.difference)}</b><em>ชิ้น</em></article>
        </div>
        <div className="stock-count-safety"><b>ยอดรวมใหม่ของ Tag = {fmt(stockCountPreview.stockAreaCountedQty)} ใน Stock + {fmt(stockCountPreview.reservedQty)} จัดงาน/จอง = {fmt(stockCountPreview.newTotalQty)} ชิ้น</b><span>ยอด Stock รวมทุก Tag {fmt(stockCountPreview.materialTotalQty)} → {fmt(stockCountPreview.materialTotalAfter)} ชิ้น</span></div>
        <p className="stock-count-reason"><b>สาเหตุ:</b> {stockCountForm.reason}</p>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => setStockCountConfirmOpen(false)}>กลับไปแก้ไข</button><button type="button" className="button confirm-stock-count-button" disabled={stockManagementSaving || !stockCountForm.reason.trim()} onClick={() => void confirmStockCountAdjustment()}>{stockManagementSaving ? "กำลังบันทึก…" : "✓ ยืนยันปรับยอด Tag และ Stock"}</button></footer>
    </div></div>}
    {stockReceivePreview && <div className="modal-backdrop dispatch-confirm-backdrop stock-receive-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-receive-confirm-title"><div className="dispatch-confirm-modal stock-receive-confirm-modal">
      <header><div><span>✓</span><div><small>ตรวจพบ KIT Stock Tag</small><h3 id="stock-receive-confirm-title">ตรวจสอบก่อนรับเข้า Stock</h3></div></div><button type="button" onClick={() => { setStockReceivePreview(null); setStockReceiveQty(""); setStockReceiveProductionDate(""); setStockScan(""); }} aria-label="ปิด">×</button></header>
      <div className="dispatch-confirm-content">
        <section className="dispatch-confirm-images"><PartImagePair materialCode={stockReceivePreview.tag.materialCode} masterVersion={partImages.find((item) => item.materialCode === stockReceivePreview.tag.materialCode)?.updatedAt} actualVersion={partActualImages.find((item) => item.materialCode === stockReceivePreview.tag.materialCode)?.updatedAt} /></section>
        <section className="dispatch-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{stockReceivePreview.tag.materialCode}</b><p>{stockReceivePreview.tag.partName || stockReceivePreview.master.partName || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="dispatch-confirm-details"><div><small>KIT Stock Tag</small><b>{stockReceivePreview.tag.tagId}</b></div><div><small>Job</small><b>{stockReceivePreview.tag.jobNo || "—"}</b></div><div><small>ลูกค้า</small><b>{stockReceivePreview.tag.customer || "—"}</b></div><div><small>Location</small><b>{stockReceivePreview.tag.location || "—"}</b></div></div>
          <div className="stock-receive-qty-box">
            <div><small>จำนวนตาม Tag</small><b>{fmt(stockReceivePreview.tag.qty)}</b><em>ชิ้น</em></div>
            <label><small>จำนวนรับเข้าจริง</small><input type="number" inputMode="numeric" min={0} max={stockReceivePreview.tag.qty} step={1} value={stockReceiveQty} onChange={(event) => setStockReceiveQty(event.target.value.replace(/[^0-9]/g, ""))} /><em>แก้ไขได้เมื่อมีงานเสีย</em></label>
            <div className={Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0) > 0 ? "has-ng" : ""}><small>จำนวน NG</small><b>{fmt(Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0))}</b><em>ชิ้น</em></div>
            <label className="production-date"><small>วันที่ผลิต</small><input type="date" value={stockReceiveProductionDate} onChange={(event) => setStockReceiveProductionDate(event.target.value)} required /><em>ค่าเริ่มต้นคือวันที่สแกนรับเข้า · แก้ไขได้</em></label>
          </div>
          {Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0) > 0 && <p className="stock-receive-ng-note">! ระบบจะเพิ่มเข้า Stock เฉพาะ {fmt(Number(stockReceiveQty || 0))} ชิ้น และบันทึก NG {fmt(Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0))} ชิ้น</p>}
        </section>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => { setStockReceivePreview(null); setStockReceiveQty(""); setStockReceiveProductionDate(""); setStockScan(""); }}>ยกเลิก / สแกนใหม่</button><button type="button" className="button confirm-dispatch-button stock-confirm-receive-button" disabled={stockSaving || stockReceiveQty === "" || !stockReceiveProductionDate || Number(stockReceiveQty) < 0 || Number(stockReceiveQty) > Number(stockReceivePreview.tag.qty)} onClick={() => void confirmReceiveStockTag()}>{stockSaving ? "กำลังรับเข้า…" : "✓ ยืนยันรับเข้า Stock"}</button></footer>
    </div></div>}
    {arrangeConfirmation && <div className="modal-backdrop dispatch-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="arrange-confirm-title" onKeyDown={(event) => { if (event.key === "Escape" && !checkingTag) { setArrangeConfirmation(null); tagInput.current?.focus(); } if (event.key === "Tab") { const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)")); const first = buttons[0], last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><div className="dispatch-confirm-modal">
      <header><div><span>✓</span><div><small>ตรวจพบ KIT Stock Tag</small><h3 id="arrange-confirm-title">ตรวจสอบงานก่อนจัดงาน</h3></div></div><button type="button" disabled={checkingTag} onClick={() => { setArrangeConfirmation(null); tagInput.current?.focus(); }} aria-label="ปิด">×</button></header>
      <div className="dispatch-confirm-content">
        <section className="dispatch-confirm-images"><PartImagePair materialCode={arrangeConfirmation.tag.materialCode} masterVersion={partImages.find(item => item.materialCode === arrangeConfirmation.tag.materialCode)?.updatedAt} actualVersion={partActualImages.find(item => item.materialCode === arrangeConfirmation.tag.materialCode)?.updatedAt}/></section>
        <section className="dispatch-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{arrangeConfirmation.tag.materialCode}</b><p>{arrangeConfirmation.due.materialDescription || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="dispatch-confirm-details"><div><small>KIT Stock Tag</small><b>{arrangeConfirmation.tag.tagId}</b></div><div><small>Job</small><b>{arrangeConfirmation.tag.jobNo}</b></div><div><small>รอบ / FAC</small><b>{arrangeConfirmation.due.deliveryTime} / {arrangeConfirmation.due.fact}</b></div><div><small>วันที่ส่ง / DO</small><b>{formatDate(arrangeConfirmation.due.deliveryDate)} / {arrangeConfirmation.due.doNo}</b></div></div>
          <div className="dispatch-confirm-qty"><div><small>Tag พร้อมจัด</small><b>{fmt(arrangeConfirmation.tagAvailableQty)}</b><em>ชิ้น</em></div><div><small>Due เหลือจัด</small><b>{fmt(arrangeConfirmation.dueOpenQty)}</b><em>ชิ้น</em></div><label className="current" style={{padding:16}}><small>จัดครั้งนี้ (แก้ไขได้)</small><input aria-label="จำนวนจัดงานครั้งนี้" type="number" inputMode="numeric" min="1" step="1" max={Math.min(arrangeConfirmation.tagAvailableQty,arrangeConfirmation.dueOpenQty)} value={arrangeConfirmQty} disabled={checkingTag} onChange={event=>setArrangeConfirmQty(event.target.value)} style={{width:"100%",fontSize:28,fontWeight:700,textAlign:"center"}}/><em>ชิ้น</em></label><div><small>Due เหลือหลังจัด</small><b>{fmt(Math.max(arrangeConfirmation.dueOpenQty-(Number(arrangeConfirmQty)||0),0))}</b><em>ชิ้น</em></div></div>
          <p className="dispatch-staged-note">แก้จำนวนจัดครั้งนี้ได้ 1–{fmt(Math.min(arrangeConfirmation.tagAvailableQty,arrangeConfirmation.dueOpenQty))} ชิ้น · Stock พร้อมใช้หลังจัด {fmt(Math.max(arrangeConfirmation.tagAvailableQty-(Number(arrangeConfirmQty)||0),0))} ชิ้น · คงเหลือรวมยังเท่าเดิม</p>
          {!validArrangementQuantity(arrangeConfirmQty,Math.min(arrangeConfirmation.tagAvailableQty,arrangeConfirmation.dueOpenQty))&&<p role="alert">กรุณาระบุจำนวนเต็ม 1–{fmt(Math.min(arrangeConfirmation.tagAvailableQty,arrangeConfirmation.dueOpenQty))} ชิ้นก่อนยืนยัน</p>}
        </section>
      </div>
      <footer><button type="button" className="button secondary" disabled={checkingTag} onClick={() => { setArrangeConfirmation(null); tagInput.current?.focus(); }}>ยกเลิก / สแกนใหม่</button><button ref={arrangeConfirmButtonRef} type="button" className="button confirm-dispatch-button" disabled={checkingTag || !validArrangementQuantity(arrangeConfirmQty,Math.min(arrangeConfirmation.tagAvailableQty,arrangeConfirmation.dueOpenQty))} onClick={() => void stageStockTag(arrangeConfirmation.rawPayload, {...arrangeConfirmation,pickedQty:Number(arrangeConfirmQty)})}>{checkingTag ? "กำลังจัดงาน…" : "✓ ยืนยันจัดงาน"}</button></footer>
    </div></div>}
    {dispatchConfirmation && <div className="modal-backdrop dispatch-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="dispatch-confirm-title"><div className="dispatch-confirm-modal">
      <header><div><span>✓</span><div><small>ตรวจพบ Tag ลูกค้า</small><h3 id="dispatch-confirm-title">ตรวจสอบงานก่อนขายออก</h3></div></div><button type="button" onClick={() => setDispatchConfirmation(null)} aria-label="ปิด">×</button></header>
      <div className="dispatch-confirm-content">
        <section className="dispatch-confirm-images"><PartImagePair materialCode={dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode || ""} masterVersion={partImages.find((item) => item.materialCode === (dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode))?.updatedAt} actualVersion={partActualImages.find((item) => item.materialCode === (dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode))?.updatedAt} /></section>
        <section className="dispatch-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode || "—"}</b><p>{dispatchConfirmation.master?.partName || dispatchConfirmation.due?.materialDescription || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="dispatch-confirm-details"><div><small>KIT Tag</small><b>{dispatchKitSelection?.stockTagCode || "—"}</b></div><div><small>Tag ลูกค้า</small><b>{dispatchConfirmation.tag?.tagId || "—"}</b></div><div><small>FAC / Line</small><b>{dispatchConfirmation.due ? dispatchConfirmation.due.fact + " / " + (dispatchConfirmation.due.line || "—") : "—"}</b></div><div><small>DO / Seq</small><b>{dispatchConfirmation.due ? dispatchConfirmation.due.doNo + " / " + dispatchConfirmation.due.seq : "—"}</b></div><div><small>กำหนดส่ง</small><b>{dispatchConfirmation.due ? formatDate(dispatchConfirmation.due.deliveryDate) + " " + dispatchConfirmation.due.deliveryTime : "—"}</b></div><div><small>Job / จำนวน KIT</small><b>{dispatchKitSelection ? `${dispatchKitSelection.jobNo || "—"} / ${fmt(dispatchKitSelection.waitingQty)} ชิ้น` : "—"}</b></div></div>
          <div className="dispatch-confirm-qty"><div><small>Due ทั้งหมด</small><b>{fmt(dispatchConfirmation.due?.reqQty || 0)}</b><em>ชิ้น</em></div><div><small>ขายออกแล้ว</small><b>{fmt(dispatchConfirmation.due?.alreadyQty || 0)}</b><em>ชิ้น</em></div><div className="current"><small>ขายครั้งนี้</small><b>{fmt(dispatchConfirmation.tag?.qty || 0)}</b><em>{dispatchConfirmation.tag?.unit || "ชิ้น"}</em></div><div><small>คงเหลือหลังขาย</small><b>{fmt(dispatchConfirmation.due?.remainingAfter || 0)}</b><em>ชิ้น</em></div></div>
          {dispatchConfirmation.stagedAvail !== undefined && <p className="dispatch-staged-note">งานที่จัดรอขายไว้ {fmt(dispatchConfirmation.stagedAvail)} ชิ้น</p>}
        </section>
      </div>
      {(dispatchConfirmation.verdict === "ready" || dispatchConfirmation.verdict === "ready_noimg") ? <footer><button type="button" className="button secondary" onClick={() => { setDispatchConfirmation(null); setRawTag(""); }}>ยกเลิก / สแกน Tag ลูกค้าใหม่</button><button type="button" className="button confirm-dispatch-button" disabled={checkingTag} onClick={() => void confirmDispatch()}>{checkingTag ? "กำลังขายออก…" : "✓ ยืนยันขายออกและตัดยอด"}</button></footer> : <footer className="dispatch-confirm-blocked"><p>ไม่สามารถขายออกได้: {dispatchConfirmation.message || "ข้อมูลไม่พร้อมขายออก"}</p><button type="button" className="button secondary" onClick={() => { setDispatchConfirmation(null); setRawTag(""); window.setTimeout(() => tagInput.current?.focus(), 50); }}>เก็บ KIT Tag / สแกนลูกค้าใหม่</button><button type="button" className="button secondary" onClick={() => { setDispatchConfirmation(null); setDispatchKitSelection(null); setRawTag(""); window.setTimeout(() => tagInput.current?.focus(), 50); }}>ล้างทั้งคู่ / เริ่มใหม่</button></footer>}
    </div></div>}
    {jobQtyAdjustment && <div className="modal-backdrop job-qty-adjust-backdrop" role="dialog" aria-modal="true" aria-labelledby="job-qty-adjust-title"><section className="job-qty-adjust-modal">
      <header><div><span>±</span><div><small>ก่อนปิดรับเข้า Job</small><h3 id="job-qty-adjust-title">ปรับจำนวนผลิตจริง</h3></div></div><button type="button" disabled={jobQtySaving} onClick={closeJobQuantityAdjustment} aria-label="ปิด">×</button></header>
      <div className="job-qty-adjust-content">
        <section className="job-qty-adjust-job"><div><small>JOB</small><b>{jobQtyAdjustment.jobNo}</b></div><div><small>PART</small><b>{jobQtyAdjustment.materialCode}</b><span>{jobQtyAdjustment.partName}</span></div></section>
        {!jobQtyPreview && !jobQtyAdjusted && <form id="job-qty-adjust-form" onSubmit={(event) => void previewJobQuantity(event)}>
          <div className="job-qty-current"><small>จำนวน Tag ปัจจุบัน</small><b>{fmt(jobQtyAdjustment.currentQty)}</b><em>ชิ้น</em></div>
          <label><span>จำนวนผลิตจริงทั้งหมด *</span><input type="number" min="0" step="1" inputMode="numeric" value={jobQtyTarget} onChange={(event) => setJobQtyTarget(event.target.value)} required /><small>กรอกยอดรวมที่ผลิตได้จริง ไม่ใช่จำนวนใบ Tag</small></label>
          <label><span>สาเหตุ *</span><textarea value={jobQtyReason} onChange={(event) => setJobQtyReason(event.target.value)} maxLength={300} placeholder="เช่น ผลิตเกินแผน / ผลิตไม่ครบตาม Job" required /></label>
        </form>}
        {jobQtyPreview && <>
          <div className="job-qty-compare"><article><small>Tag ปัจจุบัน</small><b>{fmt(jobQtyPreview.currentQty)}</b></article><span>→</span><article><small>ผลิตจริง</small><b>{fmt(jobQtyPreview.targetQty)}</b></article><article className={jobQtyPreview.difference > 0 ? "positive" : "negative"}><small>ผลต่าง</small><b>{jobQtyPreview.difference > 0 ? "+" : ""}{fmt(jobQtyPreview.difference)}</b></article></div>
          <div className="job-qty-safety"><span>ยอดที่รับเข้า/นำไปใช้งานแล้ว <b>{fmt(jobQtyPreview.lockedQty)}</b> ชิ้น — ระบบจะไม่แก้ไข</span><span>ยกเลิก Tag เดิม <b>{fmt(jobQtyPreview.cancelledTags.length)}</b> ใบ / สร้าง Tag ใหม่ <b>{fmt(jobQtyPreview.newTagQtys.length)}</b> ใบ</span>{jobQtyPreview.difference > 0 && jobQtyPreview.cancelledTags.length > 0 && <span>ระบบนำ Tag เศษที่ยังไม่รับเข้ามารวมกับยอดเพิ่ม แล้วแบ่งใหม่ตาม Packing Qty — กรุณาทำลาย Tag ใบเก่า</span>}</div>
          {jobQtyPreview.cancelledTags.length > 0 && <section className="job-qty-tag-list cancelled"><b>Tag ที่จะยกเลิก</b>{jobQtyPreview.cancelledTags.map((tag) => <span key={tag.id}><code>{tag.tagId}</code><em>{fmt(tag.qty)} ชิ้น</em></span>)}</section>}
          {jobQtyPreview.newTagQtys.length > 0 && <section className="job-qty-tag-list created"><b>Tag ใหม่ที่จะสร้าง</b>{jobQtyPreview.newTagQtys.map((qty, index) => <span key={index}><code>ใบใหม่ {index + 1}</code><em>{fmt(qty)} ชิ้น</em></span>)}</section>}
          <p className="job-qty-reason"><b>สาเหตุ:</b> {jobQtyReason}</p>
          {jobQtyAdjusted && <div className="job-qty-success"><b>✓ ปรับจำนวนผลิตจริงเรียบร้อย</b><span>{jobQtyCreatedTags.length ? `สร้าง Tag ใหม่ ${fmt(jobQtyCreatedTags.length)} ใบ กรุณาพิมพ์และนำไปใช้แทน` : "ไม่มี Tag ใหม่ที่ต้องพิมพ์"}</span></div>}
        </>}
      </div>
      <footer>{!jobQtyPreview && !jobQtyAdjusted ? <><button type="button" className="button secondary" onClick={closeJobQuantityAdjustment}>ยกเลิก</button><button type="submit" form="job-qty-adjust-form" className="button primary" disabled={jobQtySaving}>{jobQtySaving ? "กำลังตรวจสอบ…" : "ตรวจสอบ Tag ที่จะเปลี่ยน"}</button></> : jobQtyAdjusted ? <><button type="button" className="button secondary" onClick={closeJobQuantityAdjustment}>ปิด</button>{jobQtyCreatedTags.length > 0 && <button type="button" className="button primary" onClick={() => void printStockTags(jobQtyCreatedTags)}>▤ พิมพ์ Tag ใหม่</button>}</> : <><button type="button" className="button secondary" disabled={jobQtySaving} onClick={() => setJobQtyPreview(null)}>กลับไปแก้ไข</button><button type="button" className="button primary" disabled={jobQtySaving} onClick={() => void confirmJobQuantityAdjustment()}>{jobQtySaving ? "กำลังบันทึก…" : "✓ ยืนยันปรับจำนวนผลิตจริง"}</button></>}</footer>
    </section></div>}
    {cameraOpen && <div className="modal-backdrop"><div className="camera-modal"><header><h3>{cameraPurpose === "stock" ? "สแกน Tag รับงานเข้า Stock" : cameraPurpose === "stock-count" ? "สแกน Tag ตรวจนับสิ้นเดือน" : "สแกน Tag ด้วยกล้อง"}</h3><button onClick={() => setCameraOpen(false)}>×</button></header><div className="camera-view"><video ref={videoRef} playsInline muted /><div className="camera-frame" /></div><p className="camera-format-hint">รองรับ QR · Data Matrix · Code 128 · Code 39</p>{cameraError && <p className="camera-error">{cameraError}</p>}<button className="button secondary full" onClick={() => setCameraOpen(false)}>ปิดกล้อง</button></div></div>}
    {splitTagRequest&&<SplitTagPopup {...splitTagRequest} page={page} onClose={closeSplitTag}/>}
    <OperationWarningPopup voiceEnabled={settings.sound}/>
    {userEditorOpen && <div className="modal-backdrop"><form className="user-modal permission-modal" onSubmit={saveUser}>
      <header><div><h3>{userForm.id ? "แก้ไขผู้ใช้งานและสิทธิ์" : "เพิ่มผู้ใช้งาน"}</h3><p>เลือกบทบาทและกำหนดหน้าที่แต่ละคนสามารถเปิดใช้งานได้</p></div><button type="button" onClick={() => setUserEditorOpen(false)}>×</button></header>
      <div className="user-form-grid">
        <label><span>รหัสพนักงาน *</span><input value={userForm.employeeCode} onChange={(e) => setUserForm((current) => ({ ...current, employeeCode: e.target.value.toUpperCase() }))} placeholder="เช่น DISP001" required /></label>
        <label><span>ชื่อผู้ใช้งาน *</span><input value={userForm.displayName} onChange={(e) => setUserForm((current) => ({ ...current, displayName: e.target.value }))} placeholder="ชื่อ-นามสกุล" required /></label>
        <label><span>บทบาท *</span><select value={userForm.role} onChange={(e) => { const role = e.target.value as UserRole; setUserForm((current) => ({ ...current, role })); }}><option value="production">Production</option><option value="stock">Stock</option><option value="qc">QC</option><option value="delivery">Delivery</option>{(userForm.role === "dispatcher" || userForm.role === "inspector") && <option value={userForm.role}>{ROLE_LABELS[userForm.role]}</option>}</select></label>
        <label><span>{userForm.id ? "ตั้ง PIN ใหม่ (เว้นว่างหากไม่เปลี่ยน)" : "PIN 6 หลัก *"}</span><input type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={userForm.pin} onChange={(e) => setUserForm((current) => ({ ...current, pin: e.target.value.replace(/\D/g, "") }))} required={!userForm.id} placeholder="••••••" /></label>
        <label className="wide"><span>อีเมล (ไม่บังคับ)</span><input type="email" value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} /></label>
      </div>
      <section className="individual-permissions"><div className="permission-title"><div><b>สิทธิ์เข้าใช้งานรายบุคคล</b><p>เลือก “ดูข้อมูล” เพื่อเปิดหน้า และเลือก “เพิ่ม / แก้ไข” เฉพาะผู้ที่ทำรายการได้ การลบสงวนไว้สำหรับ Admin</p></div></div>
        <div className="permission-grid">{NAV.map((item) => {
          const checked = userForm.permissions.includes(item.key);
          const editable = EDITABLE_PAGE_KEYS.includes(item.key as EditablePageKey);
          const editKey = `${item.key}-edit` as EditPermission;
          const canEdit = editable && userForm.permissions.includes(editKey);
          return <div key={item.key} className={`permission-option permission-option-levels ${checked ? "checked" : ""}`}>
            <span>{item.icon}</span><div className="permission-option-copy"><b>{item.label}</b><small>{PERMISSION_HELP[item.key]}</small></div>
            <div className="permission-levels">
              <label><input type="checkbox" checked={checked} onChange={(event) => setUserForm((current) => ({
                ...current,
                permissions: event.target.checked
                  ? [...new Set([...current.permissions, item.key])]
                  : current.permissions.filter((key) => key !== item.key && key !== editKey && (item.key !== "stock-all" || !["stock-all-details", "stock-all-export"].includes(key)) && (item.key !== "parts" || key !== "parts-add")),
              }))} /> ดูข้อมูล</label>
              {editable ? <label><input type="checkbox" checked={canEdit} onChange={(event) => setUserForm((current) => ({
                ...current,
                permissions: event.target.checked
                  ? [...new Set([...current.permissions, item.key, editKey])]
                  : current.permissions.filter((key) => key !== editKey && (item.key !== "parts" || key !== "parts-add")),
              }))} /> เพิ่ม / แก้ไข</label> : <em>ดูข้อมูลเท่านั้น</em>}
            </div>
          </div>;
        })}</div>
        <div className="permission-grid">{([{key:"stock-all-details",label:"Stock ทั้งหมด: ดู Tag / Job / Movement"},{key:"stock-all-export",label:"Stock ทั้งหมด: ส่งออก Excel"}] as const).map((item) => <label key={item.key} className="permission-option"><input type="checkbox" disabled={!userForm.permissions.includes("stock-all")} checked={userForm.permissions.includes(item.key)} onChange={(event) => setUserForm((current) => ({...current,permissions:event.target.checked ? [...new Set([...current.permissions,item.key])] : current.permissions.filter((key) => key !== item.key)}))}/><div><b>{item.label}</b><small>ต้องมีสิทธิ์ดูหน้า Stock ทั้งหมดด้วย</small></div></label>)}</div>
      </section>
      <footer><button type="button" className="button secondary" onClick={() => setUserEditorOpen(false)}>ยกเลิก</button><button className="button primary" disabled={userSaving || !userForm.permissions.length}>{userSaving ? "กำลังบันทึก…" : "บันทึกผู้ใช้งานและสิทธิ์"}</button></footer>
    </form></div>}
  </div>;
}
