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

export function voiceAlertMessages(type: VoiceAlertType, page: string, message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return {th:"",en:""};
  if (type === "success") {
    if (page === "arrange") return {th:"จัดงานสำเร็จ",en:"Arrangement completed successfully"};
    if (page === "dispatch") return {th:"ขายออกสำเร็จ",en:"Dispatch completed successfully"};
    if (page === "stock" || page === "manual-stock") return {th:"รับเข้า Stock สำเร็จ",en:"Stock receipt completed successfully"};
    if (page === "stock-count") return {th:"ปรับยอด Stock สำเร็จ",en:"Stock adjustment completed successfully"};
    if (page === "replacement") return {th:"เบิกงานทดแทนสำเร็จ",en:"Replacement stock issued successfully"};
    if (page === "settings") return {th:"เปิดเสียงพูดแล้ว จัดงานสำเร็จ",en:"Voice alerts are enabled. Arrangement completed successfully"};
    return {th:clean.slice(0,180),en:"Operation completed successfully"};
  }
  let en="Warning. Please check the message on screen";
  if (/จำนวน.*ไม่พอ|ไม่เพียงพอ|เกิน Stock|เกิน.*ที่เหลือ/i.test(clean)) en="Insufficient stock quantity";
  else if (/Tag.*ผิด|Tag ไม่ถูกต้อง|ไม่ใช่ Tag|สแกน.*ผิด|bad.tag/i.test(clean)) en="Invalid tag. Please check and scan again";
  else if (/ถูกจัดงานแล้ว|จัดงานไปแล้ว/i.test(clean)) en="This tag has already been arranged";
  else if (/ไม่มี.*Part|ไม่มีงาน.*รอบ|ไม่มี.*รอบ.*FAC/i.test(clean)) en="No parts remain for the selected round and factory";
  else if (/ไม่พบ/i.test(clean)) en="Data not found. Please check again";
  return {th:clean.slice(0,240),en};
}
export function voiceAlertMessage(type: VoiceAlertType,page:string,message:string){return voiceAlertMessages(type,page,message).th;}

const MALE_VOICE = /male|ชาย|pattara|daniel|david|mark|guy|ryan|thomas|alex|james|george|aaron|fred/i;
function chooseVoice(voices:SpeechSynthesisVoice[],language:"th"|"en") {
  const matches=voices.filter(voice=>voice.lang.toLowerCase().replace('_','-').startsWith(language));
  return matches.find(voice=>MALE_VOICE.test(voice.name)||MALE_VOICE.test(voice.voiceURI)) || matches.find(voice=>voice.default) || matches[0];
}

export function speakThaiAlert(type: VoiceAlertType, page: string, message: string, enabled = true) {
  if (!enabled || typeof window === "undefined") return false;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    reportVoiceStatus({state:"error",message:"เบราว์เซอร์นี้ไม่รองรับเสียงพูด กรุณาเปิดระบบด้วย Chrome หรือ Safari"});
    return false;
  }
  const messages = voiceAlertMessages(type, page, message);
  if (!messages.th) return false;
  const now = Date.now();
  const key = `${type}:${page}:${messages.th}:${messages.en}`;
  if (lastSpoken.key === key && now - lastSpoken.at < 1_500) return false;
  lastSpoken = { key, at: now };
  stopThaiVoice();
  const synth = window.speechSynthesis;
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
    const thaiVoice = chooseVoice(voices,'th');
    if(!thaiVoice){fail("ไม่พบเสียงภาษาไทยบนเครื่องนี้ กรุณาเพิ่มเสียงภาษาไทยในตั้งค่าของอุปกรณ์ แล้วกดทดสอบเสียงอีกครั้ง");return;}
    const englishVoice=chooseVoice(voices,'en');
    const queue=[{text:messages.th,lang:'th-TH',voice:thaiVoice},{text:messages.en,lang:'en-US',voice:englishVoice||thaiVoice}];
    const speakNext=(index:number) => {
      const item=queue[index];
      const utterance=new window.SpeechSynthesisUtterance(item.text);
      currentUtterance=utterance;utterance.lang=item.lang;utterance.voice=item.voice;
      utterance.rate=0.88;utterance.pitch=0.82;utterance.volume=1;
      utterance.onstart=()=>{if(currentUtterance!==utterance)return;if(timer!==undefined)window.clearTimeout(timer);reportVoiceStatus({state:'playing',message:`กำลังพูด ${index===0?'ภาษาไทย':'ภาษาอังกฤษ'}: ${item.text}`});};
      utterance.onend=()=>{if(currentUtterance!==utterance)return;if(index+1<queue.length){speakNext(index+1);return;}currentUtterance=null;reportVoiceStatus({state:'ready',message:'เสียงพูดไทยและอังกฤษพร้อมใช้งาน'});};
      utterance.onerror=event=>{if(currentUtterance!==utterance||event.error==='canceled'||event.error==='interrupted')return;fail(event.error==='not-allowed'?"เบราว์เซอร์บล็อกเสียง กรุณากด เปิด / ทดสอบเสียงพูด ก่อนสแกนต่อ":"เล่นเสียงพูดไม่สำเร็จ กรุณากดทดสอบเสียง และตรวจระดับเสียงของเครื่อง");};
      synth.resume();synth.speak(utterance);
      timer=window.setTimeout(()=>fail("เสียงยังไม่เริ่ม กรุณากด เปิด / ทดสอบเสียงพูด และตรวจระดับเสียงของเครื่อง"),6000);
    };
    speakNext(0);
  };
  cancelPending = cleanup;
  if(synth.getVoices().length)play();
  else {
    synth.addEventListener("voiceschanged",play);
    timer=window.setTimeout(()=>fail("โหลดเสียงพูดไม่สำเร็จ กรุณากดทดสอบเสียงอีกครั้ง"),3000);
  }
  return true;
}
