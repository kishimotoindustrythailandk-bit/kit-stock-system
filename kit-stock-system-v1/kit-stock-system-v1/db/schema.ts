import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const parts = sqliteTable("parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partNo: text("part_no").notNull().unique(),
  partName: text("part_name").notNull(),
  standardQty: integer("standard_qty").notNull(),
  containerType: text("container_type").notNull().default("บ๊อค"),
  customer: text("customer").notNull().default(""),
  imageKey: text("image_key"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workOrders = sqliteTable("work_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(),
  partId: integer("part_id").notNull().references(() => parts.id),
  lotNo: text("lot_no").notNull(),
  targetQty: integer("target_qty").notNull(),
  customer: text("customer").notNull().default(""),
  deliveryDate: text("delivery_date").notNull().default(""),
  deliveryTime: text("delivery_time").notNull().default(""),
  senderName: text("sender_name").notNull().default(""),
  packingStandard: integer("packing_standard").notNull().default(0),
  packingCount: integer("packing_count").notNull().default(0),
  fullPackingQty: integer("full_packing_qty").notNull().default(0),
  partialQty: integer("partial_qty").notNull().default(0),
  totalPackingQty: integer("total_packing_qty").notNull().default(0),
  status: text("status").notNull().default("in_progress"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const boxScans = sqliteTable("box_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id),
  tagId: text("tag_id").notNull().unique(),
  boxType: text("box_type").notNull(),
  actualQty: integer("actual_qty").notNull(),
  photoKey: text("photo_key").notNull(),
  photoName: text("photo_name").notNull(),
  photoType: text("photo_type").notNull(),
  inspectorName: text("inspector_name").notNull(),
  inspectorEmail: text("inspector_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id).unique(),
  receiverName: text("receiver_name").notNull(),
  receiverEmail: text("receiver_email").notNull(),
  note: text("note").notNull().default(""),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deliveryImports = sqliteTable("delivery_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importToken: text("import_token").notNull().unique(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  totalQty: integer("total_qty").notNull(),
  importedByName: text("imported_by_name").notNull(),
  importedByEmail: text("imported_by_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deliveryDueLines = sqliteTable("delivery_due_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => deliveryImports.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull().unique(),
  doNo: text("do_no").notNull(),
  seq: integer("seq").notNull(),
  materialCode: text("material_code").notNull(),
  materialDescription: text("material_description").notNull().default(""),
  site: text("site").notNull().default(""),
  fact: text("fact").notNull(),
  line: text("line").notNull().default(""),
  shop: text("shop").notNull().default(""),
  reqQty: integer("req_qty").notNull(),
  deliveryDate: text("delivery_date").notNull(),
  deliveryTime: text("delivery_time").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deliveryTagScans = sqliteTable("delivery_tag_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dueLineId: integer("due_line_id").notNull().references(() => deliveryDueLines.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().unique(),
  rawPayload: text("raw_payload").notNull(),
  qty: integer("qty").notNull(),
  unit: text("unit").notNull().default("PC"),
  location: text("location").notNull().default(""),
  scannedByName: text("scanned_by_name").notNull(),
  scannedByEmail: text("scanned_by_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deliveryTagReceipts = sqliteTable("delivery_tag_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dueLineId: integer("due_line_id").notNull().references(() => deliveryDueLines.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().unique(),
  rawPayload: text("raw_payload").notNull(),
  qty: integer("qty").notNull(),
  unit: text("unit").notNull().default("PC"),
  location: text("location").notNull().default(""),
  receivedByName: text("received_by_name").notNull(),
  receivedByCode: text("received_by_code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const forecastImports = sqliteTable("forecast_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importToken: text("import_token").notNull().unique(),
  fileName: text("file_name").notNull(),
  sourceCalculatedAt: text("source_calculated_at").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  materialCount: integer("material_count").notNull().default(0),
  totalQty: integer("total_qty").notNull().default(0),
  status: text("status").notNull().default("uploading"),
  importedByName: text("imported_by_name").notNull(),
  importedByCode: text("imported_by_code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  activatedAt: text("activated_at"),
});

export const forecastLines = sqliteTable("forecast_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => forecastImports.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(),
  materialCode: text("material_code").notNull(),
  description: text("description").notNull().default(""),
  deliveryDate: text("delivery_date").notNull(),
  deliveryTime: text("delivery_time").notNull(),
  prodQty: integer("prod_qty").notNull(),
  deliverySpot: text("delivery_spot").notNull().default(""),
  factory: text("factory").notNull().default(""),
  shop: text("shop").notNull().default(""),
  line: text("line").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  importSourceKey: uniqueIndex("idx_forecast_lines_import_source").on(table.importId, table.sourceKey),
  importMaterialDate: index("idx_forecast_lines_import_material_date").on(table.importId, table.materialCode, table.deliveryDate, table.deliveryTime),
}));

export const materialSuppliers = sqliteTable("material_suppliers", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  labelFormat: text("label_format").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const materialLots = sqliteTable("material_lots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptNo: text("receipt_no").notNull().unique(),
  supplierCode: text("supplier_code").notNull().references(() => materialSuppliers.code),
  barcodeValue: text("barcode_value").notNull(),
  packNo: text("pack_no").notNull().default(""),
  materialCode: text("material_code").notNull(),
  description: text("description").notNull().default(""),
  spec: text("spec").notNull().default(""),
  size: text("size").notNull().default(""),
  lotNo: text("lot_no").notNull().default(""),
  coilNo: text("coil_no").notNull().default(""),
  originalQty: integer("original_qty").notNull().default(0),
  remainingQty: integer("remaining_qty").notNull().default(0),
  unit: text("unit").notNull().default("SHEET"),
  originalWeightKg: real("original_weight_kg").notNull().default(0),
  remainingWeightKg: real("remaining_weight_kg").notNull().default(0),
  supplierDate: text("supplier_date").notNull().default(""),
  receivedDate: text("received_date").notNull(),
  location: text("location").notNull().default(""),
  status: text("status").notNull().default("in_stock"),
  rawPayload: text("raw_payload").notNull(),
  receivedByName: text("received_by_name").notNull(),
  receivedByCode: text("received_by_code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  supplierBarcode: uniqueIndex("idx_material_lots_supplier_barcode").on(table.supplierCode, table.barcodeValue),
  materialStatus: index("idx_material_lots_material_status").on(table.materialCode, table.status),
}));

export const materialTransactions = sqliteTable("material_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionNo: text("transaction_no").notNull().unique(),
  lotId: integer("lot_id").notNull().references(() => materialLots.id, { onDelete: "restrict" }),
  type: text("type").notNull(),
  qty: integer("qty").notNull().default(0),
  weightKg: real("weight_kg").notNull().default(0),
  qtyBalanceAfter: integer("qty_balance_after").notNull().default(0),
  weightBalanceAfter: real("weight_balance_after").notNull().default(0),
  jobNo: text("job_no").notNull().default(""),
  department: text("department").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  note: text("note").notNull().default(""),
  actorName: text("actor_name").notNull(),
  actorCode: text("actor_code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const partImages = sqliteTable("part_images", {
  materialCode: text("material_code").primaryKey(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull().default(""),
  contentType: text("content_type").notNull().default("image/jpeg"),
  updatedByName: text("updated_by_name").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const partActualImages = sqliteTable("part_actual_images", {
  materialCode: text("material_code").primaryKey(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull().default(""),
  contentType: text("content_type").notNull().default("image/jpeg"),
  updatedByName: text("updated_by_name").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stockParts = sqliteTable("stock_parts", {
  materialCode: text("material_code").primaryKey(),
  partName: text("part_name").notNull().default(""),
  customer: text("customer").notNull().default(""),
  standardQty: integer("standard_qty").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // เพิ่มด้วย migration 0018 เดิมคอลัมน์นี้เกิดจาก ALTER TABLE ใน route handler
  // จึงไม่มีอยู่ใน schema นี้เลย ทั้งที่โค้ดอ่านและเขียนมันอยู่ตลอด
  location: text("location").notNull().default(""),
});

export const stockTags = sqliteTable("stock_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tagId: text("tag_id").notNull().unique(),
  materialCode: text("material_code").notNull().references(() => stockParts.materialCode),
  qty: integer("qty").notNull(),
  remainingQty: integer("remaining_qty").notNull(),
  jobNo: text("job_no").notNull(),
  productionDate: text("production_date").notNull(),
  status: text("status").notNull().default("printed"),
  printedByName: text("printed_by_name").notNull(),
  receivedByName: text("received_by_name").notNull().default(""),
  receivedByCode: text("received_by_code").notNull().default(""),
  receivedAt: text("received_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stockAllocations = sqliteTable("stock_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerTagId: text("customer_tag_id").notNull(),
  stockTagId: integer("stock_tag_id").notNull().references(() => stockTags.id, { onDelete: "restrict" }),
  dueLineId: integer("due_line_id").notNull().references(() => deliveryDueLines.id, { onDelete: "cascade" }),
  qty: integer("qty").notNull(),
  status: text("status").notNull().default("reserved"),
  reservedByName: text("reserved_by_name").notNull(),
  reservedAt: text("reserved_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  dispatchedByName: text("dispatched_by_name").notNull().default(""),
  dispatchedAt: text("dispatched_at"),
});

export const stockPicks = sqliteTable("stock_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dueLineId: integer("due_line_id").notNull().references(() => deliveryDueLines.id, { onDelete: "cascade" }),
  stockTagId: integer("stock_tag_id").notNull().references(() => stockTags.id, { onDelete: "restrict" }),
  pickedQty: integer("picked_qty").notNull(),
  dispatchedQty: integer("dispatched_qty").notNull().default(0),
  status: text("status").notNull().default("staged"),
  pickedByName: text("picked_by_name").notNull(),
  pickedByCode: text("picked_by_code").notNull(),
  pickedAt: text("picked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stockDispatchLinks = sqliteTable("stock_dispatch_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerTagId: text("customer_tag_id").notNull(),
  pickId: integer("pick_id").notNull().references(() => stockPicks.id, { onDelete: "cascade" }),
  dueLineId: integer("due_line_id").notNull().references(() => deliveryDueLines.id, { onDelete: "cascade" }),
  stockTagId: integer("stock_tag_id").notNull().references(() => stockTags.id, { onDelete: "restrict" }),
  qty: integer("qty").notNull(),
  dispatchedByName: text("dispatched_by_name").notNull(),
  dispatchedByCode: text("dispatched_by_code").notNull(),
  dispatchedAt: text("dispatched_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * ยอดที่รับเข้าจริงและยอด NG ของแต่ละ Tag ตอนสแกนรับเข้า Stock
 *
 * เดิมตารางนี้ไม่มีทั้งใน schema และใน migrations ถูกสร้างจาก CREATE TABLE
 * ที่ฝังใน app/api/stock/route.ts เท่านั้น ตอนนี้ย้ายมาเป็น migration 0017
 *
 * ยังไม่ประกาศ references() ไป stockTags เพราะฐาน production ไม่มี FK ตัวนี้
 * (ตารางถูกสร้างโดยโค้ดที่ไม่ได้ใส่ FK ไว้) ถ้าประกาศที่นี่จะทำให้ schema
 * ในรีโปไม่ตรงกับฐานจริง
 */
export const stockReceiptAdjustments = sqliteTable("stock_receipt_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stockTagId: integer("stock_tag_id").notNull(),
  tagId: text("tag_id").notNull(),
  originalQty: integer("original_qty").notNull(),
  receivedQty: integer("received_qty").notNull(),
  ngQty: integer("ng_qty").notNull(),
  receivedByName: text("received_by_name").notNull(),
  receivedByCode: text("received_by_code").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_stock_receipt_adjustments_tag").on(table.stockTagId, table.id),
]);

/**
 * บันทึกการปิดรับเข้า Job แล้วตัด Tag ที่ยังค้างเป็น NG
 *
 * เดิมสร้างจาก CREATE TABLE ที่ฝังใน route handler เช่นเดียวกัน
 * ย้ายมาเป็น migration 0017 พร้อม index ที่ฐาน production ยังไม่มี
 */
export const stockJobClosures = sqliteTable("stock_job_closures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNo: text("job_no").notNull(),
  materialCode: text("material_code").notNull(),
  totalQty: integer("total_qty").notNull(),
  receivedQty: integer("received_qty").notNull(),
  ngQty: integer("ng_qty").notNull(),
  ngTagCount: integer("ng_tag_count").notNull(),
  reason: text("reason").notNull().default(""),
  closedByName: text("closed_by_name").notNull(),
  closedByCode: text("closed_by_code").notNull(),
  closedAt: text("closed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_stock_job_closures_job_material").on(table.jobNo, table.materialCode, table.id),
]);

export const appUsers = sqliteTable("app_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeCode: text("employee_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().default(""),
  role: text("role").notNull().default("staff"),
  pinHash: text("pin_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appSessions = sqliteTable("app_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appUserPermissions = sqliteTable("app_user_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("app_user_permissions_user_key_unique").on(table.userId, table.permissionKey),
]);


export const replacementRequests = sqliteTable("replacement_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestNo: text("request_no").notNull().unique(),
  materialCode: text("material_code").notNull(),
  partName: text("part_name").notNull().default(""),
  customer: text("customer").notNull().default(""),
  requestedQty: integer("requested_qty").notNull(),
  issuedQty: integer("issued_qty").notNull().default(0),
  reasonType: text("reason_type").notNull().default("shortage"),
  reasonDetail: text("reason_detail").notNull().default(""),
  neededDate: text("needed_date").notNull().default(""),
  status: text("status").notNull().default("pending"),
  requestedByName: text("requested_by_name").notNull(),
  requestedByCode: text("requested_by_code").notNull(),
  requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const replacementIssues = sqliteTable("replacement_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id").notNull().references(() => replacementRequests.id, { onDelete: "restrict" }),
  stockTagId: integer("stock_tag_id").notNull().references(() => stockTags.id, { onDelete: "restrict" }),
  stockTagCode: text("stock_tag_code").notNull(),
  qty: integer("qty").notNull(),
  noticeNo: text("notice_no").notNull(),
  issuedByName: text("issued_by_name").notNull(),
  issuedByCode: text("issued_by_code").notNull(),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  printedByName: text("printed_by_name").notNull().default(""),
  printedByCode: text("printed_by_code").notNull().default(""),
  printedAt: text("printed_at"),
});


export const stockManualReceipts = sqliteTable("stock_manual_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stockTagId: integer("stock_tag_id").notNull().references(() => stockTags.id, { onDelete: "restrict" }),
  tagId: text("tag_id").notNull(),
  materialCode: text("material_code").notNull().references(() => stockParts.materialCode, { onDelete: "restrict" }),
  qty: integer("qty").notNull(),
  jobNo: text("job_no").notNull(),
  productionDate: text("production_date").notNull(),
  referenceNo: text("reference_no").notNull().default(""),
  note: text("note").notNull().default(""),
  receivedByName: text("received_by_name").notNull(),
  receivedByCode: text("received_by_code").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_stock_manual_receipts_material_date").on(table.materialCode, table.receivedAt),
]);

export const stockCountAdjustments = sqliteTable("stock_count_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adjustmentNo: text("adjustment_no").notNull().unique(),
  countDate: text("count_date").notNull(),
  materialCode: text("material_code").notNull().references(() => stockParts.materialCode, { onDelete: "restrict" }),
  systemQty: integer("system_qty").notNull(),
  countedQty: integer("counted_qty").notNull(),
  difference: integer("difference").notNull(),
  reason: text("reason").notNull(),
  adjustedByName: text("adjusted_by_name").notNull(),
  adjustedByCode: text("adjusted_by_code").notNull(),
  adjustedAt: text("adjusted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_stock_count_adjustments_material_date").on(table.materialCode, table.countDate, table.id),
]);

export const stockCountAdjustmentLines = sqliteTable("stock_count_adjustment_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adjustmentId: integer("adjustment_id").notNull().references(() => stockCountAdjustments.id, { onDelete: "cascade" }),
  stockTagId: integer("stock_tag_id").notNull().references(() => stockTags.id, { onDelete: "restrict" }),
  stockTagCode: text("stock_tag_code").notNull(),
  qtyChange: integer("qty_change").notNull(),
  beforeQty: integer("before_qty").notNull(),
  afterQty: integer("after_qty").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_stock_count_adjustment_lines_adjustment").on(table.adjustmentId, table.id),
]);
