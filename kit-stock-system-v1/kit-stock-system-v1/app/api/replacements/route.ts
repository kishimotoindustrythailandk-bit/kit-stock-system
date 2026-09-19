import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";
import { writeAuditLog } from "../../audit-log";

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function parseInternalTag(raw: string) {
  const value = raw.trim();
  const fields = value.split("|");
  if (fields[0] === "KITSTOCK" && fields[1]) return fields[1].trim().toUpperCase();
  if (/^KITSTK-[A-Z0-9-]+$/i.test(value)) return value.toUpperCase();
  throw new Error("Tag นี้ไม่ใช่ KIT Stock Tag");
}

function canAccess(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return hasPermission(user, "replacement");
}

function canRequest(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return hasPermission(user, "replacement")
    && (user.role === "admin" || user.role === "qc" || user.role === "inspector");
}

function canIssue(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return hasPermission(user, "replacement")
    && (user.role === "admin" || user.role === "delivery" || user.role === "dispatcher");
}

/**
 * เดิมไฟล์นี้มี ensureTables() ที่ยิง CREATE TABLE 2 คำสั่งกับ CREATE INDEX
 * 4 คำสั่งทุกครั้งที่ GET หรือ POST เข้ามา ตาราง replacement_requests และ
 * replacement_issues อยู่ใน migrations/0015 อยู่แล้ว จึงไม่ต้องสร้างซ้ำตอน runtime
 */
