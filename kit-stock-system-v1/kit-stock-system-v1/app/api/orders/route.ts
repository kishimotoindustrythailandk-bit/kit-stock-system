import { eq } from "drizzle-orm";
import { getEmployeeUser, hasRole } from "../../employee-auth";
import { getDb } from "../../../db";
import { parts, workOrders } from "../../../db/schema";

export async function POST(request: Request) {
  try {
    const user = await getEmployeeUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasRole(user, ["sender"])) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์สร้างใบส่งงาน" }, { status: 403 });
    const payload = await request.json() as {
      orderNo?: string;
      partId?: number;
      lotNo?: string;
      targetQty?: number;
      customer?: string;
      deliveryDate?: string;
      deliveryTime?: string;
      senderName?: string;
    };
    const orderNo = payload.orderNo?.trim().toUpperCase() ?? "";
    const lotNo = payload.lotNo?.trim().toUpperCase() ?? "";
    const partId = Number(payload.partId);
    const targetQty = Number(payload.targetQty);
    if (!orderNo || !lotNo || !partId || !Number.isInteger(targetQty) || targetQty <= 0 || !payload.deliveryDate || !payload.deliveryTime || !payload.senderName?.trim()) {
      return Response.json({ error: "กรุณากรอกข้อมูลใบส่งงานให้ครบ" }, { status: 400 });
    }
    const db = getDb();
    const [part] = await db.select().from(parts).where(eq(parts.id, partId)).limit(1);
    if (!part) return Response.json({ error: "ไม่พบ Part ที่เลือก" }, { status: 404 });
    const exists = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.orderNo, orderNo)).limit(1);
    if (exists.length) return Response.json({ error: "Work Order นี้มีอยู่แล้ว" }, { status: 409 });
    const [order] = await db.insert(workOrders).values({
      orderNo,
      partId,
      lotNo,
      targetQty,
      customer: payload.customer?.trim() || part.customer,
      deliveryDate: payload.deliveryDate,
      deliveryTime: payload.deliveryTime,
      senderName: payload.senderName.trim(),
      packingStandard: part.standardQty,
      packingCount: part.standardQty,
      fullPackingQty: Math.floor(targetQty / part.standardQty),
      partialQty: targetQty % part.standardQty,
      totalPackingQty: Math.ceil(targetQty / part.standardQty),
    }).returning();
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สร้างใบส่งงานไม่สำเร็จ" }, { status: 500 });
  }
}
