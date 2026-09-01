"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type PageKey = "dashboard" | "stock" | "parts" | "tags" | "plan" | "arrange" | "dispatch" | "exports" | "reports" | "history" | "settings" | "users";

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
type StockPart = { materialCode: string; partName: string; customer: string; standardQty: number; active: boolean };
type StockTag = { id: number; tagId: string; materialCode: string; partName: string; customer: string; qty: number; remainingQty: number; reservedQty: number; jobNo: string; productionDate: string; status: string; printedByName: string; receivedByName: string; receivedAt?: string; createdAt: string; payload?: string; boxNo?: number; boxCount?: number; deliveryQty?: number };
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
type StockPayload = {
  parts: StockPart[]; tags: StockTag[]; allocations: StockAllocation[];
  picks: StockPick[]; dispatchLinks: StockDispatchLink[];
};
type ArrangementPreview = {
  action: "staged";
  pick: StockPick;
  tag: StockTag;
  due: DueLine & { remainingToArrange: number; remainingQty: number };
};
type UserForm = { id?: number; employeeCode: string; displayName: string; email: string; role: "dispatcher" | "inspector"; pin: string; active: boolean; permissions: PageKey[] };

const ROLE_PERMISSIONS: Record<UserForm["role"], PageKey[]> = {
  dispatcher: ["dashboard", "stock", "parts", "tags", "arrange", "history"],
  inspector: ["dashboard", "dispatch", "history"],
};
const EMPTY_USER: UserForm = { employeeCode: "", displayName: "", email: "", role: "dispatcher", pin: "", active: true, permissions: [...ROLE_PERMISSIONS.dispatcher] };

const NAV: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: "dashboard", label: "หน้าหลัก", icon: "⌂" },
  { key: "stock", label: "Stock", icon: "▦" },
  { key: "parts", label: "ทะเบียน Part", icon: "▦" },
  { key: "tags", label: "พิมพ์ Tag", icon: "▤" },
  { key: "plan", label: "แผนส่งงาน (Due)", icon: "▤" },
  { key: "arrange", label: "จัดงาน", icon: "⇥" },
  { key: "dispatch", label: "ตรวจและขายออก", icon: "⌗" },
  { key: "exports", label: "รายการส่งออก", icon: "▱" },
  { key: "reports", label: "รายงาน", icon: "▥" },
  { key: "history", label: "ประวัติ", icon: "◷" },
  { key: "settings", label: "ตั้งค่า", icon: "⚙" },
  { key: "users", label: "ผู้ใช้งาน", icon: "♙" },
];

