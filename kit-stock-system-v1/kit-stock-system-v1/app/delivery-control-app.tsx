"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type PageKey = "dashboard" | "plan" | "scan" | "exports" | "reports" | "history" | "settings" | "users";

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
};

type ImportRow = Omit<DueLine, "id" | "importId" | "status" | "scannedQty" | "tagCount"> & { sourceKey: string };
type DuePayload = { dues: DueLine[]; imports: DueImport[]; scans: DueScan[]; receipts: DueReceipt[]; error?: string };
type SystemUser = { id: number; employeeCode: string; displayName: string; email: string; role: string; active: boolean; createdAt?: string };
type PartImageMapping = { materialCode: string; originalName: string; contentType: string; updatedByName: string; updatedAt: string; materialDescription?: string };
type UserForm = { id?: number; employeeCode: string; displayName: string; email: string; role: "dispatcher" | "inspector"; pin: string; active: boolean };
const EMPTY_USER: UserForm = { employeeCode: "", displayName: "", email: "", role: "dispatcher", pin: "", active: true };

const NAV: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: "dashboard", label: "หน้าหลัก", icon: "⌂" },
  { key: "plan", label: "แผนส่งงาน (Due)", icon: "▤" },
  { key: "scan", label: "สแกนและตัดยอด", icon: "⌗" },
  { key: "exports", label: "รายการส่งออก", icon: "▱" },
  { key: "reports", label: "รายงาน", icon: "▥" },
  { key: "history", label: "ประวัติ", icon: "◷" },
  { key: "settings", label: "ตั้งค่า", icon: "⚙" },
  { key: "users", label: "ผู้ใช้งาน", icon: "♙" },
];

