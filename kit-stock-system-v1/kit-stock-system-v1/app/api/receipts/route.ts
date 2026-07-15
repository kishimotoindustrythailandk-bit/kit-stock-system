import { eq, sql } from "drizzle-orm";
import { getEmployeeUser, hasRole } from "../../employee-auth";
import { getDb } from "../../../db";
import { boxScans, receipts, workOrders } from "../../../db/schema";

export async function POST(request: Request) {
  try {
    const user = await getEmployeeUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasRole(user, ["receiver"])) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์รับงาน" }, { status: 403 });
    const payload = await request.json() as { orderNo?: string; note?: string };
    const orderNo = payload.orderNo?.trim().toUpperCase() ?? "";
    const db = getDb();
    const [order] = await db.select().from(workOrders).where(eq(workOrders.orderNo, orderNo)).limit(1);
    if (!order) return Response.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
    const existing = await db.select().from(receipts).where(eq(receipts.workOrderId, order.id)).limit(1);
    if (existing.length) return Response.json({ error: "ใบงานนี้มีผู้รับงานแล้ว" }, { status: 409 });
    const [sumRow] = await db.select({ total: sql<number>`coalesce(sum(${boxScans.actualQty}), 0)` })
      .from(boxScans).where(eq(boxScans.workOrderId, order.id));
    const total = Number(sumRow?.total ?? 0);
    if (total !== order.targetQty) {
      return Response.json({ error: `ยังรับงานไม่ได้ ตรวจแล้ว ${total}/${order.targetQty} ชิ้น` }, { status: 422 });
    }
    const [receipt] = await db.insert(receipts).values({
      workOrderId: order.id,
      receiverName: user.fullName,
      receiverEmail: user.employeeCode,
      note: payload.note?.trim() || "",
    }).returning();
    return Response.json({ receipt }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ยืนยันรับงานไม่สำเร็จ" }, { status: 500 });
  }
}
