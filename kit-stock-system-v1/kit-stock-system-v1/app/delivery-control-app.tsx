"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type PageKey = "dashboard" | "stock" | "tags" | "plan" | "arrange" | "dispatch" | "exports" | "reports" | "history" | "settings" | "users";

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
  dispatcher: ["dashboard", "stock", "tags", "arrange", "history"],
  inspector: ["dashboard", "dispatch", "history"],
};
const EMPTY_USER: UserForm = { employeeCode: "", displayName: "", email: "", role: "dispatcher", pin: "", active: true, permissions: [...ROLE_PERMISSIONS.dispatcher] };

const NAV: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: "dashboard", label: "หน้าหลัก", icon: "⌂" },
  { key: "stock", label: "Stock", icon: "▦" },
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

function html(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function stateOf(due: DueLine) {
  const scanned = Number(due.scannedQty);
  if (scanned > due.reqQty) return "over";
  if (scanned === due.reqQty) return "completed";
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

function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
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

function PartImage({ materialCode, compact = false }: { materialCode: string; compact?: boolean }) {
  const [failedCode, setFailedCode] = useState("");
  if (failedCode === materialCode) return <div className={`part-photo-fallback ${compact ? "compact" : ""}`}><span>◈</span><small>ยังไม่มีรูป</small></div>;
  return <div className={`part-photo ${compact ? "compact" : ""}`}><img src={`/api/part-images?materialCode=${encodeURIComponent(materialCode)}`} alt={`รูปชิ้นงาน ${materialCode}`} onError={() => setFailedCode(materialCode)} /></div>;
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
  const [deletingImportId, setDeletingImportId] = useState<number | null>(null);
  const [stock, setStock] = useState<StockPayload>({ parts: [], tags: [], allocations: [], picks: [], dispatchLinks: [] });
  const [stockLoading, setStockLoading] = useState(false);
  const [stockPartForm, setStockPartForm] = useState({ materialCode: "", partName: "", customer: "", standardQty: "" });
  const [partSearch, setPartSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
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
    if (!["stock", "tags", "arrange", "dispatch", "reports", "history"].includes(page)) return;
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
    if (!allowedPages.has("settings")) return;
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
      const sheet = workbook.Sheets.Sheet1 ?? workbook.Sheets[workbook.SheetNames[0]];
      const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
      const headerIndex = grid.findIndex((row) => row.map(text).includes("Material Code") && row.map(text).includes("Req. Qty"));
      if (headerIndex < 0) throw new Error("ไม่พบหัวตาราง Material Code และ Req. Qty ในไฟล์");
      const headers = grid[headerIndex].map(text);
      const at = (row: unknown[], name: string) => row[headers.indexOf(name)];
      const grouped = new Map<string, ImportRow>();
      for (const row of grid.slice(headerIndex + 1)) {
        const materialCode = text(at(row, "Material Code")).toUpperCase();
        const reqQty = number(at(row, "Req. Qty"));
        if (!materialCode || materialCode.includes("ผลรวม") || reqQty <= 0) continue;
        const doSubGroup = text(at(row, "DO Sub-Group"));
        const doNo = (doSubGroup.split("|")[0] || text(at(row, "Delivery Order No."))).toUpperCase();
        const seq = number(at(row, "Seq."));
        const deliveryDate = normalizeDate(at(row, "Delivery Date"), xlsx);
        const deliveryTime = normalizeTime(at(row, "Delivery Time"));
        const fact = text(at(row, "Fact.")).toUpperCase();
        const line = text(at(row, "Line")).toUpperCase();
        const shop = text(at(row, "Shop")).toUpperCase();
        if (!doNo || !seq || !deliveryDate || !deliveryTime || !fact) continue;
        const sourceKey = [doNo, materialCode, seq, deliveryDate, deliveryTime, fact, line, shop].join("|");
        const current = grouped.get(sourceKey);
        if (current) current.reqQty += reqQty;
        else grouped.set(sourceKey, {
          sourceKey, doNo, seq, materialCode,
          materialDescription: text(at(row, "Material Description")),
          site: text(at(row, "Site")).toUpperCase(), fact, line, shop, reqQty, deliveryDate, deliveryTime,
        });
      }
      const rows = [...grouped.values()];
      if (!rows.length) throw new Error("ไม่พบรายการ Due ที่ใช้งานได้ในไฟล์");
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
      if (fileInput.current) fileInput.current.value = "";
      setNotice({ type: "success", text: `นำเข้า Due สำเร็จ ${fmt(result.rowCount || 0)} รายการ รวม ${fmt(result.totalQty || 0)} ชิ้น` });
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
      setStockPartForm({ materialCode: "", partName: "", customer: "", standardQty: "" });
      setNotice({ type: "success", text: "บันทึก Part ในทะเบียน Stock แล้ว" });
      await loadStock();
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
      remaining: rows.filter((row) => ["pending", "partial"].includes(stateOf(row))).length,
    };
  }).sort((a, b) => b.items - a.items), [facts, payload.dues, filterDate]);

  const dailyStats = useMemo(() => dates.map((date) => {
    const rows = payload.dues.filter((due) => due.deliveryDate === date);
    return { date, items: rows.length, completed: rows.filter((row) => stateOf(row) === "completed").length, partial: rows.filter((row) => stateOf(row) === "partial").length, pending: rows.filter((row) => stateOf(row) === "pending").length, qty: rows.reduce((sum, row) => sum + Number(row.scannedQty), 0) };
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
    if (next === "settings") void loadPartImages();
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
    return <>
      <section className="hero">
        <div className="hero-copy"><span>DELIVERY DUE CONTROL</span><h2>แผนส่งงานและตัดยอด<br />ด้วย QR Tag</h2><p>นำเข้า Excel ของลูกค้า ตรวจ Due และสแกน Tag เพื่อตัดยอดแบบทันที</p><button className="button white" onClick={() => go("plan")}>⇧ นำเข้าแผนส่งงาน Excel</button></div>
        <div className="hero-art" role="img" aria-label="รถส่งสินค้าและกล่อง QR"><img src="/kit-due-hero.png" alt="" /></div>
      </section>
      <div className="metrics four">
        <MetricCard tone="blue" icon="▤" label="Due ทั้งหมด" value={fmt(summary.items)} suffix="รายการ" />
        <MetricCard tone="green" icon="✓" label="ส่งออกแล้ว" value={fmt(summary.completed)} suffix="รายการ" note={`${completePct}%`} />
        <MetricCard tone="orange" icon="◷" label="ยังขาด" value={fmt(summary.partial + summary.pending)} suffix="รายการ" />
        <MetricCard tone="red" icon="!" label="ผิดปกติ" value={fmt(summary.over)} suffix="รายการ" />
      </div>
      <div className="dashboard-grid">
        <Card title="สถานะส่งงานตาม Due">
          <div className="donut-layout"><div className="donut" style={{ "--complete": `${completePct * 3.6}deg` } as React.CSSProperties}><span><b>{summary.items}</b>รายการ</span></div><div className="legend"><p><i className="green" />ส่งออกครบ <b>{summary.completed}</b></p><p><i className="orange" />คงเหลือ <b>{summary.partial + summary.pending}</b></p><p><i className="red" />เกิน Due <b>{summary.over}</b></p></div></div>
        </Card>
        <Card title="อัปเดตล่าสุด" action={<button className="text-button" onClick={() => go("history")}>ดูทั้งหมด →</button>}>
          {payload.scans.length ? <div className="activity-list">{payload.scans.slice(0, 5).map((scan) => <button key={scan.id} onClick={() => { setSelectedScan(scan); go("history"); }}><span className="activity-icon">✓</span><div><b>{scan.fact} / {scan.materialCode}</b><small>Tag {scan.tagId} · {fmt(scan.qty)} {scan.unit}</small></div><time>{formatDateTime(scan.createdAt)}</time></button>)}</div> : <Empty text="รายการสแกนล่าสุดจะแสดงที่นี่" />}
        </Card>
      </div>
      <Card title="เมนูด่วน" className="quick-panel"><div className="quick-actions"><button onClick={() => go("plan")}><span>⇧</span>นำเข้าแผนงาน</button><button onClick={() => go("tags")}><span>▤</span>สร้างและพิมพ์ Tag</button><button onClick={() => go("stock")}><span>▦</span>รับเข้า Stock</button><button onClick={() => go(user.role === "inspector" ? "dispatch" : "arrange")}><span>⌗</span>{user.role === "inspector" ? "ตรวจและขายออก" : "จัดงาน"}</button></div></Card>
      <Card title="Due ที่ยังขาด (รายการล่าสุด)" action={<button className="text-button" onClick={() => go("plan")}>ดูทั้งหมด →</button>}><DueTable rows={filtered.filter((due) => ["partial", "pending"].includes(stateOf(due)))} limit={5} /></Card>
      <div className="summary-strip"><div><span>▣</span><small>วันที่มีแผนส่งงาน</small><b>{dates.length}</b></div><div><span>▥</span><small>FAC ทั้งหมด</small><b>{facts.length}</b></div><div><span>◈</span><small>รายการทั้งหมด</small><b>{fmt(payload.dues.length)}</b></div><div><span>□</span><small>ชิ้นงานตามแผน</small><b>{fmt(payload.dues.reduce((sum, due) => sum + due.reqQty, 0))}</b></div></div>
    </>;
  }

  function renderTags() {
    const awaitingReceipt = stock.tags.filter((item) => item.status === "printed").length;
    const receivedTags = stock.tags.filter((item) => item.status !== "printed").length;
    const partNeedle = partSearch.trim().toLowerCase();
    const visibleParts = stock.parts.filter((item) => !partNeedle
      || item.materialCode.toLowerCase().includes(partNeedle)
      || item.partName.toLowerCase().includes(partNeedle)
      || item.customer.toLowerCase().includes(partNeedle));
    const tagNeedle = tagSearch.trim().toLowerCase();
    const visibleTags = stock.tags.filter((item) => !tagNeedle || [
      item.tagId,
      item.materialCode,
      item.partName,
      item.customer,
      item.jobNo,
      item.productionDate,
      item.createdAt,
    ].some((value) => String(value || "").toLowerCase().includes(tagNeedle)));
    const tagJobSummaries = Array.from(visibleTags.reduce((summaryMap, item) => {
      const jobNo = item.jobNo.trim().toUpperCase() || "ไม่ระบุ JOB";
      const summary = summaryMap.get(jobNo) || {
        jobNo,
        partCodes: new Set<string>(),
        customers: new Set<string>(),
        tagCount: 0,
        totalQty: 0,
        awaitingQty: 0,
        receivedQty: 0,
        latestAt: "",
      };
      summary.partCodes.add(item.materialCode);
      if (item.customer) summary.customers.add(item.customer);
      summary.tagCount += 1;
      summary.totalQty += Number(item.qty || 0);
      if (item.status === "printed") summary.awaitingQty += Number(item.qty || 0);
      else summary.receivedQty += Number(item.qty || 0);
      if (!summary.latestAt || item.createdAt > summary.latestAt) summary.latestAt = item.createdAt;
      summaryMap.set(jobNo, summary);
      return summaryMap;
    }, new Map<string, {
      jobNo: string;
      partCodes: Set<string>;
      customers: Set<string>;
      tagCount: number;
      totalQty: number;
      awaitingQty: number;
      receivedQty: number;
      latestAt: string;
    }>()).values()).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
    const selectedStockPart = stock.parts.find((item) => item.materialCode === stockTagForm.materialCode);
    const plannedTotalQty = Number(stockTagForm.qty || 0);
    const plannedBoxCount = selectedStockPart?.standardQty && plannedTotalQty > 0
      ? Math.ceil(plannedTotalQty / selectedStockPart.standardQty)
      : 0;
    return <>
      <div className="metrics four">
        <MetricCard tone="blue" icon="▦" label="Part ในระบบ" value={fmt(stock.parts.length)} suffix="รายการ" />
        <MetricCard tone="green" icon="▤" label="Tag ทั้งหมด" value={fmt(stock.tags.length)} suffix="ใบ" />
        <MetricCard tone="orange" icon="◷" label="รอรับเข้า Stock" value={fmt(awaitingReceipt)} suffix="ใบ" />
        <MetricCard tone="purple" icon="✓" label="รับเข้าแล้ว" value={fmt(receivedTags)} suffix="ใบ" />
      </div>
      {user.role === "admin" && <Card title="1. ทะเบียน Part ทั้งหมด" action={<div className="user-actions"><input ref={partFileInput} type="file" accept=".xlsx,.xls" hidden onChange={importPartExcel} /><button className="button primary" disabled={stockSaving} onClick={() => partFileInput.current?.click()}>⇧ นำเข้า Part Excel</button><button className="button secondary" disabled={stockSaving || !payload.dues.length} onClick={() => void syncDueParts()}>⇩ นำ Part ทั้งหมดจาก Due</button></div>}>
        <form className="stock-form-grid" onSubmit={saveStockPart}>
          <label><span>Part / Material No. *</span><input value={stockPartForm.materialCode} onChange={(e) => setStockPartForm((current) => ({ ...current, materialCode: e.target.value.toUpperCase() }))} required /></label>
          <label><span>ชื่อชิ้นงาน *</span><input value={stockPartForm.partName} onChange={(e) => setStockPartForm((current) => ({ ...current, partName: e.target.value }))} required /></label>
          <label><span>ลูกค้า</span><input value={stockPartForm.customer} onChange={(e) => setStockPartForm((current) => ({ ...current, customer: e.target.value }))} /></label>
          <label><span>จำนวนสูงสุดต่อกล่อง *</span><input type="number" min="1" value={stockPartForm.standardQty} onChange={(e) => setStockPartForm((current) => ({ ...current, standardQty: e.target.value }))} required /></label>
          <button className="button primary" disabled={stockSaving}>＋ บันทึก Part</button>
        </form>
        <p className="part-image-help">Excel รองรับคอลัมน์: Part / Material No., Part Name, Customer และ Max Qty per Box (จำนวนสูงสุดต่อกล่อง) · ระบบจะเพิ่ม Part ใหม่และอัปเดต Part เดิมตาม Part No. · รูปชิ้นงานใช้รูปเดียวกับหน้า “ตั้งค่า”</p>
        <div className="part-registry-toolbar">
          <input value={partSearch} onChange={(event) => setPartSearch(event.target.value)} placeholder="ค้นหา Part No., ชื่อชิ้นงาน หรือลูกค้า" />
          <button type="button" className="button secondary danger-outline" disabled={Boolean(deletingPartCode) || !stock.parts.length} onClick={() => void deleteUnusedStockParts()}>
            {deletingPartCode === "__ALL__" ? "กำลังลบ…" : "ลบ Part ที่ยังไม่ใช้งานทั้งหมด"}
          </button>
        </div>
        {visibleParts.length ? <div className="table-wrap mobile-table-wrap part-registry-table"><table className="mobile-card-table"><thead><tr><th>Part / Material No.</th><th>ชื่อชิ้นงาน</th><th>ลูกค้า</th><th className="num">สูงสุด/กล่อง</th><th>จัดการ</th></tr></thead><tbody>{visibleParts.slice(0, 200).map((part) => {
          const hasTag = stock.tags.some((tag) => tag.materialCode === part.materialCode);
          return <tr key={part.materialCode}><td data-label="Part"><b>{part.materialCode}</b></td><td data-label="ชื่อชิ้นงาน">{part.partName}</td><td data-label="ลูกค้า">{part.customer || "—"}</td><td data-label="สูงสุด/กล่อง" className="num">{part.standardQty > 0 ? `${fmt(part.standardQty)} ชิ้น` : "ยังไม่กำหนด"}</td><td data-label="จัดการ">{hasTag ? <span className="muted">มีประวัติ Stock</span> : <button type="button" className="tiny-button danger-outline" disabled={Boolean(deletingPartCode)} onClick={() => void deleteStockPart(part)}>{deletingPartCode === part.materialCode ? "กำลังลบ…" : "ลบ Part"}</button>}</td></tr>;
        })}</tbody></table></div> : <Empty title="ไม่พบ Part" text={partNeedle ? "ลองเปลี่ยนคำค้นหา" : "ยังไม่มี Part ในทะเบียน Stock"} />}
      </Card>}
      <Card title="2. สร้างและพิมพ์ Tag ก่อนส่งเข้า Stock">
          <form className="stock-tag-form" onSubmit={createStockTag}>
            <label><span>เลือก Part *</span><select value={stockTagForm.materialCode} onChange={(e) => {
              setStockTagForm((current) => ({ ...current, materialCode: e.target.value, qty: "" }));
            }} required><option value="">— เลือก Part —</option>{stock.parts.filter((item) => item.active).map((item) => <option key={item.materialCode} value={item.materialCode}>{item.materialCode} · {item.partName}</option>)}</select></label>
            <div className="two-fields"><label><span>จำนวนงานรวมของ Job *</span><input type="number" min="1" value={stockTagForm.qty} onChange={(e) => setStockTagForm((current) => ({ ...current, qty: e.target.value }))} required /></label><label><span>Job *</span><input value={stockTagForm.jobNo} onChange={(e) => setStockTagForm((current) => ({ ...current, jobNo: e.target.value.toUpperCase() }))} required /></label></div>
            <label><span>วันที่ผลิต *</span><input type="date" value={stockTagForm.productionDate} onChange={(e) => setStockTagForm((current) => ({ ...current, productionDate: e.target.value }))} required /></label>
            {selectedStockPart && selectedStockPart.standardQty > 0 && plannedBoxCount > 0 && <div className="stock-rule-note"><b>ระบบจะสร้าง {fmt(plannedBoxCount)} Tag</b><p>บรรจุได้สูงสุด {fmt(selectedStockPart.standardQty)} ชิ้น/กล่อง · กล่องสุดท้าย {fmt(plannedTotalQty - (selectedStockPart.standardQty * (plannedBoxCount - 1)))} ชิ้น</p></div>}
            {selectedStockPart && selectedStockPart.standardQty <= 0 && <div className="stock-rule-note"><b>ยังสร้าง Tag ไม่ได้</b><p>Part นี้ยังไม่ได้กำหนดจำนวนสูงสุดต่อกล่อง กรุณาให้ Admin บันทึกข้อมูล Part ก่อน</p></div>}
            <button className="button primary full" disabled={stockSaving || !stock.parts.length || Boolean(selectedStockPart && selectedStockPart.standardQty <= 0)}>สร้าง Tag ตามจำนวนกล่อง</button>
          </form>
          {createdStockTags.length > 0 && <div className="created-stock-tag"><PartImage materialCode={createdStockTags[0].materialCode} compact /><div><small>พร้อมพิมพ์ · A4 หนึ่งหน้าสูงสุด 8 Tag</small><b>{fmt(createdStockTags.length)} กล่อง / {fmt(createdStockTags.reduce((sum, item) => sum + item.qty, 0))} ชิ้น</b><p>{createdStockTags[0].materialCode} · Job {createdStockTags[0].jobNo} · กล่องสุดท้าย {fmt(createdStockTags.at(-1)?.qty || 0)} ชิ้น</p></div><button className="button primary" onClick={() => void printStockTags(createdStockTags)}>▤ พิมพ์ {fmt(createdStockTags.length)} Tag</button></div>}
      </Card>
      <Card title="Tag ที่สร้างแล้ว" action={<button className="button secondary" onClick={() => void loadStock()}>↻ รีเฟรช</button>}>
        <div className="part-registry-toolbar tag-history-toolbar">
          <input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="ค้นหา Tag ID, Part No., Job, ลูกค้า หรือวันที่ผลิต" aria-label="ค้นหา Tag ที่เคยสร้าง" />
          {tagSearch && <button type="button" className="button secondary" onClick={() => setTagSearch("")}>ล้างคำค้นหา</button>}
        </div>
        <p className="part-image-help">พบ {fmt(visibleTags.length)} จาก {fmt(stock.tags.length)} Tag · การพิมพ์ซ้ำใช้ Tag ID เดิม ไม่สร้าง Tag ใหม่และไม่เพิ่มยอด Stock</p>
        {tagJobSummaries.length > 0 && <div className="table-wrap mobile-table-wrap tag-job-summary"><table className="mobile-card-table"><thead><tr><th>Job / Part</th><th className="num">Tag ที่สร้าง</th><th className="num">ยอด Tag สะสม</th><th className="num">รอรับเข้า</th><th className="num">รับเข้าแล้ว</th><th>สร้างล่าสุด</th><th>ดูรายการ</th></tr></thead><tbody>{tagJobSummaries.map((summary) => <tr key={summary.jobNo}>
          <td data-label="Job / Part"><b>{summary.jobNo}</b><small>{Array.from(summary.partCodes).join(", ")}</small><small>{Array.from(summary.customers).join(", ") || "ไม่ระบุลูกค้า"}</small></td>
          <td data-label="Tag ที่สร้าง" className="num"><b>{fmt(summary.tagCount)}</b> ใบ</td>
          <td data-label="ยอด Tag สะสม" className="num"><b>{fmt(summary.totalQty)}</b> ชิ้น</td>
          <td data-label="รอรับเข้า" className="num warning">{fmt(summary.awaitingQty)} ชิ้น</td>
          <td data-label="รับเข้าแล้ว" className="num sent">{fmt(summary.receivedQty)} ชิ้น</td>
          <td data-label="สร้างล่าสุด">{formatDateTime(summary.latestAt)}</td>
          <td data-label="ดูรายการ"><button type="button" className="tiny-button" onClick={() => setTagSearch(summary.jobNo)}>ดู Tag ของ Job นี้</button></td>
        </tr>)}</tbody></table></div>}
        <p className="part-image-help">ยอด Tag สะสมคือจำนวนชิ้นจาก Tag ที่สร้างของ Job นั้นทุกครั้ง ไม่รวมจำนวนครั้งที่กดพิมพ์ซ้ำ</p>
        {stockLoading ? <div className="inline-loading">กำลังโหลด Tag…</div> : visibleTags.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>Part / รูป</th><th>Job / วันที่ผลิต</th><th>Tag ID / กล่อง</th><th className="num">จำนวน</th><th>สถานะ / จัดการ</th></tr></thead><tbody>{visibleTags.map((item) => {
          const boxMatch = item.tagId.match(/-B(\d+)OF(\d+)$/);
          return <tr key={item.id}><td data-label="Part"><div className="stock-part-cell"><PartImage materialCode={item.materialCode} compact /><div><b>{item.materialCode}</b><small>{item.partName}</small><small>{item.customer || "ไม่ระบุลูกค้า"}</small></div></div></td><td data-label="Job / วันที่"><b>{item.jobNo}</b><small>{formatDate(item.productionDate)}</small></td><td data-label="Tag ID / กล่อง"><b>{item.tagId}</b>{boxMatch && <small>กล่อง {Number(boxMatch[1])} / {Number(boxMatch[2])}</small>}</td><td data-label="จำนวน" className="num">{fmt(item.qty)}</td><td data-label="สถานะ / จัดการ"><div className="user-actions"><span className={`status ${item.status === "depleted" ? "over" : item.status === "printed" || item.reservedQty ? "partial" : "completed"}`}>{item.status === "depleted" ? "ขายออกหมด" : item.status === "printed" ? "รอรับเข้า" : item.reservedQty ? "มีงานรอขาย" : "รับเข้าแล้ว"}</span><button className="tiny-button" onClick={() => void printStockTags(item)}>พิมพ์ซ้ำ</button>{user.role === "admin" && item.status === "printed" && <button type="button" className="tiny-button danger-outline" disabled={Boolean(deletingStockTagId)} onClick={() => void deleteStockTag(item)}>{deletingStockTagId === item.tagId ? "กำลังลบ…" : "ลบ Tag"}</button>}</div></td></tr>;
        })}</tbody></table></div> : <Empty title={tagNeedle ? "ไม่พบ Tag ที่ค้นหา" : "ยังไม่มี Tag"} text={tagNeedle ? "ลองค้นหาด้วย Tag ID, Part No., Job, ลูกค้า หรือวันที่ผลิต" : "เลือก Part และสร้าง Tag สำหรับนำงานเข้า Stock"} />}
      </Card>
    </>;
  }

  function renderStock() {
    const receivedStockTags = stock.tags.filter((item) => item.status !== "printed");
    const onHand = receivedStockTags.reduce((sum, item) => sum + Number(item.remainingQty), 0);
    const reserved = receivedStockTags.reduce((sum, item) => sum + Number(item.reservedQty), 0);
    const available = Math.max(onHand - reserved, 0);
    const awaitingReceipt = stock.tags.filter((item) => item.status === "printed").length;
    return <>
      <div className="metrics four">
        <MetricCard tone="blue" icon="▤" label="Tag รอรับเข้า" value={fmt(awaitingReceipt)} suffix="ใบ" />
        <MetricCard tone="green" icon="□" label="Stock คงเหลือ" value={fmt(onHand)} suffix="ชิ้น" />
        <MetricCard tone="orange" icon="◷" label="รอขายออก" value={fmt(reserved)} suffix="ชิ้น" />
        <MetricCard tone="purple" icon="✓" label="พร้อมจัดงาน" value={fmt(available)} suffix="ชิ้น" />
      </div>
      <Card title="1. ยิง Tag รับงานเข้า Stock" action={<button type="button" className="camera-button" onClick={() => { setCameraPurpose("stock"); setCameraOpen(true); }}>▣ เปิดกล้องยิง Tag</button>}>
        <div className="stock-scan-visual"><span>▦</span><b>พร้อมรับ Tag Stock</b><small>ใช้กล้องโทรศัพท์หรือเครื่องยิงส่ง Enter แล้วระบบบันทึกทันที</small></div>
        <form className="manual-scan" onSubmit={receiveStockTag}><label><span>รหัส Tag Stock / ข้อมูล QR</span><input value={stockScan} onChange={(e) => setStockScan(e.target.value)} placeholder="ยิง Tag ที่สร้างจากเมนูพิมพ์ Tag" autoComplete="off" autoFocus /></label><button className="button primary" disabled={!stockScan.trim() || stockSaving}>{stockSaving ? "กำลังรับเข้า…" : "รับเข้า Stock"}</button></form>
        <div className="stock-rule-note"><b>ขั้นตอนการทำงาน</b><p>สร้างและพิมพ์ Tag จากเมนู “พิมพ์ Tag” ก่อน จากนั้นนำ Tag มายิงหน้านี้เพื่อรับงานเข้า Stock ผู้จัดงานจะยิง KIT Tag เพื่อจองงาน และผู้ตรวจยิง Tag ลูกค้าเพื่อตัด Stock กับ Due จริง</p></div>
      </Card>
      <Card title="2. รายการ Stock" action={<button className="button secondary" onClick={() => void loadStock()}>↻ รีเฟรช</button>}>
        {stockLoading ? <div className="inline-loading">กำลังโหลด Stock…</div> : receivedStockTags.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>Part / รูป</th><th>Job / วันที่ผลิต</th><th>Tag ID / กล่อง</th><th className="num">รับเข้า</th><th className="num">จองรอ</th><th className="num">คงเหลือ</th><th>สถานะ</th></tr></thead><tbody>{receivedStockTags.map((item) => {
          const boxMatch = item.tagId.match(/-B(\d+)OF(\d+)$/);
          return <tr key={item.id}><td data-label="Part"><div className="stock-part-cell"><PartImage materialCode={item.materialCode} compact /><div><b>{item.materialCode}</b><small>{item.partName}</small></div></div></td><td data-label="Job / วันที่"><b>{item.jobNo}</b><small>{formatDate(item.productionDate)}</small></td><td data-label="Tag ID / กล่อง"><b>{item.tagId}</b>{boxMatch && <small>กล่อง {Number(boxMatch[1])} / {Number(boxMatch[2])}</small>}</td><td data-label="รับเข้า" className="num">{fmt(item.qty)}</td><td data-label="จองรอ" className="num warning">{fmt(item.reservedQty)}</td><td data-label="คงเหลือ" className="num sent"><b>{fmt(item.remainingQty)}</b></td><td data-label="สถานะ"><span className={`status ${item.status === "depleted" ? "over" : item.reservedQty ? "partial" : "completed"}`}>{item.status === "depleted" ? "ขายออกหมด" : item.reservedQty ? "มีงานรอขาย" : "พร้อมใช้"}</span></td></tr>;
        })}</tbody></table></div> : <Empty title="ยังไม่มี Stock" text="ยิง Tag รับงานเข้า Stock แล้วรายการจะแสดงที่นี่" />}
      </Card>
      <Card title="Traceability: Tag ลูกค้า ↔ KIT Tag ↔ Job">
        {stock.dispatchLinks.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>Tag ลูกค้า</th><th>KIT Tag / Job</th><th>Part / Due</th><th>ผลิต / รับเข้า</th><th className="num">จำนวน</th><th>ผู้จัด / ผู้ตรวจ</th></tr></thead><tbody>{stock.dispatchLinks.slice(0, 50).map((item) => <tr key={item.id}><td data-label="Tag ลูกค้า"><b>{item.customerTagId}</b></td><td data-label="KIT Tag / Job"><b>{item.stockTagCode}</b><small>Job {item.jobNo}</small></td><td data-label="Part / Due"><b>{item.materialCode}</b><small>{item.fact} / {item.line || "—"} · DO {item.doNo}</small></td><td data-label="ผลิต / รับเข้า"><b>{formatDate(item.productionDate)}</b><small>{item.receivedAt ? formatDateTime(item.receivedAt) : "—"}</small></td><td data-label="จำนวน" className="num"><b>{fmt(item.qty)}</b></td><td data-label="ผู้จัด / ผู้ตรวจ"><b>{item.pickedByName}</b><small>{item.dispatchedByName} · {formatDateTime(item.dispatchedAt)}</small></td></tr>)}</tbody></table></div> : <Empty title="ยังไม่มี Traceability ขายออก" text="เมื่อผู้ตรวจยิง Tag ลูกค้า ระบบจะแสดง KIT Tag, Job, วันที่ผลิต และวันที่รับเข้าที่ใช้จริง" />}
      </Card>
    </>;
  }

  function renderPlan() {
    return <>
      <Card className="import-card" title={`สรุปแผนส่งงาน ${filterDate ? formatDate(filterDate) : "ทั้งหมด"}`} action={<button className="button primary" onClick={() => fileInput.current?.click()}>⇧ นำเข้าแผนส่งงาน Excel</button>}>
        <input ref={fileInput} type="file" accept=".xlsx,.xls" hidden onChange={parseExcel} />
        <div className="metrics four compact">
          <MetricCard tone="blue" icon="▤" label="แผนทั้งหมด" value={fmt(summary.items)} suffix="รายการ" />
          <MetricCard tone="green" icon="✓" label="ครบตามแผน" value={fmt(summary.completed)} suffix="รายการ" />
          <MetricCard tone="orange" icon="◷" label="คงเหลือ" value={fmt(summary.partial + summary.pending)} suffix="รายการ" />
          <MetricCard tone="red" icon="!" label="เกิน Due" value={fmt(summary.over)} suffix="รายการ" />
        </div>
        {(file || parsing) && <div className="import-preview"><div><span>XL</span><p><b>{file?.name}</b><small>{parsing ? "กำลังอ่านไฟล์…" : `${fmt(previewRows.length)} รายการ · ${fmt(previewRows.reduce((sum, row) => sum + row.reqQty, 0))} ชิ้น`}</small></p></div><button className="button primary" disabled={!previewRows.length || importing} onClick={importExcel}>{importing ? "กำลังนำเข้า…" : "ยืนยันนำเข้า"}</button></div>}
      </Card>
      <Card><Filters /></Card>
      <Card title="รายการแผนส่งงาน" action={<span className="result-count">แสดง {fmt(filtered.length)} รายการ</span>}><DueTable rows={filtered} /></Card>
      <div className="split-grid">
        <Card title="สรุปแผนส่งงานตาม FAC"><div className="fac-cards">{facStats.length ? facStats.map((item) => <div key={item.fact}><b>{item.fact}</b><strong>{fmt(item.items)} รายการ</strong><small><i className="green" /> ครบ {item.completed} <i className="orange" /> คงเหลือ {item.remaining}</small></div>) : <Empty />}</div></Card>
        <Card title="ประวัตินำเข้า Excel">{payload.imports.length ? <div className="mini-list">{payload.imports.map((item) => <div key={item.id}><span>XL</span><p><b>{item.fileName}</b><small>{fmt(item.rowCount)} รายการ · {fmt(item.totalQty)} ชิ้น · โดย {item.importedByName}</small></p><div className="import-history-actions"><time>{formatDateTime(item.createdAt)}</time><button className="tiny-button danger-outline" disabled={deletingImportId === item.id} onClick={() => void deleteImport(item)}>{deletingImportId === item.id ? "กำลังลบ…" : "ลบข้อมูล"}</button></div></div>)}</div> : <Empty />}</Card>
      </div>
    </>;
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
        <Card title="สรุปการส่งออกตามวัน">{dailyStats.length ? <div className="table-wrap mobile-table-wrap"><table className="mobile-card-table"><thead><tr><th>วันที่</th><th className="num">ทั้งหมด</th><th className="num">ครบ</th><th className="num">คงเหลือ</th><th className="num">ส่งแล้ว (ชิ้น)</th></tr></thead><tbody>{dailyStats.slice(0, 8).map((row) => <tr key={row.date}><td data-label="วันที่"><b>{formatDate(row.date)}</b></td><td data-label="ทั้งหมด" className="num">{row.items}</td><td data-label="ครบ" className="num sent">{row.completed}</td><td data-label="คงเหลือ" className="num warning">{row.partial + row.pending}</td><td data-label="ส่งแล้ว" className="num"><b>{fmt(row.qty)}</b></td></tr>)}</tbody></table></div> : <Empty />}</Card>
        <Card title="รายการที่ยังไม่ครบ (สูงสุด)"><DueTable rows={filtered.filter((due) => ["pending", "partial"].includes(stateOf(due))).sort((a, b) => (b.reqQty - b.scannedQty) - (a.reqQty - a.scannedQty))} limit={5} /></Card>
      </div>
    </>;
  }

  function renderHistory() {
    return <><Card><Filters /></Card><div className="metrics five"><MetricCard tone="blue" icon="⌗" label="สแกน QR Tag" value={fmt(payload.scans.length)} suffix="รายการล่าสุด" /><MetricCard tone="green" icon="✓" label="ตัดยอด" value={fmt(payload.scans.length)} suffix="รายการล่าสุด" /><MetricCard tone="orange" icon="▱" label="ส่งออก" value={fmt(payload.dues.filter((due) => due.scannedQty > 0).length)} suffix="รายการ" /><MetricCard tone="purple" icon="✎" label="นำเข้าไฟล์" value={fmt(payload.imports.length)} suffix="ครั้งล่าสุด" /><MetricCard tone="gray" icon="↪" label="เข้าสู่ระบบ" value="1" suffix="ผู้ใช้งาน" /></div><div className="history-grid"><Card title="ประวัติการทำรายการ">{payload.scans.length ? <div className="timeline">{payload.scans.map((scan) => <button className={selectedScan?.id === scan.id ? "active" : ""} key={scan.id} onClick={() => setSelectedScan(scan)}><span>✓</span><time>{formatDateTime(scan.createdAt)}</time><div><b>สแกน QR Tag และตัดยอด</b><p>{scan.fact} · {scan.materialCode} · {fmt(scan.qty)} {scan.unit}</p></div><em>สำเร็จ</em></button>)}</div> : <Empty />}</Card><Card title="รายละเอียดการทำรายการ" className="history-detail">{selectedScan ? <><div className="history-badge"><span>⌗</span><div><b>สแกน QR Tag</b><small>สำเร็จ</small></div></div><dl><div><dt>เวลา</dt><dd>{formatDateTime(selectedScan.createdAt)}</dd></div><div><dt>ผู้ทำรายการ</dt><dd>{selectedScan.scannedByName}</dd></div><div><dt>FAC</dt><dd>{selectedScan.fact}</dd></div><div><dt>หมายเลข Tag</dt><dd>{selectedScan.tagId}</dd></div><div><dt>Material</dt><dd>{selectedScan.materialCode}</dd></div><div><dt>แผน / ตัดยอด</dt><dd>{selectedDue ? `${fmt(selectedDue.reqQty)} / ${fmt(selectedScan.qty)} ชิ้น` : `${fmt(selectedScan.qty)} ชิ้น`}</dd></div><div><dt>Location</dt><dd>{selectedScan.location || "—"}</dd></div></dl></> : <Empty />}</Card></div></>;
  }

  function renderSettings() {
    const Toggle = ({ keyName, title, text: description }: { keyName: keyof typeof settings; title: string; text: string }) => <label className="setting-row"><div><b>{title}</b><small>{description}</small></div><input type="checkbox" checked={settings[keyName]} onChange={(e) => setSettings((current) => ({ ...current, [keyName]: e.target.checked }))} /><i /></label>;
    return <>
      <Card title="ข้อมูลระบบ"><div className="system-card"><div className="system-logo">KiT<small>DELIVERY DUE CONTROL</small></div><dl><div><dt>ชื่อระบบ</dt><dd>KIT Delivery Due Control</dd></div><div><dt>เวอร์ชัน</dt><dd>v2.8.14</dd></div><div><dt>เขตเวลา</dt><dd>Bangkok, Thailand</dd></div><div><dt>ผู้ดูแล</dt><dd>{user.displayName}</dd></div></dl><div className="system-stats"><p><span>▤</span><b>{fmt(payload.dues.length)}</b><small>Due ทั้งหมด</small></p><p><span>▣</span><b>{fmt(partImages.length)}</b><small>รูปชิ้นงาน</small></p></div></div></Card>
      <Card title="รูปชิ้นงานสำหรับหน้าสแกน" action={<button className="button secondary" onClick={() => void loadPartImages()}>↻ รีเฟรช</button>}>
        <form className="part-image-upload" onSubmit={uploadPartImage}>
          <label><span>Material / Part No. *</span><input list="part-material-codes" value={partImageCode} onChange={(e) => setPartImageCode(e.target.value.toUpperCase())} placeholder="เช่น ABC-1234" required /></label>
          <datalist id="part-material-codes">{[...new Set(payload.dues.map((due) => due.materialCode))].sort().map((code) => <option key={code} value={code} />)}</datalist>
          <label className="part-file"><span>ไฟล์รูป *</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPartImageFile(e.target.files?.[0] || null)} required /></label>
          <button className="button primary" disabled={partImageSaving || !partImageCode.trim() || !partImageFile}>{partImageSaving ? "กำลังอัปโหลด…" : "⇧ บันทึกรูปชิ้นงาน"}</button>
        </form>
        <p className="part-image-help">รองรับ JPG, PNG และ WebP ขนาดไม่เกิน 5 MB · หากอัปโหลด Material Code เดิม ระบบจะแทนที่รูปเก่า</p>

        <form className="part-image-upload bulk" onSubmit={uploadPartImagesBulk}>
          <label className="part-file bulk-file">
            <span>อัปโหลดหลายรูปพร้อมกัน — ตั้งชื่อไฟล์ให้ตรงกับ Part No.</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={bulkImageRunning}
              onChange={(e) => { setBulkImageFiles([...(e.target.files || [])]); setBulkImageFailed([]); }} />
          </label>
          <button className="button primary" disabled={bulkImageRunning || !bulkImageFiles.length}>
            {bulkImageRunning
              ? `กำลังอัปโหลด ${fmt(bulkImageProgress.done)}/${fmt(bulkImageProgress.total)}…`
              : `⇧ อัปโหลด ${bulkImageFiles.length ? fmt(bulkImageFiles.length) + " รูป" : "ทั้งหมด"}`}
          </button>
        </form>
        <p className="part-image-help">
          ตัวอย่าง ไฟล์ชื่อ <code>BK02J964G12-F.jpg</code> จะถูกบันทึกเป็นรูปของ Part <code>BK02J964G12-F</code> อัตโนมัติ
          · ระบบตัดเลขสำเนาแบบ <code>(1)</code> ท้ายชื่อไฟล์ให้เอง · อัปโหลดทีละไฟล์ตามลำดับ ปิดหน้าจอระหว่างอัปโหลดไม่ได้
        </p>
        {bulkImageFiles.length > 0 && !bulkImageRunning && <div className="bulk-preview">
          <b>จะบันทึกเป็น Part เหล่านี้</b>
          <ul>{bulkImageFiles.slice(0, 12).map((file) => <li key={file.name}><code>{materialCodeFromFileName(file.name)}</code><small>{file.name}</small></li>)}</ul>
          {bulkImageFiles.length > 12 && <small>และอีก {fmt(bulkImageFiles.length - 12)} ไฟล์</small>}
        </div>}
        {bulkImageFailed.length > 0 && <div className="bulk-preview failed">
          <b>ไฟล์ที่อัปโหลดไม่สำเร็จ</b>
          <ul>{bulkImageFailed.map((item) => <li key={item.name}><code>{item.name}</code><small>{item.reason}</small></li>)}</ul>
        </div>}
        {partImagesLoading ? <div className="inline-loading">กำลังโหลดรูปชิ้นงาน…</div> : partImages.length ? <div className="part-image-list">{partImages.map((item) => <article key={item.materialCode}><PartImage materialCode={item.materialCode} compact /><div><b>{item.materialCode}</b><p>{item.materialDescription || item.originalName}</p><small>แก้ไขโดย {item.updatedByName || "Admin"} · {formatDateTime(item.updatedAt)}</small></div><button className="tiny-button danger-outline" onClick={() => void deletePartImage(item.materialCode)}>ลบรูป</button></article>)}</div> : <Empty title="ยังไม่มีรูปชิ้นงาน" text="เลือก Material Code และอัปโหลดรูป รูปจะแสดงทันทีหลังสแกน Tag" />}
      </Card>
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

  const pageContent: Record<PageKey, () => ReactNode> = { dashboard: renderDashboard, stock: renderStock, tags: renderTags, plan: renderPlan, arrange: () => renderScan("arrange"), dispatch: () => renderScan("dispatch"), exports: renderExports, reports: renderReports, history: renderHistory, settings: renderSettings, users: renderUsers };
  const activeNav = NAV.find((item) => item.key === page)!;

  return <div className="control-shell">
    <aside className={`control-sidebar ${menuOpen ? "open" : ""}`}>
      <button className="sidebar-close" onClick={() => setMenuOpen(false)}>×</button>
      <div className="kit-logo"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <nav>{NAV.filter((item) => allowedPages.has(item.key)).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom">{allowedPages.has("settings") && <div className="help-box"><b>ต้องการความช่วยเหลือ?</b><button onClick={() => go("settings")}>◉ คู่มือและตั้งค่า</button></div>}<a className="mobile-logout" href={signOutPath} onClick={signOut}><span>↪</span><b>ออกจากระบบ</b></a><div className="mini-brand"><b>KiT</b><span>Delivery Due Control<br />© 2026 · v2.8.14</span></div></div>
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