const PAGE_SUBTITLE: Record<PageKey, string> = {
  dashboard: "ภาพรวมการส่งงานและสถานะล่าสุด",
  plan: "ตรวจสอบแผนส่งงานจากไฟล์ Excel",
  scan: "สแกน Tag ตรวจสอบ Due และยืนยันตัดยอดในหน้าเดียว",
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

function stateOf(due: DueLine) {
  const scanned = Number(due.scannedQty);
  if (scanned > due.reqQty) return "over";
  if (scanned === due.reqQty) return "completed";
  if (scanned > 0) return "partial";
  return "pending";
}

function stateLabel(due: DueLine) {
  return { over: "เกิน Due", completed: "ครบตามแผน", partial: "คงเหลือ", pending: "ยังไม่ส่ง" }[stateOf(due)];
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

export default function DeliveryControlApp({ user, signOutPath }: { user: { id: number; employeeCode: string; displayName: string; email: string; role: string }; signOutPath: string }) {
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
  const [adminScanMode, setAdminScanMode] = useState<"receive" | "dispatch">("receive");
  const [filterDate, setFilterDate] = useState("");
  const [filterFact, setFilterFact] = useState("ALL");
  const [filterTime, setFilterTime] = useState("ALL");
  const [query, setQuery] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDue(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (user.role !== "admin") return;
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
    if (user.role !== "admin") return;
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
    setUserForm({ id: target.id, employeeCode: target.employeeCode, displayName: target.displayName, email: target.email, role: target.role as "dispatcher" | "inspector", pin: "", active: target.active });
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
              setRawTag(value);
              setTagPreview(null);
              setCameraOpen(false);
              void processTag(value);
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
  }, [cameraOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
        body: JSON.stringify({ rawPayload: scannedValue, operation: user.role === "admin" ? adminScanMode : undefined }),
      });
      const result = await response.json() as TagPreview & { action?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึก Tag ไม่สำเร็จ");
      setTagPreview(result);
      setRawTag("");
      setNotice({ type: "success", text: result.action === "received" ? `รับเข้า Tag ${result.tag.tagId} สำเร็จ โดย ${user.displayName}` : `ส่งออกและตัด Due ${result.due.materialCode} สำเร็จ เหลือ ${fmt(result.due.remainingAfter)} ชิ้น` });
      await loadDue();
      window.setTimeout(() => tagInput.current?.focus(), 100);
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "บันทึก Tag ไม่สำเร็จ" });
    } finally {
      setCheckingTag(false);
    }
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

  function go(next: PageKey) {
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

  function saveSettings() {
    window.localStorage.setItem("kit-due-settings", JSON.stringify(settings));
    setNotice({ type: "success", text: "บันทึกการตั้งค่าบนอุปกรณ์นี้แล้ว" });
  }

  const Filters = () => (
    <div className="filter-grid">
      <label><span>วันที่ส่งงาน</span><select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}><option value="">ทุกวันที่</option>{dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
      <label><span>โรงงาน (FAC)</span><select value={filterFact} onChange={(e) => setFilterFact(e.target.value)}><option value="ALL">ทั้งหมด</option>{facts.map((fact) => <option key={fact}>{fact}</option>)}</select></label>
      <label><span>เวลา</span><select value={filterTime} onChange={(e) => setFilterTime(e.target.value)}><option value="ALL">ทั้งหมด</option>{times.map((time) => <option key={time}>{time}</option>)}</select></label>
      <label className="search-field"><span>ค้นหา</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Material / Part No. / DO" /></label>
      <button className="button secondary filter-reset" onClick={() => { setFilterFact("ALL"); setFilterTime("ALL"); setQuery(""); }}>↻ ล้างค่า</button>
    </div>
  );

  const DueTable = ({ rows, limit }: { rows: DueLine[]; limit?: number }) => {
    const shown = typeof limit === "number" ? rows.slice(0, limit) : rows;
    if (!shown.length) return <Empty text="ไม่พบรายการตามตัวกรองที่เลือก" />;
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>เวลา</th><th>FAC / Line</th><th>Material / Part No.</th><th>รายละเอียด</th><th className="num">แผน</th><th className="num">ส่งแล้ว</th><th className="num">คงเหลือ</th><th>สถานะ</th><th /></tr></thead>
          <tbody>{shown.map((due) => <tr key={due.id}>
            <td><b>{due.deliveryTime}</b><small>{formatDate(due.deliveryDate)}</small></td>
            <td><b>{due.fact}</b><small>{[due.line, due.shop].filter(Boolean).join(" / ") || "—"}</small></td>
            <td><b>{due.materialCode}</b><small>{due.doNo} · Seq {due.seq}</small></td>
            <td>{due.materialDescription || "—"}</td>
            <td className="num"><b>{fmt(due.reqQty)}</b></td>
            <td className="num sent"><b>{fmt(due.scannedQty)}</b></td>
            <td className={`num ${stateOf(due) === "over" ? "danger" : "warning"}`}><b>{fmt(Math.max(due.reqQty - due.scannedQty, 0))}</b></td>
            <td><span className={`status ${stateOf(due)}`}>{stateLabel(due)}</span></td>
            <td><button className="tiny-button" onClick={() => go("scan")}>{Number(due.scannedQty) < due.reqQty ? "ตัดยอด" : "ดู"}</button></td>
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
      <Card title="เมนูด่วน" className="quick-panel"><div className="quick-actions"><button onClick={() => go("plan")}><span>⇧</span>นำเข้าแผนงาน</button><button onClick={() => go("scan")}><span>⌗</span>สแกนและตัดยอด</button><button onClick={() => go("plan")}><span>▤</span>ดูแผนทั้งหมด</button><button onClick={() => go("reports")}><span>▥</span>รายงานสรุปผล</button></div></Card>
      <Card title="Due ที่ยังขาด (รายการล่าสุด)" action={<button className="text-button" onClick={() => go("plan")}>ดูทั้งหมด →</button>}><DueTable rows={filtered.filter((due) => ["partial", "pending"].includes(stateOf(due)))} limit={5} /></Card>
      <div className="summary-strip"><div><span>▣</span><small>วันที่มีแผนส่งงาน</small><b>{dates.length}</b></div><div><span>▥</span><small>FAC ทั้งหมด</small><b>{facts.length}</b></div><div><span>◈</span><small>รายการทั้งหมด</small><b>{fmt(payload.dues.length)}</b></div><div><span>□</span><small>ชิ้นงานตามแผน</small><b>{fmt(payload.dues.reduce((sum, due) => sum + due.reqQty, 0))}</b></div></div>
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
        <Card title="ประวัตินำเข้า Excel">{payload.imports.length ? <div className="mini-list">{payload.imports.slice(0, 4).map((item) => <div key={item.id}><span>XL</span><p><b>{item.fileName}</b><small>{fmt(item.rowCount)} รายการ · โดย {item.importedByName}</small></p><time>{formatDateTime(item.createdAt)}</time></div>)}</div> : <Empty />}</Card>
      </div>
    </>;
  }

  function renderScan() {
    const progress = tagPreview ? Math.min(100, Math.round((tagPreview.due.projectedQty / tagPreview.due.reqQty) * 100)) : 0;
    const scanMode = user.role === "admin" ? adminScanMode : user.role === "dispatcher" ? "receive" : "dispatch";
    return <>
      {user.role === "admin" && <Card title="โหมดทดสอบของ Admin"><div className="scan-mode"><button className={adminScanMode === "receive" ? "active" : ""} onClick={() => setAdminScanMode("receive")}>⇥ ผู้จัดงาน — รับเข้า</button><button className={adminScanMode === "dispatch" ? "active" : ""} onClick={() => setAdminScanMode("dispatch")}>⌗ ผู้ตรวจงาน — ส่งออก/ตัด Due</button></div></Card>}
      <div className="scan-layout">
        <section className="scanner-card">
          <div className="scanner-title"><div><h3>{scanMode === "receive" ? "สแกนรับงานเข้าระบบ" : "สแกนส่งออกและตัด Due"}</h3><p>สแกนแล้วระบบบันทึกและแสดงข้อมูลทันที</p></div><button className="camera-button" onClick={() => setCameraOpen(true)}>▣ เปิดกล้อง</button></div>
          <div className="scanner-visual"><div className="scan-frame"><span className="qr-symbol">▦</span><b>{checkingTag ? "กำลังบันทึก…" : "พร้อมรับ QR Tag"}</b><small>วาง QR ให้อยู่ในกรอบ หรือยิง Tag ได้ทันที</small><i /></div></div>
          <form className="manual-scan" onSubmit={processTag}><label><span>รหัส Tag / ข้อมูลจาก QR</span><input ref={tagInput} value={rawTag} onChange={(e) => { setRawTag(e.target.value); setTagPreview(null); }} placeholder="ยิง Tag แล้วกด Enter หรือวางข้อมูลที่นี่" autoComplete="off" /></label><button className="button primary" disabled={!rawTag.trim() || checkingTag}>{checkingTag ? "กำลังบันทึก…" : scanMode === "receive" ? "บันทึกรับเข้า" : "บันทึกส่งออก"}</button></form>
        </section>
        <section className="tag-result">
          <header><div><p>ข้อมูล Tag และ Due</p><h3>{tagPreview ? tagPreview.due.materialCode : "รอการสแกน"}</h3></div><span className={`status ${tagPreview ? "completed" : "pending"}`}>{tagPreview ? "ข้อมูลตรงกัน" : "ยังไม่มี Tag"}</span></header>
          {tagPreview ? <>
            <div className="tag-main"><PartImage materialCode={tagPreview.due.materialCode} /><div><small>PART / MATERIAL</small><b>{tagPreview.due.materialCode}</b><p>{tagPreview.due.materialDescription || "ไม่ระบุรายละเอียด"}</p></div></div>
            <div className="detail-grid"><div><small>FAC / Line</small><b>{tagPreview.due.fact} / {tagPreview.due.line || "—"}</b></div><div><small>DO / Seq</small><b>{tagPreview.due.doNo} / {tagPreview.due.seq}</b></div><div><small>แผนส่งวัน / เวลา</small><b>{formatDate(tagPreview.due.deliveryDate)} {tagPreview.due.deliveryTime}</b></div><div><small>Tag ID</small><b>{tagPreview.tag.tagId}</b></div><div><small>Location</small><b>{tagPreview.tag.location || "—"}</b></div><div><small>จำนวนใน Tag</small><b>{fmt(tagPreview.tag.qty)} {tagPreview.tag.unit}</b></div></div>
            <div className="cut-summary"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><b>{progress}%</b>{scanMode === "receive" ? "ยอดส่งออกปัจจุบัน" : "หลังตัดยอด"}</span></div><div className="cut-numbers"><p><span>แผนทั้งหมด</span><b>{fmt(tagPreview.due.reqQty)}</b></p><p><span>ส่งออกแล้ว</span><b>{fmt(tagPreview.due.scannedQty)}</b></p><p className="current"><span>จำนวน Tag</span><b>{fmt(tagPreview.tag.qty)}</b></p><p><span>คงเหลือ</span><b>{fmt(tagPreview.due.remainingAfter)}</b></p></div></div>
            <div className="scan-saved">✓ {scanMode === "receive" ? "บันทึกรับเข้างานเรียบร้อย รอผู้ตรวจสแกนส่งออก" : "บันทึกส่งออกและตัดยอด Due เรียบร้อย"}</div>
          </> : <Empty title={scanMode === "receive" ? "รอผู้จัดงานสแกนรับเข้า" : "รอผู้ตรวจงานสแกนส่งออก"} text="ข้อมูล Tag และ Due จะแสดงทันทีหลังสแกนสำเร็จ ไม่ต้องกดตรวจสอบ Tag" />}
        </section>
      </div>
      <Card title={scanMode === "receive" ? "รายการรับเข้าล่าสุด" : "รายการส่งออกและตัดยอดล่าสุด"} action={<button className="text-button" onClick={() => go("history")}>ดูประวัติทั้งหมด →</button>}>
        {scanMode === "receive" ? (payload.receipts?.length ? <div className="table-wrap"><table><thead><tr><th>วัน / เวลา</th><th>FAC</th><th>Part No.</th><th>Tag ID</th><th className="num">จำนวน</th><th>ผู้จัดงาน</th></tr></thead><tbody>{payload.receipts.slice(0, 8).map((item) => <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td><b>{item.fact}</b></td><td><b>{item.materialCode}</b></td><td>{item.tagId}</td><td className="num sent"><b>{fmt(item.qty)} {item.unit}</b></td><td>{item.receivedByName}</td></tr>)}</tbody></table></div> : <Empty text="เมื่อผู้จัดงานสแกนรับเข้า รายการจะแสดงที่นี่" />) : (payload.scans.length ? <div className="table-wrap"><table><thead><tr><th>วัน / เวลา</th><th>FAC</th><th>Part No.</th><th>Tag ID</th><th className="num">จำนวนที่ตัด</th><th>ผู้ตรวจ</th></tr></thead><tbody>{payload.scans.slice(0, 8).map((scan) => <tr key={scan.id}><td>{formatDateTime(scan.createdAt)}</td><td><b>{scan.fact}</b></td><td><b>{scan.materialCode}</b></td><td>{scan.tagId}</td><td className="num sent"><b>{fmt(scan.qty)} {scan.unit}</b></td><td>{scan.scannedByName}</td></tr>)}</tbody></table></div> : <Empty text="เมื่อผู้ตรวจสแกนส่งออก รายการจะแสดงที่นี่" />)}
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
      <div className="metrics five"><MetricCard tone="blue" icon="◈" label="แผนทั้งหมด" value={fmt(summary.items)} suffix="รายการ" /><MetricCard tone="green" icon="✓" label="ครบตามแผน" value={fmt(summary.completed)} suffix="รายการ" /><MetricCard tone="orange" icon="◷" label="คงเหลือ" value={fmt(summary.partial + summary.pending)} suffix="รายการ" /><MetricCard tone="red" icon="!" label="เกิน Due" value={fmt(summary.over)} suffix="รายการ" /><MetricCard tone="purple" icon="□" label="ส่งแล้วรวม" value={fmt(summary.sent)} suffix="ชิ้น" /></div>
      <div className="report-grid">
        <Card title="สัดส่วนสถานะการส่งงาน"><div className="donut-layout"><div className="donut" style={{ "--complete": `${completePct * 3.6}deg` } as React.CSSProperties}><span><b>{summary.items}</b>รายการ</span></div><div className="legend"><p><i className="green" />ครบตามแผน <b>{summary.completed}</b></p><p><i className="orange" />คงเหลือ <b>{summary.partial + summary.pending}</b></p><p><i className="red" />เกิน Due <b>{summary.over}</b></p></div></div></Card>
        <Card title="ส่งออกตาม FAC / Line"><div className="bar-chart">{facStats.length ? facStats.slice(0, 7).map((item) => <div key={item.fact}><b>{item.fact}</b><span><i style={{ width: `${Math.max(4, item.items / maxFac * 100)}%` }} /></span><strong>{item.items}</strong></div>) : <Empty />}</div></Card>
      </div>
      <div className="split-grid">
        <Card title="สรุปการส่งออกตามวัน">{dailyStats.length ? <div className="table-wrap"><table><thead><tr><th>วันที่</th><th className="num">ทั้งหมด</th><th className="num">ครบ</th><th className="num">คงเหลือ</th><th className="num">ส่งแล้ว (ชิ้น)</th></tr></thead><tbody>{dailyStats.slice(0, 8).map((row) => <tr key={row.date}><td><b>{formatDate(row.date)}</b></td><td className="num">{row.items}</td><td className="num sent">{row.completed}</td><td className="num warning">{row.partial + row.pending}</td><td className="num"><b>{fmt(row.qty)}</b></td></tr>)}</tbody></table></div> : <Empty />}</Card>
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
      <Card title="ข้อมูลระบบ"><div className="system-card"><div className="system-logo">KiT<small>DELIVERY DUE CONTROL</small></div><dl><div><dt>ชื่อระบบ</dt><dd>KIT Delivery Due Control</dd></div><div><dt>เวอร์ชัน</dt><dd>v2.3.0</dd></div><div><dt>เขตเวลา</dt><dd>Bangkok, Thailand</dd></div><div><dt>ผู้ดูแล</dt><dd>{user.displayName}</dd></div></dl><div className="system-stats"><p><span>▤</span><b>{fmt(payload.dues.length)}</b><small>Due ทั้งหมด</small></p><p><span>▣</span><b>{fmt(partImages.length)}</b><small>รูปชิ้นงาน</small></p></div></div></Card>
      <Card title="รูปชิ้นงานสำหรับหน้าสแกน" action={<button className="button secondary" onClick={() => void loadPartImages()}>↻ รีเฟรช</button>}>
        <form className="part-image-upload" onSubmit={uploadPartImage}>
          <label><span>Material / Part No. *</span><input list="part-material-codes" value={partImageCode} onChange={(e) => setPartImageCode(e.target.value.toUpperCase())} placeholder="เช่น ABC-1234" required /></label>
          <datalist id="part-material-codes">{[...new Set(payload.dues.map((due) => due.materialCode))].sort().map((code) => <option key={code} value={code} />)}</datalist>
          <label className="part-file"><span>ไฟล์รูป *</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPartImageFile(e.target.files?.[0] || null)} required /></label>
          <button className="button primary" disabled={partImageSaving || !partImageCode.trim() || !partImageFile}>{partImageSaving ? "กำลังอัปโหลด…" : "⇧ บันทึกรูปชิ้นงาน"}</button>
        </form>
        <p className="part-image-help">รองรับ JPG, PNG และ WebP ขนาดไม่เกิน 5 MB · หากอัปโหลด Material Code เดิม ระบบจะแทนที่รูปเก่า</p>
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
    return <><Card title="ภาพรวมผู้ใช้งาน" action={<button className="button primary" onClick={() => { setUserForm(EMPTY_USER); setUserEditorOpen(true); }}>＋ เพิ่มผู้ใช้งาน</button>}><div className="metrics four compact"><MetricCard tone="blue" icon="♙" label="ผู้ใช้งานทั้งหมด" value={fmt(systemUsers.length)} suffix="คน" /><MetricCard tone="green" icon="✓" label="ใช้งานปกติ" value={fmt(active)} suffix="คน" /><MetricCard tone="orange" icon="⇥" label="ผู้จัดงาน" value={fmt(dispatchers)} suffix="คน" /><MetricCard tone="purple" icon="⌗" label="ผู้ตรวจงาน" value={fmt(inspectors)} suffix="คน" /></div></Card><Card title="ผู้ใช้งานระบบ" action={<button className="button secondary" onClick={() => void loadUsers()}>↻ รีเฟรช</button>}>{usersLoading ? <div className="loading-state"><span /><p>กำลังโหลดผู้ใช้งาน…</p></div> : <div className="table-wrap"><table><thead><tr><th>รหัส / ผู้ใช้งาน</th><th>อีเมล</th><th>บทบาท</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{systemUsers.map((item) => <tr key={item.id}><td><div className="user-cell"><span>{item.displayName.slice(0, 1).toUpperCase()}</span><div><b>{item.displayName}</b><small>{item.employeeCode}</small></div></div></td><td>{item.email || "—"}</td><td><span className="role-pill">{item.role === "admin" ? "ผู้ดูแลระบบ" : item.role === "dispatcher" ? "ผู้จัดงาน (รับเข้า)" : "ผู้ตรวจงาน (ส่งออก)"}</span></td><td><span className={`status ${item.active ? "completed" : "over"}`}>{item.active ? "ใช้งานปกติ" : "ระงับ"}</span></td><td>{item.role === "admin" ? <span className="muted">บัญชีหลัก</span> : <div className="user-actions"><button className="tiny-button" onClick={() => editUser(item)}>แก้ไข / PIN</button><button className={`tiny-button ${item.active ? "danger-outline" : ""}`} onClick={() => void toggleUser(item)}>{item.active ? "ระงับ" : "เปิดใช้"}</button></div>}</td></tr>)}</tbody></table></div>}</Card><div className="split-grid"><Card title="สิทธิ์ตามบทบาท"><div className="role-list"><p><span>⇥</span><b>ผู้จัดงาน</b><em>สแกนรับงานเข้าระบบ</em></p><p><span>⌗</span><b>ผู้ตรวจงาน</b><em>สแกนส่งออกและตัด Due</em></p></div></Card><Card title="ความปลอดภัย"><div className="permission-note"><span>◆</span><div><b>PIN 6 หลักเก็บแบบ Hash</b><p>Admin ตั้งหรือรีเซ็ต PIN ได้ แต่ระบบไม่แสดง PIN เดิม และการระงับบัญชีจะยกเลิก Session ของผู้ใช้งานทันที</p></div></div></Card></div></>;
  }

  const pageContent: Record<PageKey, () => ReactNode> = { dashboard: renderDashboard, plan: renderPlan, scan: renderScan, exports: renderExports, reports: renderReports, history: renderHistory, settings: renderSettings, users: renderUsers };
  const activeNav = NAV.find((item) => item.key === page)!;

  return <div className="control-shell">
    <aside className={`control-sidebar ${menuOpen ? "open" : ""}`}>
      <button className="sidebar-close" onClick={() => setMenuOpen(false)}>×</button>
      <div className="kit-logo"><b>KiT</b><span>DELIVERY DUE CONTROL</span></div>
      <nav>{NAV.filter((item) => user.role === "admin" || ["dashboard", "scan", "history"].includes(item.key)).map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-box"><b>ต้องการความช่วยเหลือ?</b><button onClick={() => go("settings")}>◉ คู่มือและตั้งค่า</button></div><div className="mini-brand"><b>KiT</b><span>Delivery Due Control<br />© 2026 · v2.3.0</span></div></div>
    </aside>
    {menuOpen && <button className="menu-backdrop" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} />}
    <main className="control-main">
      <header className="control-topbar"><button className="menu-button" onClick={() => setMenuOpen(true)}>☰</button><div><h1>{activeNav.label}</h1><p>หน้าหลัก <span>›</span> {PAGE_SUBTITLE[page]}</p></div><div className="top-user"><button className="notification">♧<i>{notice ? "1" : "0"}</i></button><span className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><b>{user.displayName}</b><small>{user.role === "admin" ? "ผู้ดูแลระบบ" : user.role === "dispatcher" ? "ผู้จัดงาน" : "ผู้ตรวจงาน"}</small></div><a href={signOutPath}>ออกจากระบบ</a></div></header>
      <div className="control-content">
        {notice && <div className={`toast ${notice.type}`}><span>{notice.type === "success" ? "✓" : "!"}</span><p>{notice.text}</p><button onClick={() => setNotice(null)}>×</button></div>}
        {error && <div className="toast error"><span>!</span><p>{error}</p><button onClick={() => void loadDue()}>ลองใหม่</button></div>}
        {loading ? <div className="loading-state"><span /><p>กำลังโหลดข้อมูล Due…</p></div> : pageContent[page]()}
      </div>
    </main>
    {cameraOpen && <div className="modal-backdrop"><div className="camera-modal"><header><h3>สแกน QR Tag ด้วยกล้อง</h3><button onClick={() => setCameraOpen(false)}>×</button></header><div className="camera-view"><video ref={videoRef} playsInline muted /><div className="camera-frame" /></div>{cameraError && <p className="camera-error">{cameraError}</p>}<button className="button secondary full" onClick={() => setCameraOpen(false)}>ปิดกล้อง</button></div></div>}
    {userEditorOpen && <div className="modal-backdrop"><form className="user-modal" onSubmit={saveUser}><header><div><h3>{userForm.id ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}</h3><p>กำหนดผู้จัดงานหรือผู้ตรวจงานได้หลายคน</p></div><button type="button" onClick={() => setUserEditorOpen(false)}>×</button></header><div className="user-form-grid"><label><span>รหัสพนักงาน *</span><input value={userForm.employeeCode} onChange={(e) => setUserForm((current) => ({ ...current, employeeCode: e.target.value.toUpperCase() }))} placeholder="เช่น DISP001" required /></label><label><span>ชื่อผู้ใช้งาน *</span><input value={userForm.displayName} onChange={(e) => setUserForm((current) => ({ ...current, displayName: e.target.value }))} placeholder="ชื่อ-นามสกุล" required /></label><label><span>บทบาท *</span><select value={userForm.role} onChange={(e) => setUserForm((current) => ({ ...current, role: e.target.value as UserForm["role"] }))}><option value="dispatcher">ผู้จัดงาน — สแกนรับเข้า</option><option value="inspector">ผู้ตรวจงาน — สแกนส่งออก/ตัด Due</option></select></label><label><span>{userForm.id ? "ตั้ง PIN ใหม่ (เว้นว่างหากไม่เปลี่ยน)" : "PIN 6 หลัก *"}</span><input type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={userForm.pin} onChange={(e) => setUserForm((current) => ({ ...current, pin: e.target.value.replace(/\D/g, "") }))} required={!userForm.id} placeholder="••••••" /></label><label className="wide"><span>อีเมล (ไม่บังคับ)</span><input type="email" value={userForm.email} onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))} /></label></div><footer><button type="button" className="button secondary" onClick={() => setUserEditorOpen(false)}>ยกเลิก</button><button className="button primary" disabled={userSaving}>{userSaving ? "กำลังบันทึก…" : "บันทึกผู้ใช้งาน"}</button></footer></form></div>}
  </div>;
}
