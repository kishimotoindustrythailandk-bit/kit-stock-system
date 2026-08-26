/**
 * Cloudflare Workers จำกัด PBKDF2 ไว้ที่ 100,000 รอบ ขอเกินกว่านี้จะได้
 * "Pbkdf2 failed: iteration counts above 100000 are not supported"
 *
 * โค้ดเดิมตั้งไว้ 120,000 ซึ่งเกินเพดาน แปลว่า hashPin() โยน error ทุกครั้งที่ถูกเรียก
 * ที่ผ่านมาไม่มีใครเจอเพราะไม่เคยมีการสร้าง PIN แบบแฮชจริงเลย — บัญชี ADMIN
 * ใช้การเทียบกับ environment variable ตรงๆ ส่วนเมนู "เพิ่มผู้ใช้งาน" ก็ใช้ไม่ได้
 * มาตลอดโดยไม่มีใครรู้ เพราะมันเรียก hashPin เหมือนกัน
 */
const MAX_ITERATIONS = 100_000;
const ITERATIONS = MAX_ITERATIONS;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function secureEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/**
 * ตรวจ PIN กับค่าที่เก็บไว้ คืนค่า false เสมอเมื่อตรวจไม่ได้ ไม่โยน exception
 *
 * เดิมถ้าค่าใน pin_hash ผิดรูปแบบ (เช่น base64 เสีย) atob() จะโยน
 * InvalidCharacterError ทะลุออกไป ทำให้ทั้งการเข้าสู่ระบบและการเปลี่ยน PIN
 * ตอบ 500 แทนที่จะบอกว่า PIN ไม่ถูกต้อง — บัญชีนั้นจะใช้งานไม่ได้เลยและ
 * หาสาเหตุยากมาก เพราะข้อความที่ผู้ใช้เห็นไม่เกี่ยวกับต้นเหตุ
 */
export async function verifyHashedPin(pin: string, stored: string) {
  try {
    const [algorithm, iterationText, saltText, hashText] = stored.split("$");
    const iterations = Number(iterationText);
    // เพดานบนต้องเช็คด้วย ไม่งั้นแฮชที่บันทึกไว้เกิน 100,000 รอบจะทำให้ deriveBits
    // โยน error แทนที่จะบอกว่า PIN ไม่ถูกต้อง
    if (algorithm !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 10_000 || iterations > MAX_ITERATIONS || !saltText || !hashText) return false;
    const expected = fromBase64Url(hashText);
    const actual = await derive(pin, fromBase64Url(saltText), iterations);
    return secureEqual(actual, expected);
  } catch {
    return false;
  }
}
