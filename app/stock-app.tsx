"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

type Part = {
  id: number;
  partNo: string;
  partName: string;
  standardQty: number;
  containerType: string;
  customer: string;
  imageUrl: string;
  active: boolean;
};

type WorkOrder = {
  id: number;
  orderNo: string;
  lotNo: string;
  targetQty: number;
  status: string;
  partId: number;
  partNo: string;
  partName: string;
  standardQty: number;
  containerType: string;
  customer: string;
  deliveryDate: string;
  deliveryTime: string;
  senderName: string;
  packingStandard: number;
  packingCount: number;
  fullPackingQty: number;
  partialQty: number;
  totalPackingQty: number;
  imageUrl: string;
};

type Scan = {
  id: number;
  workOrderId: number;
  tagId: string;
  boxType: "full" | "partial";
  actualQty: number;
  inspectorName: string;
  createdAt: string;
  photoUrl: string;
  orderNo: string;
  partNo: string;
};

type Receipt = {
  id: number;
  workOrderId: number;
  orderNo: string;
  receiverName: string;
  receiverEmail: string;
  note: string;
  receivedAt: string;
};

type Bootstrap = { parts: Part[]; orders: WorkOrder[]; scans: Scan[]; receipts: Receipt[] };
type Tab = "overview" | "scan" | "receive" | "history" | "parts";

const tabLabels: Record<Tab, string> = {
  overview: "หน้าหลัก",
  scan: "ตรวจสอบบ๊อคงาน",
  receive: "รับงานเข้าคลัง",
  history: "ประวัติการตรวจ",
  parts: "ข้อมูล Part Master",
};

const navItems: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "หน้าหลัก", icon: "⌂" },
  { id: "parts", label: "Stock", icon: "▦" },
  { id: "scan", label: "พิมพ์ Tag", icon: "▤" },
  { id: "scan", label: "ตรวจและตัดยอด", icon: "⌁" },
  { id: "receive", label: "รับเข้า Stock", icon: "✓" },
  { id: "history", label: "ประวัติ", icon: "◷" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}

function statusLabel(status: string) {
  if (status === "completed") return "ครบแล้ว";
  if (status === "over") return "จำนวนเกิน";
  return "กำลังตรวจ";
}

function readPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านรูปภาพได้"));
    reader.readAsDataURL(file);
  });
}

function ProductArtwork({ small = false, imageUrl = "" }: { small?: boolean; imageUrl?: string }) {
  return (
    <div className={`product-art ${small ? "product-art-small" : ""}`} aria-label="ภาพตัวอย่างชิ้นงาน">
      {imageUrl ? <img className="product-real-image" src={imageUrl} alt="รูปชิ้นงาน" /> : <>
        <div className="part-shadow" />
        <div className="part-plate part-plate-a" />
        <div className="part-plate part-plate-b" />
        <div className="part-hole part-hole-a" />
        <div className="part-hole part-hole-b" />
      </>}
    </div>
  );
}

type BoxTag = {
  index: number;
  tagId: string;
  qty: number;
  boxType: "full" | "partial";
};

function PrintableTag({ order, tag }: { order: WorkOrder; tag: BoxTag }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    void QRCode.toDataURL(tag.tagId, { width: 220, margin: 1, errorCorrectionLevel: "M" }).then(setQrDataUrl);
    if (barcodeRef.current) {
      JsBarcode(barcodeRef.current, tag.tagId, {
        format: "CODE128",
        displayValue: false,
        height: 32,
        margin: 0,
        width: 1.15,
      });
    }
  }, [tag.tagId]);

  return (
    <article className={`a4-tag ${tag.boxType}`}>
      <header><div><span>DELIVERY BOX TAG / ใบติดบ๊อคงาน</span><strong>{tag.boxType === "full" ? "FULL / บ๊อคเต็ม" : "PARTIAL / บ๊อคเศษ"}</strong></div><b>{String(tag.index).padStart(2, "0")}/{String(order.totalPackingQty).padStart(2, "0")}</b></header>
      <div className="a4-tag-main">
        <div className="a4-tag-product">
          {order.imageUrl ? <img src={order.imageUrl} alt={order.partNo} /> : <div className="a4-no-image">NO IMAGE</div>}
          <div><span>Part No.</span><strong>{order.partNo}</strong><span>Part Name</span><b>{order.partName}</b></div>
        </div>
        <div className="a4-tag-qr">{qrDataUrl && <img src={qrDataUrl} alt={`QR ${tag.tagId}`} />}</div>
      </div>
      <div className="a4-tag-grid">
        <div><span>Customer</span><strong>{order.customer}</strong></div>
        <div><span>Quantity</span><strong>{formatNumber(tag.qty)} PCS</strong></div>
        <div><span>Lot No.</span><strong>{order.lotNo}</strong></div>
        <div><span>Delivery</span><strong>{order.deliveryDate} {order.deliveryTime}</strong></div>
        <div><span>Work Order</span><strong>{order.orderNo}</strong></div>
        <div><span>Box No.</span><strong>BOX-{String(tag.index).padStart(4, "0")}</strong></div>
      </div>
      <div className="a4-tag-barcode"><svg ref={barcodeRef} /><small>{tag.tagId}</small></div>
    </article>
  );
}

