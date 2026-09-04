"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type PageKey = "dashboard" | "stock" | "parts" | "tags" | "plan" | "arrange" | "replacement" | "verify" | "dispatch" | "exports" | "reports" | "history" | "settings" | "users";

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
type SystemUser = { id: number; employeeCode: string; displayName: string; email: string; role: string; active: boolean; permissions: PageKey[]; createdAt?: string };
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
type StockTag = { id: number; tagId: string; materialCode: string; partName: string; customer: string; qty: number; remainingQty: number; reservedQty: number; receivedQty?: number; ngQty?: number; jobNo: string; productionDate: string; status: string; printedByName: string; receivedByName: string; receivedAt?: string; createdAt: string; payload?: string; boxNo?: number; boxCount?: number; deliveryQty?: number; location?: string };
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
type StockManualReceipt = {
  id: number; stockTagId: number; tagId: string; materialCode: string; partName: string;
  qty: number; jobNo: string; productionDate: string; referenceNo: string; note: string;
  receivedByName: string; receivedByCode: string; receivedAt: string;
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
type StockCountPreview = {
  action: "preview_stock_count"; materialCode: string; partName: string; countDate: string;
  systemQty: number; countedQty: number; difference: number; reservedQty: number;
  reducibleQty: number; affectedTagCount: number;
  affectedTags: Array<{ stockTagCode: string; qtyChange: number; beforeQty: number; afterQty: number }>;
};
type StockPayload = {
  parts: StockPart[]; tags: StockTag[]; allocations: StockAllocation[];
  picks: StockPick[]; dispatchLinks: StockDispatchLink[]; jobClosures: StockJobClosure[];
  manualReceipts: StockManualReceipt[]; countAdjustments: StockCountAdjustment[];
  countAdjustmentLines: StockCountAdjustmentLine[];
};
type ArrangementPreview = {
  action: "staged";
  pick: StockPick;
  tag: StockTag;
  due: DueLine & { remainingToArrange: number; remainingQty: number };
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
type UserRole = "production" | "stock" | "qc" | "delivery" | "dispatcher" | "inspector";
type UserForm = { id?: number; employeeCode: string; displayName: string; email: string; role: UserRole; pin: string; active: boolean; permissions: PageKey[] };

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
  { key: "parts", label: "ทะเบียน Part", icon: "▦" },
  { key: "tags", label: "พิมพ์ Tag", icon: "▤" },
  { key: "plan", label: "แผนส่งงาน (Due)", icon: "▤" },
  { key: "arrange", label: "จัดงาน", icon: "⇥" },
  { key: "replacement", label: "เบิกงานทดแทน", icon: "↺" },
  { key: "dispatch", label: "ตรวจและขายออก", icon: "⌗" },
  { key: "exports", label: "รายการส่งออก", icon: "▱" },
  { key: "reports", label: "รายงาน", icon: "▥" },
  { key: "history", label: "ประวัติ", icon: "◷" },
  { key: "settings", label: "ตั้งค่า", icon: "⚙" },
  { key: "users", label: "ผู้ใช้งาน", icon: "♙" },
];

const DUE_DATA_PAGES: PageKey[] = ["dashboard", "plan", "arrange", "dispatch", "exports", "reports", "history"];

const PAGE_KEYS = new Set<PageKey>([...NAV.map((item) => item.key), "verify"]);

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
  parts: "ทะเบียน Part และรูปชิ้นงาน",
  tags: "ทะเบียน Part สร้างและพิมพ์ Tag",
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
  stock: "สแกนรับเข้า ตรวจสอบยอดคงเหลือ และประวัติ Stock",
  parts: "เพิ่ม นำเข้า และจัดการรูปชิ้นงานของแต่ละ Part",
  tags: "ทะเบียน Part สร้าง Tag และพิมพ์ Tag รับงานเข้า Stock",
  plan: "ตรวจสอบแผนส่งงานจากไฟล์ Excel",
  arrange: "ผู้จัดงานเลือก Due แล้วยิง KIT Stock Tag เพื่อบันทึกงานรอขาย",
  replacement: "QC แจ้งขอเบิกงานทดแทน ทีมจัดงานยิง KIT Tag และพิมพ์ใบแจ้งออก",
  verify: "สแกนชิ้นงานในกล่องเพื่อเทียบรูป master และงานที่ต้องส่งออก ก่อนยืนยันขายออก",
  dispatch: "ผู้ตรวจยิง Tag ลูกค้าเพื่อขายออก ตัด Stock และ Due",
  exports: "รายการที่ตัดยอดและส่งออกแล้ว",
  reports: "สรุปผลการส่งงานตามวันและโรงงาน",
  history: "ตรวจสอบประวัติการสแกนและตัดยอด",
  settings: "กำหนดค่าการทำงานของระบบ",
  users: "ผู้ใช้งานที่มีสิทธิ์เข้าถึงระบบ",
};

type VerifyVerdict = "ready" | "ready_noimg" | "short" | "over" | "no_due" | "ambiguous" | "already" | "bad_tag";
type VerifyResult = {
  action: "verify";
  verdict: VerifyVerdict;
  message?: string;
  tag?: { rawPayload: string; tagId: string; materialCode: string; qty: number; unit: string; doNo: string; seq: number; deliveryDate: string; line: string; shop: string; location: string };
  master?: { materialCode: string; partName: string; customer: string; hasImage: boolean };
  due?: { id: number; doNo: string; seq: number; materialCode: string; materialDescription: string; fact: string; line: string; shop: string; site: string; reqQty: number; deliveryDate: string; deliveryTime: string; alreadyQty: number; remainingDue: number; projectedQty: number; remainingAfter: number };
  stagedAvail?: number;
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

function dueDeadlinePassed(due: DueLine) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due.deliveryDate)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return due.deliveryDate < today;
}

function stateOf(due: DueLine) {
  const scanned = Number(due.scannedQty);
  if (scanned > due.reqQty) return "over";
  if (scanned === due.reqQty) return "completed";
  if (dueDeadlinePassed(due)) return "over";
  if (scanned > 0) return "partial";
  return "pending";
}

