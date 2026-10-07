export type VoiceAlertType = "success" | "error";

let lastSpoken = { key: "", at: 0 };
let currentUtterance: SpeechSynthesisUtterance | null = null;
let cancelPending: (() => void) | null = null;
export type VoiceStatus = { state: "playing" | "ready" | "error"; message: string };
function reportVoiceStatus(detail: VoiceStatus) {
  window.dispatchEvent(new CustomEvent("kit-voice-status", { detail }));
}
export function stopThaiVoice() {
  cancelPending?.();
  cancelPending = null;
  currentUtterance = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

const THAI_MONTHS = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const SPOKEN_CHARACTERS: Record<string, string> = {
  A: "เอ", B: "บี", C: "ซี", D: "ดี", E: "อี", F: "เอฟ", G: "จี", H: "เอช", I: "ไอ",
  J: "เจ", K: "เค", L: "แอล", M: "เอ็ม", N: "เอ็น", O: "โอ", P: "พี", Q: "คิว", R: "อาร์",
  S: "เอส", T: "ที", U: "ยู", V: "วี", W: "ดับเบิลยู", X: "เอ็กซ์", Y: "วาย", Z: "แซด",
  "0": "ศูนย์", "1": "หนึ่ง", "2": "สอง", "3": "สาม", "4": "สี่",
  "5": "ห้า", "6": "หก", "7": "เจ็ด", "8": "แปด", "9": "เก้า", "-": "ขีด",
};

function spokenDate(yearText: string, monthText: string, dayText: string) {
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (year < 1900 || year > 2999 || day < 1 || day > daysInMonth) return "";
  return `วันที่ ${day} ${THAI_MONTHS[month]} ${year}`;
}

function spokenTime(hourText: string, minuteText: string) {
  const hour = Number(hourText), minute = Number(minuteText);
  if (hour > 23 || minute > 59) return "";
  return minute === 0 ? `${hour} นาฬิกา` : `${hour} นาฬิกา ${minute} นาที`;
}

function spellOperationalCode(code: string) {
  return [...code.toUpperCase()].map(character => SPOKEN_CHARACTERS[character] ?? character).join(" ");
}

export function speechPronunciation(message: string) {
  return message
    .replace(/(?:วันที่\s*)?(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, (original, year, month, day, hour, minute) => {
      const date = spokenDate(year, month, day), time = spokenTime(hour, minute);
      return date && time ? `${date} เวลา ${time}` : original;
    })
    .replace(/(?:วันที่\s*)?(\d{4})-(\d{2})-(\d{2})\b/g, (original, year, month, day) => spokenDate(year, month, day) || original)
    .replace(/(?:วันที่\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (original, day, month, year) => spokenDate(year, month, day) || original)
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (original, hour, minute) => spokenTime(hour, minute) || original)
    .replace(/\b(?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gi, spellOperationalCode)
    .replace(/Stock/gi, "สต็อก")
    .replace(/Tag/gi, "แท็ก")
    .replace(/FAC/gi, "แฟค")
    .replace(/Due/gi, "ดิว")
    .replace(/Job/gi, "จ๊อบ")
    .replace(/NG/gi, "เอ็นจี");
}

export function voiceAlertMessage(type: VoiceAlertType, page: string, message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  let spokenText = clean.slice(0, type === "error" ? 240 : 180);
  if (type === "success" && page === "arrange") spokenText = "จัดงานสำเร็จ";
  if (type === "success" && page === "dispatch") spokenText = "ขายออกสำเร็จ";
  if (type === "success" && (page === "stock" || page === "manual-stock")) spokenText = "รับเข้า Stock สำเร็จ";
  if (type === "success" && page === "stock-count") spokenText = "ปรับยอด Stock สำเร็จ";
  if (type === "success" && page === "replacement") spokenText = "เบิกงานทดแทนสำเร็จ";
  return speechPronunciation(spokenText);
}

export function speakThaiAlert(type: VoiceAlertType, page: string, message: string, enabled = true) {
  if (!enabled || typeof window === "undefined") return false;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    reportVoiceStatus({state:"error",message:"เบราว์เซอร์นี้ไม่รองรับเสียงพูด กรุณาเปิดระบบด้วย Chrome หรือ Safari"});
    return false;
  }
  const text = voiceAlertMessage(type, page, message);
  if (!text) return false;
  const now = Date.now();
  const key = `${type}:${page}:${text}`;
  if (lastSpoken.key === key && now - lastSpoken.at < 1_500) return false;
  lastSpoken = { key, at: now };
  stopThaiVoice();
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  utterance.lang = "th-TH";
  utterance.rate = 0.9;
  utterance.pitch = 0.85;
  utterance.volume = 1;
  let timer: number | undefined;
  const cleanup = () => {
    if(timer !== undefined)window.clearTimeout(timer);
    synth.removeEventListener("voiceschanged",play);
  };
  const fail = (message:string) => {
    cleanup();lastSpoken={key:"",at:0};
    reportVoiceStatus({state:"error",message});
  };
  const play = () => {
    const voices = synth.getVoices();
    if(!voices.length)return;
    cleanup();
    const thaiVoices = voices.filter(voice=>voice.lang.toLowerCase().replace('_','-').startsWith('th'));
    const thaiVoice = thaiVoices.find(voice=>/male|ชาย|pattara/i.test(`${voice.name ?? ""} ${voice.voiceURI ?? ""}`)) ?? thaiVoices[0];
    if(!thaiVoice){fail("ไม่พบเสียงภาษาไทยบนเครื่องนี้ กรุณาเพิ่มเสียงภาษาไทยในตั้งค่าของอุปกรณ์ แล้วกดทดสอบเสียงอีกครั้ง");return;}
    utterance.voice = thaiVoice;
    utterance.onstart = () => {if(currentUtterance!==utterance)return;cleanup();reportVoiceStatus({state:"playing",message:"กำลังพูด: "+text});};
    utterance.onend = () => {if(currentUtterance!==utterance)return;cleanup();currentUtterance=null;reportVoiceStatus({state:"ready",message:"เสียงพูดพร้อมใช้งาน"});};
    utterance.onerror = event => {
      if(currentUtterance!==utterance)return;
      if(event.error==='canceled'||event.error==='interrupted')return;
      fail(event.error==='not-allowed'?"เบราว์เซอร์บล็อกเสียง กรุณากด เปิด / ทดสอบเสียงพูด ก่อนสแกนต่อ":"เล่นเสียงพูดไม่สำเร็จ กรุณากดทดสอบเสียง และตรวจระดับเสียงของเครื่อง");
    };
    synth.resume();
    synth.speak(utterance);
    timer=window.setTimeout(()=>fail("เสียงยังไม่เริ่ม กรุณากด เปิด / ทดสอบเสียงพูด และตรวจระดับเสียงของเครื่อง"),6000);
  };
  cancelPending = cleanup;
  if(synth.getVoices().length)play();
  else {
    synth.addEventListener("voiceschanged",play);
    timer=window.setTimeout(()=>fail("โหลดเสียงพูดไม่สำเร็จ กรุณากดทดสอบเสียงอีกครั้ง"),3000);
  }
  return true;
}
