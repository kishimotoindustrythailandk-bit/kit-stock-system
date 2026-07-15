import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeCode: text("employee_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("viewer"),
  pinHash: text("pin_hash").notNull(),
  pinSalt: text("pin_salt").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  mustChangePin: integer("must_change_pin", { mode: "boolean" }).notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const employeeSessions = sqliteTable("employee_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionHash: text("session_hash").notNull().unique(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