async function requestRow(id: number) {
  const { DB } = getRuntimeEnv();
  if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
  return DB.prepare(`
    SELECT r.id, r.request_no AS requestNo, r.material_code AS materialCode,
      r.part_name AS partName, r.customer, r.requested_qty AS requestedQty,
      r.issued_qty AS issuedQty, max(r.requested_qty - r.issued_qty, 0) AS remainingQty,
      r.reason_type AS reasonType, r.reason_detail AS reasonDetail,
      r.needed_date AS neededDate, r.status, r.requested_by_name AS requestedByName,
      r.requested_by_code AS requestedByCode, r.requested_at AS requestedAt,
      r.completed_at AS completedAt
    FROM replacement_requests r WHERE r.id = ?1 LIMIT 1
  `).bind(id).first();
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!canAccess(user)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูงานทดแทน" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const [requests, issues] = await Promise.all([
      DB.prepare(`
        SELECT r.id, r.request_no AS requestNo, r.material_code AS materialCode,
          r.part_name AS partName, r.customer, r.requested_qty AS requestedQty,
          r.issued_qty AS issuedQty, max(r.requested_qty - r.issued_qty, 0) AS remainingQty,
          r.reason_type AS reasonType, r.reason_detail AS reasonDetail,
          r.needed_date AS neededDate, r.status, r.requested_by_name AS requestedByName,
          r.requested_by_code AS requestedByCode, r.requested_at AS requestedAt,
          r.completed_at AS completedAt
        FROM replacement_requests r ORDER BY r.id DESC LIMIT 500
      `).all(),
      DB.prepare(`
        SELECT i.id, i.request_id AS requestId, i.stock_tag_id AS stockTagId,
          i.stock_tag_code AS stockTagCode, i.qty, i.notice_no AS noticeNo,
          i.issued_by_name AS issuedByName, i.issued_by_code AS issuedByCode,
          i.issued_at AS issuedAt, i.printed_by_name AS printedByName,
          i.printed_by_code AS printedByCode, i.printed_at AS printedAt,
          t.job_no AS jobNo, t.production_date AS productionDate
        FROM replacement_issues i
        LEFT JOIN stock_tags t ON t.id = i.stock_tag_id
        ORDER BY i.id DESC LIMIT 1000
      `).all(),
    ]);
    return Response.json({ requests: requests.results, issues: issues.results });
  } catch (error) {
    console.error("replacements GET failed", error);
    return Response.json({ error: "โหลดงานทดแทนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!canAccess(user)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งานทดแทน" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 40);

    if (action === "create") {
      if (!canRequest(user)) return Response.json({ error: "เฉพาะ QC/ผู้ตรวจงานเท่านั้นที่แจ้งขอเบิกได้" }, { status: 403 });
      const materialCode = clean(body.materialCode, 100).toUpperCase();
      const customer = clean(body.customer, 160);
      const requestedQty = Number(body.requestedQty || 0);
      const reasonType = clean(body.reasonType, 30);
      const reasonDetail = clean(body.reasonDetail, 500);
      const neededDate = clean(body.neededDate, 10);
      if (!materialCode || !Number.isInteger(requestedQty) || requestedQty <= 0) {
        return Response.json({ error: "กรุณาเลือก Part และระบุจำนวนที่ขอเบิกอย่างน้อย 1 ชิ้น" }, { status: 400 });
      }
      if (!["defect", "shortage", "other"].includes(reasonType)) {
        return Response.json({ error: "กรุณาเลือกสาเหตุที่ขอเบิก" }, { status: 400 });
      }
      const part = await DB.prepare(`
        SELECT material_code AS materialCode, part_name AS partName, customer
        FROM stock_parts WHERE material_code = ?1 AND active = 1 LIMIT 1
      `).bind(materialCode).first<{ materialCode: string; partName: string; customer: string }>();
      if (!part) return Response.json({ error: "ไม่พบ Part นี้ในทะเบียน Part" }, { status: 404 });
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
      const requestNo = `REP-${stamp}-${crypto.randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase()}`;
      const result = await DB.prepare(`
        INSERT INTO replacement_requests
          (request_no, material_code, part_name, customer, requested_qty, issued_qty,
           reason_type, reason_detail, needed_date, status, requested_by_name, requested_by_code)
        VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, 'pending', ?9, ?10)
      `).bind(requestNo, materialCode, part.partName, customer || part.customer || "", requestedQty,
        reasonType, reasonDetail, neededDate, user.displayName, user.employeeCode).run();
      await writeAuditLog(user, {
        module: "replacement", moduleLabel: "เบิกงานทดแทน", action: "create_replacement_request", actionLabel: "ขอเบิกงานทดแทน",
        entityType: "replacement_request", entityId: requestNo,
        summary: `ขอเบิก ${materialCode} จำนวน ${requestedQty} ชิ้น · ${requestNo}`,
        details: { requestNo, materialCode, requestedQty, reasonType, reasonDetail, neededDate },
      }, request);
      return Response.json({ action: "created", request: await requestRow(Number(result.meta.last_row_id)) }, { status: 201 });
    }

    if (action === "preview_issue") {
      if (!canIssue(user)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดงานทดแทน" }, { status: 403 });
      const requestId = Number(body.requestId || 0);
      const tagId = parseInternalTag(clean(body.rawPayload, 1000));
      const replacement = await requestRow(requestId) as Record<string, unknown> | null;
      if (!replacement || replacement.status === "cancelled") return Response.json({ error: "ไม่พบใบขอเบิก หรือใบขอถูกยกเลิกแล้ว" }, { status: 404 });
      const remainingRequest = Number(replacement.remainingQty || 0);
      if (remainingRequest <= 0) return Response.json({ error: "ใบขอเบิกนี้จัดงานครบแล้ว" }, { status: 409 });
      const tag = await DB.prepare(`
        SELECT t.id, t.tag_id AS tagId, t.material_code AS materialCode, p.part_name AS partName,
          p.customer, p.location, t.qty, t.remaining_qty AS remainingQty, t.job_no AS jobNo,
          t.production_date AS productionDate, t.status,
          coalesce((SELECT sum(sp.picked_qty - sp.dispatched_qty) FROM stock_picks sp
            WHERE sp.stock_tag_id = t.id AND sp.status IN ('staged', 'partial')), 0) AS stagedQty,
          coalesce((SELECT sum(a.qty) FROM stock_allocations a
            WHERE a.stock_tag_id = t.id AND a.status = 'reserved'), 0) AS legacyReservedQty
        FROM stock_tags t
        INNER JOIN stock_parts p ON p.material_code = t.material_code
        WHERE t.tag_id = ?1 LIMIT 1
      `).bind(tagId).first<Record<string, unknown>>();
      if (!tag) return Response.json({ error: "ไม่พบ KIT Stock Tag นี้ในระบบ" }, { status: 404 });
      if (tag.status !== "in_stock") {
        return Response.json({ error: tag.status === "printed" ? "Tag นี้ยังไม่ได้รับเข้า Stock" : "Tag นี้ไม่มีจำนวนคงเหลือ" }, { status: 409 });
      }
      if (tag.materialCode !== replacement.materialCode) {
        return Response.json({ error: `Part ไม่ตรงกัน: ใบขอต้องการ ${replacement.materialCode} แต่ Tag เป็น ${tag.materialCode}` }, { status: 409 });
      }
      const availableQty = Math.max(Number(tag.remainingQty) - Number(tag.stagedQty) - Number(tag.legacyReservedQty), 0);
      if (!availableQty) return Response.json({ error: "KIT Stock Tag นี้ถูกจัดงานไว้หมดแล้ว" }, { status: 409 });
      const suggestedQty = Math.min(availableQty, remainingRequest);
      return Response.json({ action: "preview", request: replacement, tag: { ...tag, availableQty }, suggestedQty });
    }

    if (action === "confirm_issue") {
      if (!canIssue(user)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดงานทดแทน" }, { status: 403 });
      const requestId = Number(body.requestId || 0);
      const tagId = parseInternalTag(clean(body.rawPayload, 1000));
      const qty = Number(body.qty || 0);
      if (!Number.isInteger(qty) || qty <= 0) return Response.json({ error: "จำนวนเบิกต้องอย่างน้อย 1 ชิ้น" }, { status: 400 });
      const replacement = await requestRow(requestId) as Record<string, unknown> | null;
      if (!replacement || replacement.status === "cancelled") return Response.json({ error: "ไม่พบใบขอเบิก หรือใบขอถูกยกเลิกแล้ว" }, { status: 404 });
      const remainingRequest = Number(replacement.remainingQty || 0);
      if (qty > remainingRequest) return Response.json({ error: `ใบขอเหลือให้เบิก ${remainingRequest.toLocaleString("th-TH")} ชิ้น` }, { status: 409 });
      const tag = await DB.prepare(`
        SELECT t.id, t.tag_id AS tagId, t.material_code AS materialCode,
          t.remaining_qty AS remainingQty, t.status,
          coalesce((SELECT sum(sp.picked_qty - sp.dispatched_qty) FROM stock_picks sp
            WHERE sp.stock_tag_id = t.id AND sp.status IN ('staged', 'partial')), 0) AS stagedQty,
          coalesce((SELECT sum(a.qty) FROM stock_allocations a
            WHERE a.stock_tag_id = t.id AND a.status = 'reserved'), 0) AS legacyReservedQty
        FROM stock_tags t WHERE t.tag_id = ?1 LIMIT 1
      `).bind(tagId).first<Record<string, unknown>>();
      if (!tag || tag.status !== "in_stock") return Response.json({ error: "KIT Stock Tag นี้ไม่พร้อมเบิกจาก Stock" }, { status: 409 });
      if (tag.materialCode !== replacement.materialCode) return Response.json({ error: "Part ใน Tag ไม่ตรงกับใบขอเบิก" }, { status: 409 });
      const availableQty = Math.max(Number(tag.remainingQty) - Number(tag.stagedQty) - Number(tag.legacyReservedQty), 0);
      if (qty > availableQty) return Response.json({ error: `Tag นี้พร้อมเบิกเพียง ${availableQty.toLocaleString("th-TH")} ชิ้น` }, { status: 409 });
      const noticeNo = `RPL-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase()}`;
      // ทำทั้งชุดแบบ atomic ใน transaction เดียว: INSERT ใบเบิกต้องมาก่อน และดึง
      // stock_tag_id จาก subquery ที่คืนค่าเฉพาะเมื่อเงื่อนไข "ยังจริงในฐาน ณ ตอนนี้"
      // ครบทั้งสองข้อ — Tag ยัง in_stock และมีของว่างพอ (หักงานที่จัด/จองแล้ว) และ
      // ใบขอยังเบิกได้พอ ถ้าข้อใดพลาด subquery คืน NULL ชน NOT NULL ทำให้ D1 rollback
      let results;
      try {
        results = await DB.batch([
          DB.prepare(`
            INSERT INTO replacement_issues
              (request_id, stock_tag_id, stock_tag_code, qty, notice_no, issued_by_name, issued_by_code)
            VALUES (
              ?1,
              (SELECT t.id FROM stock_tags t
                WHERE t.id = ?2 AND t.status = 'in_stock'
                  AND t.remaining_qty
                      - coalesce((SELECT sum(sp.picked_qty - sp.dispatched_qty) FROM stock_picks sp
                          WHERE sp.stock_tag_id = t.id AND sp.status IN ('staged', 'partial')), 0)
                      - coalesce((SELECT sum(al.qty) FROM stock_allocations al
                          WHERE al.stock_tag_id = t.id AND al.status = 'reserved'), 0) >= ?4
                  AND EXISTS (SELECT 1 FROM replacement_requests r
                    WHERE r.id = ?1 AND r.status IN ('pending', 'partial')
                      AND r.requested_qty - r.issued_qty >= ?4)
                LIMIT 1),
              ?3, ?4, ?5, ?6, ?7
            )
          `).bind(requestId, Number(tag.id), String(tag.tagId), qty, noticeNo, user.displayName, user.employeeCode),
          DB.prepare(`
            UPDATE stock_tags SET remaining_qty = remaining_qty - ?1,
              status = CASE WHEN remaining_qty - ?1 <= 0 THEN 'depleted' ELSE status END
            WHERE id = ?2 AND status = 'in_stock' AND remaining_qty >= ?1
          `).bind(qty, Number(tag.id)),
          DB.prepare(`
            UPDATE replacement_requests SET issued_qty = issued_qty + ?1,
              status = CASE WHEN issued_qty + ?1 >= requested_qty THEN 'completed' ELSE 'partial' END,
              completed_at = CASE WHEN issued_qty + ?1 >= requested_qty THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id = ?2 AND status IN ('pending', 'partial')
          `).bind(qty, requestId),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/NOT NULL|UNIQUE|constraint/i.test(message)) {
          return Response.json({
            error: "ยอด Stock หรือใบขอเบิกมีการเปลี่ยนแปลงจากอีกเครื่อง หรือ Tag ถูกเบิกไปแล้ว กรุณารีเฟรชและสแกนใหม่",
          }, { status: 409 });
        }
        throw error;
      }
      if (Number(results[1].meta.changes || 0) !== 1 || Number(results[2].meta.changes || 0) !== 1) {
        throw new Error("ข้อมูล Stock หรือใบขอเบิกมีการเปลี่ยนแปลง กรุณาสแกนใหม่");
      }
      const issueId = Number(results[0].meta.last_row_id);
      const issue = await DB.prepare(`
        SELECT i.id, i.request_id AS requestId, i.stock_tag_id AS stockTagId,
          i.stock_tag_code AS stockTagCode, i.qty, i.notice_no AS noticeNo,
          i.issued_by_name AS issuedByName, i.issued_by_code AS issuedByCode,
          i.issued_at AS issuedAt, t.job_no AS jobNo, t.production_date AS productionDate
        FROM replacement_issues i LEFT JOIN stock_tags t ON t.id = i.stock_tag_id
        WHERE i.id = ?1 LIMIT 1
      `).bind(issueId).first();
      await writeAuditLog(user, {
        module: "replacement", moduleLabel: "เบิกงานทดแทน", action: "issue_replacement", actionLabel: "เบิก Tag งานทดแทน",
        entityType: "replacement_issue", entityId: noticeNo,
        summary: `เบิก Tag ${String(tag.tagId)} จำนวน ${qty} ชิ้น ให้ใบขอ ${String(replacement.requestNo || requestId)}`,
        details: { requestId, requestNo: replacement.requestNo, stockTagCode: tag.tagId, materialCode: tag.materialCode, qty, noticeNo },
      }, request);
      return Response.json({ action: "issued", request: await requestRow(requestId), issue }, { status: 201 });
    }

    if (action === "mark_printed") {
      const issueId = Number(body.issueId || 0);
      if (!Number.isInteger(issueId) || issueId <= 0) return Response.json({ error: "ไม่พบรายการที่จะพิมพ์" }, { status: 400 });
      const result = await DB.prepare(`
        UPDATE replacement_issues SET printed_by_name = ?1, printed_by_code = ?2,
          printed_at = CURRENT_TIMESTAMP WHERE id = ?3
      `).bind(user.displayName, user.employeeCode, issueId).run();
      if (!result.meta.changes) return Response.json({ error: "ไม่พบรายการที่จะพิมพ์" }, { status: 404 });
      await writeAuditLog(user, {
        module: "replacement", moduleLabel: "เบิกงานทดแทน", action: "print_replacement_notice", actionLabel: "พิมพ์ใบเบิกงานทดแทน",
        entityType: "replacement_issue", entityId: issueId, summary: `พิมพ์ใบเบิกงานทดแทนรายการ #${issueId}`,
      }, request);
      return Response.json({ success: true });
    }

    if (action === "cancel") {
      if (!canRequest(user)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ยกเลิกใบขอ" }, { status: 403 });
      const requestId = Number(body.requestId || 0);
      const replacement = await requestRow(requestId) as Record<string, unknown> | null;
      if (!replacement) return Response.json({ error: "ไม่พบใบขอเบิก" }, { status: 404 });
      if (Number(replacement.issuedQty || 0) > 0) return Response.json({ error: "ใบขอนี้เริ่มเบิกแล้ว จึงยกเลิกไม่ได้" }, { status: 409 });
      await DB.prepare("UPDATE replacement_requests SET status = 'cancelled' WHERE id = ?1 AND status = 'pending'").bind(requestId).run();
      await writeAuditLog(user, {
        module: "replacement", moduleLabel: "เบิกงานทดแทน", action: "cancel_replacement", actionLabel: "ยกเลิกใบขอเบิกงานทดแทน",
        entityType: "replacement_request", entityId: String(replacement.requestNo || requestId),
        summary: `ยกเลิกใบขอ ${String(replacement.requestNo || requestId)} · ${String(replacement.materialCode || "")}`,
        before: replacement, after: { ...replacement, status: "cancelled" },
      }, request);
      return Response.json({ success: true, request: await requestRow(requestId) });
    }

    return Response.json({ error: "ไม่รู้จักคำสั่งงานทดแทน" }, { status: 400 });
  } catch (error) {
    console.error("replacements POST failed", error);
    const raw = error instanceof Error ? error.message : "";
    const safeMessage = raw && !/D1_|SQLITE|no such|constraint|syntax error|UNIQUE|NOT NULL/i.test(raw)
      ? raw : "บันทึกงานทดแทนไม่สำเร็จ";
    return Response.json({ error: safeMessage }, { status: 500 });
  }
}
