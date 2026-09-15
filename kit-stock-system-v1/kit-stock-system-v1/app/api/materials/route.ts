import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";

type MaterialLot = {
  id: number; receiptNo: string; supplierCode: string; supplierName: string;
  barcodeValue: string; packNo: string; materialCode: string; description: string;
  spec: string; size: string; lotNo: string; coilNo: string;
  originalQty: number; remainingQty: number; unit: string;
  originalWeightKg: number; remainingWeightKg: number;
  supplierDate: string; receivedDate: string; location: string; status: string;
  rawPayload: string; receivedByName: string; receivedByCode: string;
  createdAt: string; updatedAt: string;
};

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function whole(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function decimal(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 1000) / 1000) : 0;
}

function isoDate(value: unknown) {
  const source = clean(value, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
  const match = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

function code(prefix: string) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function parseBarcode(rawValue: string) {
  const raw = rawValue.trim();
  const parsed = {
    supplierCode: "",
    barcodeValue: raw,
    packNo: "",
    materialCode: "",
    description: "",
    spec: "",
    size: "",
    lotNo: "",
    coilNo: "",
    qty: 0,
    unit: "SHEET",
    weightKg: 0,
    supplierDate: "",
    warning: "",
  };

  if (/^PACK2D;/i.test(raw)) {
    const fields = raw.split(";").map((field) => field.trim());
    parsed.supplierCode = "CS_METAL_2D";
    parsed.packNo = fields[1] || "";
    parsed.coilNo = fields[5] || fields[13] || "";
    parsed.spec = fields[6] || "";
    parsed.size = fields[7] || "";
    parsed.qty = whole(fields[8]);
    parsed.weightKg = decimal(fields[9]);
    parsed.supplierDate = isoDate(fields[10]);
    parsed.materialCode = (fields[11] || "").toUpperCase();
    parsed.description = fields[12] || "";
    parsed.lotNo = fields[13] || "";
    parsed.unit = "PCS";
    return parsed;
  }

  if (/appdb\.tisi\.go\.th/i.test(raw)) {
    parsed.warning = "QR นี้เป็นลิงก์ใบรับรอง มอก. ซึ่งใช้ระบุ Supplier ไม่ได้ กรุณาสแกน Data Matrix หรือบาร์โค้ดยาวบนฉลาก";
    return parsed;
  }
  if (/^W[A-Z0-9-]{6,}$/i.test(raw)) {
    parsed.supplierCode = "UNITED_COIL";
    parsed.packNo = raw.toUpperCase();
    parsed.coilNo = parsed.packNo;
  } else if (/^(OP|0P|01|O1)[A-Z0-9-]{6,}$/i.test(raw)) {
    parsed.supplierCode = "SUMISHO";
    parsed.packNo = raw.toUpperCase();
    parsed.materialCode = raw.toUpperCase();
  } else if (/^ARY[A-Z0-9/@-]+$/i.test(raw)) {
    parsed.supplierCode = "GREEN_INDUSTRY";
    parsed.packNo = raw.toUpperCase();
  } else if (/^PH\d{6,}$/i.test(raw)) {
    parsed.supplierCode = "CENTRAL_METALS";
    parsed.packNo = raw.toUpperCase();
  } else if (/^A\d{3,}$/i.test(raw)) {
    parsed.supplierCode = "CS_METAL_COIL";
    parsed.packNo = raw.toUpperCase();
  } else {
    parsed.warning = "ยังระบุ Supplier จากโค้ดนี้ไม่ได้ กรุณาเลือก Supplier และตรวจข้อมูลก่อนรับเข้า";
  }
  return parsed;
}

const LOT_SELECT = `
  SELECT lot.id, lot.receipt_no AS receiptNo, lot.supplier_code AS supplierCode,
    supplier.name AS supplierName, lot.barcode_value AS barcodeValue,
    lot.pack_no AS packNo, lot.material_code AS materialCode, lot.description,
    lot.spec, lot.size, lot.lot_no AS lotNo, lot.coil_no AS coilNo,
    lot.original_qty AS originalQty, lot.remaining_qty AS remainingQty, lot.unit,
    lot.original_weight_kg AS originalWeightKg, lot.remaining_weight_kg AS remainingWeightKg,
    lot.supplier_date AS supplierDate, lot.received_date AS receivedDate,
    lot.location, lot.status, lot.raw_payload AS rawPayload,
    lot.received_by_name AS receivedByName, lot.received_by_code AS receivedByCode,
    lot.created_at AS createdAt, lot.updated_at AS updatedAt
  FROM material_lots lot
  INNER JOIN material_suppliers supplier ON supplier.code = lot.supplier_code
`;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "materials")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดู Stock Mat’s" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1" }, { status: 500 });
    const [supplierResult, lotResult, transactionResult] = await Promise.all([
      DB.prepare("SELECT code, name, label_format AS labelFormat, active FROM material_suppliers ORDER BY rowid").all(),
      DB.prepare(`${LOT_SELECT} ORDER BY lot.created_at DESC LIMIT 500`).all<MaterialLot>(),
      DB.prepare(`
        SELECT tx.id, tx.transaction_no AS transactionNo, tx.lot_id AS lotId, tx.type,
          tx.qty, tx.weight_kg AS weightKg, tx.qty_balance_after AS qtyBalanceAfter,
          tx.weight_balance_after AS weightBalanceAfter, tx.job_no AS jobNo,
          tx.department, tx.purpose, tx.note, tx.actor_name AS actorName,
          tx.actor_code AS actorCode, tx.created_at AS createdAt,
          lot.receipt_no AS receiptNo, lot.pack_no AS packNo,
          lot.material_code AS materialCode, supplier.name AS supplierName
        FROM material_transactions tx
        INNER JOIN material_lots lot ON lot.id = tx.lot_id
        INNER JOIN material_suppliers supplier ON supplier.code = lot.supplier_code
        ORDER BY tx.created_at DESC LIMIT 500
      `).all(),
    ]);
    const lots = lotResult.results || [];
    const summary = lots.reduce((total, item) => {
      total.lotCount += item.status === "in_stock" ? 1 : 0;
      total.qty += Number(item.remainingQty || 0);
      total.weightKg += Number(item.remainingWeightKg || 0);
      if (item.status === "depleted") total.depletedCount += 1;
      return total;
    }, { lotCount: 0, qty: 0, weightKg: 0, depletedCount: 0 });
    return Response.json({
      suppliers: supplierResult.results || [],
      lots,
      transactions: transactionResult.results || [],
      summary,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "โหลดข้อมูล Mat’s ไม่สำเร็จ";
    return Response.json({ error: /no such table/i.test(message) ? `${message} กรุณารัน migration 0020 ก่อนใช้งาน` : message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "materials")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์รับหรือเบิก Mat’s" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อ D1" }, { status: 500 });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 30);

    if (action === "preview") {
      const rawPayload = clean(body.rawPayload, 2000);
      if (!rawPayload) return Response.json({ error: "กรุณาสแกนหรือกรอกรหัสบนฉลาก" }, { status: 400 });
      const parsed = parseBarcode(rawPayload);
      const existing = await DB.prepare(`${LOT_SELECT} WHERE lot.barcode_value = ?1 ORDER BY lot.id DESC LIMIT 1`).bind(rawPayload).first<MaterialLot>();
      return Response.json({ parsed, existing: existing || null });
    }

    if (action === "receive") {
      const supplierCode = clean(body.supplierCode, 60);
      const rawPayload = clean(body.rawPayload, 2000);
      const barcodeValue = clean(body.barcodeValue || rawPayload, 500);
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const qty = whole(body.qty);
      const weightKg = decimal(body.weightKg);
      const receivedDate = isoDate(body.receivedDate);
      if (!supplierCode || !barcodeValue || !materialCode || !receivedDate) return Response.json({ error: "กรุณาระบุ Supplier, Barcode, Material และวันที่รับ" }, { status: 400 });
      if (qty <= 0 && weightKg <= 0) return Response.json({ error: "จำนวนรับหรือ Weight ต้องมากกว่า 0" }, { status: 400 });
      const supplier = await DB.prepare("SELECT code FROM material_suppliers WHERE code = ?1 AND active = 1").bind(supplierCode).first();
      if (!supplier) return Response.json({ error: "ไม่พบ Supplier ที่เลือก" }, { status: 400 });
      const duplicate = await DB.prepare("SELECT receipt_no AS receiptNo FROM material_lots WHERE supplier_code = ?1 AND barcode_value = ?2 LIMIT 1").bind(supplierCode, barcodeValue).first<{ receiptNo: string }>();
      if (duplicate) return Response.json({ error: `ฉลากนี้รับเข้าแล้วในเลขที่ ${duplicate.receiptNo}` }, { status: 409 });
      const receiptNo = code("MAT-RCV");
      const lotResult = await DB.prepare(`
        INSERT INTO material_lots (
          receipt_no, supplier_code, barcode_value, pack_no, material_code,
          description, spec, size, lot_no, coil_no, original_qty, remaining_qty,
          unit, original_weight_kg, remaining_weight_kg, supplier_date,
          received_date, location, status, raw_payload, received_by_name, received_by_code
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?13, ?13, ?14, ?15, ?16, 'in_stock', ?17, ?18, ?19)
      `).bind(
        receiptNo, supplierCode, barcodeValue, clean(body.packNo, 140), materialCode,
        clean(body.description, 300), clean(body.spec, 180), clean(body.size, 180),
        clean(body.lotNo, 140), clean(body.coilNo, 140), qty,
        clean(body.unit, 30) || "SHEET", weightKg, isoDate(body.supplierDate),
        receivedDate, clean(body.location, 120), rawPayload, user.displayName, user.employeeCode,
      ).run();
      const lotId = Number(lotResult.meta.last_row_id);
      await DB.prepare(`
        INSERT INTO material_transactions (
          transaction_no, lot_id, type, qty, weight_kg, qty_balance_after,
          weight_balance_after, note, actor_name, actor_code
        ) VALUES (?1, ?2, 'receive', ?3, ?4, ?3, ?4, ?5, ?6, ?7)
      `).bind(code("MAT-IN"), lotId, qty, weightKg, clean(body.note, 500), user.displayName, user.employeeCode).run();
      const lot = await DB.prepare(`${LOT_SELECT} WHERE lot.id = ?1`).bind(lotId).first<MaterialLot>();
      return Response.json({ success: true, lot });
    }

    if (action === "issue") {
      const lotId = whole(body.lotId);
      const qty = whole(body.qty);
      const weightKg = decimal(body.weightKg);
      if (!lotId || (qty <= 0 && weightKg <= 0)) return Response.json({ error: "กรุณาเลือกรายการและระบุจำนวนเบิก" }, { status: 400 });
      const before = await DB.prepare(`${LOT_SELECT} WHERE lot.id = ?1 AND lot.status = 'in_stock' LIMIT 1`).bind(lotId).first<MaterialLot>();
      if (!before) return Response.json({ error: "ไม่พบ Mat’s ที่พร้อมเบิก" }, { status: 404 });
      if (qty > Number(before.remainingQty) || weightKg > Number(before.remainingWeightKg)) return Response.json({ error: "จำนวนเบิกมากกว่ายอดคงเหลือ" }, { status: 409 });
      const qtyAfter = Number(before.remainingQty) - qty;
      const weightAfter = Math.round((Number(before.remainingWeightKg) - weightKg) * 1000) / 1000;
      const isDepleted = (Number(before.originalQty) > 0 && qtyAfter <= 0)
        || (Number(before.originalWeightKg) > 0 && weightAfter <= 0);
      const update = await DB.prepare(`
        UPDATE material_lots SET remaining_qty = ?2, remaining_weight_kg = ?3,
          status = ?4, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1 AND status = 'in_stock'
          AND remaining_qty >= ?5 AND remaining_weight_kg >= ?6
      `).bind(lotId, qtyAfter, weightAfter, isDepleted ? "depleted" : "in_stock", qty, weightKg).run();
      if (!Number(update.meta.changes || 0)) return Response.json({ error: "ยอดคงเหลือมีการเปลี่ยนแปลง กรุณารีเฟรชแล้วลองใหม่" }, { status: 409 });
      const transactionNo = code("MAT-OUT");
      await DB.prepare(`
        INSERT INTO material_transactions (
          transaction_no, lot_id, type, qty, weight_kg, qty_balance_after,
          weight_balance_after, job_no, department, purpose, note, actor_name, actor_code
        ) VALUES (?1, ?2, 'issue', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      `).bind(
        transactionNo, lotId, qty, weightKg, qtyAfter, weightAfter,
        clean(body.jobNo, 140), clean(body.department, 140), clean(body.purpose, 300),
        clean(body.note, 500), user.displayName, user.employeeCode,
      ).run();
      return Response.json({ success: true, transactionNo, qtyAfter, weightAfter, status: isDepleted ? "depleted" : "in_stock" });
    }

    return Response.json({ error: "ไม่รู้จักคำสั่ง Mat’s" }, { status: 400 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "บันทึก Mat’s ไม่สำเร็จ";
    return Response.json({ error: /no such table/i.test(message) ? `${message} กรุณารัน migration 0020 ก่อนใช้งาน` : message }, { status: 500 });
  }
}
