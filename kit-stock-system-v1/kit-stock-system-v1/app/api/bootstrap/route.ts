import { asc, desc, eq } from "drizzle-orm";
import { getEmployeeUser } from "../../employee-auth";
import { getDb } from "../../../db";
import { boxScans, parts, receipts, workOrders } from "../../../db/schema";

async function seedDemoData() {
  const db = getDb();
  const demoParts = [
    { partNo: "KIT-00125", partName: "BRACKET FRONT", standardQty: 100, containerType: "บ๊อค", customer: "KISHIMOTO INDUSTRY" },
    { partNo: "KIT-00482", partName: "RETAINER PLATE", standardQty: 80, containerType: "บ๊อค", customer: "KISHIMOTO INDUSTRY" },
    { partNo: "KIT-00714", partName: "FRAME SUPPORT", standardQty: 40, containerType: "แร็ค", customer: "KISHIMOTO INDUSTRY" },
  ];

  for (const part of demoParts) {
    await db.insert(parts).values(part).onConflictDoNothing();
  }

  const savedParts = await db.select().from(parts);
  const partId = (partNo: string) => savedParts.find((part) => part.partNo === partNo)?.id;
  const demoOrders = [
    { orderNo: "WO-260714-018", partNo: "KIT-00125", lotNo: "LOT-140726-01", targetQty: 1250, customer: "KISHIMOTO INDUSTRY", deliveryDate: "2026-07-14", deliveryTime: "18:30", senderName: "ฝ่ายผลิต A", standardQty: 100 },
    { orderNo: "WO-260714-019", partNo: "KIT-00482", lotNo: "LOT-140726-02", targetQty: 640, customer: "KISHIMOTO INDUSTRY", deliveryDate: "2026-07-14", deliveryTime: "19:00", senderName: "ฝ่ายผลิต B", standardQty: 80 },
    { orderNo: "WO-260714-020", partNo: "KIT-00714", lotNo: "LOT-140726-03", targetQty: 400, customer: "KISHIMOTO INDUSTRY", deliveryDate: "2026-07-15", deliveryTime: "08:00", senderName: "ฝ่ายผลิต A", standardQty: 40 },
  ];

  for (const order of demoOrders) {
    const id = partId(order.partNo);
    if (!id) continue;
    const packing = {
      customer: order.customer,
      deliveryDate: order.deliveryDate,
      deliveryTime: order.deliveryTime,
      senderName: order.senderName,
      packingStandard: order.standardQty,
      packingCount: order.standardQty,
      fullPackingQty: Math.floor(order.targetQty / order.standardQty),
      partialQty: order.targetQty % order.standardQty,
      totalPackingQty: Math.ceil(order.targetQty / order.standardQty),
    };
    await db.insert(workOrders).values({
      orderNo: order.orderNo,
      partId: id,
      lotNo: order.lotNo,
      targetQty: order.targetQty,
      ...packing,
    }).onConflictDoNothing();
    await db.update(workOrders).set(packing).where(eq(workOrders.orderNo, order.orderNo));
  }
}

export async function GET() {
  try {
    const user = await getEmployeeUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    await seedDemoData();
    const db = getDb();
    const partRows = await db.select().from(parts).orderBy(asc(parts.partNo));
    const orderRows = await db
      .select({
        id: workOrders.id,
        orderNo: workOrders.orderNo,
        lotNo: workOrders.lotNo,
        targetQty: workOrders.targetQty,
        status: workOrders.status,
        createdAt: workOrders.createdAt,
        partId: parts.id,
        partNo: parts.partNo,
        partName: parts.partName,
        standardQty: parts.standardQty,
        containerType: parts.containerType,
        customer: workOrders.customer,
        deliveryDate: workOrders.deliveryDate,
        deliveryTime: workOrders.deliveryTime,
        senderName: workOrders.senderName,
        packingStandard: workOrders.packingStandard,
        packingCount: workOrders.packingCount,
        fullPackingQty: workOrders.fullPackingQty,
        partialQty: workOrders.partialQty,
        totalPackingQty: workOrders.totalPackingQty,
        imageKey: parts.imageKey,
      })
      .from(workOrders)
      .innerJoin(parts, eq(workOrders.partId, parts.id))
      .orderBy(desc(workOrders.createdAt), desc(workOrders.id));
    const scanRows = await db
      .select({
        id: boxScans.id,
        workOrderId: boxScans.workOrderId,
        tagId: boxScans.tagId,
        boxType: boxScans.boxType,
        actualQty: boxScans.actualQty,
        inspectorName: boxScans.inspectorName,
        createdAt: boxScans.createdAt,
        photoKey: boxScans.photoKey,
        orderNo: workOrders.orderNo,
        partNo: parts.partNo,
      })
      .from(boxScans)
      .innerJoin(workOrders, eq(boxScans.workOrderId, workOrders.id))
      .innerJoin(parts, eq(workOrders.partId, parts.id))
      .orderBy(desc(boxScans.id))
      .limit(100);
    const receiptRows = await db
      .select({
        id: receipts.id,
        workOrderId: receipts.workOrderId,
        receiverName: receipts.receiverName,
        receiverEmail: receipts.receiverEmail,
        note: receipts.note,
        receivedAt: receipts.receivedAt,
        orderNo: workOrders.orderNo,
      })
      .from(receipts)
      .innerJoin(workOrders, eq(receipts.workOrderId, workOrders.id))
      .orderBy(desc(receipts.id));

    return Response.json({
      user: { displayName: user.fullName, employeeCode: user.employeeCode, role: user.role },
      parts: partRows.map((part) => ({
        ...part,
        imageUrl: part.imageKey ? `/api/photos?key=${encodeURIComponent(part.imageKey)}` : "",
      })),
      orders: orderRows.map((order) => ({
        ...order,
        imageUrl: order.imageKey ? `/api/photos?key=${encodeURIComponent(order.imageKey)}` : "",
      })),
      scans: scanRows.map((scan) => ({
        ...scan,
        photoUrl: `/api/photos?key=${encodeURIComponent(scan.photoKey)}`,
      })),
      receipts: receiptRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลได้";
    return Response.json({ error: message }, { status: 500 });
  }
}
