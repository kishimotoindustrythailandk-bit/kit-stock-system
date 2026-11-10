import { getCurrentUser } from "../../../cloudflare-auth";
import { getRuntimeEnv } from "../../../../runtime/env";

type TableRow = { name: string };
type ForeignKeyRow = { table: string };

const CONFIRMATION = "RESET KIT STOCK";
const PRESERVED_TABLES = new Set([
  "app_users",
  "app_user_permissions",
  "stock_parts",
  "parts",
  "part_images",
  "part_actual_images",
  "part_master_images",
  "d1_migrations",
]);

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function isPreservedTable(name: string) {
  return PRESERVED_TABLES.has(name)
    || name.startsWith("sqlite_")
    || name.startsWith("_cf_")
    || name.toLowerCase().includes("migration");
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: Response.json({ error: "เฉพาะ Admin เท่านั้นที่ล้างข้อมูลระบบได้" }, { status: 403 }) };
  }
  return { user };
}

async function listTables(db: D1Database) {
  const rows = await db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all<TableRow>();
  return rows.results.map((row) => row.name);
}

async function deletionOrder(db: D1Database, tables: string[]) {
  const deletable = new Set(tables);
  const children = new Map<string, Set<string>>();
  for (const child of tables) {
    const foreignKeys = await db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(child)})`).all<ForeignKeyRow>();
    for (const item of foreignKeys.results) {
      if (!deletable.has(item.table)) continue;
      const list = children.get(item.table) || new Set<string>();
      list.add(child);
      children.set(item.table, list);
    }
  }

  const ordered: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (table: string) => {
    if (state.get(table) === "done") return;
    if (state.get(table) === "visiting") return;
    state.set(table, "visiting");
    for (const child of children.get(table) || []) visit(child);
    state.set(table, "done");
    ordered.push(table);
  };
  for (const table of tables) visit(table);
  return ordered;
}

function resetPage() {
  return `<!doctype html>
  <html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ล้างข้อมูล KIT Stock</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eef5ff;color:#13315d;font-family:Arial,"Noto Sans Thai",sans-serif}.wrap{max-width:720px;margin:48px auto;padding:20px}.card{padding:30px;border:1px solid #cfe0f5;border-radius:22px;background:#fff;box-shadow:0 16px 45px #174a8720}h1{margin:0 0 12px;color:#bb1832}.warning{padding:16px;border-radius:14px;background:#fff1f3;color:#8f1730;line-height:1.7}.keep{margin:18px 0;padding:15px;border-radius:14px;background:#eaf7ef;color:#17673b;line-height:1.7}label{display:block;margin:18px 0 7px;font-weight:800}input{width:100%;padding:13px;border:1px solid #b8cde7;border-radius:10px;font-size:16px}button{width:100%;margin-top:14px;padding:14px;border:0;border-radius:11px;background:#c92740;color:#fff;font-size:16px;font-weight:900;cursor:pointer}button:disabled{opacity:.55}#result{margin-top:17px;padding:14px;border-radius:12px;background:#f2f6fb;white-space:pre-wrap;line-height:1.6}.small{color:#6d8099;font-size:12px}</style></head>
  <body><main class="wrap"><section class="card"><h1>ล้างข้อมูล KIT Stock</h1>
  <div class="warning"><b>ข้อมูลที่จะถูกล้าง:</b> ยอด Stock, Tag, Job, Due, Forecast, การจัดงาน, การขายออก, งานทดแทน, ประวัติ และ Session ทั้งหมด</div>
  <div class="keep"><b>ข้อมูลที่จะเก็บ:</b> ผู้ใช้งาน รหัสผ่าน บทบาท สิทธิ์ ทะเบียน Part รูปภาพ Part และโครงสร้างฐานข้อมูล</div>
  <p class="small">D1 Time Travel เปิดใช้งานอัตโนมัติ ระบบจะแสดงเวลาสำหรับกู้คืนหลังดำเนินการ</p>
  <label for="confirm">พิมพ์ ${CONFIRMATION}</label><input id="confirm" autocomplete="off">
  <button id="reset">ยืนยันล้างข้อมูลทั้งหมด</button><div id="result">ยังไม่ได้ดำเนินการ</div>
  <script>const b=document.getElementById('reset'),i=document.getElementById('confirm'),r=document.getElementById('result');b.onclick=async()=>{if(i.value.trim()!=='${CONFIRMATION}'){r.textContent='ข้อความยืนยันไม่ถูกต้อง';return}b.disabled=true;r.textContent='กำลังล้างข้อมูล กรุณาอย่าปิดหน้านี้…';try{const x=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:i.value.trim()})});const j=await x.json();if(!x.ok)throw new Error(j.error||'ล้างข้อมูลไม่สำเร็จ');r.textContent='ล้างข้อมูลสำเร็จ\nผู้ใช้ที่เก็บไว้: '+j.users+' คน\nสิทธิ์ที่เก็บไว้: '+j.permissions+' รายการ\nตารางข้อมูลที่ล้าง: '+j.clearedTables.length+' ตาราง\nเวลากู้คืนก่อนล้าง: '+j.restoreTimestamp+'\n\nกรุณาเข้าสู่ระบบใหม่';i.value=''}catch(e){r.textContent='เกิดข้อผิดพลาด: '+e.message;b.disabled=false}};</script>
  </section></main></body></html>`;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  return new Response(resetPage(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ error: "คำขอมาจากเว็บไซต์อื่น" }, { status: 403 });
    }
    const body = await request.json() as { confirmation?: string };
    if (body.confirmation !== CONFIRMATION) {
      return Response.json({ error: "ข้อความยืนยันไม่ถูกต้อง" }, { status: 400 });
    }

    const { DB } = getRuntimeEnv();
    if (!DB) return Response.json({ error: "ไม่พบการเชื่อมต่อฐานข้อมูล D1" }, { status: 500 });
    const restoreTimestamp = new Date(Date.now() - 2_000).toISOString();
    const allTables = await listTables(DB);
    const targets = allTables.filter((name) => !isPreservedTable(name));
    const ordered = await deletionOrder(DB, targets);
    const statements = [
      DB.prepare("PRAGMA defer_foreign_keys = ON"),
      ...ordered.map((table) => DB.prepare(`DELETE FROM ${quoteIdentifier(table)}`)),
      DB.prepare(`DELETE FROM sqlite_sequence WHERE name NOT IN ('app_users','app_user_permissions','parts')`),
    ];
    await DB.batch(statements);

    const verification = await DB.batch([
      DB.prepare("SELECT count(*) AS count FROM app_users"),
      DB.prepare("SELECT count(*) AS count FROM app_user_permissions"),
      ...ordered.map((table) => DB.prepare(`SELECT count(*) AS count FROM ${quoteIdentifier(table)}`)),
    ]);
    const users = Number((verification[0].results?.[0] as { count?: number } | undefined)?.count || 0);
    const permissions = Number((verification[1].results?.[0] as { count?: number } | undefined)?.count || 0);
    const notEmpty = ordered.filter((_, index) => Number((verification[index + 2].results?.[0] as { count?: number } | undefined)?.count || 0) !== 0);
    if (notEmpty.length) {
      return Response.json({ error: `ยังมีข้อมูลคงเหลือในตาราง: ${notEmpty.join(", ")}` }, { status: 500 });
    }
    return Response.json({ ok: true, users, permissions, clearedTables: ordered, restoreTimestamp });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ล้างข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