const PERMISSION_HELP: Record<PageKey, string> = {
  dashboard: "ภาพรวม Due และสถานะงาน",
  stock: "รับ Tag เข้า Stock และดูยอดคงเหลือ",
  parts: "ทะเบียน Part และรูปชิ้นงาน",
  tags: "ทะเบียน Part สร้างและพิมพ์ Tag",
  plan: "นำเข้า ตรวจสอบ และลบแผน Due",
  arrange: "เลือก Due และยิง KIT Tag เพื่อจัดงานรอขาย",
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
  dispatch: "ผู้ตรวจยิง Tag ลูกค้าเพื่อขายออก ตัด Stock และ Due",
  exports: "รายการที่ตัดยอดและส่งออกแล้ว",
  reports: "สรุปผลการส่งงานตามวันและโรงงาน",
  history: "ตรวจสอบประวัติการสแกนและตัดยอด",
  settings: "กำหนดค่าการทำงานของระบบ",
  users: "ผู้ใช้งานที่มีสิทธิ์เข้าถึงระบบ",
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
function PartImage({ materialCode, compact = false, version }: { materialCode: string; compact?: boolean; version?: string }) {
  const [failedCode, setFailedCode] = useState("");
  if (failedCode === materialCode) return <div className={`part-photo-fallback ${compact ? "compact" : ""}`}><span>◈</span><small>ยังไม่มีรูป</small></div>;
  const source = `/api/part-images?materialCode=${encodeURIComponent(materialCode)}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
  return <div className={`part-photo ${compact ? "compact" : ""}`}><img src={source} alt={`รูปชิ้นงาน ${materialCode}`} onError={() => setFailedCode(materialCode)} /></div>;
}

export default function DeliveryControlApp({ user, signOutPath }: { user: { id: number; employeeCode: string; displayName: string; email: string; role: string; permissions: PageKey[] }; signOutPath: string }) {
  // ออกจากระบบด้วย POST เท่านั้น ปุ่มยังเป็น <a> เพื่อให้สไตล์เดิม (.top-user a,
  // .mobile-logout) ใช้ได้ต่อโดยไม่ต้องแก้ CSS แต่ตัวคำขอจริงเป็น POST
  async function signOut(event: ReactMouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await fetch(signOutPath, { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const [page, setPage] = useState<PageKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [payload, setPayload] = useState<DuePayload>({ dues: [], imports: [], scans: [], receipts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rawTag, setRawTag] = useState("");
  const [tagPreview, setTagPreview] = useState<TagPreview | null>(null);
  const [checkingTag, setCheckingTag] = useState(false);
  const [arrangeDueId, setArrangeDueId] = useState("");
  const [arrangeTag, setArrangeTag] = useState("");
  const [arrangeQty, setArrangeQty] = useState("");
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
  const [partImagesLoading, setPartImagesLoading] = useState(false);
  const [partImageCode, setPartImageCode] = useState("");
  const [partImageFile, setPartImageFile] = useState<File | null>(null);
  const [partImageSaving, setPartImageSaving] = useState(false);
  const [bulkImageFiles, setBulkImageFiles] = useState<File[]>([]);
  const [bulkImageRunning, setBulkImageRunning] = useState(false);
  const [bulkImageProgress, setBulkImageProgress] = useState({ done: 0, total: 0 });
  const [bulkImageFailed, setBulkImageFailed] = useState<Array<{ name: string; reason: string }>>([]);
  const [partImageNeedle, setPartImageNeedle] = useState("");
  const [deletingImportId, setDeletingImportId] = useState<number | null>(null);
  const [stock, setStock] = useState<StockPayload>({ parts: [], tags: [], allocations: [], picks: [], dispatchLinks: [] });
  const [stockLoading, setStockLoading] = useState(false);
  const [stockPartForm, setStockPartForm] = useState({ materialCode: "", partName: "", customer: "", standardQty: "" });
  const [partSearch, setPartSearch] = useState("");
  const [partPage, setPartPage] = useState(1);
  const [partPageSize, setPartPageSize] = useState(10);
  const [tagSearch, setTagSearch] = useState("");
  const [tagPage, setTagPage] = useState(1);
  const [tagPageSize, setTagPageSize] = useState(10);
  const [deletingPartCode, setDeletingPartCode] = useState("");
  const [deletingStockTagId, setDeletingStockTagId] = useState("");
  const [stockTagForm, setStockTagForm] = useState({ materialCode: "", qty: "", jobNo: "", productionDate: new Date().toISOString().slice(0, 10) });
  const [stockScan, setStockScan] = useState("");
  const [stockSaving, setStockSaving] = useState(false);
  const [createdStockTags, setCreatedStockTags] = useState<StockTag[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const partFileInput = useRef<HTMLInputElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tagResultRef = useRef<HTMLElement>(null);
  const allowedPages = useMemo(() => {
    const keys: PageKey[] = user.role === "admin" ? NAV.map((item) => item.key) : (user.permissions?.length ? user.permissions : ["dashboard"]);
    return new Set<PageKey>(["dashboard", ...keys]);
  }, [user.permissions, user.role]);

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
        picks: data.picks || [], dispatchLinks: data.dispatchLinks || [],
      });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "โหลด Stock ไม่สำเร็จ" });
    } finally {
      setStockLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDue(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!["stock", "parts", "tags", "arrange", "dispatch", "reports", "history"].includes(page)) return;
    const timer = window.setTimeout(() => void loadStock(), 0);
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
    if (!allowedPages.has("users")) return;
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
      const response = await fetch("/api/part-images", { cache: "no-store" });
      const data = await response.json() as { images?: PartImageMapping[]; error?: string };
      if (!response.ok) throw new Error(data.error || "โหลดรายการรูปไม่สำเร็จ");
      setPartImages(data.images || []);
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
   * อัปโหลดรูปหลายไฟล์ในคราวเดียว โดยใช้ชื่อไฟล์เป็น Material Code
   *
   * ส่งทีละไฟล์ผ่าน API เดิม ไม่ได้เพิ่มเส้นทางใหม่ที่ฝั่ง server
   * ส่งทีละไฟล์เพื่อไม่ให้ยิงพร้อมกันจนโดนจำกัด และเพื่อให้รู้ว่าไฟล์ไหนล้มเหลว
   */
  async function uploadPartImagesBulk(event: FormEvent) {
    event.preventDefault();
    if (!bulkImageFiles.length) return;
    setBulkImageRunning(true);
    setNotice(null);
    setBulkImageFailed([]);
    setBulkImageProgress({ done: 0, total: bulkImageFiles.length });

    const failed: Array<{ name: string; reason: string }> = [];
    let saved = 0;

    for (const [index, file] of bulkImageFiles.entries()) {
      const materialCode = materialCodeFromFileName(file.name);
      try {
        if (!materialCode) throw new Error("ชื่อไฟล์ว่าง ตั้งชื่อไฟล์ให้ตรงกับ Part No.");
        const form = new FormData();
        form.set("materialCode", materialCode);
        form.set("image", file);
        const response = await fetch("/api/part-images", { method: "POST", body: form });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
        saved += 1;
      } catch (caught) {
        failed.push({ name: file.name, reason: caught instanceof Error ? caught.message : "อัปโหลดไม่สำเร็จ" });
      }
      setBulkImageProgress({ done: index + 1, total: bulkImageFiles.length });
    }

    setBulkImageFailed(failed);
    setNotice(failed.length
      ? { type: "error", text: `อัปโหลดสำเร็จ ${fmt(saved)} รูป ไม่สำเร็จ ${fmt(failed.length)} รูป ดูรายการด้านล่าง` }
      : { type: "success", text: `อัปโหลดรูปชิ้นงานสำเร็จทั้งหมด ${fmt(saved)} รูป` });
    setBulkImageFiles([]);
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
      email: target.email, role: target.role as "dispatcher" | "inspector", pin: "",
      active: target.active, permissions: target.permissions?.length ? [...target.permissions] : [...ROLE_PERMISSIONS[target.role as UserForm["role"]]],
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
              const arrangeMode = page === "arrange";
              if (arrangeMode) {
                setArrangeTag(value);
                setArrangementPreview(null);
                void stageStockTag(value);
              } else {
                setRawTag(value);
                setTagPreview(null);
                void processTag(value);
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
          const deliveryDate = normalizeDueDate(valueAt(row, activeHeaders, alias.date));
          const suppliedTime = normalizeTime(valueAt(row, activeHeaders, alias.time));
          const deliveryTime = suppliedTime || "09:00";
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

      // ไฟล์แผนจริงแยกรอบส่งเป็นหลายชีต เช่น 02.00, 09.00 F3, 14.00
      // รวมทุกชีตรอบเวลา และไม่อ่าน Sheet1/vlookup/รอบเช้าเพื่อป้องกันข้อมูลซ้ำ
      const timeSheets = candidates.filter((candidate) => /^\d{1,2}[.:]\d{2}(?:\s|$)/.test(candidate.sheetName.trim()));
      const rows = timeSheets.length
        ? timeSheets.flatMap((candidate) => candidate.rows)
        : candidates.sort((left, right) => right.rows.length - left.rows.length)[0]?.rows || [];
      if (!rows.length) throw new Error("ไม่พบรายการ Due ที่ใช้งานได้ กรุณาตรวจสอบว่ามี Item No./Material Code, Due Qty/Req. Qty และวันที่ส่งงาน");
      setPreviewRows(rows);
      setNotice({ type: "success", text: `อ่านไฟล์สำเร็จ ${fmt(rows.length)} รายการ รวม ${fmt(rows.reduce((sum, row) => sum + row.reqQty, 0))} ชิ้น` });
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
      setStockPartForm({ materialCode: "", partName: "", customer: "", standardQty: "" });
      setPartImageCode("");
      setPartImageFile(null);
      setNotice({ type: "success", text: partImageFile ? "บันทึกข้อมูลและรูปชิ้นงานแล้ว" : "บันทึก Part ในทะเบียน Stock แล้ว" });
      await Promise.all([loadStock(), loadPartImages()]);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "บันทึก Part ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
    }
  }

  async function importPartExcel(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setStockSaving(true);
    setNotice(null);
    try {
      if (!/\.xlsx?$/i.test(selected.name)) throw new Error("กรุณาเลือกไฟล์ Excel .xlsx หรือ .xls");
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(await selected.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
      const normalized = (value: unknown) => text(value).toLowerCase().replace(/[\s._/()\-]+/g, "");
      const aliases = {
        materialCode: ["partno", "material", "materialno", "materialcode", "partmaterialno", "รหัสpart", "พาร์ท", "รหัสชิ้นงาน"],
        partName: ["partname", "materialdescription", "description", "ชื่อชิ้นงาน", "รายละเอียด"],
        customer: ["customer", "customername", "ลูกค้า"],
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
      if (headerIndex < 0) {
        throw new Error("ไม่พบหัวตาราง Part / Material No. และ Part Name ในไฟล์");
      }
      const headers = grid[headerIndex].map(normalized);
      const columnIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));
      const indexes = {
        materialCode: columnIndex(normalizedAliases.materialCode),
        partName: columnIndex(normalizedAliases.partName),
        customer: columnIndex(normalizedAliases.customer),
        standardQty: columnIndex(normalizedAliases.standardQty),
      };
      if (indexes.standardQty < 0) {
        throw new Error("ไม่พบคอลัมน์ Max Qty per Box / จำนวนสูงสุดต่อกล่อง");
      }
      const parts = grid.slice(headerIndex + 1).map((row) => ({
        materialCode: text(row[indexes.materialCode]).toUpperCase(),
        partName: text(row[indexes.partName]),
        customer: indexes.customer >= 0 ? text(row[indexes.customer]) : "",
        standardQty: number(row[indexes.standardQty]),
      })).filter((part) => part.materialCode && part.partName && part.standardQty > 0);
      if (!parts.length) throw new Error("ไม่พบข้อมูล Part ที่มี Part No., Part Name และจำนวนต่อกล่องครบถ้วน");
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

  async function receiveStockTag(input: FormEvent | string) {
    if (typeof input !== "string") input.preventDefault();
    const rawPayload = (typeof input === "string" ? input : stockScan).trim();
    if (!rawPayload || stockSaving) return;
    setStockSaving(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "receive", rawPayload }),
      });
      const data = await response.json() as { tag?: StockTag; error?: string };
      if (!response.ok) throw new Error(data.error || "รับเข้า Stock ไม่สำเร็จ");
      setStockScan("");
      setNotice({ type: "success", text: `รับ Tag ${data.tag?.tagId || ""} เข้า Stock แล้ว` });
      await loadStock();
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "รับเข้า Stock ไม่สำเร็จ" });
    } finally {
      setStockSaving(false);
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
      const packQty = Number(stock.parts.find((part) => part.materialCode === tag.materialCode)?.standardQty || 0);
      const isFullBox = packQty > 0 ? tag.qty >= packQty : boxNo < boxCount;
      const boxType = isFullBox ? "FULL BOX / กล่องเต็ม" : "REMAINDER BOX / กล่องเศษ";
      const deliveryQty = tag.deliveryQty || stock.tags
        .filter((item) => item.tagId.replace(/-B\d+OF\d+$/, "") === batchCode)
        .reduce((sum, item) => sum + Number(item.qty), 0) || tag.qty;
      return `<section class="tag"><header><div class="brand">KiT<small>DELIVERY DUE CONTROL</small></div><div class="tag-title"><b>STOCK RECEIVING TAG</b><small>TAG รับงานเข้า STOCK</small></div></header>
        <div class="product"><div class="photo-wrap">${imageUrl ? `<img class="photo" src="${imageUrl}" alt="รูปชิ้นงาน ${html(tag.materialCode)}" />` : `<div class="photo-fallback"><strong>◇</strong>ยังไม่มีรูปชิ้นงาน</div>`}</div><div class="qr-wrap"><img class="qr" src="${qr}" alt="QR"><small>QR / BARCODE</small></div><div class="main"><small>CUSTOMER</small><p class="customer">${html(tag.customer || "—")}</p><small>PART NO. / MATERIAL</small><b>${html(tag.materialCode)}</b><small>PART NAME</small><p>${html(tag.partName)}</p></div></div>
        <div class="grid"><div><small>DELIVERY QTY / จำนวนงานรวม</small><b class="qty">${fmt(deliveryQty)}</b> <span class="unit">PC</span></div><div><small>QTY IN BOX / จำนวนในกล่อง</small><b class="qty">${fmt(tag.qty)}</b> <span class="unit">PC</span></div><div class="box-cell"><small>BOX / กล่อง</small><b>${fmt(boxNo)} / ${fmt(boxCount)}</b><span class="box-type ${isFullBox ? "full" : "remainder"}">${boxType}</span></div><div><small>JOB NO.</small><b>${html(tag.jobNo)}</b></div><div><small>PRODUCTION DATE / วันที่ผลิต</small><b>${html(formatDate(tag.productionDate))}</b></div><div><small>TAG ID</small><b>${html(tag.tagId)}</b></div></div>
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
      .product{display:grid;grid-template-columns:19mm 17mm 1fr;gap:1.2mm;padding:1mm 1.6mm;border-bottom:1.4px solid #48688d;background:#e7f0fc}.photo-wrap{height:18mm;display:grid;place-items:center;border:1.2px solid #48688d;border-radius:1.3mm;background:#fff;overflow:hidden}.photo{width:100%;height:100%;object-fit:contain}.photo-fallback{color:#344b68;text-align:center;font-size:5px;font-weight:700}.photo-fallback strong{display:block;font-size:13px;color:#48688d}.qr-wrap{height:18mm;display:grid;place-items:center;align-content:center;border:1.2px solid #48688d;border-radius:1.3mm;background:#fff}.qr{width:14.5mm;height:14.5mm}.qr-wrap small{font-size:3.8px;font-weight:800;color:#071a35}
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

  const selectedDue = selectedScan ? payload.dues.find((due) => due.id === selectedScan.dueLineId) : null;
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
    if (next === "users") void loadUsers();
    if (next === "parts" || next === "settings") void loadPartImages();
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
            <td data-label="จัดการ"><button className="tiny-button" onClick={() => {
              setArrangeDueId(String(due.id));
              go(user.role === "inspector" ? "dispatch" : "arrange");
            }}>{Number(due.scannedQty) < due.reqQty ? (user.role === "inspector" ? "ขายออก" : "จัดงาน") : "ดู"}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    );
  };

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
      <section className="hero">
        <div className="hero-copy">
          <span>DELIVERY DUE CONTROL</span>
          <h2>แผนส่งงานและตัดยอด<br />ด้วย <em>QR Tag</em></h2>
          <p>นำเข้า Excel ของลูกค้า ตรวจ Due และสแกน Tag เพื่อตัดยอดแบบทันที</p>
          <button className="button white" onClick={() => go("plan")}>⇧ นำเข้าแผนส่งงาน Excel</button>
        </div>
        <div className="hero-art" role="img" aria-label="รถขนส่งสินค้าในเส้นทางโรงงาน"><img src="/dashboard-delivery-hero.png" alt="" /></div>
      </section>

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

        <Card title="Due ที่ค้างตัดยอด (รายการล่าสุด)" action={<button className="text-button" onClick={() => go("plan")}>ดูทั้งหมด →</button>}>
          {pendingDues.length ? <div className="pending-list">{pendingDues.map((due) => <button key={due.id} className="pending-row" onClick={() => go("plan")}>
            <span className={`date-pill ${urgency(due.deliveryDate)}`}>{formatDate(due.deliveryDate)}</span>
            <span className="pending-main"><b>{due.materialCode}</b><small>{due.materialDescription || `${due.fact}${due.line ? ` / ${due.line}` : ""}`}</small></span>
            <span className="pending-qty">{fmt(Math.max(Number(due.reqQty) - Number(due.scannedQty), 0))}</span>
          </button>)}</div> : <Empty title="ไม่มี Due ค้าง" text="ทุกรายการตามตัวกรองปัจจุบันตัดยอดครบแล้ว" />}
        </Card>

        <div className="home-side">
          <Card title="เมนูด่วน">
            <div className="quick-tiles">
              <button className="qt blue" onClick={() => go("plan")}><span>⇧</span>นำเข้าแผนงาน</button>
              <button className="qt purple" onClick={() => go("tags")}><span>▤</span>สร้างและพิมพ์ Tag</button>
              <button className="qt green" onClick={() => go("stock")}><span>▦</span>รับเข้า Stock</button>
              <button className="qt orange" onClick={() => go(user.role === "inspector" ? "dispatch" : "arrange")}><span>⌗</span>{user.role === "inspector" ? "ตรวจและขายออก" : "จัดงาน"}</button>
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
      || item.customer.toLowerCase().includes(partNeedle));
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
    const formImage = partImages.find((item) => item.materialCode === stockPartForm.materialCode.trim().toUpperCase());
    const editPart = (part: StockPart) => {
      setStockPartForm({ materialCode: part.materialCode, partName: part.partName, customer: part.customer, standardQty: String(part.standardQty || "") });
      setPartImageCode(part.materialCode);
      setPartImageFile(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const clearPartForm = () => {
      setStockPartForm({ materialCode: "", partName: "", customer: "", standardQty: "" });
      setPartImageCode("");
      setPartImageFile(null);
    };
    return <div className="parts-home">
      <div className="part-stat-row">
        <article className="part-stat blue"><span>▦</span><div><small>Part ในระบบ</small><b>{fmt(stock.parts.length)}</b><em>รายการ</em></div></article>
        <article className="part-stat green"><span>✓</span><div><small>Active</small><b>{fmt(activeParts)}</b><em>Part</em></div></article>
        <article className="part-stat orange"><span>◷</span><div><small>ยกเลิก</small><b>{fmt(inactiveParts)}</b><em>Part</em></div></article>
        <article className="part-stat purple"><span>◇</span><div><small>มีรูปชิ้นงาน</small><b>{fmt(partImages.length)}</b><em>รายการ</em></div></article>
      </div>

      {user.role === "admin" && <Card className="part-editor-card" title={stockPartForm.materialCode ? "แก้ไข Part" : "เพิ่ม / แก้ไข Part"} action={<div className="user-actions"><input ref={partFileInput} type="file" accept=".xlsx,.xls" hidden onChange={importPartExcel} /><button className="button secondary" disabled={stockSaving} onClick={() => partFileInput.current?.click()}>⇧ นำเข้า Part Excel</button><button className="button primary" form="part-editor-form" disabled={stockSaving}>▣ {stockSaving ? "กำลังบันทึก…" : "บันทึก Part"}</button></div>}>
        <form id="part-editor-form" className="part-editor-grid" onSubmit={saveStockPart}>
          <label><span>Part / Material No. *</span><input value={stockPartForm.materialCode} onChange={(e) => { const code=e.target.value.toUpperCase(); setStockPartForm((current) => ({ ...current, materialCode: code })); setPartImageCode(code); }} required /></label>
          <label><span>ชื่อชิ้นงาน *</span><input value={stockPartForm.partName} onChange={(e) => setStockPartForm((current) => ({ ...current, partName: e.target.value }))} required /></label>
          <label><span>ลูกค้า</span><input value={stockPartForm.customer} onChange={(e) => setStockPartForm((current) => ({ ...current, customer: e.target.value }))} /></label>
          <label><span>จำนวนสูงสุดต่อกล่อง *</span><input type="number" min="1" value={stockPartForm.standardQty} onChange={(e) => setStockPartForm((current) => ({ ...current, standardQty: e.target.value }))} required /></label>
          <div className="part-photo-editor">
            <div className="part-current-photo">{stockPartForm.materialCode ? <PartImage materialCode={stockPartForm.materialCode} version={formImage?.updatedAt} /> : <span>▧</span>}</div>
            <label className="part-change-photo"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPartImageFile(e.target.files?.[0] || null)} /><b>⇧ {formImage ? "เปลี่ยนรูป" : "เพิ่มรูป"}</b><small>{partImageFile?.name || "JPG, PNG, WebP (ไม่เกิน 5MB)"}</small></label>
          </div>
        </form>
        <div className="part-editor-foot"><span>Excel รองรับคอลัมน์: Part / Material No., Part Name, Customer และ Max Qty per Box</span>{stockPartForm.materialCode && <button type="button" className="tiny-button" onClick={clearPartForm}>＋ เพิ่ม Part ใหม่</button>}</div>
      </Card>}

      <Card className="part-list-card" title="รายการ Part ทั้งหมด" action={<div className="part-list-actions"><input value={partSearch} onChange={(e) => { setPartSearch(e.target.value); setPartPage(1); }} placeholder="⌕ ค้นหา Part No., ชื่อชิ้นงาน หรือลูกค้า..." /><button className="button secondary" onClick={() => void Promise.all([loadStock(), loadPartImages()])}>↻ รีเฟรช</button></div>}>
        {visibleParts.length ? <div className="part-modern-table">
          <div className="part-modern-head"><span>Part / Material No.</span><span>ชื่อชิ้นงาน</span><span>ลูกค้า</span><span>จำนวนสูงสุดต่อกล่อง</span><span>สถานะ</span><span>จัดการ</span></div>
          <div className="part-modern-body">{paginatedParts.map((part) => {
            const image = partImages.find((item) => item.materialCode === part.materialCode);
            const hasTag = stock.tags.some((tag) => tag.materialCode === part.materialCode);
            return <div className="part-modern-row" key={part.materialCode}>
              <span className="part-code-cell"><PartImage materialCode={part.materialCode} compact version={image?.updatedAt} /><span><b>{part.materialCode}</b><small>{image ? "มีรูปชิ้นงาน" : "ยังไม่มีรูป"}</small></span></span>
              <span>{part.partName}</span><span>{part.customer || "—"}</span><span>{part.standardQty > 0 ? fmt(part.standardQty) + " ชิ้น" : "ยังไม่กำหนด"}</span>
              <span><em className={"part-active " + (part.active ? "on" : "off")}>{part.active ? "ใช้งาน" : "ยกเลิก"}</em></span>
              <span className="part-row-actions"><button className="tiny-button" onClick={() => editPart(part)}>✎ แก้ไข</button>{hasTag ? <small>มีประวัติ Stock</small> : <button className="tiny-button danger-outline" disabled={Boolean(deletingPartCode)} onClick={() => void deleteStockPart(part)}>♲ {deletingPartCode === part.materialCode ? "กำลังลบ…" : "ลบ"}</button>}</span>
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

      {user.role === "admin" && <details className="part-bulk-panel"><summary>อัปโหลดรูปหลาย Part พร้อมกัน</summary><form className="part-image-upload bulk" onSubmit={uploadPartImagesBulk}><label className="part-file bulk-file"><span>ตั้งชื่อไฟล์ให้ตรงกับ Part No.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={bulkImageRunning} onChange={(e) => { setBulkImageFiles([...(e.target.files || [])]); setBulkImageFailed([]); }} /></label><button className="button primary" disabled={bulkImageRunning || !bulkImageFiles.length}>{bulkImageRunning ? "กำลังอัปโหลด " + fmt(bulkImageProgress.done) + "/" + fmt(bulkImageProgress.total) + "…" : "⇧ อัปโหลด " + (bulkImageFiles.length ? fmt(bulkImageFiles.length) + " รูป" : "ทั้งหมด")}</button></form>{bulkImageFailed.length > 0 && <div className="bulk-preview failed"><b>ไฟล์ที่อัปโหลดไม่สำเร็จ</b><ul>{bulkImageFailed.map((item) => <li key={item.name}><code>{item.name}</code><small>{item.reason}</small></li>)}</ul></div>}</details>}
    </div>;
  }

  function renderTags() {
    const awaitingReceipt = stock.tags.filter((item) => item.status === "printed").length;
    const receivedTags = stock.tags.filter((item) => item.status !== "printed").length;
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

    return <div className="tag-print-home">
      <div className="tag-stat-row">
        <article className="tag-stat green"><span>▤</span><div><small>Tag ทั้งหมด</small><b>{fmt(stock.tags.length)}</b><em>ใบ</em></div></article>
        <article className="tag-stat orange"><span>◷</span><div><small>รอรับเข้า Stock</small><b>{fmt(awaitingReceipt)}</b><em>ใบ</em></div></article>
        <article className="tag-stat purple"><span>✓</span><div><small>รับเข้าแล้ว</small><b>{fmt(receivedTags)}</b><em>ใบ</em></div></article>
        <article className="tag-stat blue"><span>▣</span><div><small>Job ที่สร้าง Tag</small><b>{fmt(jobCount)}</b><em>Job</em></div></article>
      </div>

      <Card className="tag-create-card" title="สร้างและพิมพ์ Tag ก่อนส่งเข้า Stock" action={<button className="button primary" form="tag-create-form" disabled={stockSaving || !selectedStockPart || selectedStockPart.standardQty <= 0}>▣ {stockSaving ? "กำลังสร้าง…" : "สร้าง Tag"}</button>}>
        <form id="tag-create-form" className="tag-create-form" onSubmit={createStockTag}>
          <label className="tag-part-select"><span>เลือก Part *</span><input list="stock-part-codes" value={stockTagForm.materialCode} onChange={(event) => setStockTagForm((current) => ({ ...current, materialCode: event.target.value.toUpperCase(), qty: "" }))} placeholder="พิมพ์ Part No. หรือเลือกรายการ" autoComplete="off" spellCheck={false} required /></label>
          <datalist id="stock-part-codes">{activeStockParts.map((item) => <option key={item.materialCode} value={item.materialCode}>{item.partName}{item.customer ? ` · ${item.customer}` : ""}</option>)}</datalist>
          <label><span>จำนวนสูงสุดต่อกล่อง</span><input value={selectedStockPart?.standardQty ? fmt(selectedStockPart.standardQty) : ""} placeholder="เลือก Part ก่อน" readOnly /></label>
          <label><span>จำนวนงานรวม (Job) *</span><input type="number" min="1" value={stockTagForm.qty} onChange={(event) => setStockTagForm((current) => ({ ...current, qty: event.target.value }))} required /></label>
          <label className="tag-job-field"><span>Job *</span><input value={stockTagForm.jobNo} onChange={(event) => setStockTagForm((current) => ({ ...current, jobNo: event.target.value.toUpperCase() }))} placeholder="กรอก Job" required /></label>
          <label className="tag-date-field"><span>วันที่ผลิต *</span><input type="date" value={stockTagForm.productionDate} onChange={(event) => setStockTagForm((current) => ({ ...current, productionDate: event.target.value }))} required /></label>
          <div className="tag-auto-photo">{selectedStockPart ? <PartImage materialCode={selectedStockPart.materialCode} version={selectedPartImage?.updatedAt} /> : <div className="tag-auto-photo-empty"><span>▧</span><b>รูปชิ้นงาน</b><small>ดึงจากทะเบียน Part อัตโนมัติ</small></div>}</div>
          <div className="tag-create-note">
            <span>{selectedStockPart ? "✓" : "ⓘ"}</span>
            <div>{selectedStockPart ? <><b>{selectedStockPart.materialCode} · {selectedStockPart.partName}</b><small>{plannedBoxCount > 0 ? `ระบบจะสร้าง ${fmt(plannedBoxCount)} Tag · กล่องละสูงสุด ${fmt(selectedStockPart.standardQty)} ชิ้น` : "กรอกจำนวนงานรวมเพื่อคำนวณจำนวน Tag"}</small></> : <><b>{stockTagForm.materialCode ? "ไม่พบ Part นี้ในทะเบียน" : "เลือกรายการ Part เพื่อเริ่มสร้าง Tag"}</b><small>รูปและจำนวนต่อกล่องจะดึงจากทะเบียน Part</small></>}</div>
          </div>
          <button className="button primary tag-create-submit" disabled={stockSaving || !selectedStockPart || selectedStockPart.standardQty <= 0}>▣ สร้าง Tag ตามจำนวนกล่อง</button>
        </form>
        {createdStockTags.length > 0 && <div className="tag-created-banner"><PartImage materialCode={createdStockTags[0].materialCode} compact /><div><small>สร้างสำเร็จ · A4 หนึ่งหน้าสูงสุด 8 Tag</small><b>{fmt(createdStockTags.length)} Tag / {fmt(createdStockTags.reduce((sum, item) => sum + item.qty, 0))} ชิ้น</b><p>{createdStockTags[0].materialCode} · Job {createdStockTags[0].jobNo}</p></div><button className="button primary" onClick={() => void printStockTags(createdStockTags)}>▤ พิมพ์ Tag</button></div>}
      </Card>

      <Card className="tag-list-card" title="Tag ที่สร้างแล้ว" action={<button className="button secondary" onClick={() => void loadStock()}>↻ รีเฟรช</button>}>
        <div className="tag-list-toolbar"><input value={tagSearch} onChange={(event) => { setTagSearch(event.target.value); setTagPage(1); }} placeholder="⌕ ค้นหา Tag ID, Part No., Job, ลูกค้า หรือวันที่ผลิต" />{tagSearch && <button type="button" className="button secondary" onClick={() => { setTagSearch(""); setTagPage(1); }}>ล้าง</button>}</div>
        <p className="tag-list-help">พบ {fmt(visibleTags.length)} จาก {fmt(stock.tags.length)} Tag · Tag ที่สร้างแล้วแก้ไขไม่ได้ การพิมพ์ซ้ำใช้ Tag ID เดิมและไม่เพิ่มยอด Stock</p>
        {stockLoading ? <div className="inline-loading">กำลังโหลด Tag…</div> : visibleTags.length ? <div className="tag-modern-table">
          <div className="tag-modern-head"><span>Tag ID</span><span>Part / รูปชิ้นงาน</span><span>จำนวน/กล่อง</span><span>Job</span><span>วันที่ผลิต</span><span>สถานะ</span><span>จัดการ</span></div>
          <div className="tag-modern-body">{paginatedTags.map((item) => {
            const image = partImages.find((entry) => entry.materialCode === item.materialCode);
            const boxMatch = item.tagId.match(/-B(\d+)OF(\d+)$/);
            const statusText = item.status === "depleted" ? "ขายออกหมด" : item.status === "printed" ? "รอรับเข้า" : item.reservedQty ? "รอขายออก" : "รับเข้าแล้ว";
            const statusClass = item.status === "depleted" ? "over" : item.status === "printed" || item.reservedQty ? "partial" : "completed";
            return <div className="tag-modern-row" key={item.id}>
              <span className="tag-id-cell"><b>{item.tagId}</b><small>{boxMatch ? `กล่อง ${Number(boxMatch[1])} / ${Number(boxMatch[2])}` : "Tag งาน"}</small></span>
              <span className="tag-product-cell"><PartImage materialCode={item.materialCode} compact version={image?.updatedAt} /><span><b>{item.materialCode}</b><small>{item.partName}</small><small>{item.customer || "ไม่ระบุลูกค้า"}</small></span></span>
              <span><b>{fmt(item.qty)} ชิ้น</b></span>
              <span><b>{item.jobNo}</b></span>
              <span><b>{formatDate(item.productionDate)}</b><small>{formatTime(item.createdAt)}</small></span>
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
      </Card>
    </div>;
  }

  function renderStock() {
    const receivedStockTags = stock.tags.filter((item) => item.status !== "printed");
    const onHand = receivedStockTags.reduce((sum, item) => sum + Number(item.remainingQty), 0);
    const reserved = receivedStockTags.reduce((sum, item) => sum + Number(item.reservedQty), 0);
    const available = Math.max(onHand - reserved, 0);
    const awaitingReceipt = stock.tags.filter((item) => item.status === "printed").length;
    const todayKey = new Date().toISOString().slice(0, 10);
    const receivedToday = receivedStockTags.filter((item) => (item.receivedAt || "").slice(0, 10) === todayKey).reduce((sum, item) => sum + Number(item.qty), 0);
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
      return { key, label: String(date.getDate()) + "/" + String(date.getMonth() + 1), qty: receivedStockTags.filter((item) => (item.receivedAt || "").slice(0, 10) === key).reduce((sum, item) => sum + Number(item.qty), 0) };
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
          <form className="stock-receive-form" onSubmit={receiveStockTag}><input value={stockScan} onChange={(e) => setStockScan(e.target.value)} placeholder="เช่น TG-20250901-0001" autoComplete="off" autoFocus /><button className="button primary" disabled={!stockScan.trim() || stockSaving}>{stockSaving ? "กำลังบันทึก…" : "บันทึกรับเข้า Stock"}</button></form>
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
    return <>
      <div className="scan-layout">
        <section className="scanner-card">
          <div className="scanner-title"><div><h3>{scanMode === "arrange" ? "ผู้จัดงาน: เลือก Due แล้วยิง KIT Stock Tag" : "ผู้ตรวจ: ยิง Tag ลูกค้าเพื่อขายออก"}</h3><p>{scanMode === "arrange" ? "บันทึก Job ที่หยิบจริงและขึ้นสถานะรอขาย — ยังไม่ลด Stock / Due" : "ระบบจับคู่กับ KIT Tag ที่จัดไว้ แล้วลด Stock และ Due พร้อมกัน"}</p></div><button className="camera-button" onClick={() => { setCameraPurpose("scan"); setCameraOpen(true); }}>▣ เปิดกล้อง</button></div>
          {scanMode === "arrange" && <div className="arrange-due-selector">
            <label><span>1. เลือก Due ที่จะจัด *</span><select value={effectiveArrangeDueId} onChange={(e) => { setArrangeDueId(e.target.value); setArrangementPreview(null); }}>
              <option value="">— เลือก Due —</option>
              {arrangeableDues.map((due) => <option key={due.id} value={due.id}>{formatDate(due.deliveryDate)} {due.deliveryTime} · {due.fact}/{due.line || "—"} · {due.materialCode} · เหลือจัด {fmt(due.reqQty - due.scannedQty - (due.arrangedQty || 0))}</option>)}
            </select></label>
            {selectedArrangeDue && <div className="selected-due-strip"><PartImage materialCode={selectedArrangeDue.materialCode} compact /><div><b>{selectedArrangeDue.materialCode}</b><small>{selectedArrangeDue.fact} / {selectedArrangeDue.line || "—"} · DO {selectedArrangeDue.doNo} · Seq {selectedArrangeDue.seq}</small></div><strong>เหลือจัด {fmt(selectedArrangeDue.reqQty - selectedArrangeDue.scannedQty - (selectedArrangeDue.arrangedQty || 0))}</strong></div>}
          </div>}
          <div className="scanner-visual"><div className="scan-frame"><span className="qr-symbol">▦</span><b>{checkingTag ? "กำลังบันทึก…" : "พร้อมรับ QR Tag"}</b><small>วาง QR ให้อยู่ในกรอบ หรือยิง Tag ได้ทันที</small><i /></div></div>
          {scanMode === "arrange"
            ? <form className="manual-scan arrange-scan-form" onSubmit={stageStockTag}><label><span>2. จำนวนที่จะหยิบ (เว้นว่าง = จัดเท่าที่ Due ต้องการ)</span><input type="number" min="1" value={arrangeQty} onChange={(e) => setArrangeQty(e.target.value)} placeholder="อัตโนมัติ" /></label><label><span>3. KIT Stock Tag</span><input ref={tagInput} value={arrangeTag} onChange={(e) => { setArrangeTag(e.target.value); setArrangementPreview(null); }} placeholder="ยิง Tag ที่พิมพ์จากระบบ แล้วเครื่องส่ง Enter" autoComplete="off" /></label><button className="button primary" disabled={!effectiveArrangeDueId || !arrangeTag.trim() || checkingTag}>{checkingTag ? "กำลังจัดงาน…" : "จัดงาน / รอขายออก"}</button></form>
            : <form className="manual-scan" onSubmit={processTag}><label><span>Tag ลูกค้า / ข้อมูลจาก QR</span><input ref={tagInput} value={rawTag} onChange={(e) => { setRawTag(e.target.value); setTagPreview(null); }} placeholder="ยิง Tag ลูกค้า แล้วเครื่องส่ง Enter" autoComplete="off" /></label><button className="button primary" disabled={!rawTag.trim() || checkingTag}>{checkingTag ? "กำลังขายออก…" : "ขายออก / ตัด Stock และ Due"}</button></form>}
        </section>
        <section className="tag-result" ref={tagResultRef}>
          <header><div><p>{scanMode === "arrange" ? "KIT Tag / Job ที่จัด" : "Customer Tag / Due"}</p><h3>{scanMode === "arrange" ? arrangementPreview?.due.materialCode || "รอการสแกน" : tagPreview?.due.materialCode || "รอการสแกน"}</h3></div><span className={`status ${(scanMode === "arrange" ? arrangementPreview : tagPreview) ? "completed" : "pending"}`}>{(scanMode === "arrange" ? arrangementPreview : tagPreview) ? (scanMode === "arrange" ? "จัดรอขายแล้ว" : "ขายออกสำเร็จ") : "ยังไม่มี Tag"}</span></header>
          {scanMode === "arrange" ? (arrangementPreview ? <>
            <div className="tag-main"><PartImage materialCode={arrangementPreview.due.materialCode} /><div><small>PART / MATERIAL</small><b>{arrangementPreview.due.materialCode}</b><p>{arrangementPreview.due.materialDescription || "ไม่ระบุรายละเอียด"}</p></div></div>
            <div className="detail-grid"><div><small>FAC / Line</small><b>{arrangementPreview.due.fact} / {arrangementPreview.due.line || "—"}</b></div><div><small>DO / Seq</small><b>{arrangementPreview.due.doNo} / {arrangementPreview.due.seq}</b></div><div><small>KIT Stock Tag</small><b>{arrangementPreview.tag.tagId}</b></div><div><small>Job</small><b>{arrangementPreview.tag.jobNo}</b></div><div><small>วันที่ผลิต</small><b>{formatDate(arrangementPreview.tag.productionDate)}</b></div><div><small>วันที่รับเข้า Stock</small><b>{arrangementPreview.tag.receivedAt ? formatDateTime(arrangementPreview.tag.receivedAt) : "—"}</b></div></div>
            <div className="cut-summary"><div className="progress-ring staged-ring"><span><b>{fmt(arrangementPreview.pick.pickedQty)}</b>ชิ้นที่จัด</span></div><div className="cut-numbers"><p><span>Due ทั้งหมด</span><b>{fmt(arrangementPreview.due.reqQty)}</b></p><p><span>จัดรอขายรวม</span><b>{fmt(arrangementPreview.due.arrangedQty || 0)}</b></p><p><span>ส่งแล้ว</span><b>{fmt(arrangementPreview.due.scannedQty)}</b></p><p><span>Due คงเหลือ</span><b>{fmt(arrangementPreview.due.remainingQty)}</b></p></div></div>
            <div className="scan-saved">✓ บันทึกผู้จัดงานและ Job แล้ว — ขั้นตอนนี้ยังไม่ลด Stock และ Due</div>
          </> : <Empty title="รอผู้จัดงานยิง KIT Stock Tag" text="เลือก Due ก่อน แล้วสแกน Tag ของเราที่ติดกับงาน ข้อมูล Job และวันที่รับเข้าจะแสดงทันที" />) : (tagPreview ? <>
            <div className="tag-main"><PartImage materialCode={tagPreview.due.materialCode} /><div><small>PART / MATERIAL</small><b>{tagPreview.due.materialCode}</b><p>{tagPreview.due.materialDescription || "ไม่ระบุรายละเอียด"}</p></div></div>
            <div className="detail-grid"><div><small>FAC / Line</small><b>{tagPreview.due.fact} / {tagPreview.due.line || "—"}</b></div><div><small>DO / Seq</small><b>{tagPreview.due.doNo} / {tagPreview.due.seq}</b></div><div><small>แผนส่งวัน / เวลา</small><b>{formatDate(tagPreview.due.deliveryDate)} {tagPreview.due.deliveryTime}</b></div><div><small>Tag ID</small><b>{tagPreview.tag.tagId}</b></div><div><small>Location</small><b>{tagPreview.tag.location || "—"}</b></div><div><small>จำนวนใน Tag</small><b>{fmt(tagPreview.tag.qty)} {tagPreview.tag.unit}</b></div></div>
            <div className="cut-summary"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><b>{progress}%</b>หลังขายออก</span></div><div className="cut-numbers"><p><span>Due ทั้งหมด</span><b>{fmt(tagPreview.due.reqQty)}</b></p><p><span>ขายออกแล้ว</span><b>{fmt(tagPreview.due.projectedQty)}</b></p><p className="current"><span>จำนวน Tag ลูกค้า</span><b>{fmt(tagPreview.tag.qty)}</b></p><p><span>Due คงเหลือ</span><b>{fmt(tagPreview.due.remainingAfter)}</b></p></div></div>
            {tagPreview.stockAllocations?.length ? <div className="linked-stock-tags"><b>Traceability: Tag ลูกค้า ↔ KIT Tag / Job</b>{tagPreview.stockAllocations.map((item, index) => <span key={`${item.stockTagId}-${index}`}><strong>{item.stockTagCode || `Stock #${item.stockTagId}`}</strong> · Job {item.jobNo || "—"} · ผลิต {item.productionDate ? formatDate(item.productionDate) : "—"} · รับเข้า {item.receivedAt ? formatDateTime(item.receivedAt) : "—"} · {fmt(item.qty)} ชิ้น</span>)}</div> : null}
            <div className="scan-saved">✓ ขายออกแล้ว ลด Stock และตัด Due พร้อมบันทึก Job ที่ใช้จริง</div>
          </> : <Empty title="รอผู้ตรวจยิง Tag ลูกค้า" text="สแกนแล้วระบบจะแสดงรูปชิ้นงาน ตรวจยอด และตัด Stock / Due ทันทีโดยไม่ต้องกดตรวจสอบ Tag" />)}
        </section>
      </div>
      <Card title={scanMode === "arrange" ? "รายการจัดงานรอขายออกล่าสุด" : "รายการขายออกและตัดยอดล่าสุด"} action={allowedPages.has("history") ? <button className="text-button" onClick={() => go("history")}>ดูประวัติทั้งหมด →</button> : undefined}>
        {scanMode === "arrange" ? (stock.picks.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วัน / เวลา</th><th>Due / Part</th><th>KIT Tag / Job</th><th>ผลิต / รับเข้า</th><th className="num">จัด / ขายแล้ว</th><th>ผู้จัดงาน</th></tr></thead><tbody>{stock.picks.slice(0, 12).map((item) => <tr key={item.id}><td data-label="วัน / เวลา">{formatDateTime(item.pickedAt)}</td><td data-label="Due / Part"><b>{item.fact} / {item.line || "—"}</b><small>{item.materialCode} · DO {item.doNo}</small></td><td data-label="KIT Tag / Job"><b>{item.stockTagCode}</b><small>Job {item.jobNo}</small></td><td data-label="ผลิต / รับเข้า"><b>{formatDate(item.productionDate)}</b><small>{item.receivedAt ? formatDateTime(item.receivedAt) : "—"}</small></td><td data-label="จัด / ขายแล้ว" className="num"><b>{fmt(item.pickedQty)} / {fmt(item.dispatchedQty)}</b></td><td data-label="ผู้จัดงาน">{item.pickedByName}</td></tr>)}</tbody></table></div> : <Empty text="เลือก Due แล้วยิง KIT Stock Tag รายการจะขึ้นที่นี่" />) : (payload.scans.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วัน / เวลา</th><th>FAC</th><th>Part No.</th><th>Tag ลูกค้า</th><th className="num">จำนวนที่ตัด</th><th>ผู้ตรวจ</th></tr></thead><tbody>{payload.scans.slice(0, 8).map((scan) => <tr key={scan.id}><td data-label="วัน / เวลา">{formatDateTime(scan.createdAt)}</td><td data-label="FAC"><b>{scan.fact}</b></td><td data-label="Part No."><b>{scan.materialCode}</b></td><td data-label="Tag ลูกค้า">{scan.tagId}</td><td data-label="จำนวนที่ตัด" className="num sent"><b>{fmt(scan.qty)} {scan.unit}</b></td><td data-label="ผู้ตรวจ">{scan.scannedByName}</td></tr>)}</tbody></table></div> : <Empty text="เมื่อผู้ตรวจสแกน Tag ลูกค้า รายการจะแสดงที่นี่" />)}
      </Card>
    </>;
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
    return <><Card><Filters /></Card><div className="metrics five"><MetricCard tone="blue" icon="⌗" label="สแกน QR Tag" value={fmt(payload.scans.length)} suffix="รายการล่าสุด" /><MetricCard tone="green" icon="✓" label="ตัดยอด" value={fmt(payload.scans.length)} suffix="รายการล่าสุด" /><MetricCard tone="orange" icon="▱" label="ส่งออก" value={fmt(payload.dues.filter((due) => due.scannedQty > 0).length)} suffix="รายการ" /><MetricCard tone="purple" icon="✎" label="นำเข้าไฟล์" value={fmt(payload.imports.length)} suffix="ครั้งล่าสุด" /><MetricCard tone="gray" icon="↪" label="เข้าสู่ระบบ" value="1" suffix="ผู้ใช้งาน" /></div><div className="history-grid"><Card title="ประวัติการทำรายการ">{payload.scans.length ? <div className="timeline">{payload.scans.map((scan) => <button className={selectedScan?.id === scan.id ? "active" : ""} key={scan.id} onClick={() => setSelectedScan(scan)}><span>✓</span><time>{formatDateTime(scan.createdAt)}</time><div><b>สแกน QR Tag และตัดยอด</b><p>{scan.fact} · {scan.materialCode} · {fmt(scan.qty)} {scan.unit}</p></div><em>สำเร็จ</em></button>)}</div> : <Empty />}</Card><Card title="รายละเอียดการทำรายการ" className="history-detail">{selectedScan ? <><div className="history-badge"><span>⌗</span><div><b>สแกน QR Tag</b><small>สำเร็จ</small></div></div><dl><div><dt>เวลา</dt><dd>{formatDateTime(selectedScan.createdAt)}</dd></div><div><dt>ผู้ทำรายการ</dt><dd>{selectedScan.scannedByName}</dd></div><div><dt>FAC</dt><dd>{selectedScan.fact}</dd></div><div><dt>หมายเลข Tag</dt><dd>{selectedScan.tagId}</dd></div><div><dt>Material</dt><dd>{selectedScan.materialCode}</dd></div><div><dt>แผน / ตัดยอด</dt><dd>{selectedDue ? `${fmt(selectedDue.reqQty)} / ${fmt(selectedScan.qty)} ชิ้น` : `${fmt(selectedScan.qty)} ชิ้น`}</dd></div><div><dt>Location</dt><dd>{selectedScan.location || "—"}</dd></div></dl></> : <Empty />}</Card></div></>;
  }

  function renderSettings() {
    // ตัวแปรธรรมดา ไม่ใช่ useMemo เพราะ renderSettings() เป็นฟังก์ชันที่ถูกเรียก
    // แบบมีเงื่อนไข ไม่ใช่คอมโพเนนต์ การเรียก hook ในนี้จะผิดกฎ Hooks
    const Toggle = ({ keyName, title, text: description }: { keyName: keyof typeof settings; title: string; text: string }) => <label className="setting-row"><div><b>{title}</b><small>{description}</small></div><input type="checkbox" checked={settings[keyName]} onChange={(e) => setSettings((current) => ({ ...current, [keyName]: e.target.checked }))} /><i /></label>;
    return <>
      <Card title="ข้อมูลระบบ"><div className="system-card"><div className="system-logo">KiT<small>DELIVERY DUE CONTROL</small></div><dl><div><dt>ชื่อระบบ</dt><dd>KIT Delivery Due Control</dd></div><div><dt>เวอร์ชัน</dt><dd>v2.15.0</dd></div><div><dt>เขตเวลา</dt><dd>Bangkok, Thailand</dd></div><div><dt>ผู้ดูแล</dt><dd>{user.displayName}</dd></div></dl><div className="system-stats"><p><span>▤</span><b>{fmt(payload.dues.length)}</b><small>Due ทั้งหมด</small></p><p><span>▣</span><b>{fmt(partImages.length)}</b><small>รูปชิ้นงาน</small></p></div></div></Card>
      <div className="settings-grid"><Card title="ตั้งค่าการตัดยอด"><Toggle keyName="partial" title="อนุญาตให้ตัดยอดบางส่วน" text="Tag หนึ่งใบสามารถตัดยอดไม่ครบ Due ได้" /><Toggle keyName="confirm" title="ยืนยันก่อนตัดยอดทุกครั้ง" text="แสดงยอดก่อนและหลังให้ตรวจสอบก่อนบันทึก" /></Card><Card title="ตั้งค่าการสแกน"><Toggle keyName="autoFocus" title="โฟกัสช่องสแกนอัตโนมัติ" text="เหมาะสำหรับใช้งานร่วมกับเครื่องยิง Tag" /><Toggle keyName="sound" title="เสียงแจ้งเตือนเมื่อสำเร็จ" text="เปิดเสียงยืนยันหลังตัดยอดเรียบร้อย" /></Card></div>
      <Card title="รูปแบบการแสดงผล"><div className="form-grid"><label><span>ภาษา</span><select><option>ภาษาไทย</option></select></label><label><span>เขตเวลา</span><select><option>(GMT+07:00) Bangkok, Thailand</option></select></label><label><span>รูปแบบวันที่</span><select><option>DD/MM/YYYY</option></select></label><label><span>หน่วยเริ่มต้น</span><select><option>ชิ้น (PC)</option></select></label></div><div className="save-row"><button className="button primary" onClick={saveSettings}>▣ บันทึกการตั้งค่า</button></div></Card>
    </>;
  }

  function renderUsers() {
    const active = systemUsers.filter((item) => item.active).length;
    const dispatchers = systemUsers.filter((item) => item.role === "dispatcher").length;
    const inspectors = systemUsers.filter((item) => item.role === "inspector").length;
    return <>
      <Card title="ภาพรวมผู้ใช้งาน" action={<button className="button primary" onClick={() => { setUserForm({ ...EMPTY_USER, permissions: [...EMPTY_USER.permissions] }); setUserEditorOpen(true); }}>＋ เพิ่มผู้ใช้งาน</button>}>
        <div className="metrics four compact">
          <MetricCard tone="blue" icon="♙" label="ผู้ใช้งานทั้งหมด" value={fmt(systemUsers.length)} suffix="คน" />
          <MetricCard tone="green" icon="✓" label="ใช้งานปกติ" value={fmt(active)} suffix="คน" />
          <MetricCard tone="orange" icon="⇥" label="ผู้จัดงาน" value={fmt(dispatchers)} suffix="คน" />
          <MetricCard tone="purple" icon="⌗" label="ผู้ตรวจงาน" value={fmt(inspectors)} suffix="คน" />
        </div>
      </Card>
      <Card title="ผู้ใช้งานระบบ" action={<button className="button secondary" onClick={() => void loadUsers()}>↻ รีเฟรช</button>}>
        {usersLoading ? <div className="loading-state"><span /><p>กำลังโหลดผู้ใช้งาน…</p></div> : <div className="table-wrap mobile-table-wrap">
          <table className="mobile-card-table"><thead><tr><th>รหัส / ผู้ใช้งาน</th><th>อีเมล</th><th>บทบาท</th><th>สิทธิ์หน้า</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>{systemUsers.map((item) => <tr key={item.id}>
              <td data-label="ผู้ใช้งาน"><div className="user-cell"><span>{item.displayName.slice(0, 1).toUpperCase()}</span><div><b>{item.displayName}</b><small>{item.employeeCode}</small></div></div></td>
              <td data-label="อีเมล">{item.email || "—"}</td>
              <td data-label="บทบาท"><span className="role-pill">{item.role === "admin" ? "ผู้ดูแลระบบ" : item.role === "dispatcher" ? "ผู้จัดงาน (รับเข้า)" : "ผู้ตรวจงาน (ส่งออก)"}</span></td>
              <td data-label="สิทธิ์หน้า"><div className="permission-summary">{(item.role === "admin" ? NAV.map((nav) => nav.key) : item.permissions || []).map((key) => <span key={key}>{NAV.find((nav) => nav.key === key)?.label || key}</span>)}</div></td>
              <td data-label="สถานะ"><span className={`status ${item.active ? "completed" : "over"}`}>{item.active ? "ใช้งานปกติ" : "ระงับ"}</span></td>
              <td data-label="จัดการ">{item.role === "admin" ? <span className="muted">บัญชีหลัก</span> : <div className="user-actions"><button className="tiny-button" onClick={() => editUser(item)}>แก้ไข / สิทธิ์ / PIN</button><button className={`tiny-button ${item.active ? "danger-outline" : ""}`} onClick={() => void toggleUser(item)}>{item.active ? "ระงับ" : "เปิดใช้"}</button></div>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Card>
      <div className="split-grid">
        <Card title="สิทธิ์รายบุคคล"><div className="permission-note"><span>◆</span><div><b>Admin เลือกได้ทีละคน</b><p>บทบาทจะใส่สิทธิ์เริ่มต้นให้ก่อน จากนั้นเปิดหรือปิดแต่ละหน้าได้อิสระ โดยหน้าหลักเปิดไว้เสมอ</p></div></div></Card>
        <Card title="ความปลอดภัย"><div className="permission-note"><span>◆</span><div><b>ป้องกันทั้งเมนูและ API</b><p>หน้าที่ไม่ได้รับสิทธิ์จะไม่แสดงในเมนู และระบบจะปฏิเสธการเปิดหรือเรียกใช้งานโดยตรง</p></div></div></Card>
      </div>
    </>;
  }

  const pageContent: Record<PageKey, () => ReactNode> = { dashboard: renderDashboard, stock: renderStock, parts: renderParts, tags: renderTags, plan: renderPlan, arrange: () => renderScan("arrange"), dispatch: () => renderScan("dispatch"), exports: renderExports, reports: renderReports, history: renderHistory, settings: renderSettings, users: renderUsers };
  const activeNav = NAV.find((item) => item.key === page)!;

  return <div className="control-shell">
    <aside className={`control-sidebar ${menuOpen ? "open" : ""}`}>
      <button className="sidebar-close" onClick={() => setMenuOpen(false)}>×</button>
      <div className="kit-logo"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <nav>{NAV.filter((item) => allowedPages.has(item.key)).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom">{allowedPages.has("settings") && <div className="help-box"><b>ต้องการความช่วยเหลือ?</b><button onClick={() => go("settings")}>◉ คู่มือและตั้งค่า</button></div>}<a className="mobile-logout" href={signOutPath} onClick={signOut}><span>↪</span><b>ออกจากระบบ</b></a><div className="mini-brand"><b>KiT</b><span>Delivery Due Control<br />© 2026 · v2.15.0</span></div></div>
    </aside>
    {menuOpen && <button className="menu-backdrop" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} />}
    <main className="control-main">
      <header className="control-topbar"><button className="menu-button" onClick={() => setMenuOpen(true)}>☰</button><div><h1>{activeNav.label}</h1><p>หน้าหลัก <span>›</span> {PAGE_SUBTITLE[page]}</p></div><div className="top-user"><button className="notification">♧<i>{notice ? "1" : "0"}</i></button><span className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><b>{user.displayName}</b><small>{user.role === "admin" ? "ผู้ดูแลระบบ" : user.role === "dispatcher" ? "ผู้จัดงาน" : "ผู้ตรวจงาน"}</small></div><a href={signOutPath} onClick={signOut}>ออกจากระบบ</a></div></header>
      <div className="control-content">
        {notice && <div className={`toast ${notice.type}`}><span>{notice.type === "success" ? "✓" : "!"}</span><p>{notice.text}</p><button onClick={() => setNotice(null)}>×</button></div>}
        {error && <div className="toast error"><span>!</span><p>{error}</p><button onClick={() => void loadDue()}>ลองใหม่</button></div>}
        {loading ? <div className="loading-state"><span /><p>กำลังโหลดข้อมูล Due…</p></div> : pageContent[page]()}
      </div>
    </main>
    <nav className="mobile-bottom-nav" aria-label="เมนูมือถือ">
      {NAV.filter((item) => allowedPages.has(item.key)).slice(0, 4).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span><small>{item.label.replace("แผนส่งงาน (Due)", "แผนงาน").replace("ตรวจและขายออก", "ขายออก")}</small></button>)}
      <button onClick={() => setMenuOpen(true)}><span>☰</span><small>เมนู</small></button>
      <a className="bottom-logout" href={signOutPath} onClick={signOut}><span>↪</span><small>ออกระบบ</small></a>
    </nav>
    {cameraOpen && <div className="modal-backdrop"><div className="camera-modal"><header><h3>{cameraPurpose === "stock" ? "สแกน Tag รับงานเข้า Stock" : "สแกน QR Tag ด้วยกล้อง"}</h3><button onClick={() => setCameraOpen(false)}>×</button></header><div className="camera-view"><video ref={videoRef} playsInline muted /><div className="camera-frame" /></div>{cameraError && <p className="camera-error">{cameraError}</p>}<button className="button secondary full" onClick={() => setCameraOpen(false)}>ปิดกล้อง</button></div></div>}
    {userEditorOpen && <div className="modal-backdrop"><form className="user-modal permission-modal" onSubmit={saveUser}>
      <header><div><h3>{userForm.id ? "แก้ไขผู้ใช้งานและสิทธิ์" : "เพิ่มผู้ใช้งาน"}</h3><p>เลือกบทบาทและกำหนดหน้าที่แต่ละคนสามารถเปิดใช้งานได้</p></div><button type="button" onClick={() => setUserEditorOpen(false)}>×</button></header>
      <div className="user-form-grid">
        <label><span>รหัสพนักงาน *</span><input value={userForm.employeeCode} onChange={(e) => setUserForm((current) => ({ ...current, employeeCode: e.target.value.toUpperCase() }))} placeholder="เช่น DISP001" required /></label>
        <label><span>ชื่อผู้ใช้งาน *</span><input value={userForm.displayName} onChange={(e) => setUserForm((current) => ({ ...current, displayName: e.target.value }))} placeholder="ชื่อ-นามสกุล" required /></label>
        <label><span>บทบาท *</span><select value={userForm.role} onChange={(e) => { const role = e.target.value as UserForm["role"]; setUserForm((current) => ({ ...current, role, permissions: [...ROLE_PERMISSIONS[role]] })); }}><option value="dispatcher">ผู้จัดงาน — สแกนรับเข้า</option><option value="inspector">ผู้ตรวจงาน — สแกนส่งออก/ตัด Due</option></select></label>
        <label><span>{userForm.id ? "ตั้ง PIN ใหม่ (เว้นว่างหากไม่เปลี่ยน)" : "PIN 6 หลัก *"}</span><input type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={userForm.pin} onChange={(e) => setUserForm((current) => ({ ...current, pin: e.target.value.replace(/\D/g, "") }))} required={!userForm.id} placeholder="••••••" /></label>
        <label className="wide"><span>อีเมล (ไม่บังคับ)</span><input type="email" value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} /></label>
      </div>
      <section className="individual-permissions"><div className="permission-title"><div><b>สิทธิ์เข้าใช้งานรายบุคคล</b><p>เลือกหน้าได้อิสระ หน้าหลักจะเปิดไว้เสมอ</p></div><button type="button" className="tiny-button" onClick={() => setUserForm((current) => ({ ...current, permissions: [...ROLE_PERMISSIONS[current.role]] }))}>คืนค่าตามบทบาท</button></div>
        <div className="permission-grid">{NAV.map((item) => {
          const checked = userForm.permissions.includes(item.key);
          return <label key={item.key} className={`permission-option ${checked ? "checked" : ""}`}>
            <input type="checkbox" checked={checked} disabled={item.key === "dashboard"} onChange={(event) => setUserForm((current) => ({
              ...current,
              permissions: event.target.checked
                ? [...new Set([...current.permissions, item.key])]
                : current.permissions.filter((key) => key !== item.key),
            }))} />
            <span>{item.icon}</span><div><b>{item.label}</b><small>{PERMISSION_HELP[item.key]}</small></div>
          </label>;
        })}</div>
      </section>
      <footer><button type="button" className="button secondary" onClick={() => setUserEditorOpen(false)}>ยกเลิก</button><button className="button primary" disabled={userSaving}>{userSaving ? "กำลังบันทึก…" : "บันทึกผู้ใช้งานและสิทธิ์"}</button></footer>
    </form></div>}
  </div>;
}
