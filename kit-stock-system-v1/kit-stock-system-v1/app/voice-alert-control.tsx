"use client";
import {useEffect,useState} from 'react';
import {speakThaiAlert,stopThaiVoice,type VoiceStatus} from './voice-alert';
export default function VoiceAlertControl({enabled,onEnabledChange}:{enabled:boolean;onEnabledChange:(enabled:boolean)=>void}) {
 const [status,setStatus]=useState<VoiceStatus|null>(null);
 useEffect(()=>{
  const receive=(event:Event)=>setStatus((event as CustomEvent<VoiceStatus>).detail);
  window.addEventListener('kit-voice-status',receive);
  // Voice lists can load after the page mounts.
  window.speechSynthesis?.getVoices();
  return()=>window.removeEventListener('kit-voice-status',receive);
 },[]);
 return <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12,padding:10,borderRadius:10,background:'#eef5ff'}}>
  <button type="button" className="button secondary" onClick={()=>{
    onEnabledChange(true);
    setStatus({state:'ready',message:'กำลังทดสอบเสียง…'});
    // Call directly in the click, before any effect or network request.
    speakThaiAlert('success','settings','เปิดเสียงพูดแล้ว จัดงานสำเร็จ',true);
  }}>🔊 เปิด / ทดสอบเสียงพูด</button>
  {enabled&&<button type="button" className="tiny-button" onClick={()=>{stopThaiVoice();onEnabledChange(false);setStatus(null);}}>ปิดเสียง</button>}
  <span role="status" style={{fontSize:12,color:status?.state==='error'?'#ba263b':'#31587b'}}>{!enabled?'ปิดเสียงพูดอยู่':status?.message||'พูดภาษาไทย ตามด้วยภาษาอังกฤษ · เลือกเสียงผู้ชายก่อนถ้าเครื่องมี'}</span>
 </div>;
}
