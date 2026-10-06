export type VoiceAlertType = "success" | "error";

let lastSpoken = { key: "", at: 0 };

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
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  const text = voiceAlertMessage(type, page, message);
  if (!text) return false;
  const now = Date.now();
  const key = `${type}:${page}:${text}`;
  if (lastSpoken.key === key && now - lastSpoken.at < 1_500) return false;
  lastSpoken = { key, at: now };
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "th-TH";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  const thaiVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th"));
  if (thaiVoice) utterance.voice = thaiVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

