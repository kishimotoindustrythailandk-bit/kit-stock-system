import { eq } from "drizzle-orm";
import { getCurrentUser } from "../../cloudflare-auth";
import { getDb } from "../../../db";
import { deliveryDueLines, deliveryImports } from "../../../db/schema";

type ImportRow = {
  sourceKey?: string;
  doNo?: string;
  seq?: number;
  materialCode?: string;
  materialDescription?: string;
  site?: string;
  fact?: string;
  line?: string;
  shop?: string;
  reqQty?: number;
  deliveryDate?: string;
  deliveryTime?: string;
};

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  let importId = 0;
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const payload = await request.json() as {
      importToken?: string;
      fileName?: string;
      rows?: ImportRow[];
    };
    const importToken = clean(payload.importToken, 240);
    const fileName = clean(payload.fileName, 200);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!importToken || !fileName || !rows.length) {
      return Response.json({ error: "ไม่พบข้อมูล Due ที่จะนำเข้า" }, { status: 400 });
    }
    if (rows.length > 2500) {
      return Response.json({ error: "ไฟล์มีรายการมากเกิน 2,500 รายการ" }, { status: 400 });
    }

    const normalized = rows.map((row, index) => {
      const seq = Number(row.seq);
      const reqQty = Number(row.reqQty);
      const item = {
        sourceKey: clean(row.sourceKey, 500),
        doNo: clean(row.doNo, 100).toUpperCase(),
        seq,
        materialCode: clean(row.materialCode, 100).toUpperCase(),
        materialDescription: clean(row.materialDescription, 240),
        site: clean(row.site, 60).toUpperCase(),
        fact: clean(row.fact, 60).toUpperCase(),
        line: clean(row.line, 80).toUpperCase(),
        shop: clean(row.shop, 120).toUpperCase(),
        reqQty,
        deliveryDate: clean(row.deliveryDate, 10),
        deliveryTime: clean(row.deliveryTime, 30),
      };
      if (!item.sourceKey || !item.doNo || !item.materialCode || !item.fact || !item.deliveryDate || !item.deliveryTime || !Number.isInteger(seq) || !Number.isInteger(reqQty) || reqQty <= 0) {
        throw new Error(`ข้อมูลแถวที่ ${index + 1} ไม่ครบหรือจำนวนไม่ถูกต้อง`);
      }
      return item;
    });

    const db = getDb();
    const duplicate = await db.select({ id: deliveryImports.id }).from(deliveryImports)
      .where(eq(deliveryImports.importToken, importToken)).limit(1);
    if (duplicate.length) {
      return Response.json({ error: "ไฟล์นี้ถูกนำเข้าแล้ว ระบบจึงไม่บันทึกซ้ำ" }, { status: 409 });
    }

    const totalQty = normalized.reduce((sum, row) => sum + row.reqQty, 0);
    const [created] = await db.insert(deliveryImports).values({
      importToken,
      fileName,
      rowCount: normalized.length,
      totalQty,
      importedByName: user.displayName,
      importedByEmail: user.email,
    }).returning();
    importId = created.id;

    for (let offset = 0; offset < normalized.length; offset += 80) {
      await db.insert(deliveryDueLines).values(
        normalized.slice(offset, offset + 80).map((row) => ({ ...row, importId })),
      );
    }

    return Response.json({ importId, rowCount: normalized.length, totalQty }, { status: 201 });
  } catch (error) {
    if (importId) {
      await getDb().delete(deliveryImports).where(eq(deliveryImports.id, importId)).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "นำเข้าไฟล์ไม่สำเร็จ";
    const duplicate = /unique|constraint/i.test(message);
    return Response.json({
      error: duplicate ? "มีรายการ Due นี้อยู่ในระบบแล้ว กรุณาตรวจสอบไฟล์ที่เคยนำเข้า" : message,
    }, { status: duplicate ? 409 : 500 });
  }
}
