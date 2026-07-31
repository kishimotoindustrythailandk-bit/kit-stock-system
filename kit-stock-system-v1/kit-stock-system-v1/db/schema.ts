import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const partImages = sqliteTable("part_images", {
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