export default function StockApp({
  user,
  signOutPath,
}: {
  user: { displayName: string; email: string; role: string };
  signOutPath: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Bootstrap>({ parts: [], orders: [], scans: [], receipts: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedOrderNo, setSelectedOrderNo] = useState("WO-260714-018");
  const [orderQuery, setOrderQuery] = useState("WO-260714-018");
  const [tagId, setTagId] = useState("");
  const [boxType, setBoxType] = useState<"full" | "partial">("full");
  const [actualQty, setActualQty] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [partForm, setPartForm] = useState({ partNo: "", partName: "", customer: "", standardQty: "", containerType: "บ๊อค" });
  const [partImage, setPartImage] = useState<File | null>(null);
  const [partImagePreview, setPartImagePreview] = useState("");
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ orderNo: "", partId: "", lotNo: "", targetQty: "", customer: "", deliveryDate: "", deliveryTime: "", senderName: user.displayName });
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [receiveNotice, setReceiveNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tagPrintOpen, setTagPrintOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const payload = await response.json() as Bootstrap & { error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(payload);
      if (!payload.orders.some((order) => order.orderNo === selectedOrderNo) && payload.orders[0]) {
        setSelectedOrderNo(payload.orders[0].orderNo);
        setOrderQuery(payload.orders[0].orderNo);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
    // load once when the app mounts; later refreshes call loadData explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const activeOrder = useMemo(
    () => data.orders.find((order) => order.orderNo === selectedOrderNo) ?? data.orders[0],
    [data.orders, selectedOrderNo],
  );

  const activeScans = useMemo(
    () => activeOrder ? data.scans.filter((scan) => scan.workOrderId === activeOrder.id) : [],
    [data.scans, activeOrder],
  );

  const summary = useMemo(() => {
    const total = activeScans.reduce((sum, scan) => sum + scan.actualQty, 0);
    const full = activeScans.filter((scan) => scan.boxType === "full").length;
    const partial = activeScans.filter((scan) => scan.boxType === "partial").length;
    const target = activeOrder?.targetQty ?? 0;
    return {
      total,
      full,
      partial,
      remaining: Math.max(target - total, 0),
      over: Math.max(total - target, 0),
      percent: target ? Math.min((total / target) * 100, 100) : 0,
    };
  }, [activeScans, activeOrder]);

  const activeReceipt = useMemo(
    () => activeOrder ? data.receipts.find((receipt) => receipt.workOrderId === activeOrder.id) : undefined,
    [activeOrder, data.receipts],
  );

  const printableTags = useMemo<BoxTag[]>(() => {
    if (!activeOrder) return [];
    return Array.from({ length: activeOrder.totalPackingQty }, (_, offset) => {
      const index = offset + 1;
      const isPartial = activeOrder.partialQty > 0 && index === activeOrder.totalPackingQty;
      return {
        index,
        tagId: `${activeOrder.partNo}|${activeOrder.lotNo}|BOX-${String(index).padStart(4, "0")}`,
        qty: isPartial ? activeOrder.partialQty : activeOrder.packingStandard,
        boxType: isPartial ? "partial" : "full",
      };
    });
  }, [activeOrder]);

  function openOrder(event?: FormEvent) {
    event?.preventDefault();
    const normalized = orderQuery.trim().toUpperCase();
    const found = data.orders.find((order) => order.orderNo === normalized);
    if (!found) {
      setNotice({ type: "error", text: "ไม่พบใบงาน กรุณาตรวจสอบหมายเลข Work Order" });
      return;
    }
    setSelectedOrderNo(found.orderNo);
    setOrderQuery(found.orderNo);
    setTagId("");
    setActualQty("");
    setPhoto(null);
    setPhotoPreview("");
    setNotice(null);
    setTab("scan");
    setTimeout(() => tagInputRef.current?.focus(), 150);
  }

  function openReceiveOrder(event?: FormEvent) {
    event?.preventDefault();
    const normalized = orderQuery.trim().toUpperCase();
    const found = data.orders.find((order) => order.orderNo === normalized);
    if (!found) {
      setReceiveNotice({ type: "error", text: "ไม่พบใบงาน กรุณาตรวจสอบ Work Order" });
      return;
    }
    setSelectedOrderNo(found.orderNo);
    setOrderQuery(found.orderNo);
    setReceiveNotice(null);
    setTab("receive");
  }

  function chooseOrder(order: WorkOrder) {
    setSelectedOrderNo(order.orderNo);
    setOrderQuery(order.orderNo);
    setTab("scan");
    setNotice(null);
    setTimeout(() => tagInputRef.current?.focus(), 150);
  }

  function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  function openNewPart() {
    setEditingPart(null);
    setPartForm({ partNo: "", partName: "", customer: "KISHIMOTO INDUSTRY", standardQty: "", containerType: "บ๊อค" });
    setPartImage(null);
    setPartImagePreview("");
    setModalError("");
    setPartModalOpen(true);
  }

  function openEditPart(part: Part) {
    setEditingPart(part);
    setPartForm({ partNo: part.partNo, partName: part.partName, customer: part.customer, standardQty: String(part.standardQty), containerType: part.containerType });
    setPartImage(null);
    setPartImagePreview(part.imageUrl);
    setModalError("");
    setPartModalOpen(true);
  }

  function onPartImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPartImage(file);
    setPartImagePreview(file ? URL.createObjectURL(file) : editingPart?.imageUrl || "");
  }

  async function savePart(event: FormEvent) {
    event.preventDefault();
    setModalSaving(true);
    setModalError("");
    try {
      if (partImage && partImage.size > 6 * 1024 * 1024) throw new Error("รูปสินค้าต้องมีขนาดไม่เกิน 6 MB");
      const imageDataUrl = partImage ? await readPhoto(partImage) : "";
      const response = await fetch("/api/parts", {
        method: editingPart ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingPart?.id, ...partForm, standardQty: Number(partForm.standardQty), imageDataUrl }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึก Part ไม่สำเร็จ");
      setPartModalOpen(false);
      await loadData();
      setNotice({ type: "success", text: editingPart ? "แก้ไขข้อมูล Part สำเร็จ" : "เพิ่ม Part ใหม่สำเร็จ" });
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "บันทึก Part ไม่สำเร็จ");
    } finally {
      setModalSaving(false);
    }
  }

  function openNewOrder() {
    const part = data.parts[0];
    setOrderForm({
      orderNo: "",
      partId: part ? String(part.id) : "",
      lotNo: "",
      targetQty: "",
      customer: part?.customer || "KISHIMOTO INDUSTRY",
      deliveryDate: new Date().toISOString().slice(0, 10),
      deliveryTime: "08:00",
      senderName: user.displayName,
    });
    setModalError("");
    setOrderModalOpen(true);
  }

  async function saveOrder(event: FormEvent) {
    event.preventDefault();
    setModalSaving(true);
    setModalError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...orderForm, partId: Number(orderForm.partId), targetQty: Number(orderForm.targetQty) }),
      });
      const payload = await response.json() as { error?: string; order?: { orderNo: string } };
      if (!response.ok) throw new Error(payload.error || "สร้างใบส่งงานไม่สำเร็จ");
      setOrderModalOpen(false);
      await loadData();
      if (payload.order?.orderNo) {
        setSelectedOrderNo(payload.order.orderNo);
        setOrderQuery(payload.order.orderNo);
      }
      setNotice({ type: "success", text: "สร้างใบส่งงานสำเร็จ" });
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "สร้างใบส่งงานไม่สำเร็จ");
    } finally {
      setModalSaving(false);
    }
  }

  async function receiveWork() {
    if (!activeOrder) return;
    setModalSaving(true);
    setReceiveNotice(null);
    try {
      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNo: activeOrder.orderNo }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "ยืนยันรับงานไม่สำเร็จ");
      await loadData();
      setReceiveNotice({ type: "success", text: `รับงานสำเร็จ บันทึกผู้รับเป็น ${user.displayName}` });
    } catch (error) {
      setReceiveNotice({ type: "error", text: error instanceof Error ? error.message : "ยืนยันรับงานไม่สำเร็จ" });
    } finally {
      setModalSaving(false);
    }
  }

  const tagCheck = useMemo(() => {
    if (!activeOrder || !tagId.trim()) return null;
    const segments = tagId.trim().toUpperCase().split("|");
    if (segments.length < 3) return { valid: false, text: "รูปแบบ Tag ยังไม่ครบ" };
    if (segments[0] !== activeOrder.partNo) return { valid: false, text: "Part No. ไม่ตรงใบงาน" };
    if (segments[1] !== activeOrder.lotNo) return { valid: false, text: "Lot No. ไม่ตรงใบงาน" };
    if (data.scans.some((scan) => scan.tagId === tagId.trim().toUpperCase())) {
      return { valid: false, text: "Tag นี้ถูกบันทึกแล้ว" };
    }
    return { valid: true, text: "Part และ Lot ถูกต้อง" };
  }, [activeOrder, data.scans, tagId]);

  async function saveScan(event: FormEvent) {
    event.preventDefault();
    if (!activeOrder || !tagCheck?.valid || !photo) {
      setNotice({ type: "error", text: !photo ? "กรุณาถ่ายรูปงานในบ๊อคก่อนบันทึก" : "กรุณาตรวจสอบ Tag ให้ถูกต้อง" });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      if (photo.size > 6 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 6 MB");
      const photoDataUrl = await readPhoto(photo);
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNo: activeOrder.orderNo,
          tagId: tagId.trim().toUpperCase(),
          boxType,
          actualQty: boxType === "full" ? activeOrder.standardQty : Number(actualQty),
          photoDataUrl,
          photoName: photo.name,
        }),
      });
      const payload = await response.json() as { error?: string; total?: number; targetQty?: number };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      setNotice({
        type: "success",
        text: `บันทึกสำเร็จ ยอดตรวจสะสม ${formatNumber(payload.total ?? 0)}/${formatNumber(payload.targetQty ?? activeOrder.targetQty)} ชิ้น`,
      });
      setTagId("");
      setBoxType("full");
      setActualQty("");
      setPhoto(null);
      setPhotoPreview("");
      await loadData();
      setTimeout(() => tagInputRef.current?.focus(), 150);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data.orders.length) {
    return (
      <main className="loading-screen">
        <div className="loader-mark">KIT</div>
        <p>กำลังเปิดระบบตรวจสอบสต๊อก…</p>
      </main>
    );
  }

  const completedOrders = data.orders.filter((order) => order.status === "completed").length;
  const pendingOrders = data.orders.filter((order) => order.status === "in_progress").length;
  const abnormalOrders = data.orders.filter((order) => order.status === "over").length;
  const completedPercent = data.orders.length ? Math.round((completedOrders / data.orders.length) * 10000) / 100 : 0;
  const totalPieces = data.orders.reduce((sum, order) => sum + order.targetQty, 0);
  const latestOrders = data.orders.slice(0, 4);
  const latestScans = data.scans.slice(0, 3);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><span>K</span><span>I</span><span>T</span></div>
          <div>
            <strong>DELIVERY DUE CONTROL</strong>
            <span>KISHIMOTO INDUSTRY</span>
          </div>
        </div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          {navItems.map((item) => (
            <button key={item.label} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        {user.role === "admin" && <a className="employee-admin-link" href="/employees"><span className="nav-icon">♙</span>จัดการพนักงาน</a>}
        <div className="sidebar-help">
          <span className="help-icon">👩🏻‍💻</span>
          <strong>ต้องการความช่วยเหลือ?</strong>
          <button type="button">คู่มือและตั้งค่า</button>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
            <a href={signOutPath}>ออกจากระบบ</a>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <h1>{tabLabels[tab]}</h1>
            <p className="eyebrow">ภาพรวมการส่งงานและสถานะล่าสุด</p>
          </div>
          <div className="topbar-actions">
            <button className="notification-button" aria-label="การแจ้งเตือน">♧<b>{abnormalOrders}</b></button>
            <span className="signed-user"><b>{user.displayName.slice(0, 1)}</b><span><strong>{user.displayName}</strong>{user.role === "admin" ? "ผู้ดูแลระบบ" : user.role}</span></span>
          </div>
        </header>

        {loadError && (
          <div className="system-error">
            <span>{loadError}</span>
            <button onClick={() => void loadData()}>ลองใหม่</button>
          </div>
        )}
        {notice && tab === "overview" && <div className={`notice ${notice.type}`}>{notice.type === "success" ? "✓" : "!"} {notice.text}</div>}

        {tab === "overview" && (
          <section className="page-stack dashboard-home">
            <div className="delivery-hero">
              <div><span>DELIVERY DUE CONTROL</span><h2>แผนส่งงานและตัดยอด<br />ด้วย <em>QR Tag</em></h2><p>นำเข้า Excel ของลูกค้า ตรวจ Due และสแกน Tag<br />เพื่อตัดยอดแบบทันที</p><button type="button" onClick={openNewOrder}>⇧ &nbsp; นำเข้าแผนส่งงาน Excel</button></div>
            </div>

            <div className="home-metrics">
              <article className="home-stat blue"><i>▣</i><div><span>Due ทั้งหมด</span><strong>{data.orders.length}</strong><small>รายการ</small></div></article>
              <article className="home-stat green"><i>✓</i><div><span>ส่งออกแล้ว</span><strong>{completedOrders}</strong><small>รายการ &nbsp;•&nbsp; {completedPercent}%</small></div></article>
              <article className="home-stat orange"><i>◷</i><div><span>ค้างตัดยอด</span><strong>{pendingOrders}</strong><small>รายการ</small></div></article>
              <article className="home-stat red"><i>!</i><div><span>ผิดปกติ</span><strong>{abnormalOrders}</strong><small>รายการ</small></div></article>
            </div>

            <div className="home-grid">
              <article className="panel due-chart-card">
                <h3>สถานะส่งงานตาม Due</h3>
                <div className="due-chart-body"><div className="due-donut" style={{"--done": `${completedPercent * 3.6}deg`, "--pending": `${(completedPercent + (data.orders.length ? pendingOrders / data.orders.length * 100 : 0)) * 3.6}deg`} as React.CSSProperties}><b>{data.orders.length}</b><span>รายการ</span></div><div className="due-legend"><p><i className="green" />ส่งออกครบ <b>{completedOrders}</b><span>{completedPercent}%</span></p><p><i className="orange" />ค้างเหลือ <b>{pendingOrders}</b><span>{data.orders.length ? Math.round(pendingOrders / data.orders.length * 10000) / 100 : 0}%</span></p><p><i className="red" />เกิน Due <b>{abnormalOrders}</b><span>{data.orders.length ? Math.round(abnormalOrders / data.orders.length * 10000) / 100 : 0}%</span></p></div></div>
                <footer>อัปเดตล่าสุด: {new Intl.DateTimeFormat("th-TH", {dateStyle:"medium", timeStyle:"short"}).format(new Date())} &nbsp;↻</footer>
              </article>

              <article className="panel due-list-card">
                <div className="compact-heading"><h3>Due ที่ค้างตัดยอด (รายการล่าสุด)</h3><button onClick={() => setTab("history")}>ดูทั้งหมด →</button></div>
                <div className="due-table-head"><span>Due / ลูกค้า</span><span>ค้างเหลือ</span></div>
                {latestOrders.length ? latestOrders.map((order) => { const scanned=data.scans.filter(s=>s.workOrderId===order.id).reduce((n,s)=>n+s.actualQty,0); return <button className="due-line" key={order.id} onClick={()=>chooseOrder(order)}><time>{order.deliveryDate || "ไม่ระบุ"}</time><span><b>{order.customer || order.partNo}</b><small>{order.partNo} • {order.partName}</small></span><strong>{formatNumber(Math.max(order.targetQty-scanned,0))}</strong></button> }) : <div className="empty-mini">ยังไม่มีแผนส่งงาน</div>}
              </article>

              <aside className="home-side">
                <article className="panel quick-card"><h3>เมนูด่วน</h3><div><button className="quick-blue" onClick={openNewOrder}>⇧<span>นำเข้าแผนงาน</span></button><button className="quick-purple" onClick={()=>setTab("scan")}>◇<span>สร้างและพิมพ์ Tag</span></button><button className="quick-green" onClick={()=>setTab("receive")}>▦<span>รับเข้า Stock</span></button><button className="quick-orange" onClick={()=>setTab("scan")}>⌗<span>ตัดงาน</span></button></div></article>
                <article className="panel updates-card"><div className="compact-heading"><h3>อัปเดตล่าสุด</h3><button onClick={()=>setTab("history")}>ดูทั้งหมด →</button></div>{latestScans.length ? latestScans.map((scan,index)=><div className="update-line" key={scan.id}><time>{new Date(scan.createdAt.replace(" ","T")+"Z").toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</time><i className={index===0?"green":"blue"}/><span><b>สแกน Tag เลขที่ {scan.tagId.split("|").at(-1)}</b><small>{scan.partNo} • {scan.actualQty} PCS</small></span></div>) : <div className="empty-mini">ยังไม่มีรายการอัปเดต</div>}</article>
              </aside>
            </div>

            <div className="bottom-metrics"><article><i>▣</i><span>วันนี้ส่งแผนงาน<strong>{completedOrders}</strong><small>รายการ</small></span></article><article><i>▥</i><span>FAC ทั้งหมด<strong>{new Set(data.orders.map(o=>o.customer)).size}</strong><small>โรงงาน</small></span></article><article><i>▤</i><span>รายการทั้งหมด<strong>{formatNumber(data.scans.length)}</strong><small>รายการ</small></span></article><article><i>⌘</i><span>ชิ้นงานทั้งหมด<strong>{formatNumber(totalPieces)}</strong><small>ชิ้น</small></span></article></div>
          </section>
        )}

        {tab === "scan" && activeOrder && (
          <section className="page-stack">
            <div className="scan-toolbar">
              <form onSubmit={openOrder}>
                <label>Work Order</label>
                <div><span>▥</span><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} /><button>เปิดใบงาน</button></div>
              </form>
              <div className={`match-banner ${summary.total === activeOrder.targetQty ? "complete" : ""}`}>
                <span>{summary.total === activeOrder.targetQty ? "✓" : "i"}</span>
                <div><strong>{summary.total === activeOrder.targetQty ? "จำนวนครบแล้ว" : "กำลังตรวจสอบ"}</strong><small>{formatNumber(summary.total)} / {formatNumber(activeOrder.targetQty)} ชิ้น</small></div>
              </div>
            </div>

            <div className="scan-layout">
              <div className="scan-left">
                <article className="panel product-panel">
                  <ProductArtwork imageUrl={activeOrder.imageUrl} />
                  <div className="product-info">
                    <span className="section-kicker">PRODUCT INFORMATION</span>
                    <h2>{activeOrder.partNo}</h2>
                    <p>{activeOrder.partName}</p>
                    <div className="product-meta">
                      <div><span>Lot No.</span><strong>{activeOrder.lotNo}</strong></div>
                      <div><span>มาตรฐาน/บ๊อค</span><strong>{activeOrder.standardQty} ชิ้น</strong></div>
                      <div><span>จำนวนตามใบงาน</span><strong>{formatNumber(activeOrder.targetQty)} ชิ้น</strong></div>
                    </div>
                  </div>
                  <div className="product-summary">
                    <span>บ๊อคเต็มที่ต้องมี</span>
                    <strong>{Math.floor(activeOrder.targetQty / activeOrder.standardQty)}</strong>
                    <small>+ เศษ {activeOrder.targetQty % activeOrder.standardQty} ชิ้น</small>
                  </div>
                </article>

                <article className="panel delivery-label">
                  <div className="delivery-title"><div><span>DELIVERY QR CODE LABEL</span><h3>ใบติดงานส่ง</h3></div><div className="delivery-title-actions"><button type="button" onClick={() => setTagPrintOpen(true)}>พิมพ์ Tag A4</button><div className="qr-mini">▦</div></div></div>
                  <div className="delivery-fields">
                    <div><span>Customer</span><strong>{activeOrder.customer}</strong></div>
                    <div><span>Packing Standard</span><strong>{activeOrder.packingStandard} ชิ้น/{activeOrder.containerType}</strong></div>
                    <div><span>Part No.</span><strong>{activeOrder.partNo}</strong></div>
                    <div><span>Packing Count</span><strong>{activeOrder.packingCount} ชิ้น</strong></div>
                    <div><span>Part Name</span><strong>{activeOrder.partName}</strong></div>
                    <div><span>Full packing Qty</span><strong>{activeOrder.fullPackingQty} {activeOrder.containerType}</strong></div>
                    <div><span>Delivery Qty</span><strong>{formatNumber(activeOrder.targetQty)} ชิ้น</strong></div>
                    <div><span>Partial Qty</span><strong>{activeOrder.partialQty} ชิ้น</strong></div>
                    <div><span>Delivery Date</span><strong>{activeOrder.deliveryDate}</strong></div>
                    <div><span>Total packing Qty</span><strong>{activeOrder.totalPackingQty} {activeOrder.containerType}</strong></div>
                    <div><span>Delivery Time</span><strong>{activeOrder.deliveryTime}</strong></div>
                    <div><span>Lot No.</span><strong>{activeOrder.lotNo}</strong></div>
                    <div><span>Sender</span><strong>{activeOrder.senderName}</strong></div>
                    <div><span>Inspector</span><strong>{activeScans[0]?.inspectorName || user.displayName}</strong></div>
                    <div><span>Receiver</span><strong>{activeReceipt?.receiverName || "ยังไม่มีผู้รับงาน"}</strong></div>
                    <div><span>Work Order</span><strong>{activeOrder.orderNo}</strong></div>
                  </div>
                </article>

                <article className="panel scan-form-panel">
                  <div className="panel-heading">
                    <div><span className="step-number">01</span><h3>ยิง Tag ประจำบ๊อค</h3><p>เครื่องยิงบาร์โค้ดจะพิมพ์ข้อมูลลงช่องนี้อัตโนมัติ</p></div>
                    <button className="sample-tag" type="button" onClick={() => setTagId(`${activeOrder.partNo}|${activeOrder.lotNo}|BOX-${String(data.scans.length + 1).padStart(4, "0")}`)}>ใช้ Tag ตัวอย่าง</button>
                  </div>
                  <form onSubmit={saveScan}>
                    <div className="tag-field-wrap">
                      <span className="barcode-glyph">▥</span>
                      <input ref={tagInputRef} value={tagId} onChange={(event) => setTagId(event.target.value.toUpperCase())} placeholder={`${activeOrder.partNo}|${activeOrder.lotNo}|BOX-XXXX`} />
                      {tagCheck && <span className={`tag-check ${tagCheck.valid ? "valid" : "invalid"}`}>{tagCheck.valid ? "✓" : "!"} {tagCheck.text}</span>}
                    </div>

                    <div className="form-columns">
                      <div className="form-section">
                        <div className="form-section-title"><span className="step-number">02</span><div><h3>ระบุประเภทบ๊อค</h3><p>เลือกตามจำนวนงานจริงในภาชนะ</p></div></div>
                        <div className="type-options">
                          <button type="button" className={boxType === "full" ? "selected" : ""} onClick={() => setBoxType("full")}><span className="box-symbol">▣</span><strong>บ๊อคเต็ม</strong><small>{activeOrder.standardQty} ชิ้น</small></button>
                          <button type="button" className={boxType === "partial" ? "selected partial" : "partial"} onClick={() => setBoxType("partial")}><span className="box-symbol">◩</span><strong>บ๊อคเศษ</strong><small>กรอกจำนวนจริง</small></button>
                        </div>
                        <label className={`quantity-field ${boxType === "full" ? "disabled" : ""}`}><span>จำนวนจริงในบ๊อค</span><div><input type="number" min="1" max={activeOrder.standardQty - 1} value={boxType === "full" ? activeOrder.standardQty : actualQty} onChange={(event) => setActualQty(event.target.value)} disabled={boxType === "full"} required /><strong>ชิ้น</strong></div></label>
                      </div>

                      <div className="form-section photo-section">
                        <div className="form-section-title"><span className="step-number">03</span><div><h3>ถ่ายรูปยืนยัน</h3><p>ต้องเห็นชิ้นงานภายในบ๊อคชัดเจน</p></div></div>
                        <label className={`photo-capture ${photoPreview ? "has-photo" : ""}`}>
                          {photoPreview ? <img src={photoPreview} alt="รูปถ่ายที่จะบันทึก" /> : <><span className="camera-symbol">▣</span><strong>เปิดกล้องถ่ายรูป</strong><small>แตะเพื่อถ่ายหรือเลือกรูปภาพ</small></>}
                          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
                          {photoPreview && <span className="retake">ถ่ายใหม่</span>}
                        </label>
                      </div>
                    </div>

                    {notice && <div className={`notice ${notice.type}`}>{notice.type === "success" ? "✓" : "!"} {notice.text}</div>}
                    <button className="save-scan" disabled={saving || !tagCheck?.valid || !photo}>{saving ? "กำลังบันทึก…" : "บันทึกและสแกนบ๊อคถัดไป"}<span>→</span></button>
                  </form>
                </article>
              </div>

              <aside className="scan-right">
                <article className="panel progress-panel">
                  <span className="section-kicker">VERIFICATION PROGRESS</span>
                  <div className="progress-ring" style={{ "--progress": `${summary.percent * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(summary.percent)}%</strong><span>ตรวจแล้ว</span></div></div>
                  <div className="progress-stats"><div><span>บ๊อคเต็ม</span><strong>{summary.full}</strong></div><div><span>บ๊อคเศษ</span><strong>{summary.partial}</strong></div></div>
                  <div className="remaining-box"><span>{summary.over ? "จำนวนเกิน" : "ยังขาด"}</span><strong>{formatNumber(summary.over || summary.remaining)} ชิ้น</strong></div>
                </article>
                <article className="panel recent-boxes">
                  <div className="panel-heading"><h3>บ๊อคที่สแกนล่าสุด</h3><button className="text-button" onClick={() => setTab("history")}>ดูทั้งหมด</button></div>
                  {activeScans.slice(0, 4).map((scan) => (
                    <div className="recent-box" key={scan.id}><img src={scan.photoUrl} alt="หลักฐาน" /><div><strong>{scan.tagId.split("|").at(-1)}</strong><span>{scan.boxType === "full" ? "เต็ม" : "เศษ"} • {scan.actualQty} ชิ้น</span></div><i>✓</i></div>
                  ))}
                  {!activeScans.length && <div className="empty-mini">ยังไม่มี Tag ที่บันทึกในใบงานนี้</div>}
                </article>
              </aside>
            </div>
          </section>
        )}

        {tab === "receive" && activeOrder && (
          <section className="page-stack">
            <div className="scan-toolbar">
              <form onSubmit={openReceiveOrder}>
                <label>ยิง QR ใบส่งงาน / Work Order</label>
                <div><span>▥</span><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} /><button>ค้นหา</button></div>
              </form>
              <div className={`match-banner ${activeReceipt ? "complete" : ""}`}>
                <span>{activeReceipt ? "✓" : "i"}</span>
                <div><strong>{activeReceipt ? "รับงานแล้ว" : "รอการรับงาน"}</strong><small>{activeReceipt ? activeReceipt.receiverName : `${formatNumber(summary.total)} / ${formatNumber(activeOrder.targetQty)} ชิ้น`}</small></div>
              </div>
            </div>

            <div className="receive-layout">
              <article className="panel receive-document">
                <div className="receive-doc-header">
                  <div><span>DELIVERY QR CODE LABEL</span><h2>ใบติดงานส่งและรับงาน</h2></div>
                  <div className="document-qr"><strong>▦</strong><small>{activeOrder.orderNo}</small></div>
                </div>
                <div className="receive-doc-grid">
                  <div><span>Customer</span><strong>{activeOrder.customer}</strong></div>
                  <div><span>Packing Standard</span><strong>{activeOrder.packingStandard} ชิ้น/{activeOrder.containerType}</strong></div>
                  <div><span>Part No.</span><strong>{activeOrder.partNo}</strong></div>
                  <div><span>Packing Count</span><strong>{activeOrder.packingCount} ชิ้น</strong></div>
                  <div><span>Part Name</span><strong>{activeOrder.partName}</strong></div>
                  <div><span>Full packing Qty</span><strong>{activeOrder.fullPackingQty} {activeOrder.containerType}</strong></div>
                  <div><span>Delivery Qty</span><strong>{formatNumber(activeOrder.targetQty)} ชิ้น</strong></div>
                  <div><span>Partial Qty</span><strong>{activeOrder.partialQty} ชิ้น</strong></div>
                  <div><span>Delivery Date</span><strong>{activeOrder.deliveryDate}</strong></div>
                  <div><span>Total packing Qty</span><strong>{activeOrder.totalPackingQty} {activeOrder.containerType}</strong></div>
                  <div><span>Delivery Time</span><strong>{activeOrder.deliveryTime}</strong></div>
                  <div><span>Lot No.</span><strong>{activeOrder.lotNo}</strong></div>
                  <div><span>Sender</span><strong>{activeOrder.senderName}</strong></div>
                  <div><span>Inspector</span><strong>{activeScans[0]?.inspectorName || "ยังไม่มีผู้ตรวจ"}</strong></div>
                  <div className="wide"><span>Receiver</span><strong>{activeReceipt?.receiverName || user.displayName}</strong></div>
                </div>
              </article>

              <aside className="panel receive-confirm">
                <span className="section-kicker">RECEIVING CONFIRMATION</span>
                <div className={`receive-icon ${activeReceipt ? "done" : ""}`}>{activeReceipt ? "✓" : "▣"}</div>
                <h3>{activeReceipt ? "รับงานเรียบร้อย" : "ยืนยันรับงานเข้าคลัง"}</h3>
                <p>{activeReceipt ? `ผู้รับ: ${activeReceipt.receiverName}` : `ระบบจะบันทึกผู้รับเป็น ${user.displayName}`}</p>
                <div className="receive-checks">
                  <div><span>Part และ Lot</span><strong>✓ ตรงใบงาน</strong></div>
                  <div><span>จำนวนตรวจแล้ว</span><strong className={summary.total === activeOrder.targetQty ? "ok" : "warn"}>{formatNumber(summary.total)}/{formatNumber(activeOrder.targetQty)}</strong></div>
                  <div><span>รูปยืนยัน</span><strong>{activeScans.length}/{activeOrder.totalPackingQty} รูป</strong></div>
                </div>
                {receiveNotice && <div className={`notice ${receiveNotice.type}`}>{receiveNotice.type === "success" ? "✓" : "!"} {receiveNotice.text}</div>}
                <button className="receive-button" onClick={() => void receiveWork()} disabled={modalSaving || Boolean(activeReceipt) || summary.total !== activeOrder.targetQty}>{activeReceipt ? "รับงานแล้ว" : modalSaving ? "กำลังบันทึก…" : "ยืนยันรับงาน"}</button>
                {!activeReceipt && summary.total !== activeOrder.targetQty && <small className="receive-hint">ต้องตรวจจำนวนให้ครบก่อนจึงจะรับงานได้</small>}
              </aside>
            </div>
          </section>
        )}

        {tab === "history" && (
          <section className="page-stack">
            <div className="history-summary">
              <div><span>รายการตรวจทั้งหมด</span><strong>{data.scans.length}</strong></div>
              <div><span>บ๊อคเต็ม</span><strong>{data.scans.filter((scan) => scan.boxType === "full").length}</strong></div>
              <div><span>บ๊อคเศษ</span><strong>{data.scans.filter((scan) => scan.boxType === "partial").length}</strong></div>
              <button onClick={() => setTab("scan")}>+ ตรวจบ๊อคใหม่</button>
            </div>
            <article className="panel history-panel">
              <div className="panel-heading"><div><span className="section-kicker">EVIDENCE LOG</span><h3>หลักฐานการตรวจสอบ</h3></div><div className="search-chip">⌕ ค้นหาด้วย Tag / Part</div></div>
              <div className="table-wrap"><table><thead><tr><th>รูปยืนยัน</th><th>Tag ID</th><th>ใบงาน / Part</th><th>ประเภท</th><th>จำนวน</th><th>ผู้ตรวจ</th><th>ผู้รับงาน</th><th>วันเวลา</th><th>ผล</th></tr></thead><tbody>
                {data.scans.map((scan) => <tr key={scan.id}><td><a href={scan.photoUrl} target="_blank" rel="noreferrer"><img className="table-photo" src={scan.photoUrl} alt="รูปยืนยัน" /></a></td><td><strong>{scan.tagId.split("|").at(-1)}</strong><small>{scan.tagId}</small></td><td><strong>{scan.orderNo}</strong><small>{scan.partNo}</small></td><td><span className={`box-badge ${scan.boxType}`}>{scan.boxType === "full" ? "บ๊อคเต็ม" : "บ๊อคเศษ"}</span></td><td><strong>{scan.actualQty} ชิ้น</strong></td><td>{scan.inspectorName}</td><td>{data.receipts.find((receipt) => receipt.workOrderId === scan.workOrderId)?.receiverName || "-"}</td><td>{formatDate(scan.createdAt)}</td><td><span className="verified">✓ ถูกต้อง</span></td></tr>)}
              </tbody></table></div>
              {!data.scans.length && <div className="empty-state"><span>▥</span><h3>ยังไม่มีประวัติการตรวจ</h3><p>เมื่อบันทึก Tag พร้อมรูปถ่าย รายการจะแสดงที่นี่</p><button onClick={() => setTab("scan")}>เริ่มตรวจสอบ</button></div>}
            </article>
          </section>
        )}

        {tab === "parts" && (
          <section className="page-stack">
            <div className="master-hero"><div><span className="section-kicker">MASTER DATA</span><h2>ข้อมูลมาตรฐานสำหรับตรวจสอบงาน</h2><p>ระบบใช้จำนวนมาตรฐานต่อบ๊อคเพื่อคำนวณบ๊อคเต็มและบ๊อคเศษ</p></div><button onClick={openNewPart}>+ เพิ่ม Part ใหม่</button></div>
            {notice && <div className={`notice ${notice.type}`}>{notice.type === "success" ? "✓" : "!"} {notice.text}</div>}
            <div className="part-grid">
              {data.parts.map((part) => (
                <article className="part-card" key={part.id}><ProductArtwork imageUrl={part.imageUrl} /><span className="active-dot">● ACTIVE</span><h3>{part.partNo}</h3><p>{part.partName}</p><div><span>Customer</span><strong>{part.customer}</strong></div><div><span>บรรจุมาตรฐาน</span><strong>{part.standardQty} ชิ้น/{part.containerType}</strong></div><button onClick={() => openEditPart(part)}>แก้ไขข้อมูล</button></article>
              ))}
            </div>
          </section>
        )}
      </main>

      {partModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="part-modal-title">
            <div className="modal-header"><div><span className="section-kicker">PART MASTER</span><h2 id="part-modal-title">{editingPart ? "แก้ไขข้อมูล Part" : "เพิ่ม Part ใหม่"}</h2></div><button type="button" onClick={() => setPartModalOpen(false)} aria-label="ปิด">×</button></div>
            <form onSubmit={savePart}>
              <label className="product-upload">
                {partImagePreview ? <img src={partImagePreview} alt="รูปสินค้า" /> : <><span>▣</span><strong>ถ่ายรูปหรือเลือกรูปสินค้า</strong><small>ใช้แสดงเมื่อยิง Tag</small></>}
                <input type="file" accept="image/*" capture="environment" onChange={onPartImage} />
              </label>
              <div className="modal-grid">
                <label><span>Part No. *</span><input value={partForm.partNo} onChange={(event) => setPartForm({ ...partForm, partNo: event.target.value.toUpperCase() })} required /></label>
                <label><span>Part Name *</span><input value={partForm.partName} onChange={(event) => setPartForm({ ...partForm, partName: event.target.value })} required /></label>
                <label className="wide"><span>Customer *</span><input value={partForm.customer} onChange={(event) => setPartForm({ ...partForm, customer: event.target.value })} required /></label>
                <label><span>Packing Count / จำนวนต่อบ๊อค *</span><input type="number" min="1" value={partForm.standardQty} onChange={(event) => setPartForm({ ...partForm, standardQty: event.target.value })} required /></label>
                <label><span>ประเภทภาชนะ *</span><select value={partForm.containerType} onChange={(event) => setPartForm({ ...partForm, containerType: event.target.value })}><option value="บ๊อค">บ๊อค</option><option value="กล่อง">กล่อง</option><option value="แร็ค">แร็ค</option></select></label>
              </div>
              {modalError && <div className="notice error">! {modalError}</div>}
              <div className="modal-actions"><button type="button" className="secondary" onClick={() => setPartModalOpen(false)}>ยกเลิก</button><button type="submit" disabled={modalSaving}>{modalSaving ? "กำลังบันทึก…" : editingPart ? "บันทึกการแก้ไข" : "เพิ่ม Part"}</button></div>
            </form>
          </section>
        </div>
      )}

      {orderModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
            <div className="modal-header"><div><span className="section-kicker">DELIVERY CONTROL</span><h2 id="order-modal-title">สร้างใบส่งงานใหม่</h2></div><button type="button" onClick={() => setOrderModalOpen(false)} aria-label="ปิด">×</button></div>
            <form onSubmit={saveOrder}>
              <div className="modal-grid">
                <label><span>Work Order *</span><input value={orderForm.orderNo} onChange={(event) => setOrderForm({ ...orderForm, orderNo: event.target.value.toUpperCase() })} required /></label>
                <label><span>Part No. *</span><select value={orderForm.partId} onChange={(event) => { const selected = data.parts.find((part) => part.id === Number(event.target.value)); setOrderForm({ ...orderForm, partId: event.target.value, customer: selected?.customer || orderForm.customer }); }} required><option value="">เลือก Part</option>{data.parts.map((part) => <option key={part.id} value={part.id}>{part.partNo} — {part.partName}</option>)}</select></label>
                <label><span>Lot No. *</span><input value={orderForm.lotNo} onChange={(event) => setOrderForm({ ...orderForm, lotNo: event.target.value.toUpperCase() })} required /></label>
                <label><span>Delivery Qty *</span><input type="number" min="1" value={orderForm.targetQty} onChange={(event) => setOrderForm({ ...orderForm, targetQty: event.target.value })} required /></label>
                <label className="wide"><span>Customer *</span><input value={orderForm.customer} onChange={(event) => setOrderForm({ ...orderForm, customer: event.target.value })} required /></label>
                <label><span>Delivery Date *</span><input type="date" value={orderForm.deliveryDate} onChange={(event) => setOrderForm({ ...orderForm, deliveryDate: event.target.value })} required /></label>
                <label><span>Delivery Time *</span><input type="time" value={orderForm.deliveryTime} onChange={(event) => setOrderForm({ ...orderForm, deliveryTime: event.target.value })} required /></label>
                <label className="wide"><span>Sender / ผู้ส่งงาน *</span><input value={orderForm.senderName} onChange={(event) => setOrderForm({ ...orderForm, senderName: event.target.value })} required /></label>
              </div>
              <div className="form-info">ระบบจะคำนวณ Full packing Qty, Partial Qty และ Total packing Qty จากมาตรฐานของ Part ให้อัตโนมัติ</div>
              {modalError && <div className="notice error">! {modalError}</div>}
              <div className="modal-actions"><button type="button" className="secondary" onClick={() => setOrderModalOpen(false)}>ยกเลิก</button><button type="submit" disabled={modalSaving}>{modalSaving ? "กำลังบันทึก…" : "สร้างใบส่งงาน"}</button></div>
            </form>
          </section>
        </div>
      )}

      {tagPrintOpen && activeOrder && (
        <div className="tag-print-modal" role="dialog" aria-modal="true" aria-label="พิมพ์ Tag A4">
          <div className="tag-print-toolbar">
            <div><strong>พิมพ์ Tag A4</strong><span>{activeOrder.orderNo} • {printableTags.length} Tag • 8 Tag/หน้า</span></div>
            <div><button type="button" className="secondary" onClick={() => setTagPrintOpen(false)}>ปิด</button><button type="button" onClick={() => window.print()}>พิมพ์ A4</button></div>
          </div>
          <div className="tag-print-preview">
            {Array.from({ length: Math.ceil(printableTags.length / 8) }, (_, pageIndex) => (
              <section className="a4-tag-sheet" key={pageIndex}>
                {printableTags.slice(pageIndex * 8, pageIndex * 8 + 8).map((tag) => <PrintableTag key={tag.tagId} order={activeOrder} tag={tag} />)}
              </section>
            ))}
          </div>
        </div>
      )}

      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {navItems.map((item) => <button key={item.label} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
    </div>
  );
}
