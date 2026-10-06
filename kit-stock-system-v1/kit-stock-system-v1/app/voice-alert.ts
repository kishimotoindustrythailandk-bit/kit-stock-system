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

export function voiceAlertMessage(type: VoiceAlertType, page: string, message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (type === "error") return clean.slice(0, 240);
  if (page === "arrange") return "จัดงานสำเร็จ";
  if (page === "dispatch") return "ขายออกสำเร็จ";
  if (page === "stock" || page === "manual-stock") return "รับเข้า Stock สำเร็จ";
  if (page === "stock-count") return "ปรับยอด Stock สำเร็จ";
  if (page === "replacement") return "เบิกงานทดแทนสำเร็จ";
  return clean.slice(0, 180);
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
  utterance.rate = 0.95;
  utterance.pitch = 1;
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
    const thaiVoice = voices.find(voice=>voice.lang.toLowerCase().replace('_','-').startsWith('th'));
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