function stateLabel(due: DueLine) {
  const state = stateOf(due);
  if (state === "over") return "เกิน Due";
  if (state === "completed") return "ครบตามแผน";
  if (Number(due.arrangedQty) > 0 && Number(due.scannedQty) > 0) return "ส่งบางส่วน / มีงานรอ";
  if (Number(due.arrangedQty) > 0) return "จัดแล้ว รอขายออก";
  if (state === "partial") return "ส่งบางส่วน";
  return "ยังไม่ส่ง";
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
function PartImage({ materialCode, compact = false, version, slot = "master" }: { materialCode: string; compact?: boolean; version?: string; slot?: "master" | "actual" }) {
  const key = `${slot}:${materialCode}`;
  const [failedKey, setFailedKey] = useState("");
  if (failedKey === key) return <div className={`part-photo-fallback ${compact ? "compact" : ""}`}><span>◈</span><small>ยังไม่มีรูป</small></div>;
  const source = `/api/part-images?materialCode=${encodeURIComponent(materialCode)}${slot === "actual" ? "&slot=actual" : ""}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
  return <div className={`part-photo ${compact ? "compact" : ""}`}><img src={source} alt={`รูปชิ้นงาน ${materialCode}`} onError={() => setFailedKey(key)} /></div>;
}

/**
 * โชว์รูปคู่กันตามตำแหน่งที่ผู้ใช้งานคุ้นเคย: รูปชิ้นงานอยู่ซ้าย และรูปตัวอย่างอยู่ขวา
 * ใช้ตอนสแกนเพื่อให้ผู้ตรวจเทียบว่าชิ้นงานในกล่องตรงกับตัวอย่างจริง
 */
function PartImagePair({ materialCode, masterVersion, actualVersion }: { materialCode: string; masterVersion?: string; actualVersion?: string }) {
  const capStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6b7787", marginBottom: 5, textAlign: "center", letterSpacing: "0.02em" };
  const figStyle: React.CSSProperties = { margin: 0, flex: "1 1 130px", minWidth: 0 };
  return <div className="part-image-pair" style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "100%" }}>
    <figure style={figStyle}><figcaption style={capStyle}>รูปชิ้นงานในกล่อง</figcaption><PartImage materialCode={materialCode} slot="actual" version={actualVersion} /></figure>
    <figure style={figStyle}><figcaption style={capStyle}>รูปตัวอย่าง (Master)</figcaption><PartImage materialCode={materialCode} slot="master" version={masterVersion} /></figure>
  </div>;
}

export default function DeliveryControlApp({ user, signOutPath }: { user: { id: number; employeeCode: string; displayName: string; email: string; role: string; permissions: PageKey[] }; signOutPath: string }) {
  // ออกจากระบบด้วย POST เท่านั้น ปุ่มยังเป็น <a> เพื่อให้สไตล์เดิม (.top-user a,
  // .mobile-logout) ใช้ได้ต่อโดยไม่ต้องแก้ CSS แต่ตัวคำขอจริงเป็น POST
  async function signOut(event: ReactMouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await fetch(signOutPath, { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const initialPage = user.role === "admin"
    ? "dashboard"
    : NAV.find((item) => user.permissions.includes(item.key))?.key || "dashboard";
  const hasDueDataPermission = user.role === "admin" || DUE_DATA_PAGES.some((key) => user.permissions.includes(key));
  const [page, setPage] = useState<PageKey>(initialPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [payload, setPayload] = useState<DuePayload>({ dues: [], imports: [], scans: [], receipts: [] });
  const [loading, setLoading] = useState(hasDueDataPermission);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rawTag, setRawTag] = useState("");
  const [tagPreview, setTagPreview] = useState<TagPreview | null>(null);
  const [dispatchConfirmation, setDispatchConfirmation] = useState<VerifyResult | null>(null);
  const [checkingTag, setCheckingTag] = useState(false);
  const [verifyRaw, setVerifyRaw] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [arrangeDueId, setArrangeDueId] = useState("");
  const [arrangeTag, setArrangeTag] = useState("");
  const [arrangeQty, setArrangeQty] = useState("");
  const [arrangeDueSearch, setArrangeDueSearch] = useState("");
  const [arrangeListPage, setArrangeListPage] = useState(1);
  const [arrangedSearch, setArrangedSearch] = useState("");
  const [arrangedPage, setArrangedPage] = useState(1);
  const [arrangementPreview, setArrangementPreview] = useState<ArrangementPreview | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [planPage, setPlanPage] = useState(1);
  const [planPageSize, setPlanPageSize] = useState(10);
  const [filterFact, setFilterFact] = useState("ALL");
  const [filterTime, setFilterTime] = useState("ALL");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPurpose, setCameraPurpose] = useState<"scan" | "stock">("scan");
  const [cameraError, setCameraError] = useState("");
  const [selectedScan, setSelectedScan] = useState<DueScan | null>(null);
  const [settings, setSettings] = useState({ partial: true, confirm: true, sound: true, autoFocus: true });
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
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
  const [stock, setStock] = useState<StockPayload>({ parts: [], tags: [], allocations: [], picks: [], dispatchLinks: [], jobClosures: [], manualReceipts: [], countAdjustments: [], countAdjustmentLines: [] });
  const [manualStockForm, setManualStockForm] = useState({ materialCode: "", qty: "", jobNo: "", productionDate: new Date().toISOString().slice(0, 10), referenceNo: "", note: "" });
  const [stockCountForm, setStockCountForm] = useState({ materialCode: "", countedQty: "", countDate: new Date().toISOString().slice(0, 10), reason: "" });
  const [stockCountPreview, setStockCountPreview] = useState<StockCountPreview | null>(null);
  const [stockManagementSaving, setStockManagementSaving] = useState(false);
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
  const [jobCloseSearch, setJobCloseSearch] = useState("");
  const [jobClosePage, setJobClosePage] = useState(1);
  const [stockLoading, setStockLoading] = useState(false);
  const [clearingTestStock, setClearingTestStock] = useState(false);
  const [stockPartForm, setStockPartForm] = useState({ materialCode: "", partName: "", customer: "", location: "", standardQty: "" });
  const [partSearch, setPartSearch] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyType, setHistoryType] = useState("all");
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
  const [stockSaving, setStockSaving] = useState(false);
  const [createdStockTags, setCreatedStockTags] = useState<StockTag[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const partFileInput = useRef<HTMLInputElement>(null);
  const partBundleExcelInput = useRef<HTMLInputElement>(null);
  const partBundleMasterInput = useRef<HTMLInputElement>(null);
  const partBundleActualInput = useRef<HTMLInputElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tagResultRef = useRef<HTMLElement>(null);
  const verifyInput = useRef<HTMLInputElement>(null);
  const verifyResultRef = useRef<HTMLElement>(null);
  const canPrintTags = user.role === "admin" || user.permissions?.includes("tags");
  const allowedPages = useMemo(() => new Set<PageKey>(
    user.role === "admin" ? NAV.map((item) => item.key) : user.permissions,
  ), [user.permissions, user.role]);
  const firstAllowedPage = NAV.find((item) => allowedPages.has(item.key))?.key || "dashboard";
  const workflowPage: PageKey | null = allowedPages.has("dispatch")
    ? "dispatch"
    : allowedPages.has("arrange") ? "arrange" : null;

  const restoredPageRef = useRef(false);
  useEffect(() => {
    if (restoredPageRef.current) return;
    restoredPageRef.current = true;
    const savedPage = pageFromLocation();
    const nextPage = savedPage && allowedPages.has(savedPage) ? savedPage : firstAllowedPage;
    setPage(nextPage);
    updatePageLocation(nextPage, "replace");
  }, [allowedPages, firstAllowedPage]);

  useEffect(() => {
    const onHistoryChange = () => {
      const requestedPage = pageFromUrl();
      const nextPage = requestedPage && allowedPages.has(requestedPage) ? requestedPage : firstAllowedPage;
      window.localStorage.setItem("kit-current-page", nextPage);
      setPage(nextPage);
      if (nextPage === "users") void loadUsers();
      if (nextPage === "parts" || nextPage === "settings") void loadPartImages();
      setMenuOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onHistoryChange);
    return () => window.removeEventListener("popstate", onHistoryChange);
  }, [allowedPages, firstAllowedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDue() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/due", { cache: "no-store" });
      const data = await response.json() as DuePayload;
      if (!response.ok) throw new Error(data.error || "โหลดข้อมูล Due ไม่สำเร็จ");
      setPayload(data);
      if (!filterDate && data.dues.length) {
        const dates = [...new Set(data.dues.map((due) => due.deliveryDate))].sort();
        const today = new Date().toISOString().slice(0, 10);
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
        countAdjustmentLines: data.countAdjustmentLines || [],
      });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลด Stock ไม่สำเร็จ" });
    } finally {
      setStockLoading(false);
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
    if (!["stock", "parts", "tags", "arrange", "replacement", "dispatch", "reports", "history"].includes(page)) return;
    const timer = window.setTimeout(() => void loadStock(), 0);
    return () => window.clearTimeout(timer);
  }, [page]);

  useEffect(() => {
    if (page !== "replacement") return;
    const timer = window.setTimeout(() => void loadReplacements(), 0);
    return () => window.clearTimeout(timer);
  }, [page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("kit-due-settings");
      if (stored) {
        try { setSettings(JSON.parse(stored)); } catch { /* use defaults */ }
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
        body: JSON.stringify(userForm),
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
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    async function start() {
      try {
        setCameraError("");
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("อุปกรณ์นี้ไม่รองรับการเปิดกล้อง");
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
        if (!Detector) throw new Error("เบราว์เซอร์นี้ยังไม่รองรับ QR ผ่านกล้อง กรุณาใช้เครื่องยิงหรือ Chrome บน Android");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!videoRef.current || stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ["qr_code"] });
        const detect = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue;
            if (value) {
              setCameraOpen(false);
              if (cameraPurpose === "stock") {
                setStockScan(value);
                void receiveStockTag(value);
                return;
              }
              if (page === "verify") {
                setVerifyRaw(value);
                setVerifyResult(null);
                void verifyTag(value);
                return;
              }
              const arrangeMode = page === "arrange";
              if (arrangeMode) {
                setArrangeTag(value);
                setArrangementPreview(null);
                void stageStockTag(value);
              } else {
                setRawTag(value);
                setTagPreview(null);
                void previewDispatchTag(value);
              }
              return;
            }
          } catch { /* keep scanning */ }
          timer = window.setTimeout(detect, 350);
        };
        void detect();
      } catch (caught) {
        setCameraError(caught instanceof Error ? caught.message : "เปิดกล้องไม่สำเร็จ");
      }
    }
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOpen, cameraPurpose, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const scannerPage = page === "stock" || page === "dispatch" || page === "replacement";
    if (!scannerPage || stockReceivePreview || dispatchConfirmation || replacementPreview || cameraOpen) return;
    const activeInput = page === "stock" ? stockScanInputRef.current : page === "replacement" ? replacementInputRef.current : tagInput.current;
    const focusTimer = window.setTimeout(() => activeInput?.focus(), 80);
    const submitBuffer = () => {
      const value = hardwareScanBufferRef.current.trim();
      hardwareScanBufferRef.current = "";
      if (hardwareScanTimerRef.current !== null) window.clearTimeout(hardwareScanTimerRef.current);
      hardwareScanTimerRef.current = null;
      if (value.length < 4) return;
      if (page === "stock") {
        setStockScan(value);
        void receiveStockTag(value);
      } else if (page === "replacement") {
        setReplacementTag(value);
        void previewReplacementIssue(value);
      } else {
        setRawTag(value);
        setTagPreview(null);
        void previewDispatchTag(value);
      }
    };
    const onScannerKey = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target === activeInput || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      if (event.key === "Enter" || event.key === "Tab") {
        if (hardwareScanBufferRef.current) {
          event.preventDefault();
          submitBuffer();
        }
        return;
      }
      if (event.key.length !== 1) return;
      const now = Date.now();
      if (now - hardwareScanLastKeyRef.current > 400) hardwareScanBufferRef.current = "";
      hardwareScanLastKeyRef.current = now;
      hardwareScanBufferRef.current += event.key;
      if (hardwareScanTimerRef.current !== null) window.clearTimeout(hardwareScanTimerRef.current);
      hardwareScanTimerRef.current = window.setTimeout(submitBuffer, 320);
    };
    document.addEventListener("keydown", onScannerKey);
    return () => {
      window.clearTimeout(focusTimer);
      if (hardwareScanTimerRef.current !== null) window.clearTimeout(hardwareScanTimerRef.current);
      hardwareScanBufferRef.current = "";
      document.removeEventListener("keydown", onScannerKey);
    };
  }, [page, stockReceivePreview, dispatchConfirmation, replacementPreview, cameraOpen, replacementSelectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function parseExcel(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreviewRows([]);
    setNotice(null);
    if (!selected) return;
    setParsing(true);
    try {
      if (!/\.xlsx?$/i.test(selected.name)) throw new Error("กรุณาเลือกไฟล์ Excel .xlsx หรือ .xls");
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(await selected.arrayBuffer(), { type: "array", cellDates: true });
      const normalized = (value: unknown) => text(value).toLowerCase().replace(/[\s._/()\-]+/g, "");
      const fileDateMatch = selected.name.match(/(?:^|\D)(\d{1,2})[-_/](\d{1,2})[-_/](\d{2,4})(?:\D|$)/);
      const normalizeDueDate = (value: unknown) => {
        if (value instanceof Date && fileDateMatch) {
          const fileDay = Number(fileDateMatch[1]);
          const fileMonth = Number(fileDateMatch[2]);
          const rawYear = Number(fileDateMatch[3]);
          const fileYear = rawYear < 100 ? 2000 + rawYear : rawYear;
          const excelMonth = value.getMonth() + 1;
          const excelDay = value.getDate();
          const likelySwapped = value.getFullYear() === fileYear
            && excelDay === fileMonth
            && excelMonth !== fileMonth
            && Math.abs(excelMonth - fileDay) <= 7;
          if (likelySwapped) {
            return `${fileYear}-${String(fileMonth).padStart(2, "0")}-${String(excelMonth).padStart(2, "0")}`;
          }
        }
        return normalizeDate(value, xlsx);
      };
      // ไฟล์ FAC บางฉบับเก็บวันที่จริงใน Excel เป็นเดือน/วัน แต่จัดรูปแบบบนหัวชีตเป็นวัน-เดือน
      // เช่นค่าภายใน 9 ม.ค. แสดงเป็น 01-09-26 ซึ่งผู้ใช้หมายถึง 1 ก.ย.
      // จึงยึดข้อความที่ Excel แสดงใน A2 แทน Date object ภายใน
      const normalizeDisplayedDueDate = (value: unknown) => {
        const match = text(value).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
        if (!match) return "";
        const rawYear = Number(match[3]);
        const year = rawYear > 2400 ? rawYear - 543 : rawYear < 100 ? rawYear + 2000 : rawYear;
        return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      };
      const valueAt = (row: unknown[], headers: string[], aliases: string[]) => {
        const index = headers.findIndex((header) => aliases.includes(header));
        return index >= 0 ? row[index] : "";
      };
      const alias = {
        material: ["materialcode", "materialno", "partno", "itemno"],
        qty: ["reqqty", "dueqty", "quantity", "qty"],
        description: ["materialdescription", "description", "partname"],
        doNo: ["deliveryorderno", "dono", "pono", "ordernumber"],
        doSubGroup: ["dosubgroup"],
        seq: ["seq", "poitem", "item"],
        date: ["deliverydate", "duedate"],
        time: ["deliverytime", "duetime"],
        fact: ["fact", "factory", "fac"],
        line: ["line"],
        shop: ["shop", "deliveryspot"],
        site: ["site"],
      };
      const candidates: Array<{ sheetName: string; rows: ImportRow[] }> = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
        const isTimeSheet = /^\d{1,2}[.:]\d{2}(?:\s|$)/.test(sheetName.trim());
        const isMcpSheet = /^mcp\s*site\s*[12](?:\s|$)/i.test(sheetName.trim());
        // แบบฟอร์ม MCP รวมชื่อ Site, วันที่ และรอบเวลาไว้ในหัวด้านบน (เซลล์ merged เช่น B1)
        // จึงอ่านข้อความจาก 6 แถวแรกและใช้วันที่/เวลานี้กับทุกรายการในชีต
        const mcpHeader = isMcpSheet
          ? grid.slice(0, 6).flat().map((value) => text(value)).filter(Boolean).join(" ")
          : "";
        const mcpDateMatch = mcpHeader.match(/(?:^|\s)(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?=\s|$)/);
        const mcpTimeMatch = mcpHeader.match(/รอบ\s*(\d{1,2})[.:](\d{2})/i);
        const mcpHeaderDate = mcpDateMatch
          ? (() => {
              const rawYear = Number(mcpDateMatch[3]);
              const year = rawYear > 2400 ? rawYear - 543 : rawYear < 100 ? rawYear + 2000 : rawYear;
              return `${year}-${mcpDateMatch[2].padStart(2, "0")}-${mcpDateMatch[1].padStart(2, "0")}`;
            })()
          : "";
        const mcpHeaderTime = mcpTimeMatch
          ? `${mcpTimeMatch[1].padStart(2, "0")}:${mcpTimeMatch[2]}`
          : "";
        const displayedSheetDate = normalizeDisplayedDueDate(sheet["A2"]?.w);
        const sheetDeliveryDate = isTimeSheet
          ? displayedSheetDate || normalizeDueDate(grid[1]?.[0])
          : isMcpSheet ? mcpHeaderDate : "";
        const sheetDeliveryTime = isTimeSheet
          ? normalizeTime(grid[1]?.[1])
          : isMcpSheet ? mcpHeaderTime : "";
        let activeHeaders: string[] = [];
        const parsedRows: ImportRow[] = [];

        for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
          const row = grid[rowIndex];
          const normalizedRow = row.map(normalized);
          const hasMaterial = normalizedRow.some((header) => alias.material.includes(header));
          const hasQty = normalizedRow.some((header) => alias.qty.includes(header));
          if (hasMaterial && hasQty) {
            activeHeaders = normalizedRow;
            continue;
          }
          if (!activeHeaders.length) continue;

          const materialCode = text(valueAt(row, activeHeaders, alias.material)).toUpperCase();
          const reqQty = number(valueAt(row, activeHeaders, alias.qty));
          if (!materialCode || materialCode === "ITEM NO." || materialCode.includes("ผลรวม") || reqQty <= 0) continue;

          const doSubGroup = text(valueAt(row, activeHeaders, alias.doSubGroup));
          const doRaw = doSubGroup.split("|")[0] || text(valueAt(row, activeHeaders, alias.doNo));
          const doNo = doRaw.toUpperCase();
          const seq = number(valueAt(row, activeHeaders, alias.seq)) || rowIndex + 1;
          const rowDeliveryDate = normalizeDueDate(valueAt(row, activeHeaders, alias.date));
          const suppliedTime = normalizeTime(valueAt(row, activeHeaders, alias.time));
          const deliveryDate = sheetDeliveryDate || rowDeliveryDate;
          const deliveryTime = sheetDeliveryTime || suppliedTime || "09:00";
          const deliverySpot = text(valueAt(row, activeHeaders, alias.shop)).toUpperCase();
          const filenameSite = selected.name.match(/SITE\s*([1-9])/i)?.[1] || "";
          const spotFactory = deliverySpot.match(/(?:^|[-_ ])F(?:AC)?\s*([1-9])(?:$|[-_ ])/i)?.[1] || "";
          const factRaw = text(valueAt(row, activeHeaders, alias.fact)).toUpperCase();
          const fact = factRaw || (spotFactory ? `FAC${spotFactory}` : filenameSite ? `FAC${filenameSite}` : "FAC1");
          const line = text(valueAt(row, activeHeaders, alias.line)).toUpperCase();
          const shop = deliverySpot;
          const siteRaw = text(valueAt(row, activeHeaders, alias.site)).toUpperCase();
          const site = siteRaw || (/MCP/i.test(selected.name) ? "MCP" : deliverySpot);
          if (!doNo || !deliveryDate) continue;

          const baseKey = [doNo, materialCode, seq, deliveryDate, deliveryTime, fact, line, shop].join("|");
          parsedRows.push({
            sourceKey: `${baseKey}|SHEET:${sheetName.trim().toUpperCase()}|ROW:${rowIndex + 1}`,
            doNo, seq, materialCode,
            materialDescription: text(valueAt(row, activeHeaders, alias.description)),
            site, fact, line, shop, reqQty, deliveryDate, deliveryTime,
          });
        }
        if (parsedRows.length) candidates.push({ sheetName, rows: parsedRows });
      }

      // ไฟล์ MCP ใช้ชีต MCP site1/site2 เป็นข้อมูลหลัก
      // ไฟล์ FAC รวมใช้ทุกชีตรอบเวลา และไม่อ่าน Sheet1/vlookup/รอบเช้าเพื่อป้องกันข้อมูลซ้ำ
      const mcpSheets = candidates.filter((candidate) => /^mcp\s*site\s*[12](?:\s|$)/i.test(candidate.sheetName.trim()));
      const timeSheets = candidates.filter((candidate) => /^\d{1,2}[.:]\d{2}(?:\s|$)/.test(candidate.sheetName.trim()));
      const selectedSheets = mcpSheets.length
        ? mcpSheets
        : timeSheets.length
          ? timeSheets
          : candidates.sort((left, right) => right.rows.length - left.rows.length).slice(0, 1);
      const rows = selectedSheets.flatMap((candidate) => candidate.rows);
      if (!rows.length) throw new Error("ไม่พบรายการ Due ที่ใช้งานได้ กรุณาตรวจสอบว่ามี Item No./Material Code, Due Qty/Req. Qty และวันที่ส่งงาน");
      setPreviewRows(rows);
      setNotice({ type: "success", text: `อ่านจากชีต ${selectedSheets.map((item) => item.sheetName.trim()).join(", ")} สำเร็จ ${fmt(rows.length)} รายการ รวม ${fmt(rows.reduce((sum, row) => sum + row.reqQty, 0))} ชิ้น` });
    } catch (caught) {
      setFile(null);
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "อ่านไฟล์ Excel ไม่สำเร็จ" });
    } finally {
      setParsing(false);
    }
  }

  async function importExcel() {
    if (!file || !previewRows.length) return;
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/due-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importToken: `${file.name}|${file.size}|${file.lastModified}`, fileName: file.name, rows: previewRows }),
      });
      const result = await response.json() as { error?: string; rowCount?: number; totalQty?: number };
      if (!response.ok) throw new Error(result.error || "นำเข้าไฟล์ไม่สำเร็จ");
      setFile(null);
      setPreviewRows([]);
      setFilterDate("");
      setFilterFact("ALL");
      setFilterTime("ALL");
      setQuery("");
      setPlanPage(1);
      if (fileInput.current) fileInput.current.value = "";
      setNotice({ type: "success", text: `นำเข้า Due สำเร็จ ${fmt(result.rowCount || 0)} รายการ รวม ${fmt(result.totalQty || 0)} ชิ้น · แสดงรายการทั้งหมดแล้ว` });
      await loadDue();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "นำเข้าไฟล์ไม่สำเร็จ" });
    } finally {
      setImporting(false);
    }
  }

  async function deleteImport(item: DueImport, confirmActivity = false) {
    if (!confirmActivity && !window.confirm(`ลบข้อมูลที่นำเข้าจากไฟล์ ${item.fileName} จำนวน ${fmt(item.rowCount)} รายการ ใช่หรือไม่?`)) return;
    setDeletingImportId(item.id);
    setNotice(null);
    try {
      const response = await fetch("/api/due-import", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, confirmActivity }),
      });
      const data = await response.json() as { error?: string; requiresConfirmation?: boolean; scanCount?: number; receiptCount?: number; stockCount?: number };
      if (response.status === 409 && data.requiresConfirmation) {
        const confirmed = window.confirm(`คำเตือน: ชุดนี้มีประวัติจัดงาน ${fmt(data.receiptCount || 0)} รายการ ส่งออก ${fmt(data.scanCount || 0)} รายการ และเชื่อม Stock ${fmt(data.stockCount || 0)} รายการ\n\nหากลบ ระบบจะคืน Stock ที่ขายออกจากชุดนี้และลบประวัติที่เกี่ยวข้อง ต้องการดำเนินการต่อหรือไม่?`);
        if (confirmed) { await deleteImport(item, true); return; }
        return;
      }
      if (!response.ok) throw new Error(data.error || "ลบข้อมูลนำเข้าไม่สำเร็จ");
      setNotice({ type: "success", text: `ลบข้อมูลจาก ${item.fileName} แล้ว ${fmt(item.rowCount)} รายการ` });
      await loadDue();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ลบข้อมูลนำเข้าไม่สำเร็จ" });
    } finally {
      setDeletingImportId(null);
    }
  }

  function updateDispatchScannerValue(value: string) {
    setRawTag(value);
    setTagPreview(null);
    setDispatchConfirmation(null);
    if (dispatchScanTimerRef.current !== null) window.clearTimeout(dispatchScanTimerRef.current);
    if (value.trim().length < 4) return;
    dispatchScanTimerRef.current = window.setTimeout(() => {
      dispatchScanTimerRef.current = null;
      void previewDispatchTag(value);
    }, 320);
  }

  async function previewDispatchTag(value?: string | FormEvent) {
    const event = typeof value === "object" ? value : undefined;
    event?.preventDefault();
    if (dispatchScanTimerRef.current !== null) {
      window.clearTimeout(dispatchScanTimerRef.current);
      dispatchScanTimerRef.current = null;
    }
    const scannedValue = typeof value === "string" ? value.trim() : rawTag.trim();
    if (!scannedValue || dispatchScanRequestRef.current) return;
    dispatchScanRequestRef.current = true;
    setCheckingTag(true);
    setDispatchConfirmation(null);
    setTagPreview(null);
    setNotice(null);
    try {
      const response = await fetch("/api/due", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawPayload: scannedValue, mode: "verify" }),
      });
      const result = await response.json() as VerifyResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "ตรวจสอบ Tag ไม่สำเร็จ");
      setRawTag(scannedValue);
      setDispatchConfirmation(result);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ตรวจสอบ Tag ไม่สำเร็จ" });
    } finally {
      dispatchScanRequestRef.current = false;
      setCheckingTag(false);
    }
  }

  async function confirmDispatch() {
    const rawPayload = dispatchConfirmation?.tag?.rawPayload;
    if (!rawPayload || checkingTag) return;
    setDispatchConfirmation(null);
    await processTag(rawPayload);
  }

  async function processTag(value?: string | FormEvent) {
    const event = typeof value === "object" ? value : undefined;
    event?.preventDefault();
    const scannedValue = typeof value === "string" ? value.trim() : rawTag.trim();
    if (!scannedValue || checkingTag) return;
    setCheckingTag(true);
    setTagPreview(null);
    setNotice(null);
    try {
      const response = await fetch("/api/due", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawPayload: scannedValue }),
      });
      const result = await response.json() as TagPreview & { action?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึก Tag ไม่สำเร็จ");
      setTagPreview(result);
      setRawTag("");
      setNotice({ type: "success", text: `ขายออก ตัด Stock และ Due ${result.due.materialCode} สำเร็จ เหลือ Due ${fmt(result.due.remainingAfter)} ชิ้น` });
      await Promise.all([loadDue(), loadStock()]);
      window.setTimeout(() => {
        if (window.matchMedia("(max-width: 720px)").matches) tagResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        else tagInput.current?.focus();
      }, 120);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "บันทึก Tag ไม่สำเร็จ" });
    } finally {
      setCheckingTag(false);
    }
  }

  async function verifyTag(value?: string | FormEvent) {
    const event = typeof value === "object" ? value : undefined;
    event?.preventDefault();
    const scannedValue = typeof value === "string" ? value.trim() : verifyRaw.trim();
    if (!scannedValue || verifyLoading) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    setNotice(null);
    try {
      const response = await fetch("/api/due", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawPayload: scannedValue, mode: "verify" }),
      });
      const result = await response.json() as VerifyResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "ตรวจสอบชิ้นงานไม่สำเร็จ");
      setVerifyResult(result);
      window.setTimeout(() => {
        if (window.matchMedia("(max-width: 720px)").matches) verifyResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        else verifyInput.current?.focus();
      }, 120);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ตรวจสอบชิ้นงานไม่สำเร็จ" });
    } finally {
      setVerifyLoading(false);
    }
  }

  function goDispatchFromVerify() {
    if (!verifyResult?.tag) return;
    setRawTag(verifyResult.tag.rawPayload);
    setTagPreview(null);
    go("dispatch");
  }

  async function stageStockTag(value?: string | FormEvent) {
    const event = typeof value === "object" ? value : undefined;
    event?.preventDefault();
    const scannedValue = typeof value === "string" ? value.trim() : arrangeTag.trim();
    if (!effectiveArrangeDueId || !scannedValue || checkingTag) return;
    setCheckingTag(true);
    setArrangementPreview(null);
    setNotice(null);
    try {
      const response = await fetch("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          dueLineId: Number(effectiveArrangeDueId),
          rawPayload: scannedValue,
          qty: Number(arrangeQty || 0),
        }),
      });
      const result = await response.json() as ArrangementPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || "จัดงานไม่สำเร็จ");
      setArrangementPreview(result);
      setArrangeTag("");
      setArrangeQty("");
      setNotice({
        type: "success",
        text: `จัด ${fmt(result.pick.pickedQty)} ชิ้นจาก Job ${result.tag.jobNo} รอขายออก — ยังไม่ตัด Stock และ Due`,
      });
      await Promise.all([loadDue(), loadStock()]);
      window.setTimeout(() => {
        if (window.matchMedia("(max-width: 720px)").matches) tagResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        else tagInput.current?.focus();
      }, 120);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "จัดงานไม่สำเร็จ" });
    } finally {
      setCheckingTag(false);
    }
  }


  async function saveManualStockReceipt(event: FormEvent) {
    event.preventDefault();
    if (stockManagementSaving) return;
    setStockManagementSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "manual_receive", ...manualStockForm, qty: Number(manualStockForm.qty || 0) }),
      });
      const data = await response.json() as { tag?: StockTag; error?: string };
      if (!response.ok) throw new Error(data.error || "คีย์รับงานเข้า Stock ไม่สำเร็จ");
      setManualStockForm((current) => ({ ...current, materialCode: "", qty: "", jobNo: "", referenceNo: "", note: "" }));
      setNotice({ type: "success", text: `รับเข้า Stock แบบคีย์เอง ${fmt(Number(data.tag?.qty || 0))} ชิ้น · สร้าง KIT Tag ${data.tag?.tagId || ""} แล้ว` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "คีย์รับงานเข้า Stock ไม่สำเร็จ" });
    } finally {
      setStockManagementSaving(false);
    }
  }

  async function previewStockCount(event: FormEvent) {
    event.preventDefault();
    if (stockManagementSaving) return;
    setStockManagementSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview_stock_count", ...stockCountForm, countedQty: Number(stockCountForm.countedQty) }),
      });
      const data = await response.json() as StockCountPreview & { error?: string };
      if (!response.ok) throw new Error(data.error || "ตรวจสอบยอด Stock ไม่สำเร็จ");
      setStockCountPreview(data);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ตรวจสอบยอด Stock ไม่สำเร็จ" });
    } finally {
      setStockManagementSaving(false);
    }
  }

  async function confirmStockCountAdjustment() {
    if (!stockCountPreview || stockManagementSaving) return;
    setStockManagementSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm_stock_count", ...stockCountForm, countedQty: Number(stockCountForm.countedQty) }),
      });
      const data = await response.json() as { adjustmentNo?: string; difference?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "ปรับยอด Stock ไม่สำเร็จ");
      setStockCountPreview(null);
      setStockCountForm((current) => ({ ...current, materialCode: "", countedQty: "", reason: "" }));
      const difference = Number(data.difference || 0);
      setNotice({ type: "success", text: `บันทึกยอดตรวจนับแล้ว ${data.adjustmentNo || ""} · ${difference > 0 ? "เพิ่ม" : difference < 0 ? "ตัด" : "ยอดตรง"} ${fmt(Math.abs(difference))} ชิ้น` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ปรับยอด Stock ไม่สำเร็จ" });
    } finally {
      setStockManagementSaving(false);
    }
  }

  async function saveStockPart(event: FormEvent) {
    event.preventDefault();
    setStockSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_part", ...stockPartForm, standardQty: Number(stockPartForm.standardQty || 0) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "บันทึก Part ไม่สำเร็จ");
      const savedCode = stockPartForm.materialCode.trim().toUpperCase();
      if (partImageFile) {
        const form = new FormData();
        form.set("materialCode", savedCode);
        form.set("image", partImageFile);
        const imageResponse = await fetch("/api/part-images", { method: "POST", body: form });
        const imageData = await imageResponse.json() as { error?: string };
        if (!imageResponse.ok) throw new Error(imageData.error || "บันทึก Part สำเร็จ แต่บันทึกรูปไม่สำเร็จ");
      }
      if (partActualImageFile) {
        const form = new FormData();
        form.set("materialCode", savedCode);
        form.set("slot", "actual");
        form.set("image", partActualImageFile);
        const imageResponse = await fetch("/api/part-images", { method: "POST", body: form });
        const imageData = await imageResponse.json() as { error?: string };
        if (!imageResponse.ok) throw new Error(imageData.error || "บันทึก Part สำเร็จ แต่บันทึกรูปชิ้นงานในกล่องไม่สำเร็จ");
      }
      const savedAnyImage = Boolean(partImageFile || partActualImageFile);
      setStockPartForm({ materialCode: "", partName: "", customer: "", location: "", standardQty: "" });
      setPartImageCode("");
      setPartImageFile(null);
      setPartActualImageFile(null);
      setNotice({ type: "success", text: savedAnyImage ? "บันทึกข้อมูลและรูปชิ้นงานแล้ว" : "บันทึก Part ในทะเบียน Stock แล้ว" });
      await Promise.all([loadStock(), loadPartImages()]);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "บันทึก Part ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
    }
  }

  async function parsePartExcel(selected: File): Promise<PartImportItem[]> {
    if (!/\.xlsx?$/i.test(selected.name)) throw new Error("กรุณาเลือกไฟล์ Excel .xlsx หรือ .xls");
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(await selected.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const normalized = (value: unknown) => text(value).toLowerCase().replace(/[\s._/()\-]+/g, "");
    const aliases = {
      materialCode: ["partno", "material", "materialno", "materialcode", "partmaterialno", "itemno", "itemnumber", "รหัสpart", "พาร์ท", "รหัสชิ้นงาน"],
      partName: ["partname", "materialdescription", "description", "itemname", "ชื่อชิ้นงาน", "รายละเอียด"],
      customer: ["customer", "customername", "ลูกค้า"],
      location: ["location", "locationcode", "storage", "bin", "rack", "โลเคชั่น", "ตำแหน่งจัดเก็บ", "สถานที่จัดเก็บ"],
      standardQty: ["maxqtyperbox", "maxperbox", "packqty", "standardqty", "qtyperbox", "จำนวนสูงสุดต่อกล่อง", "ชิ้นต่อกล่อง", "จำนวนต่อกล่อง"],
    };
    const normalizedAliases = Object.fromEntries(
      Object.entries(aliases).map(([key, values]) => [key, values.map(normalized)]),
    ) as Record<keyof typeof aliases, string[]>;
    const headerIndex = grid.findIndex((row) => {
      const headers = row.map(normalized);
      return normalizedAliases.materialCode.some((name) => headers.includes(name))
        && normalizedAliases.partName.some((name) => headers.includes(name));
    });
    if (headerIndex < 0) throw new Error("ไม่พบหัวตาราง Part / Material No. (หรือ Item No.) และ Part Name ในไฟล์");
    const headers = grid[headerIndex].map(normalized);
    const columnIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));
    const indexes = {
      materialCode: columnIndex(normalizedAliases.materialCode),
      partName: columnIndex(normalizedAliases.partName),
      customer: columnIndex(normalizedAliases.customer),
      location: columnIndex(normalizedAliases.location),
      standardQty: columnIndex(normalizedAliases.standardQty),
    };
    if (indexes.standardQty < 0) throw new Error("ไม่พบคอลัมน์ Max Qty per Box / จำนวนสูงสุดต่อกล่อง");
    const byCode = new Map<string, PartImportItem>();
    for (const row of grid.slice(headerIndex + 1)) {
      const part = {
        materialCode: text(row[indexes.materialCode]).toUpperCase(),
        partName: text(row[indexes.partName]),
        customer: indexes.customer >= 0 ? text(row[indexes.customer]) : "",
        location: indexes.location >= 0 ? text(row[indexes.location]).toUpperCase() : "",
        standardQty: number(row[indexes.standardQty]),
      };
      if (part.materialCode && part.partName && part.standardQty > 0) byCode.set(part.materialCode, part);
    }
    const parts = [...byCode.values()];
    if (!parts.length) throw new Error("ไม่พบข้อมูล Part ที่มี Part No., Part Name และจำนวนต่อกล่องครบถ้วน");
    return parts;
  }

  async function downloadPartWorkbook(mode: "template" | "export") {
    try {
      const xlsx = await import("xlsx");
      const headers = ["Part / Material No.", "Part Name", "Customer", "Location", "Max Qty per Box"];
      const rows = mode === "export"
        ? stock.parts.map((part) => [part.materialCode, part.partName, part.customer, part.location, part.standardQty])
        : [];
      const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
      worksheet["!cols"] = [{ wch: 24 }, { wch: 36 }, { wch: 24 }, { wch: 20 }, { wch: 20 }];
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Parts");
      const fileName = mode === "template"
        ? "KIT-Part-Import-Template.xlsx"
        : `KIT-Part-Registry-${new Date().toISOString().slice(0, 10)}.xlsx`;
      xlsx.writeFile(workbook, fileName);
      setNotice({ type: "success", text: mode === "template" ? "ดาวน์โหลด Template ทะเบียน Part แล้ว" : `ดาวน์โหลดข้อมูล Part ${fmt(rows.length)} รายการแล้ว` });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ดาวน์โหลดไฟล์ Part ไม่สำเร็จ" });
    }
  }

  async function importPartExcel(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setStockSaving(true);
    setNotice(null);
    try {
      const parts = await parsePartExcel(selected);
      const response = await fetch("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import_parts", parts }),
      });
      const data = await response.json() as { imported?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "นำเข้า Part ไม่สำเร็จ");
      setNotice({ type: "success", text: `นำเข้า/อัปเดต Part จาก ${selected.name} สำเร็จ ${fmt(data.imported || 0)} รายการ` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "นำเข้า Part ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
      if (partFileInput.current) partFileInput.current.value = "";
    }
  }

  function matchBundleImages(files: File[], parts: PartImportItem[]) {
    const codes = parts.map((part) => part.materialCode).sort((a, b) => b.length - a.length);
    const matched = new Map<string, File>();
    const unmatched: string[] = [];
    const duplicates: string[] = [];
    for (const file of files) {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > 5 * 1024 * 1024) {
        unmatched.push(`${file.name} — รองรับ JPG, PNG, WebP ขนาดไม่เกิน 5MB`);
        continue;
      }
      const stem = materialCodeFromFileName(file.name);
      const code = codes.find((item) => stem === item || stem.startsWith(`${item}_`) || stem.startsWith(`${item}-MASTER`) || stem.startsWith(`${item}-ACTUAL`) || stem.startsWith(`${item}-BOX`) || stem.startsWith(`${item}-SAMPLE`));
      if (!code) {
        unmatched.push(`${file.name} — ไม่พบ Part No. ที่ตรงกันใน Excel`);
        continue;
      }
      const previous = matched.get(code);
      if (previous) {
        duplicates.push(`${code}: ${previous.name}, ${file.name}`);
        continue;
      }
      matched.set(code, file);
    }
    return { matched, unmatched, duplicates };
  }

  async function previewPartBundle(event: FormEvent) {
    event.preventDefault();
    setPartBundleFailed([]);
    setNotice(null);
    try {
      if (!partBundleExcel) throw new Error("กรุณาเลือกไฟล์ Excel ทะเบียน Part");
      const parts = await parsePartExcel(partBundleExcel);
      const master = matchBundleImages(partBundleMasterFiles, parts);
      const actual = matchBundleImages(partBundleActualFiles, parts);
      setPartBundlePreview({
        fileName: partBundleExcel.name,
        rows: parts.map((part) => ({ part, masterFile: master.matched.get(part.materialCode), actualFile: actual.matched.get(part.materialCode) })),
        unmatchedMaster: master.unmatched,
        unmatchedActual: actual.unmatched,
        duplicateImages: [...master.duplicates.map((item) => `รูปตัวอย่าง · ${item}`), ...actual.duplicates.map((item) => `รูปในกล่อง · ${item}`)],
      });
    } catch (caught) {
      setPartBundlePreview(null);
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ตรวจสอบไฟล์ไม่สำเร็จ" });
    }
  }

  function resetPartBundle() {
    setPartBundleExcel(null);
    setPartBundleMasterFiles([]);
    setPartBundleActualFiles([]);
    setPartBundlePreview(null);
    setPartBundleFailed([]);
    setPartBundleProgress({ done: 0, total: 0 });
    if (partBundleExcelInput.current) partBundleExcelInput.current.value = "";
    if (partBundleMasterInput.current) partBundleMasterInput.current.value = "";
    if (partBundleActualInput.current) partBundleActualInput.current.value = "";
  }

  async function importPartBundle() {
    if (!partBundlePreview || partBundleRunning) return;
    setPartBundleRunning(true);
    setPartBundleFailed([]);
    setNotice(null);
    const uploads = partBundlePreview.rows.flatMap((row) => [
      ...(row.masterFile ? [{ materialCode: row.part.materialCode, file: row.masterFile, slot: "master" as const }] : []),
      ...(row.actualFile ? [{ materialCode: row.part.materialCode, file: row.actualFile, slot: "actual" as const }] : []),
    ]);
    setPartBundleProgress({ done: 0, total: uploads.length + 1 });
    try {
      const response = await fetch("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import_parts", parts: partBundlePreview.rows.map((row) => row.part) }),
      });
      const data = await response.json() as { imported?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "นำเข้าทะเบียน Part ไม่สำเร็จ");
      setPartBundleProgress({ done: 1, total: uploads.length + 1 });
      const failed: Array<{ name: string; reason: string }> = [];
      for (const [index, upload] of uploads.entries()) {
        try {
          const form = new FormData();
          form.set("materialCode", upload.materialCode);
          form.set("slot", upload.slot);
          form.set("image", upload.file);
          const imageResponse = await fetch("/api/part-images", { method: "POST", body: form });
          const imageData = await imageResponse.json() as { error?: string };
          if (!imageResponse.ok) throw new Error(imageData.error || "อัปโหลดรูปไม่สำเร็จ");
        } catch (caught) {
          failed.push({ name: `${upload.materialCode} · ${upload.file.name}`, reason: caught instanceof Error ? caught.message : "อัปโหลดรูปไม่สำเร็จ" });
        }
        setPartBundleProgress({ done: index + 2, total: uploads.length + 1 });
      }
      setPartBundleFailed(failed);
      await Promise.all([loadStock(), loadPartImages()]);
      if (failed.length) {
        setNotice({ type: "error", text: `บันทึก Part สำเร็จ ${fmt(data.imported || 0)} รายการ แต่อัปโหลดรูปไม่สำเร็จ ${fmt(failed.length)} รูป` });
      } else {
        setNotice({ type: "success", text: `นำเข้า Part ${fmt(data.imported || 0)} รายการ พร้อมรูป ${fmt(uploads.length)} รูปเรียบร้อย` });
        resetPartBundle();
      }
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "นำเข้า Part พร้อมรูปไม่สำเร็จ" });
    } finally {
      setPartBundleRunning(false);
    }
  }

  async function syncDueParts() {
    setStockSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync_due_parts" }),
      });
      const data = await response.json() as { changed?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "นำ Part จาก Due ไม่สำเร็จ");
      setNotice({ type: "success", text: `นำ Part จาก Due เข้าทะเบียนแล้ว ${fmt(data.changed || 0)} รายการ` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "นำ Part จาก Due ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
    }
  }

  async function deleteStockPart(part: StockPart) {
    if (!window.confirm(`ยืนยันลบ Part ${part.materialCode} · ${part.partName} หรือไม่?`)) return;
    setDeletingPartCode(part.materialCode);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_part", materialCode: part.materialCode }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ลบ Part ไม่สำเร็จ");
      setNotice({ type: "success", text: `ลบ Part ${part.materialCode} แล้ว` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ลบ Part ไม่สำเร็จ" });
    } finally {
      setDeletingPartCode("");
    }
  }

  async function deleteUnusedStockParts() {
    if (!window.confirm("ยืนยันลบ Part ทุกตัวที่ยังไม่เคยสร้าง Tag หรือมีประวัติ Stock หรือไม่?")) return;
    setDeletingPartCode("__ALL__");
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_unused_parts" }),
      });
      const data = await response.json() as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "ลบ Part ไม่สำเร็จ");
      setNotice({ type: "success", text: `ลบ Part ที่ยังไม่เคยใช้งานแล้ว ${fmt(data.deleted || 0)} รายการ` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ลบ Part ไม่สำเร็จ" });
    } finally {
      setDeletingPartCode("");
    }
  }

  async function createStockTag(event: FormEvent) {
    event.preventDefault();
    setStockSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_tag", ...stockTagForm, qty: Number(stockTagForm.qty) }),
      });
      const data = await response.json() as { tags?: StockTag[]; totalQty?: number; packQty?: number; boxCount?: number; error?: string };
      if (!response.ok || !data.tags?.length) throw new Error(data.error || "สร้าง Tag ไม่สำเร็จ");
      setCreatedStockTags(data.tags);
      setStockTagForm((current) => ({ ...current, qty: "", jobNo: "" }));
      const fullBoxes = Math.floor(Number(data.totalQty || 0) / Number(data.packQty || 1));
      const remainder = Number(data.totalQty || 0) % Number(data.packQty || 1);
      setNotice({
        type: "success",
        text: `สร้าง ${fmt(data.boxCount || data.tags.length)} Tag แล้ว · กล่องเต็ม ${fmt(fullBoxes)} กล่อง${remainder ? ` · เศษ 1 กล่อง ${fmt(remainder)} ชิ้น` : ""}`,
      });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "สร้าง Tag ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
    }
  }

  function updateStockScannerValue(value: string) {
    setStockScan(value);
    if (stockScanTimerRef.current !== null) window.clearTimeout(stockScanTimerRef.current);
    if (value.trim().length < 4) return;
    stockScanTimerRef.current = window.setTimeout(() => {
      stockScanTimerRef.current = null;
      void receiveStockTag(value);
    }, 320);
  }

  async function receiveStockTag(input: FormEvent | string) {
    if (typeof input !== "string") input.preventDefault();
    if (stockScanTimerRef.current !== null) {
      window.clearTimeout(stockScanTimerRef.current);
      stockScanTimerRef.current = null;
    }
    const rawPayload = (typeof input === "string" ? input : stockScan).trim();
    if (!rawPayload || stockScanRequestRef.current) return;
    stockScanRequestRef.current = true;
    setStockSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "receive", mode: "preview", rawPayload }),
      });
      const data = await response.json() as StockReceivePreview & { error?: string };
      if (!response.ok || !data.tag) throw new Error(data.error || "ตรวจสอบ Tag ไม่สำเร็จ");
      setStockScan(rawPayload);
      setStockReceiveQty(String(data.tag.qty));
      setStockReceivePreview(data);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ตรวจสอบ Tag ไม่สำเร็จ" });
    } finally {
      stockScanRequestRef.current = false;
      setStockSaving(false);
    }
  }

  async function confirmReceiveStockTag() {
    if (!stockReceivePreview || stockSaving) return;
    const receivedQty = Number(stockReceiveQty);
    const totalQty = Number(stockReceivePreview.tag.qty);
    if (!Number.isInteger(receivedQty) || receivedQty < 0 || receivedQty > totalQty) {
      setNotice({ type: "error", text: `จำนวนรับเข้าต้องอยู่ระหว่าง 0 ถึง ${fmt(totalQty)} ชิ้น` });
      return;
    }
    setStockSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "receive", rawPayload: stockReceivePreview.rawPayload, receivedQty }),
      });
      const data = await response.json() as { tag?: StockTag; receivedQty?: number; ngQty?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "รับเข้า Stock ไม่สำเร็จ");
      setStockScan("");
      setStockReceivePreview(null);
      setStockReceiveQty("");
      const ngQty = Number(data.ngQty || 0);
      setNotice({ type: "success", text: `รับ Tag ${data.tag?.tagId || ""} เข้า Stock ${fmt(Number(data.receivedQty || receivedQty))} ชิ้น${ngQty ? ` · NG ${fmt(ngQty)} ชิ้น` : ""}` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "รับเข้า Stock ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
    }
  }

  async function closeStockJob(jobNo: string, materialCode: string, totalQty: number, receivedQty: number, ngQty: number) {
    const reason = window.prompt("ระบุสาเหตุที่ปิดรับเข้าและตีงานคงเหลือเป็น NG", "รับเข้าไม่ครบตามจำนวน Tag");
    if (reason === null) return;
    if (!reason.trim()) return setNotice({ type: "error", text: "กรุณาระบุสาเหตุที่ปิดรับเข้า Job" });
    const confirmed = window.confirm(`ยืนยันปิดรับเข้า Job ${jobNo}\nPart ${materialCode}\n\nTag ทั้งหมด ${fmt(totalQty)} ชิ้น\nรับเข้าแล้ว ${fmt(receivedQty)} ชิ้น\nตีเป็น NG ${fmt(ngQty)} ชิ้น\n\nTag NG จะไม่สามารถรับเข้า Stock หรือจัดงานได้`);
    if (!confirmed) return;
    const key = jobNo + "|" + materialCode;
    setJobClosingKey(key);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "close_job", jobNo, materialCode, reason: reason.trim() }),
      });
      const data = await response.json() as { ngQty?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "ปิดรับเข้า Job ไม่สำเร็จ");
      setNotice({ type: "success", text: `ปิด Job ${jobNo} แล้ว · ตีเป็น NG ${fmt(Number(data.ngQty || ngQty))} ชิ้น` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ปิดรับเข้า Job ไม่สำเร็จ" });
    } finally {
      setJobClosingKey("");
    }
  }

  async function reopenNgStockJob(jobNo: string, materialCode: string, ngQty: number) {
    if (!window.confirm(`เปิดรับเข้า Job ${jobNo} คืนหรือไม่?\nTag NG ${fmt(ngQty)} ชิ้นจะกลับเป็นสถานะรอรับเข้า`)) return;
    const key = jobNo + "|" + materialCode;
    setJobClosingKey(key);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reopen_ng_job", jobNo, materialCode }),
      });
      const data = await response.json() as { reopenedTags?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "เปิด Job คืนไม่สำเร็จ");
      setNotice({ type: "success", text: `เปิด Job ${jobNo} คืนแล้ว ${fmt(Number(data.reopenedTags || 0))} Tag` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "เปิด Job คืนไม่สำเร็จ" });
    } finally {
      setJobClosingKey("");
    }
  }

  async function deleteStockTag(tag: StockTag) {
    if (!window.confirm(`ยืนยันลบ Tag ${tag.tagId}\nPart ${tag.materialCode} · Job ${tag.jobNo} หรือไม่?\n\nลบได้เฉพาะ Tag ที่ยังไม่เคยรับเข้า Stock เท่านั้น`)) return;
    setDeletingStockTagId(tag.tagId);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_tag", tagId: tag.tagId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ลบ Tag ไม่สำเร็จ");
      setCreatedStockTags((current) => current.filter((item) => item.tagId !== tag.tagId));
      setNotice({ type: "success", text: `ลบ Tag ${tag.tagId} แล้ว` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ลบ Tag ไม่สำเร็จ" });
    } finally {
      setDeletingStockTagId("");
    }
  }

  async function printStockTags(input: StockTag | StockTag[]) {
    const tags = Array.isArray(input) ? input : [input];
    if (!tags.length) return;
    const qrcode = await import("qrcode");
    const popup = window.open("", "_blank", "width=900,height=950");
    if (!popup) return setNotice({ type: "error", text: "เบราว์เซอร์บล็อกหน้าพิมพ์ กรุณาอนุญาต Pop-up" });
    let imageUrl = "";
    try {
      const imageResponse = await fetch(`/api/part-images?materialCode=${encodeURIComponent(tags[0].materialCode)}`, { cache: "no-store" });
      if (imageResponse.ok) {
        const imageBlob = await imageResponse.blob();
        imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(imageBlob);
        });
      }
    } catch {
      imageUrl = "";
    }
    const tagMarkups = await Promise.all(tags.map(async (tag) => {
      const payloadValue = tag.payload || `KITSTOCK|${tag.tagId}|${tag.materialCode}|${tag.qty}|${tag.jobNo}|${tag.productionDate}`;
      const qr = await qrcode.toDataURL(payloadValue, { width: 440, margin: 1, errorCorrectionLevel: "M" });
      const boxMatch = tag.tagId.match(/-B(\d+)OF(\d+)$/);
      const boxNo = tag.boxNo || Number(boxMatch?.[1] || 1);
      const boxCount = tag.boxCount || Number(boxMatch?.[2] || 1);
      const batchCode = tag.tagId.replace(/-B\d+OF\d+$/, "");
      const tagPart = stock.parts.find((part) => part.materialCode === tag.materialCode);
      const packQty = Number(tagPart?.standardQty || 0);
      const location = tagPart?.location || "—";
      const isFullBox = packQty > 0 ? tag.qty >= packQty : boxNo < boxCount;
      const boxType = isFullBox ? "FULL BOX / กล่องเต็ม" : "REMAINDER BOX / กล่องเศษ";
      const deliveryQty = tag.deliveryQty || stock.tags
        .filter((item) => item.tagId.replace(/-B\d+OF\d+$/, "") === batchCode)
        .reduce((sum, item) => sum + Number(item.qty), 0) || tag.qty;
      return `<section class="tag"><header><div class="brand">KiT<small>DELIVERY DUE CONTROL</small></div><div class="tag-title"><b>STOCK RECEIVING TAG</b><small>TAG รับงานเข้า STOCK</small></div></header>
        <div class="product"><div class="photo-wrap">${imageUrl ? `<img class="photo" src="${imageUrl}" alt="รูปชิ้นงาน ${html(tag.materialCode)}" />` : `<div class="photo-fallback"><strong>◇</strong>ยังไม่มีรูปชิ้นงาน</div>`}</div><div class="qr-wrap"><img class="qr" src="${qr}" alt="QR"><small>QR / BARCODE</small></div><div class="main"><small>CUSTOMER</small><p class="customer">${html(tag.customer || "—")}</p><small>PART NO. / MATERIAL</small><b>${html(tag.materialCode)}</b><small>PART NAME</small><p>${html(tag.partName)}</p></div></div>
        <div class="grid"><div><small>DELIVERY QTY / จำนวนงานรวม</small><b class="qty">${fmt(deliveryQty)}</b> <span class="unit">PC</span></div><div><small>QTY IN BOX / จำนวนในกล่อง</small><b class="qty">${fmt(tag.qty)}</b> <span class="unit">PC</span></div><div class="box-cell"><small>BOX / กล่อง</small><b>${fmt(boxNo)} / ${fmt(boxCount)}</b><span class="box-type ${isFullBox ? "full" : "remainder"}">${boxType}</span></div><div><small>JOB NO.</small><b>${html(tag.jobNo)}</b></div><div><small>TAG ISSUE DATE / วันที่ออก TAG</small><b>${html(formatDateOnly(tag.createdAt))}</b></div><div><small>LOCATION / ตำแหน่งจัดเก็บ</small><b>${html(location)}</b></div></div>
        <footer><b class="code">${html(tag.tagId)}</b><p class="payload">${html(payloadValue)}</p><div class="hint">ยิง QR เพื่อรับงานเข้า Stock</div></footer>
      </section>`;
    }));
    const tagsPerPage = 8;
    const pages = Array.from({ length: Math.ceil(tagMarkups.length / tagsPerPage) }, (_, pageIndex) =>
      `<div class="sheet">${tagMarkups.slice(pageIndex * tagsPerPage, pageIndex * tagsPerPage + tagsPerPage).join("")}</div>`,
    ).join("");
    popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${html(tags[0].jobNo)} · ${fmt(tags.length)} Tag</title><style>
      @page{size:A4 portrait;margin:4mm}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Arial,"Noto Sans Thai",sans-serif;color:#071a35;font-weight:500}
      .sheet{height:289mm;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,1fr);gap:2mm;break-after:page}.sheet:last-child{break-after:auto}.tag{min-width:0;min-height:0;border:1.6px solid #003f98;border-radius:2mm;overflow:hidden;display:grid;grid-template-rows:auto auto 1fr auto;break-inside:avoid;background:#fff;box-shadow:inset 0 0 0 .25mm #c5d7ed}
      header{display:flex;justify-content:space-between;align-items:center;padding:1.15mm 1.6mm;color:#fff;background:#003f98}.brand{font-size:16px;font-weight:900;line-height:.78}.brand small{display:block;margin-top:.8mm;font-size:4px;font-weight:800;letter-spacing:.55px;color:#fff}.tag-title{text-align:right}.tag-title b{display:block;font-size:7px;font-weight:900;letter-spacing:.2px}.tag-title small{font-size:5px;font-weight:800;color:#fff}
      .product{display:grid;grid-template-columns:29mm 17mm 1fr;gap:1.2mm;padding:1mm 1.6mm;border-bottom:1.4px solid #48688d;background:#e7f0fc}.photo-wrap{height:23mm;display:grid;place-items:center;border:1.4px solid #2e5f9a;border-radius:1.6mm;background:#fff;overflow:hidden}.photo{width:100%;height:100%;object-fit:contain;padding:.5mm}.photo-fallback{color:#344b68;text-align:center;font-size:5px;font-weight:700}.photo-fallback strong{display:block;font-size:13px;color:#48688d}.qr-wrap{height:23mm;display:grid;place-items:center;align-content:center;border:1.2px solid #48688d;border-radius:1.3mm;background:#fff}.qr{width:16mm;height:16mm}.qr-wrap small{font-size:3.8px;font-weight:800;color:#071a35}
      .main{align-self:center;min-width:0}.main small{font-size:4.5px;font-weight:800;letter-spacing:.1px;color:#243e60}.main b{display:block;margin:.2mm 0;font-size:9px;font-weight:900;color:#071a35;overflow-wrap:anywhere}.main p{margin:0;color:#071a35;font-size:6px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.customer{margin-top:.25mm!important;color:#003f98!important;font-size:6.6px!important;font-weight:900!important}
      .grid{display:grid;grid-template-columns:1fr 1fr;margin:.8mm 1.6mm;border:1.3px solid #48688d;background:#fff}.grid div{min-height:6.3mm;padding:.55mm .7mm;border-right:1.1px solid #48688d;border-bottom:1.1px solid #48688d;overflow:hidden}.grid div:nth-child(even){border-right:0}.grid div:nth-last-child(-n+2){border-bottom:0}.grid small{display:block;color:#243e60;font-size:4.2px;font-weight:800;letter-spacing:0}.grid b{font-size:6.4px;font-weight:900;color:#071a35;overflow-wrap:anywhere}.qty,.box-cell b{font-size:11.5px!important;color:#003f98}.unit{font-size:4.8px;font-weight:800;color:#071a35}.box-cell{position:relative;padding-right:25mm!important}.box-type{position:absolute;right:.7mm;top:50%;transform:translateY(-50%);display:inline-block;padding:.65mm .8mm;border:1px solid;border-radius:.8mm;font-size:4.4px;font-weight:900;line-height:1.15;text-align:center}.box-type.full{color:#075b2a;background:#dff6e7;border-color:#198754}.box-type.remainder{color:#7a3700;background:#fff0d5;border-color:#d97706}
      footer{display:grid;grid-template-columns:1fr auto;gap:.35mm 1mm;align-items:center;padding:.55mm 1.6mm;border-top:1.5px solid #003f98;min-width:0;background:#f1f5fa}.code{display:block;font-size:5.4px;font-weight:900;color:#071a35;overflow-wrap:anywhere}.payload{grid-column:1/-1;margin:0;font-size:3.1px;font-weight:600;line-height:1.05;color:#243e60;overflow-wrap:anywhere}.hint{display:inline-block;padding:.55mm .9mm;color:#fff;background:#003f98;border-radius:.8mm;font-size:4.2px;font-weight:900;white-space:nowrap}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>${pages}<script>window.onload=()=>{const images=[...document.images];Promise.all(images.map((image)=>image.complete?Promise.resolve():new Promise((resolve)=>{image.onload=resolve;image.onerror=resolve}))).finally(()=>setTimeout(()=>window.print(),250))}<\/script></body></html>`);
    popup.document.close();
  }

  const dates = useMemo(() => [...new Set(payload.dues.map((due) => due.deliveryDate))].sort().reverse(), [payload.dues]);
  const facts = useMemo(() => [...new Set(payload.dues.map((due) => due.fact))].filter(Boolean).sort(), [payload.dues]);
  const times = useMemo(() => [...new Set(payload.dues.filter((due) => !filterDate || due.deliveryDate === filterDate).map((due) => due.deliveryTime))].filter(Boolean).sort(), [payload.dues, filterDate]);
  const filtered = useMemo(() => payload.dues.filter((due) => {
    const search = query.trim().toUpperCase();
    return (!filterDate || due.deliveryDate === filterDate)
      && (filterFact === "ALL" || due.fact === filterFact)
      && (filterTime === "ALL" || due.deliveryTime === filterTime)
      && (!search || [due.materialCode, due.materialDescription, due.doNo, String(due.seq), due.line, due.shop].some((value) => value.toUpperCase().includes(search)));
  }), [payload.dues, filterDate, filterFact, filterTime, query]);

  const summary = useMemo(() => filtered.reduce((total, due) => {
    total.items += 1;
    total.plan += Number(due.reqQty);
    total.sent += Number(due.scannedQty);
    total[stateOf(due)] += 1;
    return total;
  }, { items: 0, plan: 0, sent: 0, completed: 0, partial: 0, pending: 0, over: 0 }), [filtered]);
  const completePct = summary.items ? Math.round((summary.completed / summary.items) * 100) : 0;

  const facStats = useMemo(() => facts.map((fact) => {
    const rows = payload.dues.filter((due) => due.fact === fact && (!filterDate || due.deliveryDate === filterDate));
    return {
      fact,
      items: rows.length,
      plan: rows.reduce((sum, row) => sum + Number(row.reqQty), 0),
      sent: rows.reduce((sum, row) => sum + Number(row.scannedQty), 0),
      completed: rows.filter((row) => stateOf(row) === "completed").length,
      remaining: rows.filter((row) => ["pending", "partial", "over"].includes(stateOf(row))).length,
    };
  }).sort((a, b) => b.items - a.items), [facts, payload.dues, filterDate]);

  const dailyStats = useMemo(() => dates.map((date) => {
    const rows = payload.dues.filter((due) => due.deliveryDate === date);
    return { date, items: rows.length, completed: rows.filter((row) => stateOf(row) === "completed").length, partial: rows.filter((row) => stateOf(row) === "partial").length, pending: rows.filter((row) => stateOf(row) === "pending").length, over: rows.filter((row) => stateOf(row) === "over").length, qty: rows.reduce((sum, row) => sum + Number(row.scannedQty), 0) };
  }), [dates, payload.dues]);

  const arrangeableDues = useMemo(() => payload.dues.filter((due) =>
    Number(due.reqQty) > Number(due.scannedQty) + Number(due.arrangedQty || 0)
  ), [payload.dues]);
  const effectiveArrangeDueId = arrangeableDues.some((due) => String(due.id) === arrangeDueId)
    ? arrangeDueId
    : arrangeableDues[0] ? String(arrangeableDues[0].id) : "";

  function go(next: PageKey) {
    if (!allowedPages.has(next)) {
      setNotice({ type: "error", text: "บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้ กรุณาติดต่อ Admin" });
      setMenuOpen(false);
      return;
    }
    setPage(next);
    updatePageLocation(next);
    if (next === "users") void loadUsers();
    if (next === "parts" || next === "settings") void loadPartImages();
    if (next === "replacement") void loadReplacements();
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportCsv() {
    const rows = payload.dues.filter((due) => Number(due.scannedQty) > 0);
    const csv = [
      ["Delivery Date", "Time", "FAC", "Line", "DO", "Material", "Plan Qty", "Sent Qty", "Remaining", "Status"],
      ...rows.map((due) => [due.deliveryDate, due.deliveryTime, due.fact, due.line, due.doNo, due.materialCode, due.reqQty, due.scannedQty, Math.max(due.reqQty - due.scannedQty, 0), stateLabel(due)]),
    ].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `KIT-delivery-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reportFileName(extension: string) {
    const scope = [filterDate || "all-dates", filterFact === "ALL" ? "all-fac" : filterFact, filterTime === "ALL" ? "all-times" : filterTime.replace(":", "-")].join("_");
    return `KIT-delivery-report_${scope}.${extension}`;
  }

  function reportTableRows() {
    return [
      ["วันที่ส่งงาน", "เวลา", "FAC", "Line", "Shop", "DO No.", "Seq", "Material / Part No.", "รายละเอียด", "แผน (ชิ้น)", "จัดรอขาย (ชิ้น)", "ส่งแล้ว (ชิ้น)", "คงเหลือ (ชิ้น)", "สถานะ"],
      ...filtered.map((due) => [due.deliveryDate, due.deliveryTime, due.fact, due.line, due.shop, due.doNo, due.seq, due.materialCode, due.materialDescription, due.reqQty, due.arrangedQty || 0, due.scannedQty, Math.max(due.reqQty - due.scannedQty, 0), stateLabel(due)]),
    ];
  }

  function exportReportCsv() {
    const csv = reportTableRows().map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reportFileName("csv");
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ type: "success", text: `ส่งออกรายงาน CSV แล้ว ${fmt(filtered.length)} รายการ` });
  }

  async function exportReportExcel() {
    try {
      const xlsx = await import("xlsx");
      const workbook = xlsx.utils.book_new();
      const summarySheet = xlsx.utils.aoa_to_sheet([
        ["KIT Delivery Due Control — สรุปรายงาน"],
        ["วันที่ส่งงาน", filterDate ? formatDate(filterDate) : "ทุกวันที่"],
        ["FAC", filterFact === "ALL" ? "ทั้งหมด" : filterFact],
        ["เวลา", filterTime === "ALL" ? "ทั้งหมด" : filterTime],
        ["จำนวนรายการ", summary.items], ["แผนทั้งหมด (ชิ้น)", summary.plan], ["ส่งแล้ว (ชิ้น)", summary.sent],
        ["ครบตามแผน", summary.completed], ["คงเหลือ", summary.partial + summary.pending], ["เกิน Due", summary.over],
      ]);
      const detailSheet = xlsx.utils.aoa_to_sheet(reportTableRows());
      detailSheet["!cols"] = [12, 8, 12, 12, 12, 24, 8, 24, 36, 14, 14, 14, 14, 20].map((wch) => ({ wch }));
      const traceSheet = xlsx.utils.aoa_to_sheet([
        ["Tag ลูกค้า", "KIT Stock Tag", "Job", "Material", "DO", "FAC", "Line", "วันที่ผลิต", "วันที่รับเข้า Stock", "จำนวน", "ผู้จัดงาน", "เวลาจัดงาน", "ผู้ตรวจ", "เวลาขายออก"],
        ...stock.dispatchLinks.map((item) => [
          item.customerTagId, item.stockTagCode, item.jobNo, item.materialCode, item.doNo,
          item.fact, item.line, item.productionDate, item.receivedAt || "", item.qty,
          item.pickedByName, item.pickedAt, item.dispatchedByName, item.dispatchedAt,
        ]),
      ]);
      traceSheet["!cols"] = [28, 24, 18, 22, 24, 12, 12, 14, 22, 12, 18, 22, 18, 22].map((wch) => ({ wch }));
      xlsx.utils.book_append_sheet(workbook, summarySheet, "สรุปรายงาน");
      xlsx.utils.book_append_sheet(workbook, detailSheet, "รายละเอียด Due");
      xlsx.utils.book_append_sheet(workbook, traceSheet, "Job Traceability");
      xlsx.writeFile(workbook, reportFileName("xlsx"));
      setNotice({ type: "success", text: `ส่งออกรายงาน Excel แล้ว ${fmt(filtered.length)} รายการ` });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ส่งออก Excel ไม่สำเร็จ" });
    }
  }

  function exportReportPdf() {
    const popup = window.open("", "_blank", "width=1200,height=850");
    if (!popup) return setNotice({ type: "error", text: "เบราว์เซอร์บล็อกหน้าต่างรายงาน กรุณาอนุญาต Pop-up แล้วลองใหม่" });
    const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
    const rows = filtered.map((due) => `<tr><td>${escape(formatDate(due.deliveryDate))}</td><td>${escape(due.deliveryTime)}</td><td>${escape(due.fact)} / ${escape(due.line || "—")}</td><td>${escape(due.materialCode)}<small>${escape(due.materialDescription)}</small></td><td>${fmt(due.reqQty)}</td><td>${fmt(due.scannedQty)}</td><td>${fmt(Math.max(due.reqQty - due.scannedQty, 0))}</td><td>${escape(stateLabel(due))}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>KIT Delivery Report</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#132647}header{display:flex;justify-content:space-between;border-bottom:3px solid #075fd7;padding-bottom:12px}h1{margin:0;color:#075fd7}.scope{color:#64748b}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.metrics div{padding:10px;border:1px solid #dbe5f2;border-radius:8px}.metrics b{display:block;font-size:20px}table{width:100%;border-collapse:collapse}th{background:#eaf3ff;color:#123765}th,td{padding:7px;border:1px solid #dbe3ed;text-align:left}td:nth-last-child(-n+4){text-align:right}small{display:block;color:#718096;margin-top:3px}footer{margin-top:10px;color:#718096;text-align:right}@media print{button{display:none}}</style></head><body><header><div><h1>KIT Delivery Due Control</h1><b>รายงานสถานะการส่งงาน</b></div><div class="scope">วันที่ ${escape(filterDate ? formatDate(filterDate) : "ทุกวันที่")} · FAC ${escape(filterFact === "ALL" ? "ทั้งหมด" : filterFact)} · เวลา ${escape(filterTime === "ALL" ? "ทั้งหมด" : filterTime)}</div></header><section class="metrics"><div>รายการทั้งหมด<b>${fmt(summary.items)}</b></div><div>แผนทั้งหมด<b>${fmt(summary.plan)}</b></div><div>ส่งแล้ว<b>${fmt(summary.sent)}</b></div><div>ครบตามแผน<b>${fmt(summary.completed)}</b></div><div>คงเหลือ<b>${fmt(summary.partial + summary.pending)}</b></div></section><table><thead><tr><th>วันที่</th><th>เวลา</th><th>FAC / Line</th><th>Material / Part No.</th><th>แผน</th><th>ส่งแล้ว</th><th>คงเหลือ</th><th>สถานะ</th></tr></thead><tbody>${rows || '<tr><td colspan="8">ไม่พบข้อมูลตามตัวกรอง</td></tr>'}</tbody></table><footer>สร้างรายงาน ${escape(new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    popup.document.close();
  }

  function saveSettings() {
    window.localStorage.setItem("kit-due-settings", JSON.stringify(settings));
    setNotice({ type: "success", text: "บันทึกการตั้งค่าบนอุปกรณ์นี้แล้ว" });
  }

  async function clearTestStock() {
    if (!window.confirm(`ยืนยันล้างข้อมูล Stock ทดลองทั้งหมดหรือไม่?\n\nระบบจะลบ Tag Stock ${stock.tags.length} ใบ และประวัติการจัด/ขายออกที่เชื่อมโยง\nแต่จะไม่ลบทะเบียน Part, รูปชิ้นงาน, แผน Due หรือผู้ใช้งาน\n\nรายการที่ลบแล้วไม่สามารถกู้คืนจากหน้าระบบได้`)) return;
    setClearingTestStock(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_test_stock" }),
      });
      const data = await response.json() as { error?: string; deleted?: { tags?: number; picks?: number; allocations?: number; dispatchLinks?: number } };
      if (!response.ok) throw new Error(data.error || "ล้างข้อมูล Stock ไม่สำเร็จ");
      setCreatedStockTags([]);
      setNotice({ type: "success", text: `ล้างข้อมูล Stock ทดลองแล้ว ${fmt(data.deleted?.tags || 0)} Tag` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ล้างข้อมูล Stock ไม่สำเร็จ" });
    } finally {
      setClearingTestStock(false);
    }
  }

  const Filters = () => (<>
    <button className="mobile-filter-toggle" type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><span>⌄</span>{filtersOpen ? "ซ่อนตัวกรอง" : "แสดงตัวกรอง"}<b>{[filterDate, filterFact !== "ALL" ? filterFact : "", filterTime !== "ALL" ? filterTime : "", query].filter(Boolean).length || ""}</b></button>
    <div className={`filter-grid ${filtersOpen ? "mobile-open" : ""}`}>
      <label><span>วันที่ส่งงาน</span><select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}><option value="">ทุกวันที่</option>{dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
      <label><span>โรงงาน (FAC)</span><select value={filterFact} onChange={(e) => setFilterFact(e.target.value)}><option value="ALL">ทั้งหมด</option>{facts.map((fact) => <option key={fact}>{fact}</option>)}</select></label>
      <label><span>เวลา</span><select value={filterTime} onChange={(e) => setFilterTime(e.target.value)}><option value="ALL">ทั้งหมด</option>{times.map((time) => <option key={time}>{time}</option>)}</select></label>
      <label className="search-field"><span>ค้นหา</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Material / Part No. / DO" /></label>
      <button className="button secondary filter-reset" onClick={() => { setFilterFact("ALL"); setFilterTime("ALL"); setQuery(""); }}>↻ ล้างค่า</button>
    </div>
  </>);

  const DueTable = ({ rows, limit }: { rows: DueLine[]; limit?: number }) => {
    const shown = typeof limit === "number" ? rows.slice(0, limit) : rows;
    if (!shown.length) return <Empty text="ไม่พบรายการตามตัวกรองที่เลือก" />;
    return (
      <div className="table-wrap mobile-table-wrap">
        <table className="mobile-card-table due-table">
          <thead><tr><th>เวลา</th><th>FAC / Line</th><th>Material / Part No.</th><th>รายละเอียด</th><th className="num">แผน</th><th className="num">จัดรอขาย</th><th className="num">ส่งแล้ว</th><th className="num">คงเหลือ</th><th>สถานะ</th><th /></tr></thead>
          <tbody>{shown.map((due) => <tr key={due.id}>
            <td data-label="เวลา"><b>{due.deliveryTime}</b><small>{formatDate(due.deliveryDate)}</small></td>
            <td data-label="FAC / Line"><b>{due.fact}</b><small>{[due.line, due.shop].filter(Boolean).join(" / ") || "—"}</small></td>
            <td data-label="Part No."><b>{due.materialCode}</b><small>{due.doNo} · Seq {due.seq}</small></td>
            <td data-label="รายละเอียด">{due.materialDescription || "—"}</td>
            <td data-label="แผน" className="num"><b>{fmt(due.reqQty)}</b></td>
            <td data-label="จัดรอขาย" className="num warning"><b>{fmt(due.arrangedQty || 0)}</b></td>
            <td data-label="ส่งแล้ว" className="num sent"><b>{fmt(due.scannedQty)}</b></td>
            <td data-label="คงเหลือ" className={`num ${stateOf(due) === "over" ? "danger" : "warning"}`}><b>{fmt(Math.max(due.reqQty - due.scannedQty, 0))}</b></td>
            <td data-label="สถานะ"><span className={`status ${Number(due.arrangedQty) > 0 && stateOf(due) === "pending" ? "partial" : stateOf(due)}`}>{stateLabel(due)}</span></td>
            <td data-label="จัดการ">{workflowPage && <button className="tiny-button" onClick={() => {
              setArrangeDueId(String(due.id));
              go(workflowPage);
            }}>{Number(due.scannedQty) < due.reqQty ? (workflowPage === "dispatch" ? "ขายออก" : "จัดงาน") : "ดู"}</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    );
  };

  async function createReplacementRequest(event: FormEvent) {
    event.preventDefault();
    setReplacementSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/replacements", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", ...replacementForm }),
      });
      const data = await response.json() as { request?: ReplacementRequest; error?: string };
      if (!response.ok) throw new Error(data.error || "สร้างใบขอเบิกไม่สำเร็จ");
      setReplacementForm({ materialCode: "", customer: "", requestedQty: "", reasonType: "shortage", reasonDetail: "", neededDate: "" });
      if (data.request) setReplacementSelectedId(String(data.request.id));
      setNotice({ type: "success", text: `สร้างใบขอเบิก ${data.request?.requestNo || ""} แล้ว ทีมจัดงานสามารถสแกน KIT Tag ได้ทันที` });
      await Promise.all([loadReplacements(), loadStock()]);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "สร้างใบขอเบิกไม่สำเร็จ" });
    } finally {
      setReplacementSaving(false);
    }
  }

  async function previewReplacementIssue(rawValue?: string) {
    const rawPayload = (rawValue || replacementTag).trim();
    if (!replacementSelectedId) return setNotice({ type: "error", text: "กรุณาเลือกใบขอเบิกก่อนสแกน KIT Tag" });
    if (!rawPayload || replacementSaving) return;
    setReplacementSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/replacements", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview_issue", requestId: Number(replacementSelectedId), rawPayload }),
      });
      const data = await response.json() as ReplacementIssuePreview & { error?: string };
      if (!response.ok) throw new Error(data.error || "ตรวจ KIT Tag ไม่สำเร็จ");
      setReplacementTag(rawPayload);
      setReplacementPreview(data);
      setReplacementQty(String(data.suggestedQty || ""));
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "ตรวจ KIT Tag ไม่สำเร็จ" });
      setReplacementTag("");
      window.setTimeout(() => replacementInputRef.current?.focus(), 80);
    } finally {
      setReplacementSaving(false);
    }
  }

  async function confirmReplacementIssue() {
    if (!replacementPreview) return;
    const qty = Number(replacementQty || 0);
    setReplacementSaving(true);
    try {
      const response = await fetch("/api/replacements", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm_issue", requestId: replacementPreview.request.id,
          rawPayload: replacementTag, qty,
        }),
      });
      const data = await response.json() as { request?: ReplacementRequest; issue?: ReplacementIssue; error?: string };
      if (!response.ok) throw new Error(data.error || "เบิกงานทดแทนไม่สำเร็จ");
      setReplacementPreview(null);
      setReplacementTag("");
      setReplacementQty("");
      setNotice({ type: "success", text: `เบิกงานทดแทน ${fmt(qty)} ชิ้นแล้ว และตัดยอด Stock/ใบขอเรียบร้อย` });
      await Promise.all([loadReplacements(), loadStock()]);
      window.setTimeout(() => replacementInputRef.current?.focus(), 100);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "เบิกงานทดแทนไม่สำเร็จ" });
    } finally {
      setReplacementSaving(false);
    }
  }

  async function cancelReplacementRequest(item: ReplacementRequest) {
    if (!window.confirm(`ยกเลิกใบขอเบิก ${item.requestNo} ใช่หรือไม่?`)) return;
    const response = await fetch("/api/replacements", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", requestId: item.id }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ type: "error", text: data.error || "ยกเลิกใบขอไม่สำเร็จ" });
    setNotice({ type: "success", text: `ยกเลิกใบขอเบิก ${item.requestNo} แล้ว` });
    await loadReplacements();
  }

  async function printReplacementIssue(issue: ReplacementIssue) {
    const item = replacement.requests.find((request) => request.id === issue.requestId);
    if (!item) return setNotice({ type: "error", text: "ไม่พบข้อมูลใบขอเบิกสำหรับพิมพ์" });
    const popup = window.open("", "_blank", "width=900,height=900");
    if (!popup) return setNotice({ type: "error", text: "เบราว์เซอร์บล็อกหน้าพิมพ์ กรุณาอนุญาต Pop-up" });
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    const safe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => entities[character] || character);
    const reason = item.reasonType === "defect" ? "งานเสีย" : item.reasonType === "shortage" ? "งานขาด" : "อื่น ๆ";
    popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${safe(issue.noticeNo)}</title><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans Thai",sans-serif;color:#10234a;margin:0}.sheet{border:2px solid #1767df;border-radius:18px;overflow:hidden}.head{padding:24px 28px;color:#fff;background:linear-gradient(135deg,#096fe8,#753fe0);display:flex;justify-content:space-between;align-items:center}.head h1{margin:0 0 4px;font-size:28px}.head p,.head b{margin:0}.body{padding:28px}.part{background:#eef5ff;border-radius:14px;padding:22px;margin-bottom:20px}.part small{color:#65789d}.part h2{font-size:28px;margin:6px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cell{border:1px solid #d9e4f6;border-radius:12px;padding:14px}.cell small{display:block;color:#6f7d99;margin-bottom:6px}.qty{margin:22px 0;display:grid;grid-template-columns:repeat(3,1fr);text-align:center;border:1px solid #d9e4f6;border-radius:14px;overflow:hidden}.qty div{padding:16px;border-right:1px solid #d9e4f6}.qty div:last-child{border:0}.qty b{display:block;font-size:24px;color:#0963da}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:70px;text-align:center}.sign span{display:block;border-top:1px solid #7786a5;padding-top:8px}.foot{padding:15px 28px;background:#f5f8fd;color:#6f7d99;font-size:12px}@media print{button{display:none}}</style></head><body>
      <section class="sheet"><div class="head"><div><p>DELIVERY DUE CONTROL</p><h1>ใบแจ้งเบิกงานทดแทน</h1><b>REPLACEMENT ISSUE NOTE</b></div><div><b>${safe(issue.noticeNo)}</b><p>${safe(formatDateTime(issue.issuedAt))}</p></div></div>
      <div class="body"><div class="part"><small>PART / MATERIAL</small><h2>${safe(item.materialCode)}</h2><p>${safe(item.partName || "—")}</p></div>
      <div class="grid"><div class="cell"><small>เลขที่ใบขอ QC</small><b>${safe(item.requestNo)}</b></div><div class="cell"><small>ลูกค้า / Site</small><b>${safe(item.customer || "—")}</b></div><div class="cell"><small>สาเหตุ</small><b>${safe(reason)}</b><p>${safe(item.reasonDetail || "—")}</p></div><div class="cell"><small>KIT Stock Tag</small><b>${safe(issue.stockTagCode)}</b></div><div class="cell"><small>Job</small><b>${safe(issue.jobNo || "—")}</b></div><div class="cell"><small>ผู้เบิกงาน</small><b>${safe(issue.issuedByName)} (${safe(issue.issuedByCode)})</b></div></div>
      <div class="qty"><div><small>QC ขอเบิก</small><b>${safe(fmt(item.requestedQty))}</b><span>ชิ้น</span></div><div><small>เบิกครั้งนี้</small><b>${safe(fmt(issue.qty))}</b><span>ชิ้น</span></div><div><small>คงเหลือในใบขอ</small><b>${safe(fmt(item.remainingQty))}</b><span>ชิ้น</span></div></div>
      <div class="sign"><div><span>ผู้จัดงาน / ผู้เบิก</span></div><div><span>QC ผู้รับงานทดแทน</span></div></div></div>
      <div class="foot">พิมพ์จากระบบ KiT Delivery Due Control · ไม่มี Customer Tag เนื่องจากเป็นงานทดแทน</div></section>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    popup.document.close();
    void fetch("/api/replacements", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_printed", issueId: issue.id }),
    }).then(() => loadReplacements());
  }

  function renderDashboard() {
    // renderDashboard() เป็นฟังก์ชันธรรมดาที่ถูกเรียกแบบมีเงื่อนไข ห้ามใช้ hook ในนี้
    const remainingItems = summary.partial + summary.pending;
    const share = (value: number) => (summary.items ? Math.round((value / summary.items) * 1000) / 10 : 0);

    // สามสถานะนี้เป็นสี "สถานะ" ไม่ใช่สีแยกชุดข้อมูล เขียว/ส้ม/แดงจึงสื่อความหมายตรงตัว
    // ผ่านการตรวจค่าความต่างสำหรับผู้มีภาวะตาบอดสีแล้ว (ค่าต่างต่ำสุด 18.3)
    const segments = [
      { key: "completed", label: "ส่งออกครบ", value: summary.completed, className: "ok" },
      { key: "remaining", label: "ค้างเหลือ", value: remainingItems, className: "warn" },
      { key: "over", label: "เกิน Due", value: summary.over, className: "crit" },
    ].filter((item) => item.value > 0);

    // โดนัทวาดด้วย SVG เส้นรอบวง 2πr โดย r = 54
    const CIRCUMFERENCE = 2 * Math.PI * 54;
    const GAP = segments.length > 1 ? 3 : 0;
    let offset = 0;
    const arcs = segments.map((item) => {
      const length = summary.items ? (item.value / summary.items) * CIRCUMFERENCE : 0;
      const arc = { ...item, length: Math.max(length - GAP, 0.5), offset };
      offset += length;
      return arc;
    });

    const pendingDues = filtered
      .filter((due) => ["partial", "pending", "over"].includes(stateOf(due)))
      .slice()
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.deliveryTime.localeCompare(b.deliveryTime))
      .slice(0, 5);

    // ป้ายวันที่สื่อความเร่งด่วนจริง ไม่ใช่แค่สถานะ pending/partial
    // เทียบด้วยสตริง YYYY-MM-DD ตามเวลาเครื่องผู้ใช้ จึงไม่มีปัญหาข้ามวันจาก UTC
    const todayKey = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    })();
    const soonKey = (() => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 2);
      return `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    })();
    const urgency = (deliveryDate: string) => {
      if (!deliveryDate) return "";
      if (deliveryDate <= todayKey) return "hot";
      if (deliveryDate <= soonKey) return "soon";
      return "";
    };

    const scannedToday = payload.scans.filter((scan) => isToday(scan.createdAt));
    const plannedPieces = payload.dues.reduce((sum, due) => sum + Number(due.reqQty || 0), 0);

    return <div className="home">
      <div className="stat-row">
        <article className="stat-tile blue"><span className="stat-icon">▤</span><div><small>Due ทั้งหมด</small><b>{fmt(summary.items)}</b><em>รายการ</em></div></article>
        <article className="stat-tile green"><span className="stat-icon">✓</span><div><small>ส่งออกแล้ว</small><b>{fmt(summary.completed)}</b><em>รายการ · {share(summary.completed)}%</em></div></article>
        <article className="stat-tile orange"><span className="stat-icon">◷</span><div><small>ค้างตัดยอด</small><b>{fmt(remainingItems)}</b><em>รายการ</em></div></article>
        <article className="stat-tile red"><span className="stat-icon">!</span><div><small>เกิน Due</small><b>{fmt(summary.over)}</b><em>รายการ</em></div></article>
      </div>

      <div className="home-grid">
        <Card title="สถานะส่งงานตาม Due" className="chart-card">
          {summary.items ? <>
            <div className="chart-body">
            <div className="donut-wrap">
              <svg viewBox="0 0 120 120" className="donut-svg" role="img" aria-label={`ส่งออกครบ ${summary.completed} ค้างเหลือ ${remainingItems} เกิน Due ${summary.over} จากทั้งหมด ${summary.items} รายการ`}>
                <circle className="donut-track" cx="60" cy="60" r="54" />
                {arcs.map((arc) => <circle
                  key={arc.key}
                  className={`donut-arc ${arc.className}`}
                  cx="60" cy="60" r="54"
                  strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                  strokeDashoffset={-arc.offset}
                ><title>{arc.label} {fmt(arc.value)} รายการ ({share(arc.value)}%)</title></circle>)}
              </svg>
              <div className="donut-center"><b>{fmt(summary.items)}</b><small>รายการ</small></div>
            </div>
            <ul className="donut-legend">
              <li><i className="ok" /><span>ส่งออกครบ</span><b>{fmt(summary.completed)}</b><em>{share(summary.completed)}%</em></li>
              <li><i className="warn" /><span>ค้างเหลือ</span><b>{fmt(remainingItems)}</b><em>{share(remainingItems)}%</em></li>
              <li><i className="crit" /><span>เกิน Due</span><b>{fmt(summary.over)}</b><em>{share(summary.over)}%</em></li>
            </ul>
            </div>
            <footer className="chart-foot">
              <small>อัปเดตล่าสุด {formatDateTime(new Date().toISOString())}</small>
              <button className="tiny-button" onClick={() => void loadDue()}>↻ รีเฟรช</button>
            </footer>
          </> : <Empty title="ยังไม่มีข้อมูล Due" text="นำเข้าแผนส่งงานเพื่อเริ่มดูภาพรวม" />}
        </Card>

        <Card title="Due ที่ค้างตัดยอด (รายการล่าสุด)" action={allowedPages.has("plan") ? <button className="text-button" onClick={() => go("plan")}>ดูทั้งหมด →</button> : undefined}>
          {pendingDues.length ? <div className="pending-list">{pendingDues.map((due) => <button key={due.id} className="pending-row" onClick={() => go("plan")}>
            <span className={`date-pill ${urgency(due.deliveryDate)}`}>{formatDate(due.deliveryDate)}</span>
            <span className="pending-main"><b>{due.materialCode}</b><small>{due.materialDescription || `${due.fact}${due.line ? ` / ${due.line}` : ""}`}</small></span>
            <span className="pending-qty">{fmt(Math.max(Number(due.reqQty) - Number(due.scannedQty), 0))}</span>
          </button>)}</div> : <Empty title="ไม่มี Due ค้าง" text="ทุกรายการตามตัวกรองปัจจุบันตัดยอดครบแล้ว" />}
        </Card>

        <div className="home-side">
          <Card title="เมนูด่วน">
            <div className="quick-tiles">
              {allowedPages.has("plan") && <button className="qt blue" onClick={() => go("plan")}><span>⇧</span>นำเข้าแผนงาน</button>}
              {allowedPages.has("tags") && <button className="qt purple" onClick={() => go("tags")}><span>▤</span>สร้างและพิมพ์ Tag</button>}
              {allowedPages.has("stock") && <button className="qt green" onClick={() => go("stock")}><span>▦</span>รับเข้า Stock</button>}
              {workflowPage && <button className="qt orange" onClick={() => go(workflowPage)}><span>⌗</span>{workflowPage === "dispatch" ? "ตรวจและขายออก" : "จัดงาน"}</button>}
            </div>
          </Card>
          <Card title="อัปเดตล่าสุด" action={<button className="text-button" onClick={() => go("history")}>ดูทั้งหมด →</button>}>
            {payload.scans.length ? <ol className="feed">{payload.scans.slice(0, 5).map((scan) => <li key={scan.id}>
              <time>{formatTime(scan.createdAt)}</time>
              <i className="feed-dot ok" />
              <div><b>สแกน Tag {scan.tagId}</b><small>{scan.fact} · {scan.materialCode} · {fmt(scan.qty)} {scan.unit}</small></div>
            </li>)}</ol> : <Empty title="ยังไม่มีความเคลื่อนไหว" text="รายการสแกนล่าสุดจะแสดงที่นี่" />}
          </Card>
        </div>
      </div>

      <div className="stat-row bottom">
        <article className="stat-tile blue"><span className="stat-icon">▣</span><div><small>สแกนแล้ววันนี้</small><b>{fmt(scannedToday.length)}</b><em>รายการ</em></div></article>
        <article className="stat-tile purple"><span className="stat-icon">▥</span><div><small>FAC ทั้งหมด</small><b>{fmt(facts.length)}</b><em>โรงงาน</em></div></article>
        <article className="stat-tile teal"><span className="stat-icon">◈</span><div><small>รายการทั้งหมด</small><b>{fmt(payload.dues.length)}</b><em>รายการ</em></div></article>
        <article className="stat-tile amber"><span className="stat-icon">□</span><div><small>ชิ้นงานตามแผน</small><b>{fmt(plannedPieces)}</b><em>ชิ้น</em></div></article>
      </div>
    </div>;
  }

  function renderParts() {
    const partNeedle = partSearch.trim().toLowerCase();
    const visibleParts = stock.parts.filter((item) => !partNeedle
      || item.materialCode.toLowerCase().includes(partNeedle)
      || item.partName.toLowerCase().includes(partNeedle)
      || item.customer.toLowerCase().includes(partNeedle)
      || item.location.toLowerCase().includes(partNeedle));
    const activeParts = stock.parts.filter((item) => item.active).length;
    const partTotalPages = Math.max(1, Math.ceil(visibleParts.length / partPageSize));
    const safePartPage = Math.min(partPage, partTotalPages);
    const partStartIndex = (safePartPage - 1) * partPageSize;
    const paginatedParts = visibleParts.slice(partStartIndex, partStartIndex + partPageSize);
    const partPageButtons: Array<number | "…"> = [];
    for (let current = 1; current <= partTotalPages; current += 1) {
      if (current === 1 || current === partTotalPages || Math.abs(current - safePartPage) <= 1) {
        partPageButtons.push(current);
      } else if (partPageButtons[partPageButtons.length - 1] !== "…") {
        partPageButtons.push("…");
      }
    }
    const inactiveParts = stock.parts.length - activeParts;
    const formCode = stockPartForm.materialCode.trim().toUpperCase();
    const formImage = partImages.find((item) => item.materialCode === formCode);
    const formActualImage = partActualImages.find((item) => item.materialCode === formCode);
    const bundleMasterMatched = partBundlePreview?.rows.filter((row) => row.masterFile).length || 0;
    const bundleActualMatched = partBundlePreview?.rows.filter((row) => row.actualFile).length || 0;
    const bundleWarningCount = (partBundlePreview?.unmatchedMaster.length || 0) + (partBundlePreview?.unmatchedActual.length || 0) + (partBundlePreview?.duplicateImages.length || 0);
    const editPart = (part: StockPart) => {
      setStockPartForm({ materialCode: part.materialCode, partName: part.partName, customer: part.customer, location: part.location || "", standardQty: String(part.standardQty || "") });
      setPartImageCode(part.materialCode);
      setPartImageFile(null);
      setPartActualImageFile(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const clearPartForm = () => {
      setStockPartForm({ materialCode: "", partName: "", customer: "", location: "", standardQty: "" });
      setPartImageCode("");
      setPartImageFile(null);
      setPartActualImageFile(null);
    };
    return <div className="parts-home">
      <div className="part-stat-row">
        <article className="part-stat blue"><span>▦</span><div><small>Part ในระบบ</small><b>{fmt(stock.parts.length)}</b><em>รายการ</em></div></article>
        <article className="part-stat green"><span>✓</span><div><small>Active</small><b>{fmt(activeParts)}</b><em>Part</em></div></article>
        <article className="part-stat orange"><span>◷</span><div><small>ยกเลิก</small><b>{fmt(inactiveParts)}</b><em>Part</em></div></article>
        <article className="part-stat purple"><span>◇</span><div><small>มีรูปชิ้นงาน</small><b>{fmt(partImages.length)}</b><em>รายการ</em></div></article>
      </div>

      {user.role === "admin" && <Card className="part-bundle-card" title={<span className="part-bundle-title"><i>⇧</i><span>นำเข้าทะเบียน Part จาก Excel<small>เลือก Excel อย่างเดียว หรือแนบรูป Master และรูปในกล่องหลายไฟล์พร้อมกัน</small></span></span>} action={partBundlePreview && <span className="part-bundle-ready">✓ ตรวจสอบแล้ว {fmt(partBundlePreview.rows.length)} Part</span>}>
        <form className="part-bundle-form" onSubmit={previewPartBundle}>
          <label className={partBundleExcel ? "selected" : ""}>
            <span className="part-bundle-icon excel">X</span>
            <span><b>1. ไฟล์ทะเบียน Part</b><small>{partBundleExcel?.name || "Excel .xlsx หรือ .xls"}</small></span>
            <input ref={partBundleExcelInput} type="file" accept=".xlsx,.xls" disabled={partBundleRunning} onChange={(e) => { setPartBundleExcel(e.target.files?.[0] || null); setPartBundlePreview(null); setPartBundleFailed([]); }} />
          </label>
          <label className={partBundleMasterFiles.length ? "selected" : ""}>
            <span className="part-bundle-icon master">▧</span>
            <span><b>2. รูปตัวอย่าง (Master) — ไม่บังคับ</b><small>{partBundleMasterFiles.length ? `${fmt(partBundleMasterFiles.length)} รูป` : "เลือกหลายรูปได้ · ตั้งชื่อเป็น Part No."}</small></span>
            <input ref={partBundleMasterInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={partBundleRunning} onChange={(e) => { setPartBundleMasterFiles([...(e.target.files || [])]); setPartBundlePreview(null); setPartBundleFailed([]); }} />
          </label>
          <label className={partBundleActualFiles.length ? "selected" : ""}>
            <span className="part-bundle-icon actual">◈</span>
            <span><b>3. รูปชิ้นงานในกล่อง</b><small>{partBundleActualFiles.length ? `${fmt(partBundleActualFiles.length)} รูป` : "ไม่บังคับ · ใช้เทียบตอนขายออก"}</small></span>
            <input ref={partBundleActualInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={partBundleRunning} onChange={(e) => { setPartBundleActualFiles([...(e.target.files || [])]); setPartBundlePreview(null); setPartBundleFailed([]); }} />
          </label>
          <button className="button primary part-bundle-check" disabled={partBundleRunning || !partBundleExcel}>⌕ ตรวจสอบข้อมูลและจับคู่รูป</button>
        </form>
        <p className="part-bundle-help">ชื่อรูปต้องตรงกับ Part No. ใน Excel เช่น <code>BA04U385G05-F.jpg</code> · รองรับ JPG, PNG, WebP ไม่เกิน 5MB ต่อรูป</p>

        {partBundlePreview && <div className="part-bundle-preview">
          <div className="part-bundle-summary">
            <span className="blue"><small>Part จาก Excel</small><b>{fmt(partBundlePreview.rows.length)}</b></span>
            <span className="purple"><small>จับคู่รูป Master</small><b>{fmt(bundleMasterMatched)}</b></span>
            <span className="green"><small>จับคู่รูปในกล่อง</small><b>{fmt(bundleActualMatched)}</b></span>
            <span className={bundleWarningCount ? "orange" : "green"}><small>ต้องตรวจสอบ</small><b>{fmt(bundleWarningCount)}</b></span>
          </div>
          <div className="part-bundle-table">
            <div className="part-bundle-head"><span>Part No.</span><span>ชื่อชิ้นงาน / Location</span><span>รูป Master</span><span>รูปในกล่อง</span></div>
            <div className="part-bundle-body">{partBundlePreview.rows.slice(0, 100).map((row) => <div className="part-bundle-row" key={row.part.materialCode}>
              <span><b>{row.part.materialCode}</b><small>{fmt(row.part.standardQty)} ชิ้น/กล่อง</small></span>
              <span><b>{row.part.partName}</b><small>{row.part.location || "ไม่ระบุ Location"}</small></span>
              <span className={row.masterFile ? "matched" : "missing"}>{row.masterFile ? `✓ ${row.masterFile.name}` : "— ไม่มีรูป"}</span>
              <span className={row.actualFile ? "matched" : "optional"}>{row.actualFile ? `✓ ${row.actualFile.name}` : "— ไม่ได้เลือก"}</span>
            </div>)}</div>
            {partBundlePreview.rows.length > 100 && <p className="part-bundle-more">และอีก {fmt(partBundlePreview.rows.length - 100)} รายการ</p>}
          </div>
          {bundleWarningCount > 0 && <div className="part-bundle-warnings"><b>ไฟล์ที่ต้องตรวจสอบก่อนนำเข้า</b><ul>{[...partBundlePreview.unmatchedMaster, ...partBundlePreview.unmatchedActual, ...partBundlePreview.duplicateImages].map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
          {partBundleFailed.length > 0 && <div className="part-bundle-warnings failed"><b>รูปที่อัปโหลดไม่สำเร็จ</b><ul>{partBundleFailed.map((item) => <li key={item.name}><strong>{item.name}</strong> — {item.reason}</li>)}</ul></div>}
          <div className="part-bundle-actions">
            <button type="button" className="button secondary" disabled={partBundleRunning} onClick={resetPartBundle}>ล้างไฟล์</button>
            <button type="button" className="button primary" disabled={partBundleRunning} onClick={() => void importPartBundle()}>{partBundleRunning ? `กำลังบันทึก ${fmt(partBundleProgress.done)}/${fmt(partBundleProgress.total)}…` : `✓ ยืนยันนำเข้า ${fmt(partBundlePreview.rows.length)} Part พร้อม ${fmt(bundleMasterMatched + bundleActualMatched)} รูป`}</button>
          </div>
        </div>}
      </Card>}

      {user.role === "admin" && <Card className="part-editor-card" title={stockPartForm.materialCode ? "แก้ไข Part" : "เพิ่ม / แก้ไข Part"} action={<div className="user-actions"><input ref={partFileInput} type="file" accept=".xlsx,.xls" hidden onChange={importPartExcel} /><button className="button secondary" disabled={stockSaving} onClick={() => partFileInput.current?.click()}>⇧ นำเข้า Part Excel (เฉพาะข้อมูล)</button><button className="button primary" form="part-editor-form" disabled={stockSaving}>▣ {stockSaving ? "กำลังบันทึก…" : "บันทึก Part"}</button></div>}>
        <form id="part-editor-form" className="part-editor-grid" onSubmit={saveStockPart}>
          <label><span>Part / Material No. *</span><input value={stockPartForm.materialCode} onChange={(e) => { const code=e.target.value.toUpperCase(); setStockPartForm((current) => ({ ...current, materialCode: code })); setPartImageCode(code); }} required /></label>
          <label><span>ชื่อชิ้นงาน *</span><input value={stockPartForm.partName} onChange={(e) => setStockPartForm((current) => ({ ...current, partName: e.target.value }))} required /></label>
          <label><span>ลูกค้า</span><input value={stockPartForm.customer} onChange={(e) => setStockPartForm((current) => ({ ...current, customer: e.target.value }))} /></label>
          <label><span>Location</span><input value={stockPartForm.location} onChange={(e) => setStockPartForm((current) => ({ ...current, location: e.target.value.toUpperCase() }))} placeholder="เช่น A-01 หรือ RACK-02" /></label>
          <label><span>จำนวนสูงสุดต่อกล่อง *</span><input type="number" min="1" value={stockPartForm.standardQty} onChange={(e) => setStockPartForm((current) => ({ ...current, standardQty: e.target.value }))} required /></label>
          <div className="part-photo-editor">
            <div className="part-current-photo">{stockPartForm.materialCode ? <PartImage materialCode={stockPartForm.materialCode} version={formImage?.updatedAt} /> : <span>▧</span>}</div>
            <label className="part-change-photo"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPartImageFile(e.target.files?.[0] || null)} /><b>⇧ {formImage ? "เปลี่ยนรูปตัวอย่าง" : "เพิ่มรูปตัวอย่าง"}</b><small>{partImageFile?.name || "รูป Master · JPG, PNG, WebP (ไม่เกิน 5MB)"}</small></label>
          </div>
          <div className="part-photo-editor">
            <div className="part-current-photo">{stockPartForm.materialCode ? <PartImage materialCode={stockPartForm.materialCode} slot="actual" version={formActualImage?.updatedAt} /> : <span>▧</span>}</div>
            <label className="part-change-photo"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPartActualImageFile(e.target.files?.[0] || null)} /><b>⇧ {formActualImage ? "เปลี่ยนรูปชิ้นงานในกล่อง" : "เพิ่มรูปชิ้นงานในกล่อง"}</b><small>{partActualImageFile?.name || "รูปชิ้นงานที่จัดวางในกล่อง · ใช้เทียบตอนขายออก"}</small></label>
          </div>
        </form>
        <div className="part-editor-foot"><span>Excel รองรับคอลัมน์: Part / Material No., Part Name, Customer, Location และ Max Qty per Box</span>{stockPartForm.materialCode && <button type="button" className="tiny-button" onClick={clearPartForm}>＋ เพิ่ม Part ใหม่</button>}</div>
      </Card>}

      <Card className="part-list-card" title="รายการ Part ทั้งหมด" action={<div className="part-list-actions"><input value={partSearch} onChange={(e) => { setPartSearch(e.target.value); setPartPage(1); }} placeholder="⌕ ค้นหา Part No., ชื่อชิ้นงาน, ลูกค้า หรือ Location..." /><button className="button secondary" onClick={() => void downloadPartWorkbook("template")}>⇩ ดาวน์โหลด Template</button><button className="button secondary" disabled={!stock.parts.length} onClick={() => void downloadPartWorkbook("export")}>⇩ ดาวน์โหลดข้อมูล Part</button><button className="button secondary" onClick={() => void Promise.all([loadStock(), loadPartImages()])}>↻ รีเฟรช</button></div>}>
        {visibleParts.length ? <div className="part-modern-table">
          <div className="part-modern-head"><span>Part / Material No.</span><span>ชื่อชิ้นงาน</span><span>ลูกค้า</span><span>Location</span><span>จำนวนสูงสุดต่อกล่อง</span><span>สถานะ</span><span>จัดการ</span></div>
          <div className="part-modern-body">{paginatedParts.map((part) => {
            const image = partImages.find((item) => item.materialCode === part.materialCode);
            const hasTag = stock.tags.some((tag) => tag.materialCode === part.materialCode);
            return <div className="part-modern-row" key={part.materialCode}>
              <span className="part-code-cell"><PartImage materialCode={part.materialCode} compact version={image?.updatedAt} /><span><b>{part.materialCode}</b><small>{image ? "มีรูปชิ้นงาน" : "ยังไม่มีรูป"}</small></span></span>
              <span>{part.partName}</span><span>{part.customer || "—"}</span><span><b>{part.location || "—"}</b></span><span>{part.standardQty > 0 ? fmt(part.standardQty) + " ชิ้น" : "ยังไม่กำหนด"}</span>
              <span><em className={"part-active " + (part.active ? "on" : "off")}>{part.active ? "ใช้งาน" : "ยกเลิก"}</em></span>
              <span className="part-row-actions">{user.role === "admin" ? <><button className="tiny-button" onClick={() => editPart(part)}>✎ แก้ไข</button>{hasTag ? <small>มีประวัติ Stock</small> : <button className="tiny-button danger-outline" disabled={Boolean(deletingPartCode)} onClick={() => void deleteStockPart(part)}>♲ {deletingPartCode === part.materialCode ? "กำลังลบ…" : "ลบ"}</button>}</> : <small>ดูข้อมูลเท่านั้น</small>}</span>
            </div>;
          })}</div>
          <footer>
            <span>แสดง {fmt(partStartIndex + 1)} - {fmt(Math.min(partStartIndex + partPageSize, visibleParts.length))} จาก {fmt(visibleParts.length)} รายการ</span>
            <nav className="part-pagination" aria-label="หน้ารายการ Part">
              <button className="part-page-button" disabled={safePartPage === 1} onClick={() => setPartPage(Math.max(1, safePartPage - 1))}>‹</button>
              {partPageButtons.map((item, index) => item === "…" ? <span className="part-page-dots" key={"dots-" + index}>…</span> : <button className={"part-page-button " + (item === safePartPage ? "active" : "")} key={item} onClick={() => setPartPage(item)}>{item}</button>)}
              <button className="part-page-button" disabled={safePartPage === partTotalPages} onClick={() => setPartPage(Math.min(partTotalPages, safePartPage + 1))}>›</button>
            </nav>
            <label className="part-page-size">แสดงต่อหน้า <select value={partPageSize} onChange={(e) => { setPartPageSize(Number(e.target.value)); setPartPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
          </footer>
        </div> : <Empty title="ไม่พบ Part" text={partNeedle ? "ลองเปลี่ยนคำค้นหา" : "ยังไม่มี Part ในทะเบียน Stock"} />}
      </Card>

      {user.role === "admin" && <details className="part-bulk-panel"><summary>อัปโหลดรูปหลาย Part พร้อมกัน — Master และรูปในกล่อง</summary>
        <form className="part-image-upload bulk" onSubmit={uploadPartImagesBulk}>
          <label className="part-file bulk-file"><span>รูปตัวอย่าง (Master) · ชื่อไฟล์ต้องตรงกับ Part No.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={bulkImageRunning} onChange={(e) => { setBulkMasterImageFiles([...(e.target.files || [])]); setBulkImageFailed([]); }} /><small>{bulkMasterImageFiles.length ? `เลือกแล้ว ${fmt(bulkMasterImageFiles.length)} รูป` : "เลือกได้หลายรูป"}</small></label>
          <label className="part-file bulk-file"><span>รูปชิ้นงานในกล่อง · ชื่อไฟล์ต้องตรงกับ Part No.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={bulkImageRunning} onChange={(e) => { setBulkActualImageFiles([...(e.target.files || [])]); setBulkImageFailed([]); }} /><small>{bulkActualImageFiles.length ? `เลือกแล้ว ${fmt(bulkActualImageFiles.length)} รูป` : "เลือกได้หลายรูป"}</small></label>
          <button className="button primary" disabled={bulkImageRunning || (!bulkMasterImageFiles.length && !bulkActualImageFiles.length)}>{bulkImageRunning ? `กำลังอัปโหลด ${fmt(bulkImageProgress.done)}/${fmt(bulkImageProgress.total)}…` : `⇧ อัปโหลด ${fmt(bulkMasterImageFiles.length + bulkActualImageFiles.length)} รูป`}</button>
        </form>
        <p className="part-bundle-help">ตั้งชื่อไฟล์เป็น Part No. เช่น <code>BA04U385G05-F.jpg</code> ระบบจะแยกเก็บ Master และรูปในกล่องตามช่องที่เลือก</p>
        {bulkImageFailed.length > 0 && <div className="bulk-preview failed"><b>ไฟล์ที่อัปโหลดไม่สำเร็จ</b><ul>{bulkImageFailed.map((item) => <li key={item.name}><code>{item.name}</code><small>{item.reason}</small></li>)}</ul></div>}
      </details>}
    </div>;
  }

  function renderTags() {
    const awaitingReceipt = stock.tags.filter((item) => item.status === "printed").length;
    const receivedTags = stock.tags.filter((item) => item.status === "in_stock" || item.status === "depleted").length;
    const tagNeedle = tagSearch.trim().toLowerCase();
    const visibleTags = stock.tags.filter((item) => !tagNeedle || [
      item.tagId, item.materialCode, item.partName, item.customer,
      item.jobNo, item.productionDate, item.createdAt,
    ].some((value) => String(value || "").toLowerCase().includes(tagNeedle)));
    const jobCount = new Set(stock.tags.map((item) => item.jobNo.trim().toUpperCase()).filter(Boolean)).size;
    const selectedStockPart = stock.parts.find((item) => item.materialCode === stockTagForm.materialCode);
    const selectedPartImage = partImages.find((item) => item.materialCode === stockTagForm.materialCode);
    const activeStockParts = stock.parts.filter((item) => item.active).sort((x, y) => x.materialCode.localeCompare(y.materialCode));
    const plannedTotalQty = Number(stockTagForm.qty || 0);
    const plannedBoxCount = selectedStockPart?.standardQty && plannedTotalQty > 0 ? Math.ceil(plannedTotalQty / selectedStockPart.standardQty) : 0;
    const tagTotalPages = Math.max(1, Math.ceil(visibleTags.length / tagPageSize));
    const safeTagPage = Math.min(tagPage, tagTotalPages);
    const tagStartIndex = (safeTagPage - 1) * tagPageSize;
    const paginatedTags = visibleTags.slice(tagStartIndex, tagStartIndex + tagPageSize);
    const tagPageButtons: Array<number | "…"> = [];
    for (let current = 1; current <= tagTotalPages; current += 1) {
      if (current === 1 || current === tagTotalPages || Math.abs(current - safeTagPage) <= 1) tagPageButtons.push(current);
      else if (tagPageButtons[tagPageButtons.length - 1] !== "…") tagPageButtons.push("…");
    }
    const jobGroupMap = new Map<string, { jobNo: string; materialCode: string; partName: string; totalQty: number; receivedQty: number; pendingQty: number; ngQty: number; tagCount: number }>();
    stock.tags.forEach((tag) => {
      const key = tag.jobNo + "|" + tag.materialCode;
      const current = jobGroupMap.get(key) || { jobNo: tag.jobNo, materialCode: tag.materialCode, partName: tag.partName, totalQty: 0, receivedQty: 0, pendingQty: 0, ngQty: 0, tagCount: 0 };
      current.totalQty += Number(tag.qty);
      current.tagCount += 1;
      if (tag.status === "printed") current.pendingQty += Number(tag.qty);
      else if (tag.status === "ng") current.ngQty += Number(tag.ngQty ?? tag.qty);
      else if (tag.status === "in_stock" || tag.status === "depleted") {
        current.receivedQty += Number(tag.receivedQty ?? tag.qty);
        current.ngQty += Number(tag.ngQty || 0);
      }
      jobGroupMap.set(key, current);
    });
    const stockJobGroups = [...jobGroupMap.values()].sort((a, b) => b.pendingQty - a.pendingQty || b.ngQty - a.ngQty || a.jobNo.localeCompare(b.jobNo));
    const jobCloseNeedle = jobCloseSearch.trim().toLowerCase();
    const filteredStockJobGroups = stockJobGroups.filter((group) => !jobCloseNeedle
      || group.jobNo.toLowerCase().includes(jobCloseNeedle)
      || group.materialCode.toLowerCase().includes(jobCloseNeedle)
      || group.partName.toLowerCase().includes(jobCloseNeedle));
    const jobClosePageSize = 10;
    const jobCloseTotalPages = Math.max(1, Math.ceil(filteredStockJobGroups.length / jobClosePageSize));
    const safeJobClosePage = Math.min(jobClosePage, jobCloseTotalPages);
    const jobCloseStartIndex = (safeJobClosePage - 1) * jobClosePageSize;
    const paginatedStockJobGroups = filteredStockJobGroups.slice(jobCloseStartIndex, jobCloseStartIndex + jobClosePageSize);
    const jobClosePageButtons: Array<number | "…"> = [];
    for (let current = 1; current <= jobCloseTotalPages; current += 1) {
      if (current === 1 || current === jobCloseTotalPages || Math.abs(current - safeJobClosePage) <= 1) jobClosePageButtons.push(current);
      else if (jobClosePageButtons[jobClosePageButtons.length - 1] !== "…") jobClosePageButtons.push("…");
    }

    return <div className="tag-print-home">
      <div className="tag-stat-row">
        <article className="tag-stat green"><span>▤</span><div><small>Tag ทั้งหมด</small><b>{fmt(stock.tags.length)}</b><em>ใบ</em></div></article>
        <article className="tag-stat orange"><span>◷</span><div><small>รอรับเข้า Stock</small><b>{fmt(awaitingReceipt)}</b><em>ใบ</em></div></article>
        <article className="tag-stat purple"><span>✓</span><div><small>รับเข้าแล้ว</small><b>{fmt(receivedTags)}</b><em>ใบ</em></div></article>
        <article className="tag-stat blue"><span>▣</span><div><small>Job ที่สร้าง Tag</small><b>{fmt(jobCount)}</b><em>Job</em></div></article>
      </div>

      {canPrintTags && <Card className="tag-create-card" title="สร้างและพิมพ์ Tag ก่อนส่งเข้า Stock" action={<button className="button primary" form="tag-create-form" disabled={stockSaving || !selectedStockPart || selectedStockPart.standardQty <= 0}>▣ {stockSaving ? "กำลังสร้าง…" : "สร้าง Tag"}</button>}>
        <form id="tag-create-form" className="tag-create-form" onSubmit={createStockTag}>
          <label className="tag-part-select"><span>เลือก Part *</span><input list="stock-part-codes" value={stockTagForm.materialCode} onChange={(event) => setStockTagForm((current) => ({ ...current, materialCode: event.target.value.toUpperCase(), qty: "" }))} placeholder="พิมพ์ Part No. หรือเลือกรายการ" autoComplete="off" spellCheck={false} required /></label>
          <datalist id="stock-part-codes">{activeStockParts.map((item) => <option key={item.materialCode} value={item.materialCode}>{item.partName}{item.customer ? ` · ${item.customer}` : ""}</option>)}</datalist>
          <label><span>จำนวนสูงสุดต่อกล่อง</span><input value={selectedStockPart?.standardQty ? fmt(selectedStockPart.standardQty) : ""} placeholder="เลือก Part ก่อน" readOnly /></label>
          <label><span>จำนวนงานรวม (Job) *</span><input type="number" min="1" value={stockTagForm.qty} onChange={(event) => setStockTagForm((current) => ({ ...current, qty: event.target.value }))} required /></label>
          <label className="tag-job-field"><span>Job *</span><input value={stockTagForm.jobNo} onChange={(event) => setStockTagForm((current) => ({ ...current, jobNo: event.target.value.toUpperCase() }))} placeholder="กรอก Job" required /></label>
          <div className="tag-auto-photo">{selectedStockPart ? <PartImage materialCode={selectedStockPart.materialCode} version={selectedPartImage?.updatedAt} /> : <div className="tag-auto-photo-empty"><span>▧</span><b>รูปชิ้นงาน</b><small>ดึงจากทะเบียน Part อัตโนมัติ</small></div>}</div>
          <div className="tag-create-note">
            <span>{selectedStockPart ? "✓" : "ⓘ"}</span>
            <div>{selectedStockPart ? <><b>{selectedStockPart.materialCode} · {selectedStockPart.partName}</b><small>{plannedBoxCount > 0 ? `ระบบจะสร้าง ${fmt(plannedBoxCount)} Tag · กล่องละสูงสุด ${fmt(selectedStockPart.standardQty)} ชิ้น` : "กรอกจำนวนงานรวมเพื่อคำนวณจำนวน Tag"}</small></> : <><b>{stockTagForm.materialCode ? "ไม่พบ Part นี้ในทะเบียน" : "เลือกรายการ Part เพื่อเริ่มสร้าง Tag"}</b><small>รูปและจำนวนต่อกล่องจะดึงจากทะเบียน Part</small></>}</div>
          </div>
          <button className="button primary tag-create-submit" disabled={stockSaving || !selectedStockPart || selectedStockPart.standardQty <= 0}>▣ สร้าง Tag ตามจำนวนกล่อง</button>
        </form>
        {createdStockTags.length > 0 && <div className="tag-created-banner"><PartImage materialCode={createdStockTags[0].materialCode} compact /><div><small>สร้างสำเร็จ · A4 หนึ่งหน้าสูงสุด 8 Tag</small><b>{fmt(createdStockTags.length)} Tag / {fmt(createdStockTags.reduce((sum, item) => sum + item.qty, 0))} ชิ้น</b><p>{createdStockTags[0].materialCode} · Job {createdStockTags[0].jobNo}</p></div><button className="button primary" onClick={() => void printStockTags(createdStockTags)}>▤ พิมพ์ Tag</button></div>}
      </Card>}

      {canPrintTags && <Card className="tag-list-card" title="Tag ที่สร้างแล้ว" action={<button className="button secondary" onClick={() => void loadStock()}>↻ รีเฟรช</button>}>
        <div className="tag-list-toolbar"><input value={tagSearch} onChange={(event) => { setTagSearch(event.target.value); setTagPage(1); }} placeholder="⌕ ค้นหา Tag ID, Part No., Job, ลูกค้า หรือวันที่ออก Tag" />{tagSearch && <button type="button" className="button secondary" onClick={() => { setTagSearch(""); setTagPage(1); }}>ล้าง</button>}</div>
        <p className="tag-list-help">พบ {fmt(visibleTags.length)} จาก {fmt(stock.tags.length)} Tag · Tag ที่สร้างแล้วแก้ไขไม่ได้ การพิมพ์ซ้ำใช้ Tag ID เดิมและไม่เพิ่มยอด Stock</p>
        {stockLoading ? <div className="inline-loading">กำลังโหลด Tag…</div> : visibleTags.length ? <div className="tag-modern-table">
          <div className="tag-modern-head"><span>Tag ID</span><span>Part / รูปชิ้นงาน</span><span>จำนวน/กล่อง</span><span>Job</span><span>วันที่ออก Tag / รับเข้า Stock</span><span>สถานะ</span><span>จัดการ</span></div>
          <div className="tag-modern-body">{paginatedTags.map((item) => {
            const image = partImages.find((entry) => entry.materialCode === item.materialCode);
            const boxMatch = item.tagId.match(/-B(\d+)OF(\d+)$/);
            const statusText = item.status === "ng" ? "NG / ปิดรับเข้า" : item.status === "depleted" ? "ขายออกหมด" : item.status === "printed" ? "รอรับเข้า" : item.reservedQty ? "รอขายออก" : "รับเข้าแล้ว";
            const statusClass = item.status === "ng" || item.status === "depleted" ? "over" : item.status === "printed" || item.reservedQty ? "partial" : "completed";
            return <div className="tag-modern-row" key={item.id}>
              <span className="tag-id-cell"><b>{item.tagId}</b><small>{boxMatch ? `กล่อง ${Number(boxMatch[1])} / ${Number(boxMatch[2])}` : "Tag งาน"}</small></span>
              <span className="tag-product-cell"><PartImage materialCode={item.materialCode} compact version={image?.updatedAt} /><span><b>{item.materialCode}</b><small>{item.partName}</small><small>{item.customer || "ไม่ระบุลูกค้า"}</small></span></span>
              <span><b>{fmt(item.qty)} ชิ้น</b></span>
              <span><b>{item.jobNo}</b></span>
              <span><b>ออก Tag: {formatDateOnly(item.createdAt)}</b><small>{item.receivedAt ? `รับเข้า Stock: ${formatDateTime(item.receivedAt)}` : "วันที่ผลิต: รอรับเข้า Stock"}</small></span>
              <span><em className={`status ${statusClass}`}>{statusText}</em></span>
              <span className="tag-row-actions"><button className="tiny-button" onClick={() => void printStockTags(item)}>▤ พิมพ์</button>{user.role === "admin" && item.status === "printed" && <button type="button" className="tiny-button danger-outline" disabled={Boolean(deletingStockTagId)} onClick={() => void deleteStockTag(item)}>{deletingStockTagId === item.tagId ? "กำลังลบ…" : "♲ ลบ"}</button>}</span>
            </div>;
          })}</div>
          <footer>
            <span>แสดง {fmt(tagStartIndex + 1)} - {fmt(Math.min(tagStartIndex + tagPageSize, visibleTags.length))} จาก {fmt(visibleTags.length)} รายการ</span>
            <nav className="part-pagination" aria-label="หน้ารายการ Tag"><button className="part-page-button" disabled={safeTagPage === 1} onClick={() => setTagPage(Math.max(1, safeTagPage - 1))}>‹</button>{tagPageButtons.map((item, index) => item === "…" ? <span className="part-page-dots" key={"tag-dots-" + index}>…</span> : <button className={"part-page-button " + (item === safeTagPage ? "active" : "")} key={item} onClick={() => setTagPage(item)}>{item}</button>)}<button className="part-page-button" disabled={safeTagPage === tagTotalPages} onClick={() => setTagPage(Math.min(tagTotalPages, safeTagPage + 1))}>›</button></nav>
            <label className="part-page-size">แสดงต่อหน้า <select value={tagPageSize} onChange={(event) => { setTagPageSize(Number(event.target.value)); setTagPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
          </footer>
        </div> : <Empty title={tagNeedle ? "ไม่พบ Tag ที่ค้นหา" : "ยังไม่มี Tag"} text={tagNeedle ? "ลองเปลี่ยนคำค้นหา" : "เลือก Part และสร้าง Tag สำหรับนำงานเข้า Stock"} />}
      </Card>}
      {allowedPages.has("stock") && <Card className="stock-job-close-card" title="ปิดรับเข้า Job / จัดการงาน NG">
        <p className="stock-job-close-help">เมื่อรับงานเข้าไม่ครบตาม Tag ให้ตรวจยอดแล้วกดปิดรับเข้า ระบบจะเปลี่ยนเฉพาะ Tag ที่ยังไม่ถูกยิงเป็น NG และไม่นับรวมใน Stock</p>
        <div className="stock-job-close-search"><span>⌕</span><input value={jobCloseSearch} onChange={(event) => { setJobCloseSearch(event.target.value); setJobClosePage(1); }} placeholder="ค้นหา Job, Part No. หรือชื่อชิ้นงาน..." />{jobCloseSearch && <button type="button" onClick={() => { setJobCloseSearch(""); setJobClosePage(1); }}>×</button>}</div>
        {filteredStockJobGroups.length ? <><div className="stock-job-close-summary">{paginatedStockJobGroups.map((group) => {
          const key = group.jobNo + "|" + group.materialCode;
          return <div className="stock-job-close-row" key={key}>
            <span><b>{group.jobNo}</b><small>{fmt(group.tagCount)} Tag</small></span>
            <span><b>{group.materialCode}</b><small>{group.partName}</small></span>
            <span className="job-metric"><small>ทั้งหมด</small><b>{fmt(group.totalQty)}</b></span>
            <span className="job-metric received"><small>รับเข้าแล้ว</small><b>{fmt(group.receivedQty)}</b></span>
            <span className="job-metric waiting"><small>รอรับเข้า</small><b>{fmt(group.pendingQty)}</b></span>
            <span className="job-metric ng"><small>NG</small><b>{fmt(group.ngQty)}</b></span>
            <span className="job-actions">{group.pendingQty > 0 && <button className="button danger" disabled={Boolean(jobClosingKey)} onClick={() => void closeStockJob(group.jobNo, group.materialCode, group.totalQty, group.receivedQty, group.pendingQty)}>{jobClosingKey === key ? "กำลังปิด…" : "ปิดรับเข้า Job"}</button>}{group.ngQty > 0 && user.role === "admin" && <button className="button secondary" disabled={Boolean(jobClosingKey)} onClick={() => void reopenNgStockJob(group.jobNo, group.materialCode, group.ngQty)}>เปิด Job คืน</button>}{group.pendingQty === 0 && group.ngQty === 0 && <em className="stock-job-complete">✓ รับเข้าครบแล้ว</em>}</span>
          </div>;
        })}</div><footer className="stock-job-close-pagination"><span>แสดง {fmt(jobCloseStartIndex + 1)} - {fmt(Math.min(jobCloseStartIndex + jobClosePageSize, filteredStockJobGroups.length))} จาก {fmt(filteredStockJobGroups.length)} Job</span><nav aria-label="หน้ารายการปิดรับเข้า Job"><button disabled={safeJobClosePage === 1} onClick={() => setJobClosePage(Math.max(1, safeJobClosePage - 1))}>‹</button>{jobClosePageButtons.map((item, index) => item === "…" ? <span key={"job-dots-" + index}>…</span> : <button className={item === safeJobClosePage ? "active" : ""} key={item} onClick={() => setJobClosePage(item)}>{item}</button>)}<button disabled={safeJobClosePage === jobCloseTotalPages} onClick={() => setJobClosePage(Math.min(jobCloseTotalPages, safeJobClosePage + 1))}>›</button></nav><b>10 Job / หน้า</b></footer></> : <Empty title={jobCloseSearch ? "ไม่พบ Job ที่ค้นหา" : "ยังไม่มี Job"} text={jobCloseSearch ? "ลองค้นหาด้วย Job, Part No. หรือชื่อชิ้นงาน" : "เมื่อสร้าง Tag แล้ว Job จะแสดงในส่วนนี้"} />}
        {stock.jobClosures.length > 0 && <div className="stock-job-close-history"><b>ประวัติปิดรับเข้าล่าสุด</b><ul>{stock.jobClosures.slice(0, 5).map((item) => <li key={item.id}><b>{item.jobNo}</b><span>{item.materialCode}</span><em>NG {fmt(item.ngQty)} ชิ้น</em><span>{item.reason}</span><span>{item.closedByName} · {formatDateTime(item.closedAt)}</span></li>)}</ul></div>}
      </Card>}
    </div>;
  }

  function renderStock() {
    const receivedStockTags = stock.tags.filter((item) => item.status === "in_stock" || item.status === "depleted");
    const onHand = receivedStockTags.reduce((sum, item) => sum + Number(item.remainingQty), 0);
    const reserved = receivedStockTags.reduce((sum, item) => sum + Number(item.reservedQty), 0);
    const available = Math.max(onHand - reserved, 0);
    const awaitingReceipt = stock.tags.filter((item) => item.status === "printed").length;
    const todayKey = new Date().toISOString().slice(0, 10);
    const receivedToday = receivedStockTags.filter((item) => (item.receivedAt || "").slice(0, 10) === todayKey).reduce((sum, item) => sum + Number(item.receivedQty ?? item.qty), 0);
    const dispatchedToday = stock.dispatchLinks.filter((item) => (item.dispatchedAt || "").slice(0, 10) === todayKey).reduce((sum, item) => sum + Number(item.qty), 0);
    const stockNeedle = tagSearch.trim().toLowerCase();
    const recentStock = receivedStockTags.filter((item) => !stockNeedle || [item.tagId, item.materialCode, item.partName, item.jobNo].some((value) => String(value || "").toLowerCase().includes(stockNeedle))).slice(0, 6);
    const totalForChart = Math.max(onHand, 1);
    const readyPercent = Math.round((available / totalForChart) * 100);
    const reservedPercent = Math.round((reserved / totalForChart) * 100);
    const trendDays = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - offset));
      const key = date.toISOString().slice(0, 10);
      return { key, label: String(date.getDate()) + "/" + String(date.getMonth() + 1), qty: receivedStockTags.filter((item) => (item.receivedAt || "").slice(0, 10) === key).reduce((sum, item) => sum + Number(item.receivedQty ?? item.qty), 0) };
    });
    const trendMax = Math.max(...trendDays.map((item) => item.qty), 1);
    return <div className="stock-home">
      <div className="stock-stat-row">
        <article className="stock-stat blue"><span>◇</span><div><small>Tag รอรับเข้า</small><b>{fmt(awaitingReceipt)}</b><em>ใบ</em></div><button onClick={() => go("tags")}>ดูรายละเอียด →</button></article>
        <article className="stock-stat green"><span>□</span><div><small>Stock คงเหลือ</small><b>{fmt(onHand)}</b><em>ชิ้น</em></div><button onClick={() => void loadStock()}>ดูรายละเอียด →</button></article>
        <article className="stock-stat orange"><span>⇧</span><div><small>รอขายออก</small><b>{fmt(reserved)}</b><em>ชิ้น</em></div><button onClick={() => go("arrange")}>ดูรายละเอียด →</button></article>
        <article className="stock-stat red"><span>✓</span><div><small>พร้อมจัดงาน</small><b>{fmt(available)}</b><em>ชิ้น</em></div><button onClick={() => go("arrange")}>ดูรายละเอียด →</button></article>
      </div>
      <div className="stock-main-grid">
        <Card className="stock-receive-card" title="1. สแกน Tag เพื่อรับเข้า Stock">
          <button type="button" className="stock-camera-zone" onClick={() => { setCameraPurpose("stock"); setCameraOpen(true); }}><span>⌗</span><b>พร้อมสแกน Tag</b><small>นำ Tag มาแตะที่เครื่องสแกน</small></button>
          <div className="stock-scan-count"><i /> สแกนแล้ว {fmt(receivedStockTags.length)} ใบ</div>
          <form className="stock-receive-form" onSubmit={receiveStockTag}><input ref={stockScanInputRef} value={stockScan} onChange={(e) => updateStockScannerValue(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); const value = event.currentTarget.value.trim(); if (value) void receiveStockTag(value); } }} placeholder="เช่น TG-20250901-0001" autoComplete="off" autoFocus /><button className="button primary" disabled={!stockScan.trim() || stockSaving}>{stockSaving ? "กำลังตรวจสอบ…" : "ตรวจสอบก่อนรับเข้า"}</button></form>
          <div className="stock-guide"><b>↕ ขั้นตอนการทำงาน</b><p>สแกน Tag ทีละใบ เพื่อบันทึกรับเข้า Stock เข้าระบบอัตโนมัติ</p></div>
        </Card>
        <Card className="stock-latest-card" title="2. รายการ Stock ล่าสุด" action={<div className="stock-list-tools"><input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="ค้นหา Tag / รายการสินค้า / Job..." /><button onClick={() => void loadStock()}>↻</button></div>}>
          {stockLoading ? <div className="inline-loading">กำลังโหลด Stock…</div> : recentStock.length ? <><div className="stock-latest-head"><span>Tag / QR</span><span>รายการสินค้า</span><span>Job</span><span>วันที่รับเข้า</span><span>สถานะ</span><span>คงเหลือ</span></div><div className="stock-latest-list">{recentStock.map((item) => {
            const itemAvailable = Math.max(Number(item.remainingQty) - Number(item.reservedQty), 0);
            const statusClass = item.status === "depleted" ? "depleted" : Number(item.reservedQty) ? "reserved" : "ready";
            const statusText = item.status === "depleted" ? "ขายออกหมด" : Number(item.reservedQty) ? "รอขายออก" : "พร้อมจัดงาน";
            return <button key={item.id} className="stock-latest-row" onClick={() => setTagSearch(item.tagId)}><span className="tag-cell"><i>▦</i><b>{item.tagId}</b></span><span><b>{item.materialCode}</b><small>{item.partName}</small></span><span><b>{item.jobNo}</b></span><span><b>{item.receivedAt ? formatDate(item.receivedAt) : "—"}</b></span><span><em className={"stock-state " + statusClass}>{statusText}</em></span><span className="remain-cell"><b>{fmt(itemAvailable)}</b> ชิ้น <i>›</i></span></button>;
          })}</div><button className="stock-view-all" onClick={() => setTagSearch("")}>ดูรายการทั้งหมด →</button></> : <Empty title="ยังไม่มี Stock" text={stockNeedle ? "ไม่พบรายการที่ค้นหา" : "ยิง Tag รับงานเข้า Stock แล้วรายการจะแสดงที่นี่"} />}
        </Card>
      </div>
      <Card className="stock-management-card" title="รับเข้าแบบคีย์เอง / ปรับยอดตรวจนับ">
        <div className="stock-management-grid">
          <form className="stock-management-panel manual" onSubmit={saveManualStockReceipt}>
            <header><span>＋</span><div><b>รับงานเข้า Stock แบบคีย์เอง</b><small>สำหรับงานที่ไม่มี KIT Tag ระบบจะสร้าง Tag ภายในให้อัตโนมัติ</small></div></header>
            <div className="stock-management-fields">
              <label><span>Part / Material *</span><select required value={manualStockForm.materialCode} onChange={(event) => setManualStockForm((current) => ({ ...current, materialCode: event.target.value }))}><option value="">เลือก Part</option>{stock.parts.filter((part) => part.active).map((part) => <option key={part.materialCode} value={part.materialCode}>{part.materialCode} · {part.partName}</option>)}</select></label>
              <label><span>จำนวนรับเข้า *</span><input required type="number" min={1} step={1} inputMode="numeric" value={manualStockForm.qty} onChange={(event) => setManualStockForm((current) => ({ ...current, qty: event.target.value.replace(/[^0-9]/g, "") }))} placeholder="จำนวนชิ้น" /></label>
              <label><span>Job / เอกสารอ้างอิง *</span><input required value={manualStockForm.jobNo} onChange={(event) => setManualStockForm((current) => ({ ...current, jobNo: event.target.value }))} placeholder="เช่น JOB-260904-001" /></label>
              <label><span>วันที่ผลิต *</span><input required type="date" value={manualStockForm.productionDate} onChange={(event) => setManualStockForm((current) => ({ ...current, productionDate: event.target.value }))} /></label>
              <label><span>เลขที่ใบรับ / อ้างอิง</span><input value={manualStockForm.referenceNo} onChange={(event) => setManualStockForm((current) => ({ ...current, referenceNo: event.target.value }))} placeholder="ไม่บังคับ" /></label>
              <label className="wide"><span>หมายเหตุ</span><input value={manualStockForm.note} onChange={(event) => setManualStockForm((current) => ({ ...current, note: event.target.value }))} placeholder="ระบุที่มาของงานหรือรายละเอียดเพิ่มเติม" /></label>
            </div>
            <button className="button primary stock-management-submit" disabled={stockManagementSaving}>{stockManagementSaving ? "กำลังบันทึก…" : "✓ บันทึกรับเข้า Stock"}</button>
          </form>
          {user.role === "admin" ? <form className="stock-management-panel count" onSubmit={previewStockCount}>
            <header><span>≋</span><div><b>ตรวจนับและปรับยอดสิ้นเดือน</b><small>ยอดลดจะไล่ตัดจาก KIT Tag ที่มีอยู่จริง โดยไม่แตะงานที่จัดรอขาย</small></div></header>
            <div className="stock-management-fields">
              <label><span>Part / Material *</span><select required value={stockCountForm.materialCode} onChange={(event) => setStockCountForm((current) => ({ ...current, materialCode: event.target.value }))}><option value="">เลือก Part</option>{stock.parts.filter((part) => part.active).map((part) => <option key={part.materialCode} value={part.materialCode}>{part.materialCode} · {part.partName}</option>)}</select></label>
              <label><span>ยอดนับจริง *</span><input required type="number" min={0} step={1} inputMode="numeric" value={stockCountForm.countedQty} onChange={(event) => setStockCountForm((current) => ({ ...current, countedQty: event.target.value.replace(/[^0-9]/g, "") }))} placeholder="รวมทุก Tag" /></label>
              <label><span>วันที่ตรวจนับ *</span><input required type="date" value={stockCountForm.countDate} onChange={(event) => setStockCountForm((current) => ({ ...current, countDate: event.target.value }))} /></label>
              <label className="wide"><span>สาเหตุการปรับยอด *</span><input required value={stockCountForm.reason} onChange={(event) => setStockCountForm((current) => ({ ...current, reason: event.target.value }))} placeholder="เช่น ตรวจนับสิ้นเดือน / พบยอดคลาดเคลื่อน" /></label>
            </div>
            <button className="button stock-count-preview-button" disabled={stockManagementSaving}>{stockManagementSaving ? "กำลังตรวจสอบ…" : "ตรวจสอบยอดก่อนปรับ →"}</button>
          </form> : <aside className="stock-management-panel locked"><span>🔒</span><b>ปรับยอดตรวจนับสิ้นเดือน</b><p>ส่วนนี้จำกัดเฉพาะผู้ดูแลระบบ เพื่อป้องกันการแก้ยอด Stock โดยไม่ตั้งใจ</p></aside>}
        </div>
        {(stock.manualReceipts.length > 0 || stock.countAdjustments.length > 0) && <div className="stock-management-history">
          <div>
            <b>รับเข้าแบบคีย์ล่าสุด</b>
            {stock.manualReceipts.slice(0, 5).map((item) => <article key={item.id}><span><b>{item.materialCode}</b><small>{item.jobNo} · {item.tagId}</small></span><em className="plus">+{fmt(item.qty)}</em><small>{item.receivedByName} · {formatDateTime(item.receivedAt)}</small></article>)}
            {!stock.manualReceipts.length && <p>ยังไม่มีรายการ</p>}
          </div>
          <div>
            <b>ประวัติปรับยอดล่าสุด</b>
            {stock.countAdjustments.slice(0, 5).map((item) => <article key={item.id}><span><b>{item.materialCode}</b><small>{item.adjustmentNo} · {item.reason}</small></span><em className={item.difference < 0 ? "minus" : item.difference > 0 ? "plus" : "equal"}>{item.difference > 0 ? "+" : ""}{fmt(item.difference)}</em><small>{item.adjustedByName} · {formatDateTime(item.adjustedAt)}</small></article>)}
            {!stock.countAdjustments.length && <p>ยังไม่มีรายการ</p>}
          </div>
        </div>}
      </Card>
      <div className="stock-analytics-grid">
        <Card className="stock-status-card" title="3. สรุปสถานะ Stock"><div className="stock-donut-wrap"><div className="stock-donut" style={{ "--ready-stock": String(readyPercent * 3.6) + "deg" } as React.CSSProperties}><span><b>{fmt(onHand)}</b><small>ชิ้น</small></span></div><ul><li><i className="ready" /><span>พร้อมจัดงาน</span><b>{fmt(available)} ชิ้น</b><em>{readyPercent}%</em></li><li><i className="reserved" /><span>รอขายออก</span><b>{fmt(reserved)} ชิ้น</b><em>{reservedPercent}%</em></li></ul></div></Card>
        <Card className="stock-trend-card" title="แนวโน้ม 7 วันที่ผ่านมา"><div className="stock-trend-chart">{trendDays.map((item) => <div key={item.key} className="trend-column"><b>{item.qty ? fmt(item.qty) : ""}</b><i style={{ height: String(Math.max((item.qty / trendMax) * 100, 4)) + "%" }} /><span>{item.label}</span></div>)}</div></Card>
        <aside className="stock-today-card"><div><span className="blue">⇩</span><p><small>รับเข้า (วันนี้)</small><b>{fmt(receivedToday)} ชิ้น</b></p></div><div><span className="green">⇧</span><p><small>เบิกออก (วันนี้)</small><b>{fmt(dispatchedToday)} ชิ้น</b></p></div><div><span className="purple">▤</span><p><small>คงเหลือรวม</small><b>{fmt(onHand)} ชิ้น</b></p></div></aside>
      </div>
      <Card title="Traceability: Tag ลูกค้า ↔ KIT Tag ↔ Job">
        {stock.dispatchLinks.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>Tag ลูกค้า</th><th>KIT Tag / Job</th><th>Part / Due</th><th>ผลิต / รับเข้า</th><th className="num">จำนวน</th><th>ผู้จัด / ผู้ตรวจ</th></tr></thead><tbody>{stock.dispatchLinks.slice(0, 50).map((item) => <tr key={item.id}><td data-label="Tag ลูกค้า"><b>{item.customerTagId}</b></td><td data-label="KIT Tag / Job"><b>{item.stockTagCode}</b><small>Job {item.jobNo}</small></td><td data-label="Part / Due"><b>{item.materialCode}</b><small>{item.fact} / {item.line || "—"} · DO {item.doNo}</small></td><td data-label="ผลิต / รับเข้า"><b>{formatDate(item.productionDate)}</b><small>{item.receivedAt ? formatDateTime(item.receivedAt) : "—"}</small></td><td data-label="จำนวน" className="num"><b>{fmt(item.qty)}</b></td><td data-label="ผู้จัด / ผู้ตรวจ"><b>{item.pickedByName}</b><small>{item.dispatchedByName} · {formatDateTime(item.dispatchedAt)}</small></td></tr>)}</tbody></table></div> : <Empty title="ยังไม่มี Traceability ขายออก" text="เมื่อผู้ตรวจยิง Tag ลูกค้า ระบบจะแสดง KIT Tag, Job, วันที่ผลิต และวันที่รับเข้าที่ใช้จริง" />}
      </Card>

    </div>;
  }

  function renderPlan() {
    const planTotalPages = Math.max(1, Math.ceil(filtered.length / planPageSize));
    const safePlanPage = Math.min(planPage, planTotalPages);
    const planStartIndex = (safePlanPage - 1) * planPageSize;
    const paginatedDues = filtered.slice(planStartIndex, planStartIndex + planPageSize);
    const planPageButtons: Array<number | "…"> = [];
    for (let current = 1; current <= planTotalPages; current += 1) {
      if (current === 1 || current === planTotalPages || Math.abs(current - safePlanPage) <= 1) planPageButtons.push(current);
      else if (planPageButtons[planPageButtons.length - 1] !== "…") planPageButtons.push("…");
    }
    const latestImport = payload.imports[0];
    const resetPlanFilters = () => {
      setFilterDate(""); setFilterFact("ALL"); setFilterTime("ALL"); setQuery(""); setPlanPage(1);
    };

    return <div className="plan-home">
      <input ref={fileInput} type="file" accept=".xlsx,.xls" hidden onChange={parseExcel} />
      <div className="plan-top-row">
        <article className="plan-stat blue"><span>▤</span><div><small>แผนทั้งหมด</small><b>{fmt(summary.items)}</b><em>รายการ</em></div></article>
        <article className="plan-stat green"><span>✓</span><div><small>ครบตามแผน</small><b>{fmt(summary.completed)}</b><em>รายการ</em></div></article>
        <article className="plan-stat orange"><span>◷</span><div><small>คงเหลือ</small><b>{fmt(summary.partial + summary.pending)}</b><em>รายการ</em></div></article>
        <article className="plan-stat red"><span>!</span><div><small>เกิน Due</small><b>{fmt(summary.over)}</b><em>รายการ</em></div></article>
        <button className="plan-import-button" onClick={() => fileInput.current?.click()}>⇧ นำเข้าแผนส่งงาน Excel</button>
      </div>

      <Card className="plan-filter-card" title="ค้นหาแผนส่งงาน">
        <button className="mobile-filter-toggle" type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><span>⌄</span>{filtersOpen ? "ซ่อนตัวกรอง" : "แสดงตัวกรอง"}</button>
        <div className={`plan-filter-grid ${filtersOpen ? "mobile-open" : ""}`}>
          <label><span>วันที่ส่งงาน</span><select value={filterDate} onChange={(event) => { setFilterDate(event.target.value); setPlanPage(1); }}><option value="">ทุกวันที่</option>{dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
          <label><span>โรงงาน (FAC)</span><select value={filterFact} onChange={(event) => { setFilterFact(event.target.value); setPlanPage(1); }}><option value="ALL">ทั้งหมด</option>{facts.map((fact) => <option key={fact}>{fact}</option>)}</select></label>
          <label><span>เวลา</span><select value={filterTime} onChange={(event) => { setFilterTime(event.target.value); setPlanPage(1); }}><option value="ALL">ทั้งหมด</option>{times.map((time) => <option key={time}>{time}</option>)}</select></label>
          <label><span>ค้นหา</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPlanPage(1); }} placeholder="Material / Part No. / DO" /></label>
          <button className="button primary" onClick={() => setPlanPage(1)}>⌕ ค้นหา</button>
          <button className="button secondary" onClick={resetPlanFilters}>↻ ล้างค่า</button>
        </div>
        {(file || parsing) && <div className="import-preview plan-import-preview"><div><span>XL</span><p><b>{file?.name}</b><small>{parsing ? "กำลังอ่านไฟล์…" : `${fmt(previewRows.length)} รายการ · ${fmt(previewRows.reduce((sum, row) => sum + row.reqQty, 0))} ชิ้น`}</small></p></div><button className="button primary" disabled={!previewRows.length || importing} onClick={importExcel}>{importing ? "กำลังนำเข้า…" : "ยืนยันนำเข้า"}</button></div>}
      </Card>

      <Card className="plan-list-card" title={<span className="plan-list-title">▦ รายการแผนส่งงาน <em>{fmt(filtered.length)} รายการ</em></span>} action={<span className="plan-last-import">{latestImport ? `อัปโหลดล่าสุด: ${formatDateTime(latestImport.createdAt)} โดย ${latestImport.importedByName}` : "ยังไม่มีประวัตินำเข้า"}</span>}>
        {paginatedDues.length ? <div className="plan-modern-table">
          <div className="plan-modern-head"><span>วันที่ส่งงาน</span><span>โรงงาน (FAC)</span><span>เวลา</span><span>Part / Material No.</span><span>ลูกค้า / Site</span><span>Job / DO</span><span>จำนวน (ชิ้น)</span><span>สถานะ</span><span>จัดการ</span></div>
          <div className="plan-modern-body">{paginatedDues.map((due) => {
            const image = partImages.find((item) => item.materialCode === due.materialCode);
            const importRow = payload.imports.find((item) => item.id === due.importId);
            return <div className="plan-modern-row" key={due.id}>
              <span><b>{formatDate(due.deliveryDate)}</b><small>{due.shop || "—"}</small></span>
              <span><b>{due.fact}</b><small>{due.line || due.shop || "—"}</small></span>
              <span><b>{due.deliveryTime}</b></span>
              <span className="plan-part-cell"><PartImage materialCode={due.materialCode} compact version={image?.updatedAt} /><span><b>{due.materialCode}</b><small>{due.materialDescription || "—"}</small></span></span>
              <span><b>{due.site || "—"}</b></span>
              <span><b>{due.doNo}</b><small>Seq {due.seq}</small></span>
              <span><b>{fmt(due.reqQty)} ชิ้น</b></span>
              <span><em className={`status ${Number(due.arrangedQty) > 0 && stateOf(due) === "pending" ? "partial" : stateOf(due)}`}>{stateLabel(due)}</em></span>
              <span>{importRow ? <button className="plan-delete-button" title="ลบชุด Excel ที่มีรายการนี้" disabled={deletingImportId === importRow.id} onClick={() => void deleteImport(importRow)}>{deletingImportId === importRow.id ? "…" : "♲"}</button> : "—"}</span>
            </div>;
          })}</div>
          <footer>
            <span>แสดง {fmt(planStartIndex + 1)} - {fmt(Math.min(planStartIndex + planPageSize, filtered.length))} จาก {fmt(filtered.length)} รายการ</span>
            <nav className="part-pagination" aria-label="หน้ารายการแผนส่งงาน"><button className="part-page-button" disabled={safePlanPage === 1} onClick={() => setPlanPage(Math.max(1, safePlanPage - 1))}>«</button>{planPageButtons.map((item, index) => item === "…" ? <span className="part-page-dots" key={"plan-dots-" + index}>…</span> : <button className={"part-page-button " + (item === safePlanPage ? "active" : "")} key={item} onClick={() => setPlanPage(item)}>{item}</button>)}<button className="part-page-button" disabled={safePlanPage === planTotalPages} onClick={() => setPlanPage(Math.min(planTotalPages, safePlanPage + 1))}>»</button></nav>
            <label className="part-page-size">แสดงต่อหน้า <select value={planPageSize} onChange={(event) => { setPlanPageSize(Number(event.target.value)); setPlanPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
          </footer>
        </div> : <Empty title="ไม่พบแผนส่งงาน" text="ลองเปลี่ยนวันที่ โรงงาน เวลา หรือคำค้นหา" />}
      </Card>
    </div>;
  }

  function renderScan(scanMode: "arrange" | "dispatch") {
    const progress = tagPreview ? Math.min(100, Math.round((tagPreview.due.projectedQty / tagPreview.due.reqQty) * 100)) : 0;
    const selectedArrangeDue = payload.dues.find((due) => String(due.id) === effectiveArrangeDueId);
    if (scanMode === "arrange") {
      const completedCount = payload.dues.filter((due) => Number(due.scannedQty) >= Number(due.reqQty)).length;
      const overdueCount = payload.dues.filter((due) => dueDeadlinePassed(due) && Number(due.scannedQty) < Number(due.reqQty)).length;
      const remainingCount = payload.dues.filter((due) => Number(due.scannedQty) < Number(due.reqQty)).length;
      const needle = arrangeDueSearch.trim().toLowerCase();
      const arrangeRows = arrangeableDues.filter((due) => !needle || [due.materialCode, due.materialDescription, due.doNo, due.fact, due.line, due.site, formatDate(due.deliveryDate), due.deliveryTime].join(" ").toLowerCase().includes(needle));
      const arrangePageSize = 8;
      const arrangePages = Math.max(1, Math.ceil(arrangeRows.length / arrangePageSize));
      const safeArrangePage = Math.min(arrangeListPage, arrangePages);
      const pageRows = arrangeRows.slice((safeArrangePage - 1) * arrangePageSize, safeArrangePage * arrangePageSize);
      const pickedTotal = stock.picks.reduce((sum, item) => sum + Number(item.pickedQty || 0), 0);
      const arrangedNeedle = arrangedSearch.trim().toLowerCase();
      const arrangedRows = stock.picks.filter((item) => !arrangedNeedle || [
        item.materialCode, item.jobNo, item.stockTagCode, item.doNo, item.fact,
        item.line, item.shop, item.deliveryDate, item.deliveryTime, item.pickedByName,
      ].join(" ").toLowerCase().includes(arrangedNeedle));
      const arrangedPageSize = 10;
      const arrangedPages = Math.max(1, Math.ceil(arrangedRows.length / arrangedPageSize));
      const safeArrangedPage = Math.min(arrangedPage, arrangedPages);
      const arrangedPageRows = arrangedRows.slice((safeArrangedPage - 1) * arrangedPageSize, safeArrangedPage * arrangedPageSize);
      return <>
        <div className="arrange-summary-grid">
          <article className="arrange-color-card blue" style={{ background: "linear-gradient(135deg,#e4f1ff 0%,#b9d8ff 100%)", borderColor: "#8fbdff" }}><span style={{ background: "linear-gradient(145deg,#48aaff,#075fe0)" }}>▦</span><div><small>งานทั้งหมด</small><b>{fmt(payload.dues.length)}</b><em>รายการ</em></div></article>
          <article className="arrange-color-card green" style={{ background: "linear-gradient(135deg,#e0faeb 0%,#abeac7 100%)", borderColor: "#7bd6a5" }}><span style={{ background: "linear-gradient(145deg,#50dc96,#08a455)" }}>✓</span><div><small>ครบตามแผน</small><b>{fmt(completedCount)}</b><em>รายการ</em></div></article>
          <article className="arrange-color-card orange" style={{ background: "linear-gradient(135deg,#fff3d4 0%,#ffd58a 100%)", borderColor: "#f3b94f" }}><span style={{ background: "linear-gradient(145deg,#ffc653,#ee8200)" }}>◷</span><div><small>คงเหลือ</small><b>{fmt(remainingCount)}</b><em>รายการ</em></div></article>
          <article className="arrange-color-card red" style={{ background: "linear-gradient(135deg,#ffe7eb 0%,#ffb5c1 100%)", borderColor: "#f28a9c" }}><span style={{ background: "linear-gradient(145deg,#ff7182,#df263f)" }}>!</span><div><small>เกิน Due</small><b>{fmt(overdueCount)}</b><em>รายการ</em></div></article>
          <article className="arrange-brand-card"><span>◇</span><div><b>จัดงานด้วย KIT Tag</b><small>เลือก Due แล้วสแกน Tag เพื่อบันทึกงานรอขายออก</small></div></article>
        </div>

        <div className="arrange-workspace">
          <section className="arrange-scan-panel">
            <header className="arrange-section-head"><span>⌗</span><div><h3>สแกน KIT Stock Tag</h3><p>เลือก Due ทางขวา แล้วสแกน Tag ของงานที่ต้องการจัด</p></div><button className="camera-button arrange-camera-button" onClick={() => { setCameraPurpose("scan"); setCameraOpen(true); }}>▣ เปิดกล้อง</button></header>
            <div className="arrange-scan-body">
              <button type="button" className="arrange-camera-zone" onClick={() => { setCameraPurpose("scan"); setCameraOpen(true); }}>
                <span>⌗</span><b>{checkingTag ? "กำลังบันทึกงาน…" : "พร้อมสแกน KIT Tag"}</b><small>ยิงบาร์โค้ด หรือแตะเพื่อเปิดกล้องโทรศัพท์</small><i />
              </button>
              <div className="arrange-result-card">
                {arrangementPreview ? <>
                  <div className="arrange-success"><span>✓</span><b>จัดงานสำเร็จ!</b></div>
                  <div className="arrange-part-result"><PartImage materialCode={arrangementPreview.due.materialCode} compact /><div><small>Part No.</small><b>{arrangementPreview.due.materialCode}</b><p>{arrangementPreview.due.materialDescription || "ไม่ระบุชื่อชิ้นงาน"}</p></div></div>
                  <dl><div><dt>Job</dt><dd>{arrangementPreview.tag.jobNo}</dd></div><div><dt>Due ทั้งหมด</dt><dd>{fmt(arrangementPreview.due.reqQty)} ชิ้น</dd></div><div><dt>จัดครั้งนี้</dt><dd>{fmt(arrangementPreview.pick.pickedQty)} ชิ้น</dd></div><div><dt>คงเหลือ</dt><dd>{fmt(arrangementPreview.due.remainingQty)} ชิ้น</dd></div></dl>
                </> : selectedArrangeDue ? <>
                  <div className="arrange-waiting"><span>▦</span><b>Due ที่เลือก</b></div>
                  <div className="arrange-part-result"><PartImage materialCode={selectedArrangeDue.materialCode} compact /><div><small>Part No.</small><b>{selectedArrangeDue.materialCode}</b><p>{selectedArrangeDue.materialDescription || "ไม่ระบุชื่อชิ้นงาน"}</p></div></div>
                  <dl><div><dt>FAC / Line</dt><dd>{selectedArrangeDue.fact} / {selectedArrangeDue.line || "—"}</dd></div><div><dt>Due</dt><dd>{formatDate(selectedArrangeDue.deliveryDate)} {selectedArrangeDue.deliveryTime}</dd></div><div><dt>ต้องจัด</dt><dd>{fmt(selectedArrangeDue.reqQty)} ชิ้น</dd></div><div><dt>เหลือจัด</dt><dd>{fmt(selectedArrangeDue.reqQty - selectedArrangeDue.scannedQty - (selectedArrangeDue.arrangedQty || 0))} ชิ้น</dd></div></dl>
                </> : <Empty title="กรุณาเลือก Due" text="เลือกรายการจากด้านขวาก่อนสแกน KIT Tag" />}
              </div>
            </div>
            <form className="arrange-action-form" onSubmit={stageStockTag}>
              <label><span>จำนวนที่จะจัด</span><input type="number" min="1" value={arrangeQty} onChange={(e) => setArrangeQty(e.target.value)} placeholder="อัตโนมัติตาม Due" /></label>
              <label className="arrange-tag-field"><span>KIT Stock Tag *</span><input ref={tagInput} value={arrangeTag} onChange={(e) => { setArrangeTag(e.target.value); setArrangementPreview(null); }} placeholder="ยิง Tag แล้วเครื่องส่ง Enter" autoComplete="off" /></label>
              <button className="button primary" disabled={!effectiveArrangeDueId || !arrangeTag.trim() || checkingTag}>{checkingTag ? "กำลังจัดงาน…" : "✓ ยืนยันจัดงาน"}</button>
            </form>
            <div className="arrange-help">ⓘ ขั้นตอนนี้บันทึกงาน “รอขายออก” เท่านั้น ยังไม่ลด Stock และ Due จนกว่าผู้ตรวจจะขายออก</div>
          </section>

          <aside className="arrange-due-panel">
            <header><span>▤</span><div><h3>เลือก Due</h3><p>{fmt(arrangeRows.length)} รายการที่ยังจัดไม่ครบ</p></div></header>
            <div className="arrange-due-search"><span>⌕</span><input value={arrangeDueSearch} onChange={(e) => { setArrangeDueSearch(e.target.value); setArrangeListPage(1); }} placeholder="ค้นหา Due, Job, Part No." /></div>
            <div className="arrange-due-cards">
              {arrangeRows.slice(0, 6).map((due) => {
                const selected = String(due.id) === effectiveArrangeDueId;
                const remaining = due.reqQty - due.scannedQty - (due.arrangedQty || 0);
                return <button key={due.id} className={selected ? "selected" : ""} onClick={() => { setArrangeDueId(String(due.id)); setArrangementPreview(null); }}>
                  <i>{selected ? "●" : "○"}</i><span>▦</span><div><b>{formatDate(due.deliveryDate)} · {due.fact}</b><small>{due.materialCode} · {due.deliveryTime}</small><em>เหลือจัด {fmt(remaining)} ชิ้น</em></div><strong>›</strong>
                </button>;
              })}
              {!arrangeRows.length && <Empty title="ไม่พบ Due" text="ลองเปลี่ยนคำค้นหา หรือนำเข้าแผนส่งงาน" />}
            </div>
          </aside>
        </div>

        <Card className="arrange-list-panel" title={<><span className="arrange-list-icon">▣</span> รายการงานที่ต้องจัด <em>{fmt(arrangeRows.length)} รายการ</em></>} action={<span className="arrange-selected-label">{selectedArrangeDue ? `Due: ${formatDate(selectedArrangeDue.deliveryDate)} · ${selectedArrangeDue.fact}` : "ยังไม่ได้เลือก Due"}</span>}>
          {pageRows.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table arrange-table"><thead><tr><th>เลือก</th><th>รูปภาพ</th><th>Part No.</th><th>Part Name</th><th>DO / Seq</th><th className="num">ต้องจัด</th><th className="num">จัดแล้ว</th><th className="num">คงเหลือ</th><th>สถานะ</th></tr></thead><tbody>
            {pageRows.map((due) => {
              const remaining = due.reqQty - due.scannedQty - (due.arrangedQty || 0);
              const selected = String(due.id) === effectiveArrangeDueId;
              return <tr key={due.id} className={selected ? "selected-row" : ""} onClick={() => { setArrangeDueId(String(due.id)); setArrangementPreview(null); }}>
                <td data-label="เลือก"><button className={`arrange-radio ${selected ? "selected" : ""}`}>{selected ? "●" : "○"}</button></td>
                <td data-label="รูปภาพ"><PartImage materialCode={due.materialCode} compact /></td>
                <td data-label="Part No."><b>{due.materialCode}</b><small>{due.fact} / {due.line || "—"}</small></td>
                <td data-label="Part Name">{due.materialDescription || "—"}</td>
                <td data-label="DO / Seq"><b>{due.doNo}</b><small>Seq {due.seq}</small></td>
                <td data-label="ต้องจัด" className="num"><b>{fmt(due.reqQty)}</b></td>
                <td data-label="จัดแล้ว" className="num"><b>{fmt(due.arrangedQty || 0)}</b></td>
                <td data-label="คงเหลือ" className="num"><b>{fmt(remaining)}</b></td>
                <td data-label="สถานะ"><span className={`status ${dueDeadlinePassed(due) ? "over" : Number(due.arrangedQty || 0) > 0 ? "partial" : "completed"}`}>{dueDeadlinePassed(due) ? "เกิน Due" : Number(due.arrangedQty || 0) > 0 ? "จัดบางส่วน" : "พร้อมจัด"}</span></td>
              </tr>;
            })}
          </tbody></table></div> : <Empty title="ไม่มีรายการที่ต้องจัด" text="ทุกรายการจัดครบแล้ว หรือไม่พบข้อมูลตามคำค้นหา" />}
          <div className="arrange-pagination"><span>แสดง {pageRows.length ? (safeArrangePage - 1) * arrangePageSize + 1 : 0} - {Math.min(safeArrangePage * arrangePageSize, arrangeRows.length)} จาก {fmt(arrangeRows.length)} รายการ</span><div><button disabled={safeArrangePage <= 1} onClick={() => setArrangeListPage((page) => Math.max(1, page - 1))}>«</button>{Array.from({ length: Math.min(arrangePages, 5) }, (_, index) => index + 1).map((page) => <button key={page} className={safeArrangePage === page ? "active" : ""} onClick={() => setArrangeListPage(page)}>{page}</button>)}{arrangePages > 5 && <em>… {arrangePages}</em>}<button disabled={safeArrangePage >= arrangePages} onClick={() => setArrangeListPage((page) => Math.min(arrangePages, page + 1))}>»</button></div><strong>จัดสะสม {fmt(pickedTotal)} ชิ้น</strong></div>
        </Card>

        <Card className="arrange-list-panel arranged-history-panel" title={<><span className="arranged-list-icon">✓</span> รายการที่จัดงานแล้ว <em>{fmt(arrangedRows.length)} รายการ</em></>} action={<div className="arranged-search"><span>⌕</span><input type="search" value={arrangedSearch} onChange={(event) => { setArrangedSearch(event.target.value); setArrangedPage(1); }} placeholder="ค้นหา Due, Part, Job, KIT Tag หรือผู้จัด" /></div>}>
          {arrangedPageRows.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table arranged-table"><thead><tr><th>วันที่จัด</th><th>รูปภาพ</th><th>Due</th><th>Part No.</th><th>Job / KIT Tag</th><th className="num">จำนวนจัด</th><th className="num">ขายแล้ว</th><th className="num">รอขาย</th><th>ผู้จัด</th><th>สถานะ</th></tr></thead><tbody>
            {arrangedPageRows.map((item) => {
              const waitingQty = Math.max(Number(item.pickedQty || 0) - Number(item.dispatchedQty || 0), 0);
              const dispatchState = waitingQty <= 0 ? "completed" : Number(item.dispatchedQty || 0) > 0 ? "partial" : "pending";
              return <tr key={item.id}>
                <td data-label="วันที่จัด"><b>{formatDateTime(item.pickedAt)}</b></td>
                <td data-label="รูปภาพ"><PartImage materialCode={item.materialCode} compact /></td>
                <td data-label="Due"><b>{formatDate(item.deliveryDate)} · {item.deliveryTime}</b><small>{item.fact} / {item.line || "—"} · {item.doNo} / Seq {item.seq}</small></td>
                <td data-label="Part No."><b>{item.materialCode}</b></td>
                <td data-label="Job / KIT Tag"><b>{item.jobNo || "—"}</b><small>{item.stockTagCode}</small></td>
                <td data-label="จำนวนจัด" className="num"><b>{fmt(item.pickedQty)}</b></td>
                <td data-label="ขายแล้ว" className="num"><b className="sent">{fmt(item.dispatchedQty || 0)}</b></td>
                <td data-label="รอขาย" className="num"><b className={waitingQty > 0 ? "warning" : ""}>{fmt(waitingQty)}</b></td>
                <td data-label="ผู้จัด"><b>{item.pickedByName || "—"}</b><small>{item.pickedByCode || ""}</small></td>
                <td data-label="สถานะ"><span className={`status ${dispatchState}`}>{waitingQty <= 0 ? "ขายออกแล้ว" : Number(item.dispatchedQty || 0) > 0 ? "ขายออกบางส่วน" : "รอขายออก"}</span></td>
              </tr>;
            })}
          </tbody></table></div> : <Empty title="ยังไม่มีรายการที่จัดงานแล้ว" text={arrangedSearch ? "ไม่พบรายการตามคำค้นหา" : "เมื่อยิง KIT Tag จัดงาน รายการจะแสดงที่นี่"} />}
          <div className="arrange-pagination"><span>แสดง {arrangedPageRows.length ? (safeArrangedPage - 1) * arrangedPageSize + 1 : 0} - {Math.min(safeArrangedPage * arrangedPageSize, arrangedRows.length)} จาก {fmt(arrangedRows.length)} รายการ</span><div><button disabled={safeArrangedPage <= 1} onClick={() => setArrangedPage((page) => Math.max(1, page - 1))}>«</button>{Array.from({ length: Math.min(arrangedPages, 5) }, (_, index) => index + 1).map((page) => <button key={page} className={safeArrangedPage === page ? "active" : ""} onClick={() => setArrangedPage(page)}>{page}</button>)}{arrangedPages > 5 && <em>… {arrangedPages}</em>}<button disabled={safeArrangedPage >= arrangedPages} onClick={() => setArrangedPage((page) => Math.min(arrangedPages, page + 1))}>»</button></div><strong>รอขายรวม {fmt(arrangedRows.reduce((sum, item) => sum + Math.max(Number(item.pickedQty || 0) - Number(item.dispatchedQty || 0), 0), 0))} ชิ้น</strong></div>
        </Card>
      </>;
    }
    const dispatchToday = payload.scans.filter((scan) => isToday(scan.createdAt));
    const dispatchTodayQty = dispatchToday.reduce((sum, scan) => sum + Number(scan.qty || 0), 0);
    const dispatchPending = stock.picks.filter((item) => Number(item.dispatchedQty || 0) < Number(item.pickedQty || 0));
    const dispatchPendingQty = dispatchPending.reduce((sum, item) => sum + Math.max(Number(item.pickedQty || 0) - Number(item.dispatchedQty || 0), 0), 0);
    const unmatchedCount = notice?.type === "error" ? 1 : 0;
    return <>
      <div className="dispatch-summary-grid">
        <article className="dispatch-stat blue"><span>▥</span><div><small>สแกนวันนี้</small><b>{fmt(dispatchTodayQty)}</b><em>ชิ้น · {fmt(dispatchToday.length)} รายการ</em></div></article>
        <article className="dispatch-stat green"><span>✓</span><div><small>ตัดสำเร็จ</small><b>{fmt(dispatchTodayQty)}</b><em>ชิ้น</em></div></article>
        <article className="dispatch-stat orange"><span>◷</span><div><small>รอตัด</small><b>{fmt(dispatchPendingQty)}</b><em>ชิ้น · {fmt(dispatchPending.length)} รายการ</em></div></article>
        <article className="dispatch-stat red"><span>!</span><div><small>สแกนไม่พบ</small><b>{fmt(unmatchedCount)}</b><em>รายการล่าสุด</em></div></article>
      </div>
      <div className="scan-layout">
        <section className="scanner-card">
          <div className="scanner-title"><div><h3>ผู้ตรวจ: ยิง Tag ลูกค้าเพื่อขายออก</h3><p>ระบบจับคู่กับ KIT Tag ที่จัดไว้ แล้วลด Stock และ Due พร้อมกัน</p></div><button className="camera-button" onClick={() => { setCameraPurpose("scan"); setCameraOpen(true); }}>▣ เปิดกล้อง</button></div>
          <div className="scanner-visual"><div className="scan-frame"><span className="qr-symbol">▦</span><b>{checkingTag ? "กำลังบันทึก…" : "พร้อมรับ QR Tag"}</b><small>วาง QR ให้อยู่ในกรอบ หรือยิง Tag ได้ทันที</small><i /></div></div>
          <form className="manual-scan" onSubmit={previewDispatchTag}><label><span>Tag ลูกค้า / ข้อมูลจาก QR</span><input ref={tagInput} value={rawTag} onChange={(e) => updateDispatchScannerValue(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); const value = event.currentTarget.value.trim(); if (value) void previewDispatchTag(value); } }} placeholder="ยิง Tag ลูกค้าได้ทันที" autoComplete="off" /></label><button className="button primary" disabled={!rawTag.trim() || checkingTag}>{checkingTag ? "กำลังตรวจสอบ…" : "ตรวจสอบก่อนขายออก"}</button></form>
        </section>
        <section className="tag-result" ref={tagResultRef}>
          <header><div><p>Customer Tag / Due</p><h3>{tagPreview?.due.materialCode || "รอการสแกน"}</h3></div><span className={`status ${tagPreview ? "completed" : "pending"}`}>{tagPreview ? "ขายออกสำเร็จ" : "ยังไม่มี Tag"}</span></header>
          {tagPreview ? <>
            <div className="tag-main" style={{ flexWrap: "wrap" }}><PartImagePair materialCode={tagPreview.due.materialCode} masterVersion={partImages.find((item) => item.materialCode === tagPreview.due.materialCode)?.updatedAt} actualVersion={partActualImages.find((item) => item.materialCode === tagPreview.due.materialCode)?.updatedAt} /><div><small>PART / MATERIAL</small><b>{tagPreview.due.materialCode}</b><p>{tagPreview.due.materialDescription || "ไม่ระบุรายละเอียด"}</p></div></div>
            <div className="detail-grid"><div><small>FAC / Line</small><b>{tagPreview.due.fact} / {tagPreview.due.line || "—"}</b></div><div><small>DO / Seq</small><b>{tagPreview.due.doNo} / {tagPreview.due.seq}</b></div><div><small>แผนส่งวัน / เวลา</small><b>{formatDate(tagPreview.due.deliveryDate)} {tagPreview.due.deliveryTime}</b></div><div><small>Tag ID</small><b>{tagPreview.tag.tagId}</b></div><div><small>Location</small><b>{tagPreview.tag.location || "—"}</b></div><div><small>จำนวนใน Tag</small><b>{fmt(tagPreview.tag.qty)} {tagPreview.tag.unit}</b></div></div>
            <div className="cut-summary"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><b>{progress}%</b>หลังขายออก</span></div><div className="cut-numbers"><p><span>Due ทั้งหมด</span><b>{fmt(tagPreview.due.reqQty)}</b></p><p><span>ขายออกแล้ว</span><b>{fmt(tagPreview.due.projectedQty)}</b></p><p className="current"><span>จำนวน Tag ลูกค้า</span><b>{fmt(tagPreview.tag.qty)}</b></p><p><span>Due คงเหลือ</span><b>{fmt(tagPreview.due.remainingAfter)}</b></p></div></div>
            {tagPreview.stockAllocations?.length ? <div className="linked-stock-tags"><b>Traceability: Tag ลูกค้า ↔ KIT Tag / Job</b>{tagPreview.stockAllocations.map((item, index) => <span key={`${item.stockTagId}-${index}`}><strong>{item.stockTagCode || `Stock #${item.stockTagId}`}</strong> · Job {item.jobNo || "—"} · ผลิต {item.productionDate ? formatDate(item.productionDate) : "—"} · รับเข้า {item.receivedAt ? formatDateTime(item.receivedAt) : "—"} · {fmt(item.qty)} ชิ้น</span>)}</div> : null}
            <div className="scan-saved">✓ ขายออกแล้ว ลด Stock และตัด Due พร้อมบันทึก Job ที่ใช้จริง</div>
          </> : <Empty title="รอผู้ตรวจยิง Tag ลูกค้า" text="สแกนแล้วระบบจะแสดงรูปชิ้นงาน ตรวจยอด และตัด Stock / Due ทันทีโดยไม่ต้องกดตรวจสอบ Tag" />}
        </section>
      </div>
      <Card title="รายการขายออกและตัดยอดล่าสุด" action={allowedPages.has("history") ? <button className="text-button" onClick={() => go("history")}>ดูประวัติทั้งหมด →</button> : undefined}>
        {payload.scans.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วัน / เวลา</th><th>FAC</th><th>Part No.</th><th>Tag ลูกค้า</th><th className="num">จำนวนที่ตัด</th><th>ผู้ตรวจ</th></tr></thead><tbody>{payload.scans.slice(0, 8).map((scan) => <tr key={scan.id}><td data-label="วัน / เวลา">{formatDateTime(scan.createdAt)}</td><td data-label="FAC"><b>{scan.fact}</b></td><td data-label="Part No."><b>{scan.materialCode}</b></td><td data-label="Tag ลูกค้า">{scan.tagId}</td><td data-label="จำนวนที่ตัด" className="num sent"><b>{fmt(scan.qty)} {scan.unit}</b></td><td data-label="ผู้ตรวจ">{scan.scannedByName}</td></tr>)}</tbody></table></div> : <Empty text="เมื่อผู้ตรวจสแกน Tag ลูกค้า รายการจะแสดงที่นี่" />}
      </Card>
    </>;
  }

  function renderVerify() {
    const r = verifyResult;
    const TONE: Record<VerifyVerdict, { tone: "pass" | "warn" | "fail"; icon: string; title: string }> = {
      ready: { tone: "pass", icon: "✓", title: "ตรงกับงานที่ต้องส่งออก" },
      ready_noimg: { tone: "pass", icon: "✓", title: "ตรงกับงาน (ยังไม่มีรูป master)" },
      short: { tone: "warn", icon: "!", title: "งานที่จัดรอไว้ไม่พอ" },
      over: { tone: "warn", icon: "!", title: "จำนวนเกิน Due" },
      no_due: { tone: "fail", icon: "✕", title: "ไม่พบงานที่ตรงกับ Tag นี้" },
      ambiguous: { tone: "fail", icon: "✕", title: "พบ Due ซ้ำมากกว่า 1 รายการ" },
      already: { tone: "fail", icon: "✕", title: "Tag นี้ขายออกไปแล้ว" },
      bad_tag: { tone: "fail", icon: "✕", title: "อ่าน Tag ไม่ได้" },
    };
    const PALETTE = {
      pass: { bg: "#e0faeb", border: "#7bd6a5", fg: "#08863f" },
      warn: { bg: "#fff3d4", border: "#f3b94f", fg: "#b9720a" },
      fail: { bg: "#ffe7eb", border: "#f28a9c", fg: "#d61f38" },
    };
    const meta = r ? TONE[r.verdict] : null;
    const palette = meta ? PALETTE[meta.tone] : null;
    const canDispatch = allowedPages.has("dispatch");
    const isReady = r?.verdict === "ready" || r?.verdict === "ready_noimg";
    return <>
      <div className="scan-layout">
        <section className="scanner-card">
          <div className="scanner-title"><div><h3>ตรวจชิ้นงานก่อนส่งออก</h3><p>สแกน Tag ที่กล่อง ระบบจะแสดงรูป master และงานที่ต้องส่ง เพื่อเทียบว่าตรงกันก่อนขายออก — ขั้นตอนนี้ยังไม่ตัด Stock และ Due</p></div><button className="camera-button" onClick={() => { setCameraPurpose("scan"); setCameraOpen(true); }}>▣ เปิดกล้อง</button></div>
          <div className="scanner-visual"><div className="scan-frame"><span className="qr-symbol">◉</span><b>{verifyLoading ? "กำลังตรวจ…" : "พร้อมสแกนเพื่อตรวจ"}</b><small>วาง QR ให้อยู่ในกรอบ หรือยิง Tag ได้ทันที</small><i /></div></div>
          <form className="manual-scan" onSubmit={verifyTag}><label><span>Tag ลูกค้า / ข้อมูลจาก QR</span><input ref={verifyInput} value={verifyRaw} onChange={(e) => { setVerifyRaw(e.target.value); setVerifyResult(null); }} placeholder="ยิง Tag ที่กล่อง แล้วเครื่องส่ง Enter" autoComplete="off" /></label><button className="button primary" disabled={!verifyRaw.trim() || verifyLoading}>{verifyLoading ? "กำลังตรวจ…" : "◉ ตรวจสอบชิ้นงาน"}</button></form>
          <div className="arrange-help">ⓘ ใช้เทียบด้วยสายตา: ดูรูป master คู่กับของจริงในกล่องว่าเป็นงานเดียวกันก่อนกดขายออก</div>
        </section>
        <section className="tag-result" ref={verifyResultRef}>
          <header><div><p>ผลการตรวจ</p><h3>{r?.tag?.materialCode || r?.master?.materialCode || "รอการสแกน"}</h3></div>{meta && palette ? <span className="status" style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}>{meta.icon} {meta.tone === "pass" ? "พร้อมส่งออก" : meta.tone === "warn" ? "ตรวจซ้ำ" : "หยุด"}</span> : <span className="status pending">ยังไม่มี Tag</span>}</header>
          {r && meta && palette ? <>
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 12, background: palette.bg, border: `1px solid ${palette.border}`, marginBottom: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: palette.fg, color: "#fff", display: "grid", placeItems: "center", fontSize: 20, flex: "0 0 auto" }}>{meta.icon}</span>
              <div><b style={{ color: palette.fg, fontSize: 16, display: "block" }}>{meta.title}</b><small style={{ color: "#4a5568" }}>{r.message}</small></div>
            </div>
            {(r.tag || r.master) ? <div className="tag-main"><PartImage materialCode={(r.tag?.materialCode || r.master?.materialCode)!} /><div><small>PART / MATERIAL</small><b>{r.tag?.materialCode || r.master?.materialCode}</b><p>{r.master?.partName || r.due?.materialDescription || "ไม่ระบุชื่อชิ้นงาน"}</p></div></div> : null}
            {r.due ? <>
              <div className="detail-grid">
                <div><small>ต้องส่งไปที่ (FAC / Line)</small><b>{r.due.fact} / {r.due.line || "—"}</b></div>
                <div><small>DO / Seq</small><b>{r.due.doNo} / {r.due.seq}</b></div>
                <div><small>แผนส่งวัน / เวลา</small><b>{formatDate(r.due.deliveryDate)} {r.due.deliveryTime}</b></div>
                <div><small>Tag ID</small><b>{r.tag?.tagId || "—"}</b></div>
                <div><small>จำนวนใน Tag</small><b>{fmt(r.tag?.qty || 0)} {r.tag?.unit || "PC"}</b></div>
                <div><small>งานที่จัดรอขาย</small><b>{fmt(r.stagedAvail || 0)} ชิ้น</b></div>
                <div><small>Due ทั้งหมด</small><b>{fmt(r.due.reqQty)} ชิ้น</b></div>
                <div><small>ขายออกแล้ว</small><b>{fmt(r.due.alreadyQty)} ชิ้น</b></div>
                <div><small>Due คงเหลือ</small><b>{fmt(r.due.remainingDue)} ชิ้น</b></div>
              </div>
            </> : null}
            {isReady && canDispatch ? <div className="save-row" style={{ marginTop: 16 }}><button className="button primary" onClick={goDispatchFromVerify}>ตรงแล้ว → ไปหน้าขายออก</button></div>
              : isReady ? <div className="scan-saved">✓ ตรงกับงานที่ต้องส่งออก — ให้ผู้ตรวจ (inspector) ดำเนินการขายออกในหน้า “ตรวจและขายออก”</div>
              : null}
          </> : <Empty title="รอสแกนชิ้นงาน" text="สแกน Tag ที่กล่อง ระบบจะแสดงรูป master, Item No. และงานที่ต้องส่งออกให้เทียบก่อนขายออก" />}
        </section>
      </div>
    </>;
  }

  function renderReplacement() {
    const openRequests = replacement.requests.filter((item) => item.status === "pending" || item.status === "partial");
    const completedRequests = replacement.requests.filter((item) => item.status === "completed");
    const selected = replacement.requests.find((item) => String(item.id) === replacementSelectedId) || openRequests[0];
    const needle = replacementSearch.trim().toLowerCase();
    const requestRows = replacement.requests.filter((item) => !needle || [
      item.requestNo, item.materialCode, item.partName, item.customer, item.reasonDetail,
      item.requestedByName, item.neededDate,
    ].join(" ").toLowerCase().includes(needle));
    const issueRows = replacement.issues.filter((issue) => {
      const item = replacement.requests.find((request) => request.id === issue.requestId);
      return !needle || [issue.noticeNo, issue.stockTagCode, issue.jobNo, issue.issuedByName,
        item?.requestNo, item?.materialCode, item?.customer].join(" ").toLowerCase().includes(needle);
    });
    const totalRequested = replacement.requests.filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + Number(item.requestedQty), 0);
    const totalIssued = replacement.issues.reduce((sum, item) => sum + Number(item.qty), 0);
    const reasonLabel = (value: string) => value === "defect" ? "งานเสีย" : value === "shortage" ? "งานขาด" : "อื่น ๆ";
    const statusLabel = (value: string) => value === "completed" ? "เบิกครบแล้ว" : value === "partial" ? "เบิกบางส่วน" : value === "cancelled" ? "ยกเลิก" : "รอจัดงาน";
    const canCreate = allowedPages.has("replacement");

    return <div className="replacement-page">
      <div className="metrics four compact replacement-metrics">
        <MetricCard tone="blue" icon="↺" label="ใบขอทั้งหมด" value={fmt(replacement.requests.length)} suffix="ใบ" />
        <MetricCard tone="orange" icon="◷" label="รอจัดงาน" value={fmt(openRequests.length)} suffix="ใบ" />
        <MetricCard tone="green" icon="✓" label="จัดครบแล้ว" value={fmt(completedRequests.length)} suffix="ใบ" />
        <MetricCard tone="purple" icon="▦" label="เบิกออกสะสม" value={fmt(totalIssued)} suffix="ชิ้น" />
      </div>

      <div className="replacement-work-grid">
        <Card className="replacement-request-card" title={<><span className="replacement-step">1</span> QC แจ้งขอเบิกงานทดแทน</>}>
          {canCreate ? <form className="replacement-form" onSubmit={createReplacementRequest}>
            <label className="wide"><span>Part / Material No. *</span><input list="replacement-parts" value={replacementForm.materialCode} onChange={(event) => {
              const value = event.target.value.toUpperCase();
              const part = stock.parts.find((item) => item.materialCode === value);
              setReplacementForm((current) => ({ ...current, materialCode: value, customer: part?.customer || current.customer }));
            }} placeholder="เลือกหรือค้นหา Part No." required /><datalist id="replacement-parts">{stock.parts.filter((part) => part.active).map((part) => <option key={part.materialCode} value={part.materialCode}>{part.partName}</option>)}</datalist></label>
            <label><span>ลูกค้า / Site</span><input value={replacementForm.customer} onChange={(event) => setReplacementForm((current) => ({ ...current, customer: event.target.value }))} placeholder="เช่น MCP / STE1" /></label>
            <label><span>จำนวนที่ขอเบิก *</span><input type="number" inputMode="numeric" min={1} step={1} value={replacementForm.requestedQty} onChange={(event) => setReplacementForm((current) => ({ ...current, requestedQty: event.target.value }))} placeholder="0" required /></label>
            <label><span>สาเหตุ *</span><select value={replacementForm.reasonType} onChange={(event) => setReplacementForm((current) => ({ ...current, reasonType: event.target.value }))}><option value="shortage">งานขาดของลูกค้า</option><option value="defect">ทดแทนงานเสีย</option><option value="other">อื่น ๆ</option></select></label>
            <label><span>วันที่ต้องการ</span><input type="date" value={replacementForm.neededDate} onChange={(event) => setReplacementForm((current) => ({ ...current, neededDate: event.target.value }))} /></label>
            <label className="wide"><span>รายละเอียด / เลขที่เอกสารอ้างอิง</span><textarea rows={3} value={replacementForm.reasonDetail} onChange={(event) => setReplacementForm((current) => ({ ...current, reasonDetail: event.target.value }))} placeholder="ระบุอาการเสีย จำนวนขาด หรือข้อมูลที่ทีมจัดงานต้องทราบ" /></label>
            <button className="button primary full" disabled={replacementSaving}>{replacementSaving ? "กำลังสร้างใบขอ…" : "＋ สร้างใบขอเบิกให้ทีมจัดงาน"}</button>
          </form> : <div className="replacement-role-note"><span>QC</span><div><b>หน้านี้ใช้สำหรับ QC แจ้งขอเบิก</b><p>บัญชีทีมจัดงานจะเห็นใบขอและสแกนเบิกในขั้นตอนที่ 2</p></div></div>}
        </Card>

        <Card className="replacement-scan-card" title={<><span className="replacement-step green">2</span> ทีมจัดงานสแกน KIT Tag</>} action={selected ? <span className="replacement-selected">{selected.requestNo}</span> : undefined}>
          {selected ? <>
            <div className="replacement-selected-request">
              <PartImage materialCode={selected.materialCode} compact />
              <div><small>ใบขอที่เลือก</small><b>{selected.materialCode}</b><p>{selected.partName || "—"} · {selected.customer || "ไม่ระบุลูกค้า"}</p></div>
              <dl><div><dt>QC ขอ</dt><dd>{fmt(selected.requestedQty)}</dd></div><div><dt>เบิกแล้ว</dt><dd>{fmt(selected.issuedQty)}</dd></div><div><dt>คงเหลือ</dt><dd>{fmt(selected.remainingQty)}</dd></div></dl>
            </div>
            <form className="replacement-scan-form" onSubmit={(event) => { event.preventDefault(); void previewReplacementIssue(); }}>
              <button type="button" className="replacement-scan-zone" onClick={() => replacementInputRef.current?.focus()}><span>⌗</span><b>พร้อมสแกน KIT Stock Tag</b><small>ยิงบาร์โค้ดจากเครื่องสแกน แล้วตรวจจำนวนก่อนยืนยันเบิก</small></button>
              <label><span>KIT Stock Tag *</span><input ref={replacementInputRef} value={replacementTag} onChange={(event) => setReplacementTag(event.target.value)} onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === "Tab") && replacementTag.trim()) {
                  event.preventDefault(); void previewReplacementIssue();
                }
              }} placeholder="ยิง Tag แล้วเครื่องส่ง Enter" autoComplete="off" autoFocus /></label>
              <button className="button primary" disabled={!replacementTag.trim() || replacementSaving}>{replacementSaving ? "กำลังตรวจ Tag…" : "ตรวจ Tag และจำนวน"}</button>
            </form>
            <p className="replacement-help">ระบบจะตัด Stock และตัดยอดคงเหลือของใบขอเมื่อกด “ยืนยันเบิกงานทดแทน” เท่านั้น</p>
          </> : <Empty title="ยังไม่มีใบขอรอจัดงาน" text="เมื่อ QC สร้างใบขอ รายการจะขึ้นให้เลือกและสแกน KIT Tag ที่นี่" />}
        </Card>
      </div>

      <Card className="replacement-list-card" title={<><span className="replacement-list-icon">↺</span> ใบขอเบิกงานทดแทน <em>{fmt(requestRows.length)} ใบ</em></>} action={<div className="arranged-search"><span>⌕</span><input type="search" value={replacementSearch} onChange={(event) => setReplacementSearch(event.target.value)} placeholder="ค้นหาเลขที่ใบขอ, Part, ลูกค้า, ผู้ขอ" /></div>}>
        {replacementLoading ? <div className="loading-state"><span /><p>กำลังโหลดใบขอเบิก…</p></div> : requestRows.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table replacement-table"><thead><tr><th>เลขที่ / วันที่ขอ</th><th>Part / ลูกค้า</th><th>สาเหตุ</th><th className="num">ขอเบิก</th><th className="num">เบิกแล้ว</th><th className="num">คงเหลือ</th><th>ผู้ขอ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
          {requestRows.map((item) => <tr key={item.id} className={String(item.id) === replacementSelectedId ? "selected-row" : ""}>
            <td data-label="เลขที่ / วันที่ขอ"><b>{item.requestNo}</b><small>{formatDateTime(item.requestedAt)}{item.neededDate ? ` · ต้องการ ${formatDate(item.neededDate)}` : ""}</small></td>
            <td data-label="Part / ลูกค้า"><b>{item.materialCode}</b><small>{item.partName || "—"} · {item.customer || "—"}</small></td>
            <td data-label="สาเหตุ"><b>{reasonLabel(item.reasonType)}</b><small>{item.reasonDetail || "—"}</small></td>
            <td data-label="ขอเบิก" className="num"><b>{fmt(item.requestedQty)}</b></td>
            <td data-label="เบิกแล้ว" className="num"><b className="green-text">{fmt(item.issuedQty)}</b></td>
            <td data-label="คงเหลือ" className="num"><b className={item.remainingQty ? "red-text" : "green-text"}>{fmt(item.remainingQty)}</b></td>
            <td data-label="ผู้ขอ"><b>{item.requestedByName}</b><small>{item.requestedByCode}</small></td>
            <td data-label="สถานะ"><span className={`status ${item.status === "completed" ? "completed" : item.status === "partial" ? "partial" : item.status === "cancelled" ? "over" : "pending"}`}>{statusLabel(item.status)}</span></td>
            <td data-label="จัดการ"><div className="user-actions">{(item.status === "pending" || item.status === "partial") && <button className="tiny-button" onClick={() => { setReplacementSelectedId(String(item.id)); setReplacementPreview(null); setReplacementTag(""); window.setTimeout(() => replacementInputRef.current?.focus(), 100); }}>เลือกจัดงาน</button>}{canCreate && item.status === "pending" && item.issuedQty === 0 && <button className="tiny-button danger-outline" onClick={() => void cancelReplacementRequest(item)}>ยกเลิก</button>}</div></td>
          </tr>)}
        </tbody></table></div> : <Empty title="ยังไม่มีใบขอเบิก" text="QC สามารถสร้างใบขอสำหรับงานเสียหรืองานขาดได้จากแบบฟอร์มด้านบน" />}
        <footer className="replacement-list-footer"><span>ยอดขอเบิกทั้งหมด {fmt(totalRequested)} ชิ้น</span><b>เบิกออกแล้ว {fmt(totalIssued)} ชิ้น</b></footer>
      </Card>

      <Card className="replacement-list-card" title={<><span className="replacement-list-icon green">▤</span> ประวัติเบิกและใบแจ้งออก <em>{fmt(issueRows.length)} รายการ</em></>} action={<button className="button secondary" onClick={() => void loadReplacements()}>↻ รีเฟรช</button>}>
        {issueRows.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table replacement-issue-table"><thead><tr><th>ใบแจ้งออก</th><th>ใบขอ QC</th><th>KIT Stock Tag / Job</th><th>Part / ลูกค้า</th><th className="num">จำนวน</th><th>ผู้จัดงาน</th><th>พิมพ์ใบ</th></tr></thead><tbody>
          {issueRows.map((issue) => {
            const item = replacement.requests.find((request) => request.id === issue.requestId);
            return <tr key={issue.id}><td data-label="ใบแจ้งออก"><b>{issue.noticeNo}</b><small>{formatDateTime(issue.issuedAt)}</small></td><td data-label="ใบขอ QC">{item?.requestNo || "—"}</td><td data-label="KIT Tag / Job"><b>{issue.stockTagCode}</b><small>{issue.jobNo || "—"}</small></td><td data-label="Part / ลูกค้า"><b>{item?.materialCode || "—"}</b><small>{item?.customer || "—"}</small></td><td data-label="จำนวน" className="num"><b>{fmt(issue.qty)}</b></td><td data-label="ผู้จัดงาน"><b>{issue.issuedByName}</b><small>{issue.issuedByCode}</small></td><td data-label="พิมพ์ใบ"><button className="tiny-button print-replacement-button" onClick={() => void printReplacementIssue(issue)}>▤ พิมพ์ใบแจ้งออก</button>{issue.printedAt && <small>พิมพ์แล้ว {formatDateTime(issue.printedAt)}</small>}</td></tr>;
          })}
        </tbody></table></div> : <Empty title="ยังไม่มีประวัติการเบิก" text="ประวัติจะบันทึกเมื่อทีมจัดงานยืนยันเบิกจาก KIT Tag" />}
      </Card>
    </div>;
  }

  function renderExports() {
    const exported = payload.dues.filter((due) => Number(due.scannedQty) > 0);
    const full = exported.filter((due) => stateOf(due) === "completed").length;
    const part = exported.filter((due) => stateOf(due) === "partial").length;
    const over = exported.filter((due) => stateOf(due) === "over").length;
    return <><Card><Filters /></Card><div className="metrics five"><MetricCard tone="blue" icon="▱" label="ส่งออกทั้งหมด" value={fmt(exported.length)} suffix="รายการ" /><MetricCard tone="green" icon="✓" label="ส่งออกครบ" value={fmt(full)} suffix="รายการ" /><MetricCard tone="orange" icon="◷" label="บางส่วน" value={fmt(part)} suffix="รายการ" /><MetricCard tone="red" icon="×" label="เกิน Due" value={fmt(over)} suffix="รายการ" /><MetricCard tone="purple" icon="□" label="รวมจำนวน" value={fmt(exported.reduce((sum, due) => sum + Number(due.scannedQty), 0))} suffix="ชิ้น" /></div><Card title="รายการส่งออก" action={<button className="button secondary" onClick={exportCsv}>⇩ ส่งออก CSV</button>}><DueTable rows={filtered.filter((due) => Number(due.scannedQty) > 0)} /></Card></>;
  }

  function renderReports() {
    const maxFac = Math.max(...facStats.map((item) => item.items), 1);
    return <>
      <Card><Filters /></Card>
      <Card title="ส่งออกรายงานตามตัวกรองปัจจุบัน"><div className="report-export-actions"><div><b>{fmt(filtered.length)} รายการ</b><small>{filterDate ? formatDate(filterDate) : "ทุกวันที่"} · {filterFact === "ALL" ? "ทุก FAC" : filterFact} · {filterTime === "ALL" ? "ทุกเวลา" : filterTime}</small></div><button className="export-button excel" onClick={() => void exportReportExcel()}><span>▦</span><b>Excel</b><small>.xlsx</small></button><button className="export-button pdf" onClick={exportReportPdf}><span>▤</span><b>PDF</b><small>พิมพ์ / บันทึก</small></button><button className="export-button csv" onClick={exportReportCsv}><span>≡</span><b>CSV</b><small>.csv</small></button></div></Card>
      <div className="metrics five"><MetricCard tone="blue" icon="◈" label="แผนทั้งหมด" value={fmt(summary.items)} suffix="รายการ" /><MetricCard tone="green" icon="✓" label="ครบตามแผน" value={fmt(summary.completed)} suffix="รายการ" /><MetricCard tone="orange" icon="◷" label="คงเหลือ" value={fmt(summary.partial + summary.pending)} suffix="รายการ" /><MetricCard tone="red" icon="!" label="เกิน Due" value={fmt(summary.over)} suffix="รายการ" /><MetricCard tone="purple" icon="□" label="ส่งแล้วรวม" value={fmt(summary.sent)} suffix="ชิ้น" /></div>
      <div className="report-grid">
        <Card title="สัดส่วนสถานะการส่งงาน"><div className="donut-layout"><div className="donut" style={{ "--complete": `${completePct * 3.6}deg` } as React.CSSProperties}><span><b>{summary.items}</b>รายการ</span></div><div className="legend"><p><i className="green" />ครบตามแผน <b>{summary.completed}</b></p><p><i className="orange" />คงเหลือ <b>{summary.partial + summary.pending}</b></p><p><i className="red" />เกิน Due <b>{summary.over}</b></p></div></div></Card>
        <Card title="ส่งออกตาม FAC / Line"><div className="bar-chart">{facStats.length ? facStats.slice(0, 7).map((item) => <div key={item.fact}><b>{item.fact}</b><span><i style={{ width: `${Math.max(4, item.items / maxFac * 100)}%` }} /></span><strong>{item.items}</strong></div>) : <Empty />}</div></Card>
      </div>
      <div className="split-grid">
        <Card title="สรุปการส่งออกตามวัน">{dailyStats.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วันที่</th><th className="num">ทั้งหมด</th><th className="num">ครบ</th><th className="num">คงเหลือ</th><th className="num">ส่งแล้ว (ชิ้น)</th></tr></thead><tbody>{dailyStats.slice(0, 8).map((row) => <tr key={row.date}><td data-label="วันที่"><b>{formatDate(row.date)}</b></td><td data-label="ทั้งหมด" className="num">{row.items}</td><td data-label="ครบ" className="num sent">{row.completed}</td><td data-label="คงเหลือ" className="num warning">{row.partial + row.pending + row.over}</td><td data-label="ส่งแล้ว" className="num"><b>{fmt(row.qty)}</b></td></tr>)}</tbody></table></div> : <Empty />}</Card>
        <Card title="รายการที่ยังไม่ครบ (สูงสุด)"><DueTable rows={filtered.filter((due) => ["pending", "partial", "over"].includes(stateOf(due))).sort((a, b) => (b.reqQty - b.scannedQty) - (a.reqQty - a.scannedQty))} limit={5} /></Card>
      </div>
    </>;
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
      && (!historyDate || activityLocalDate(item.createdAt) === historyDate)
      && (!historyNeedle || [item.action, item.detail, item.actor, item.createdAt].some((value) => String(value || "").toLowerCase().includes(historyNeedle)))
    );
    const historyTabs = [
      { key: "all", label: "ทั้งหมด", count: activities.length },
      { key: "import", label: "นำเข้าแผน", count: activities.filter((item) => item.kind === "import").length },
      { key: "tag", label: "พิมพ์ Tag", count: activities.filter((item) => item.kind === "tag").length },
      { key: "receive", label: "รับเข้า Stock", count: activities.filter((item) => item.kind === "receive").length },
      { key: "arrange", label: "จัดงาน", count: activities.filter((item) => item.kind === "arrange").length },
      { key: "dispatch", label: "ตรวจและขายออก", count: activities.filter((item) => item.kind === "dispatch").length },
    ];
    const shownActivities = filteredActivities.slice(0, 250);
    return <>
      <div className="metrics five">
        <MetricCard tone="purple" icon="⇧" label="นำเข้าแผน" value={fmt(payload.imports.length)} suffix="ครั้ง" />
        <MetricCard tone="blue" icon="▤" label="ออก Tag" value={fmt(stock.tags.length)} suffix="ใบ" />
        <MetricCard tone="green" icon="⇩" label="รับเข้า Stock" value={fmt(stock.tags.filter((item) => item.receivedAt).length)} suffix="ใบ" />
        <MetricCard tone="orange" icon="⇥" label="จัดงาน" value={fmt(stock.picks.length)} suffix="รายการ" />
        <MetricCard tone="red" icon="⌗" label="ตรวจและขายออก" value={fmt(payload.scans.length)} suffix="รายการ" />
      </div>
      <Card className="audit-history-card" title="ประวัติผู้ดำเนินการ" action={<button className="button secondary" onClick={() => void Promise.all([loadDue(), loadStock()])}>↻ รีเฟรช</button>}>
        <div className="audit-history-controls">
          <div className="audit-history-tabs">{historyTabs.map((tab) => <button type="button" key={tab.key} className={historyType === tab.key ? "active" : ""} onClick={() => setHistoryType(tab.key)}><span>{tab.label}</span><b>{fmt(tab.count)}</b></button>)}</div>
          <div className="audit-history-filter-row">
            <div className="audit-history-search"><span>⌕</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="ค้นหาชื่อผู้ทำรายการ, Tag ID, Part No., Job หรือชื่อไฟล์..." />{historyQuery && <button type="button" onClick={() => setHistoryQuery("")}>×</button>}</div>
            <label className="audit-history-date"><span>วันที่ทำรายการ</span><input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />{historyDate && <button type="button" onClick={() => setHistoryDate("")} aria-label="ล้างวันที่">×</button>}</label>
          </div>
          <p>พบ {fmt(filteredActivities.length)} รายการ{filteredActivities.length > 250 ? " · แสดง 250 รายการล่าสุด" : ""}</p>
        </div>
        {shownActivities.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วันและเวลา</th><th>รายการที่ทำ</th><th>รายละเอียด</th><th>ผู้ดำเนินการ</th><th>ผลลัพธ์</th></tr></thead><tbody>{shownActivities.map((item) => <tr key={item.id}><td data-label="วันและเวลา"><b>{formatDateTime(item.createdAt)}</b></td><td data-label="รายการที่ทำ"><b>{item.action}</b></td><td data-label="รายละเอียด">{item.detail}</td><td data-label="ผู้ดำเนินการ"><b>{item.actor}</b></td><td data-label="ผลลัพธ์"><em className={"status completed audit-" + item.tone}>บันทึกแล้ว</em></td></tr>)}</tbody></table></div> : <Empty title={(historyQuery || historyDate) ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีประวัติในหมวดนี้"} text={(historyQuery || historyDate) ? "ลองเปลี่ยนคำค้นหาหรือวันที่ทำรายการ" : "เลือกหมวดอื่นเพื่อดูประวัติรายการ"} />}
      </Card>
    </>;
  }

  function renderSettings() {
    // ตัวแปรธรรมดา ไม่ใช่ useMemo เพราะ renderSettings() เป็นฟังก์ชันที่ถูกเรียก
    // แบบมีเงื่อนไข ไม่ใช่คอมโพเนนต์ การเรียก hook ในนี้จะผิดกฎ Hooks
    const Toggle = ({ keyName, title, text: description }: { keyName: keyof typeof settings; title: string; text: string }) => <label className="setting-row"><div><b>{title}</b><small>{description}</small></div><input type="checkbox" checked={settings[keyName]} onChange={(e) => setSettings((current) => ({ ...current, [keyName]: e.target.checked }))} /><i /></label>;
    return <>
      <Card title="ข้อมูลระบบ"><div className="system-card"><div className="system-logo">KiT<small>DELIVERY DUE CONTROL</small></div><dl><div><dt>ชื่อระบบ</dt><dd>KIT Delivery Due Control</dd></div><div><dt>เวอร์ชัน</dt><dd>v2.22.0</dd></div><div><dt>เขตเวลา</dt><dd>Bangkok, Thailand</dd></div><div><dt>ผู้ดูแล</dt><dd>{user.displayName}</dd></div></dl><div className="system-stats"><p><span>▤</span><b>{fmt(payload.dues.length)}</b><small>Due ทั้งหมด</small></p><p><span>▣</span><b>{fmt(partImages.length)}</b><small>รูปชิ้นงาน</small></p></div></div></Card>
      <div className="settings-grid"><Card title="ตั้งค่าการตัดยอด"><Toggle keyName="partial" title="อนุญาตให้ตัดยอดบางส่วน" text="Tag หนึ่งใบสามารถตัดยอดไม่ครบ Due ได้" /><Toggle keyName="confirm" title="ยืนยันก่อนตัดยอดทุกครั้ง" text="แสดงยอดก่อนและหลังให้ตรวจสอบก่อนบันทึก" /></Card><Card title="ตั้งค่าการสแกน"><Toggle keyName="autoFocus" title="โฟกัสช่องสแกนอัตโนมัติ" text="เหมาะสำหรับใช้งานร่วมกับเครื่องยิง Tag" /><Toggle keyName="sound" title="เสียงแจ้งเตือนเมื่อสำเร็จ" text="เปิดเสียงยืนยันหลังตัดยอดเรียบร้อย" /></Card></div>
      <Card title="รูปแบบการแสดงผล"><div className="form-grid"><label><span>ภาษา</span><select><option>ภาษาไทย</option></select></label><label><span>เขตเวลา</span><select><option>(GMT+07:00) Bangkok, Thailand</option></select></label><label><span>รูปแบบวันที่</span><select><option>DD/MM/YYYY</option></select></label><label><span>หน่วยเริ่มต้น</span><select><option>ชิ้น (PC)</option></select></label></div><div className="save-row"><button className="button primary" onClick={saveSettings}>▣ บันทึกการตั้งค่า</button></div></Card>
      {user.role === "admin" && <Card title="ล้างข้อมูลทดลอง"><div className="permission-note"><span>!</span><div><b>ล้างเฉพาะรายการ Stock</b><p>ลบ Tag Stock และประวัติการจัด/ขายออกทั้งหมด โดยเก็บทะเบียน Part รูปชิ้นงาน แผน Due และผู้ใช้งานไว้</p></div></div><div className="save-row"><button className="button danger" disabled={clearingTestStock || stock.tags.length === 0} onClick={() => void clearTestStock()}>{clearingTestStock ? "กำลังล้างข้อมูล…" : `ล้าง Stock ทดลอง ${fmt(stock.tags.length)} Tag`}</button></div></Card>}
    </>;
  }

  function renderUsers() {
    const active = systemUsers.filter((item) => item.active).length;
    const productionUsers = systemUsers.filter((item) => item.role === "production").length;
    const stockUsers = systemUsers.filter((item) => item.role === "stock").length;
    const qcUsers = systemUsers.filter((item) => item.role === "qc").length;
    const deliveryUsers = systemUsers.filter((item) => item.role === "delivery").length;
    return <>
      <Card title="ภาพรวมผู้ใช้งาน" action={<button className="button primary" onClick={() => { setUserForm({ ...EMPTY_USER, permissions: [...EMPTY_USER.permissions] }); setUserEditorOpen(true); }}>＋ เพิ่มผู้ใช้งาน</button>}>
        <div className="metrics four compact">
          <MetricCard tone="blue" icon="♙" label="ผู้ใช้งานทั้งหมด" value={fmt(systemUsers.length)} suffix="คน" />
          <MetricCard tone="green" icon="✓" label="ใช้งานปกติ" value={fmt(active)} suffix="คน" />
          <MetricCard tone="purple" icon="▤" label="Production" value={fmt(productionUsers)} suffix="คน" />
          <MetricCard tone="blue" icon="▦" label="Stock" value={fmt(stockUsers)} suffix="คน" />
          <MetricCard tone="orange" icon="◇" label="QC" value={fmt(qcUsers)} suffix="คน" />
          <MetricCard tone="green" icon="⌗" label="Delivery" value={fmt(deliveryUsers)} suffix="คน" />
        </div>
      </Card>
      <Card title="ผู้ใช้งานระบบ" action={<button className="button secondary" onClick={() => void loadUsers()}>↻ รีเฟรช</button>}>
        {usersLoading ? <div className="loading-state"><span /><p>กำลังโหลดผู้ใช้งาน…</p></div> : <div className="table-wrap mobile-table-wrap">
          <table className="mobile-card-table"><thead><tr><th>รหัส / ผู้ใช้งาน</th><th>อีเมล</th><th>บทบาท</th><th>สิทธิ์หน้า</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>{systemUsers.map((item) => <tr key={item.id}>
              <td data-label="ผู้ใช้งาน"><div className="user-cell"><span>{item.displayName.slice(0, 1).toUpperCase()}</span><div><b>{item.displayName}</b><small>{item.employeeCode}</small></div></div></td>
              <td data-label="อีเมล">{item.email || "—"}</td>
              <td data-label="บทบาท"><span className="role-pill">{ROLE_LABELS[item.role] || item.role}</span></td>
              <td data-label="สิทธิ์หน้า"><div className="permission-summary">{(item.role === "admin" ? NAV.map((nav) => nav.key) : item.permissions || []).map((key) => <span key={key}>{NAV.find((nav) => nav.key === key)?.label || key}</span>)}</div></td>
              <td data-label="สถานะ"><span className={`status ${item.active ? "completed" : "over"}`}>{item.active ? "ใช้งานปกติ" : "ระงับ"}</span></td>
              <td data-label="จัดการ">{item.role === "admin" ? <span className="muted">บัญชีหลัก</span> : <div className="user-actions"><button className="tiny-button" onClick={() => editUser(item)}>แก้ไข / สิทธิ์ / PIN</button><button className={`tiny-button ${item.active ? "danger-outline" : ""}`} onClick={() => void toggleUser(item)}>{item.active ? "ระงับ" : "เปิดใช้"}</button></div>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Card>
      <div className="split-grid">
        <Card title="สิทธิ์รายบุคคล"><div className="permission-note"><span>◆</span><div><b>Admin กำหนดสิทธิ์ทุกหน้า</b><p>บทบาทใช้ระบุทีมงาน ส่วนสิทธิ์เข้าแต่ละหน้ารวมถึงหน้าหลักต้องเลือกให้ผู้ใช้แต่ละคนอย่างน้อย 1 หน้า</p></div></div></Card>
        <Card title="ความปลอดภัย"><div className="permission-note"><span>◆</span><div><b>ป้องกันทั้งเมนูและ API</b><p>หน้าที่ไม่ได้รับสิทธิ์จะไม่แสดงในเมนู และระบบจะปฏิเสธการเปิดหรือเรียกใช้งานโดยตรง</p></div></div></Card>
      </div>
    </>;
  }

  const pageContent: Record<PageKey, () => ReactNode> = { dashboard: renderDashboard, stock: renderStock, parts: renderParts, tags: renderTags, plan: renderPlan, arrange: () => renderScan("arrange"), replacement: renderReplacement, verify: renderVerify, dispatch: () => renderScan("dispatch"), exports: renderExports, reports: renderReports, history: renderHistory, settings: renderSettings, users: renderUsers };
  const activeNav = NAV.find((item) => item.key === page) || NAV.find((item) => item.key === firstAllowedPage) || NAV[0];

  return <div className="control-shell">
    <aside className={`control-sidebar ${menuOpen ? "open" : ""}`}>
      <button className="sidebar-close" onClick={() => setMenuOpen(false)}>×</button>
      <div className="kit-logo"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <nav>{NAV.filter((item) => allowedPages.has(item.key)).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom">{allowedPages.has("settings") && <div className="help-box"><b>ต้องการความช่วยเหลือ?</b><button onClick={() => go("settings")}>◉ คู่มือและตั้งค่า</button></div>}<a className="mobile-logout" href={signOutPath} onClick={signOut}><span>↪</span><b>ออกจากระบบ</b></a><div className="mini-brand"><b>KiT</b><span>Delivery Due Control<br />© 2026 · v2.22.0</span></div></div>
    </aside>
    {menuOpen && <button className="menu-backdrop" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} />}
    <main className="control-main">
      <header className="control-topbar"><button className="menu-button" onClick={() => setMenuOpen(true)}>☰</button><div><h1>{activeNav.label}</h1><p>หน้าหลัก <span>›</span> {PAGE_SUBTITLE[page]}</p></div><div className="top-user"><button className="notification">♧<i>{notice ? "1" : "0"}</i></button><span className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><b>{user.displayName}</b><small>{ROLE_LABELS[user.role] || user.role}</small></div><a href={signOutPath} onClick={signOut}>ออกจากระบบ</a></div></header>
      <div className="control-content">
        {notice && <div className={`toast ${notice.type} auto-dismiss`}><span>{notice.type === "success" ? "✓" : "!"}</span><p>{notice.text}</p><button onClick={() => setNotice(null)}>×</button></div>}
        {error && <div className="toast error"><span>!</span><p>{error}</p><button onClick={() => void loadDue()}>ลองใหม่</button></div>}
        {loading ? <div className="loading-state"><span /><p>กำลังโหลดข้อมูล Due…</p></div> : pageContent[page]()}
      </div>
    </main>
    <nav className="mobile-bottom-nav" aria-label="เมนูมือถือ">
      {NAV.filter((item) => allowedPages.has(item.key)).slice(0, 4).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span><small>{item.label.replace("แผนส่งงาน (Due)", "แผนงาน").replace("ตรวจและขายออก", "ขายออก")}</small></button>)}
      <button onClick={() => setMenuOpen(true)}><span>☰</span><small>เมนู</small></button>
      <a className="bottom-logout" href={signOutPath} onClick={signOut}><span>↪</span><small>ออกระบบ</small></a>
    </nav>
    {replacementPreview && <div className="modal-backdrop replacement-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="replacement-confirm-title"><div className="replacement-confirm-modal">
      <header><div><span>↺</span><div><small>ตรวจพบ KIT Stock Tag</small><h3 id="replacement-confirm-title">ตรวจสอบก่อนเบิกงานทดแทน</h3></div></div><button type="button" onClick={() => { setReplacementPreview(null); setReplacementTag(""); setReplacementQty(""); }} aria-label="ปิด">×</button></header>
      <div className="replacement-confirm-content">
        <section className="replacement-confirm-photo"><PartImage materialCode={replacementPreview.request.materialCode} version={partImages.find((item) => item.materialCode === replacementPreview.request.materialCode)?.updatedAt} /></section>
        <section className="replacement-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{replacementPreview.request.materialCode}</b><p>{replacementPreview.request.partName || replacementPreview.tag.partName || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="replacement-confirm-details"><div><small>ใบขอ QC</small><b>{replacementPreview.request.requestNo}</b></div><div><small>ลูกค้า / Site</small><b>{replacementPreview.request.customer || "—"}</b></div><div><small>KIT Stock Tag</small><b>{replacementPreview.tag.tagId}</b></div><div><small>Job / Location</small><b>{replacementPreview.tag.jobNo || "—"} / {replacementPreview.tag.location || "—"}</b></div></div>
          <div className="replacement-qty-compare"><div><small>QC ขอเบิก</small><b>{fmt(replacementPreview.request.requestedQty)}</b><em>ชิ้น</em></div><div><small>เบิกแล้ว</small><b>{fmt(replacementPreview.request.issuedQty)}</b><em>ชิ้น</em></div><label><small>เบิกครั้งนี้</small><input type="number" inputMode="numeric" min={1} max={Math.min(replacementPreview.request.remainingQty, replacementPreview.tag.availableQty)} value={replacementQty} onChange={(event) => setReplacementQty(event.target.value.replace(/[^0-9]/g, ""))} autoFocus /><em>แก้ไขจำนวนได้</em></label><div><small>คงเหลือหลังเบิก</small><b>{fmt(Math.max(replacementPreview.request.remainingQty - Number(replacementQty || 0), 0))}</b><em>ชิ้น</em></div></div>
          <p className="replacement-stock-note">Stock Tag นี้พร้อมใช้ {fmt(replacementPreview.tag.availableQty)} ชิ้น · ระบบจะตัด Stock เมื่อยืนยัน</p>
        </section>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => { setReplacementPreview(null); setReplacementTag(""); setReplacementQty(""); }}>ยกเลิก / สแกนใหม่</button><button type="button" className="button confirm-replacement-button" disabled={replacementSaving || !Number(replacementQty) || Number(replacementQty) > replacementPreview.request.remainingQty || Number(replacementQty) > replacementPreview.tag.availableQty} onClick={() => void confirmReplacementIssue()}>{replacementSaving ? "กำลังเบิกงาน…" : "✓ ยืนยันเบิกและตัดยอด"}</button></footer>
    </div></div>}
    {stockCountPreview && <div className="modal-backdrop stock-count-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-count-title"><div className="stock-count-modal">
      <header><div><span>≋</span><div><small>ตรวจนับ Stock สิ้นเดือน</small><h3 id="stock-count-title">ยืนยันการปรับยอด</h3></div></div><button type="button" onClick={() => setStockCountPreview(null)} aria-label="ปิด">×</button></header>
      <div className="stock-count-content">
        <section><small>PART / MATERIAL</small><h4>{stockCountPreview.materialCode}</h4><p>{stockCountPreview.partName}</p></section>
        <div className="stock-count-compare">
          <article><small>ยอดในระบบ</small><b>{fmt(stockCountPreview.systemQty)}</b><em>ชิ้น</em></article>
          <span>→</span>
          <article><small>ยอดนับจริง</small><b>{fmt(stockCountPreview.countedQty)}</b><em>ชิ้น</em></article>
          <article className={stockCountPreview.difference < 0 ? "negative" : stockCountPreview.difference > 0 ? "positive" : "equal"}><small>ผลต่าง</small><b>{stockCountPreview.difference > 0 ? "+" : ""}{fmt(stockCountPreview.difference)}</b><em>ชิ้น</em></article>
        </div>
        <div className="stock-count-safety"><b>งานจัดรอขาย/จองไว้ {fmt(stockCountPreview.reservedQty)} ชิ้น</b><span>{stockCountPreview.difference < 0 ? `ระบบจะตัดจาก KIT Tag ${fmt(stockCountPreview.affectedTagCount)} ใบ โดยไม่ตัดส่วนที่จองไว้` : stockCountPreview.difference > 0 ? "ระบบจะสร้าง Adjustment Tag ใหม่สำหรับยอดที่เพิ่ม" : "ยอดตรงกัน ระบบจะบันทึกผลตรวจนับไว้เป็นหลักฐาน"}</span></div>
        {stockCountPreview.affectedTags.length > 0 && <div className="stock-count-tags"><b>Tag ที่จะถูกปรับ</b>{stockCountPreview.affectedTags.map((line) => <div key={line.stockTagCode}><span>{line.stockTagCode}</span><em>{line.qtyChange > 0 ? "+" : ""}{fmt(line.qtyChange)}</em><small>{fmt(line.beforeQty)} → {fmt(line.afterQty)}</small></div>)}</div>}
        <p className="stock-count-reason"><b>สาเหตุ:</b> {stockCountForm.reason}</p>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => setStockCountPreview(null)}>ยกเลิก</button><button type="button" className="button confirm-stock-count-button" disabled={stockManagementSaving} onClick={() => void confirmStockCountAdjustment()}>{stockManagementSaving ? "กำลังปรับยอด…" : "✓ ยืนยันปรับยอด Stock"}</button></footer>
    </div></div>}
    {stockReceivePreview && <div className="modal-backdrop dispatch-confirm-backdrop stock-receive-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-receive-confirm-title"><div className="dispatch-confirm-modal stock-receive-confirm-modal">
      <header><div><span>✓</span><div><small>ตรวจพบ KIT Stock Tag</small><h3 id="stock-receive-confirm-title">ตรวจสอบก่อนรับเข้า Stock</h3></div></div><button type="button" onClick={() => { setStockReceivePreview(null); setStockReceiveQty(""); setStockScan(""); }} aria-label="ปิด">×</button></header>
      <div className="dispatch-confirm-content">
        <section className="dispatch-confirm-images"><PartImagePair materialCode={stockReceivePreview.tag.materialCode} masterVersion={partImages.find((item) => item.materialCode === stockReceivePreview.tag.materialCode)?.updatedAt} actualVersion={partActualImages.find((item) => item.materialCode === stockReceivePreview.tag.materialCode)?.updatedAt} /></section>
        <section className="dispatch-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{stockReceivePreview.tag.materialCode}</b><p>{stockReceivePreview.tag.partName || stockReceivePreview.master.partName || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="dispatch-confirm-details"><div><small>KIT Stock Tag</small><b>{stockReceivePreview.tag.tagId}</b></div><div><small>Job</small><b>{stockReceivePreview.tag.jobNo || "—"}</b></div><div><small>ลูกค้า</small><b>{stockReceivePreview.tag.customer || "—"}</b></div><div><small>Location</small><b>{stockReceivePreview.tag.location || "—"}</b></div></div>
          <div className="stock-receive-qty-box">
            <div><small>จำนวนตาม Tag</small><b>{fmt(stockReceivePreview.tag.qty)}</b><em>ชิ้น</em></div>
            <label><small>จำนวนรับเข้าจริง</small><input type="number" inputMode="numeric" min={0} max={stockReceivePreview.tag.qty} step={1} value={stockReceiveQty} onChange={(event) => setStockReceiveQty(event.target.value.replace(/[^0-9]/g, ""))} autoFocus /><em>แก้ไขได้เมื่อมีงานเสีย</em></label>
            <div className={Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0) > 0 ? "has-ng" : ""}><small>จำนวน NG</small><b>{fmt(Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0))}</b><em>ชิ้น</em></div>
          </div>
          {Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0) > 0 && <p className="stock-receive-ng-note">! ระบบจะเพิ่มเข้า Stock เฉพาะ {fmt(Number(stockReceiveQty || 0))} ชิ้น และบันทึก NG {fmt(Math.max(Number(stockReceivePreview.tag.qty) - Number(stockReceiveQty || 0), 0))} ชิ้น</p>}
        </section>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => { setStockReceivePreview(null); setStockReceiveQty(""); setStockScan(""); }}>ยกเลิก / สแกนใหม่</button><button type="button" className="button confirm-dispatch-button stock-confirm-receive-button" disabled={stockSaving || stockReceiveQty === "" || Number(stockReceiveQty) < 0 || Number(stockReceiveQty) > Number(stockReceivePreview.tag.qty)} onClick={() => void confirmReceiveStockTag()}>{stockSaving ? "กำลังรับเข้า…" : "✓ ยืนยันรับเข้า Stock"}</button></footer>
    </div></div>}
    {dispatchConfirmation && <div className="modal-backdrop dispatch-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="dispatch-confirm-title"><div className="dispatch-confirm-modal">
      <header><div><span>✓</span><div><small>ตรวจพบ Tag ลูกค้า</small><h3 id="dispatch-confirm-title">ตรวจสอบงานก่อนขายออก</h3></div></div><button type="button" onClick={() => setDispatchConfirmation(null)} aria-label="ปิด">×</button></header>
      <div className="dispatch-confirm-content">
        <section className="dispatch-confirm-images"><PartImagePair materialCode={dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode || ""} masterVersion={partImages.find((item) => item.materialCode === (dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode))?.updatedAt} actualVersion={partActualImages.find((item) => item.materialCode === (dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode))?.updatedAt} /></section>
        <section className="dispatch-confirm-info">
          <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{dispatchConfirmation.tag?.materialCode || dispatchConfirmation.master?.materialCode || "—"}</b><p>{dispatchConfirmation.master?.partName || dispatchConfirmation.due?.materialDescription || "ไม่ระบุชื่อชิ้นงาน"}</p></div>
          <div className="dispatch-confirm-details"><div><small>Tag ลูกค้า</small><b>{dispatchConfirmation.tag?.tagId || "—"}</b></div><div><small>FAC / Line</small><b>{dispatchConfirmation.due ? dispatchConfirmation.due.fact + " / " + (dispatchConfirmation.due.line || "—") : "—"}</b></div><div><small>DO / Seq</small><b>{dispatchConfirmation.due ? dispatchConfirmation.due.doNo + " / " + dispatchConfirmation.due.seq : "—"}</b></div><div><small>กำหนดส่ง</small><b>{dispatchConfirmation.due ? formatDate(dispatchConfirmation.due.deliveryDate) + " " + dispatchConfirmation.due.deliveryTime : "—"}</b></div></div>
          <div className="dispatch-confirm-qty"><div><small>Due ทั้งหมด</small><b>{fmt(dispatchConfirmation.due?.reqQty || 0)}</b><em>ชิ้น</em></div><div><small>ขายออกแล้ว</small><b>{fmt(dispatchConfirmation.due?.alreadyQty || 0)}</b><em>ชิ้น</em></div><div className="current"><small>ขายครั้งนี้</small><b>{fmt(dispatchConfirmation.tag?.qty || 0)}</b><em>{dispatchConfirmation.tag?.unit || "ชิ้น"}</em></div><div><small>คงเหลือหลังขาย</small><b>{fmt(dispatchConfirmation.due?.remainingAfter || 0)}</b><em>ชิ้น</em></div></div>
          {dispatchConfirmation.stagedAvail !== undefined && <p className="dispatch-staged-note">งานที่จัดรอขายไว้ {fmt(dispatchConfirmation.stagedAvail)} ชิ้น</p>}
        </section>
      </div>
      {(dispatchConfirmation.verdict === "ready" || dispatchConfirmation.verdict === "ready_noimg") ? <footer><button type="button" className="button secondary" onClick={() => setDispatchConfirmation(null)}>ยกเลิก / ตรวจใหม่</button><button type="button" className="button confirm-dispatch-button" disabled={checkingTag} onClick={() => void confirmDispatch()}>{checkingTag ? "กำลังขายออก…" : "✓ ยืนยันขายออกและตัดยอด"}</button></footer> : <footer className="dispatch-confirm-blocked"><p>ไม่สามารถขายออกได้: {dispatchConfirmation.message || "ข้อมูลไม่พร้อมขายออก"}</p><button type="button" className="button secondary" onClick={() => setDispatchConfirmation(null)}>ปิดและตรวจใหม่</button></footer>}
    </div></div>}
    {cameraOpen && <div className="modal-backdrop"><div className="camera-modal"><header><h3>{cameraPurpose === "stock" ? "สแกน Tag รับงานเข้า Stock" : "สแกน QR Tag ด้วยกล้อง"}</h3><button onClick={() => setCameraOpen(false)}>×</button></header><div className="camera-view"><video ref={videoRef} playsInline muted /><div className="camera-frame" /></div>{cameraError && <p className="camera-error">{cameraError}</p>}<button className="button secondary full" onClick={() => setCameraOpen(false)}>ปิดกล้อง</button></div></div>}
    {userEditorOpen && <div className="modal-backdrop"><form className="user-modal permission-modal" onSubmit={saveUser}>
      <header><div><h3>{userForm.id ? "แก้ไขผู้ใช้งานและสิทธิ์" : "เพิ่มผู้ใช้งาน"}</h3><p>เลือกบทบาทและกำหนดหน้าที่แต่ละคนสามารถเปิดใช้งานได้</p></div><button type="button" onClick={() => setUserEditorOpen(false)}>×</button></header>
      <div className="user-form-grid">
        <label><span>รหัสพนักงาน *</span><input value={userForm.employeeCode} onChange={(e) => setUserForm((current) => ({ ...current, employeeCode: e.target.value.toUpperCase() }))} placeholder="เช่น DISP001" required /></label>
        <label><span>ชื่อผู้ใช้งาน *</span><input value={userForm.displayName} onChange={(e) => setUserForm((current) => ({ ...current, displayName: e.target.value }))} placeholder="ชื่อ-นามสกุล" required /></label>
        <label><span>บทบาท *</span><select value={userForm.role} onChange={(e) => { const role = e.target.value as UserRole; setUserForm((current) => ({ ...current, role })); }}><option value="production">Production</option><option value="stock">Stock</option><option value="qc">QC</option><option value="delivery">Delivery</option>{(userForm.role === "dispatcher" || userForm.role === "inspector") && <option value={userForm.role}>{ROLE_LABELS[userForm.role]}</option>}</select></label>
        <label><span>{userForm.id ? "ตั้ง PIN ใหม่ (เว้นว่างหากไม่เปลี่ยน)" : "PIN 6 หลัก *"}</span><input type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={userForm.pin} onChange={(e) => setUserForm((current) => ({ ...current, pin: e.target.value.replace(/\D/g, "") }))} required={!userForm.id} placeholder="••••••" /></label>
        <label className="wide"><span>อีเมล (ไม่บังคับ)</span><input type="email" value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} /></label>
      </div>
      <section className="individual-permissions"><div className="permission-title"><div><b>สิทธิ์เข้าใช้งานรายบุคคล</b><p>Admin เลือกหน้าที่ผู้ใช้เปิดได้เองทุกหน้า รวมถึงหน้าหลัก และต้องเลือกอย่างน้อย 1 หน้า</p></div></div>
        <div className="permission-grid">{NAV.map((item) => {
          const checked = userForm.permissions.includes(item.key);
          return <label key={item.key} className={`permission-option ${checked ? "checked" : ""}`}>
            <input type="checkbox" checked={checked} onChange={(event) => setUserForm((current) => ({
              ...current,
              permissions: event.target.checked
                ? [...new Set([...current.permissions, item.key])]
                : current.permissions.filter((key) => key !== item.key),
            }))} />
            <span>{item.icon}</span><div><b>{item.label}</b><small>{PERMISSION_HELP[item.key]}</small></div>
          </label>;
        })}</div>
      </section>
      <footer><button type="button" className="button secondary" onClick={() => setUserEditorOpen(false)}>ยกเลิก</button><button className="button primary" disabled={userSaving || !userForm.permissions.length}>{userSaving ? "กำลังบันทึก…" : "บันทึกผู้ใช้งานและสิทธิ์"}</button></footer>
    </form></div>}
  </div>;
}
