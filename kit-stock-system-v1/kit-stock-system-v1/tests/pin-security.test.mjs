import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * เทสต์พฤติกรรมจริงของการแฮช PIN
 *
 * เทสต์ชุดเดิมในโปรเจกต์นี้เป็นการ grep หาข้อความในซอร์สทั้งหมด จึงจับบั๊กแบบ
 * "Pbkdf2 failed: iteration counts above 100000 are not supported" ไม่ได้เลย
 * บั๊กนั้นทำให้เมนูเพิ่มผู้ใช้งานและการเปลี่ยน PIN พังมาตลอดโดยไม่มีใครรู้
 */

const source = await readFile(new URL("../app/pin-security.ts", import.meta.url), "utf8");

test("จำนวนรอบ PBKDF2 ต้องไม่เกินเพดานของ Cloudflare Workers", () => {
  const match = source.match(/const MAX_ITERATIONS = ([\d_]+)/);
  assert.ok(match, "ต้องมีค่า MAX_ITERATIONS ประกาศไว้");
  const iterations = Number(match[1].replaceAll("_", ""));
  assert.ok(
    iterations <= 100_000,
    `Cloudflare Workers รองรับ PBKDF2 ไม่เกิน 100,000 รอบ แต่โค้ดตั้งไว้ ${iterations}`,
  );
  assert.ok(iterations >= 100_000, "อย่าลดจำนวนรอบต่ำกว่าเพดานโดยไม่จำเป็น");
});

test("แฮชหลอกใน login-throttle ต้องใช้จำนวนรอบเท่ากับของจริง", async () => {
  const throttle = await readFile(new URL("../app/login-throttle.ts", import.meta.url), "utf8");
  const dummy = throttle.match(/DUMMY_PIN_HASH = "pbkdf2\$(\d+)\$/);
  assert.ok(dummy, "ต้องมี DUMMY_PIN_HASH รูปแบบ pbkdf2");
  const real = Number(source.match(/const MAX_ITERATIONS = ([\d_]+)/)[1].replaceAll("_", ""));
  assert.equal(
    Number(dummy[1]), real,
    "ถ้าจำนวนรอบไม่ตรงกัน verifyHashedPin จะคืน false ทันทีโดยไม่คำนวณ ทำให้จับเวลาแยกได้ว่ารหัสพนักงานไหนมีจริง",
  );
});

// Node 22 รองรับการ import ไฟล์ .ts ตรงๆ (type stripping) จึงทดสอบโค้ดจริงได้เลย
const { hashPin, verifyHashedPin } = await import("../app/pin-security.ts");

test("hashPin แล้ว verifyHashedPin ต้องตรวจผ่าน", async () => {
  const stored = await hashPin("246810");
  assert.match(stored, /^pbkdf2\$100000\$/);
  assert.equal(await verifyHashedPin("246810", stored), true);
  assert.equal(await verifyHashedPin("246811", stored), false);
});

test("verifyHashedPin ต้องคืน false ไม่ใช่โยน exception เมื่อค่าที่เก็บไว้พัง", async () => {
  const broken = [
    "",
    "ENV_INITIAL_ADMIN_PIN",
    "pbkdf2$100000$!!!!$@@@@",
    "pbkdf2$abc$AAAA$BBBB",
    "pbkdf2$120000$AAAA$BBBB",
    "pbkdf2$100000$AAAA",
  ];
  for (const stored of broken) {
    assert.equal(
      await verifyHashedPin("246810", stored), false,
      `ค่า ${JSON.stringify(stored)} ต้องคืน false เงียบๆ ไม่ใช่ทำให้ทั้ง route ตอบ 500`,
    );
  }
});
