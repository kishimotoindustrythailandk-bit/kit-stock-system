import assert from 'node:assert/strict';
import test from 'node:test';
import {voiceAlertMessage,speakThaiAlert,stopThaiVoice} from '../app/voice-alert.ts';

test('voice alerts use concise Thai phrases for operational success',()=>{
 assert.equal(voiceAlertMessage('success','arrange','จัด 50 ชิ้นจาก Job DEMO รอขายออก'),'จัดงานสำเร็จ');
 assert.equal(voiceAlertMessage('success','stock','รับ Tag เข้า Stock 50 ชิ้น'),'รับเข้า Stock สำเร็จ');
 assert.equal(voiceAlertMessage('success','dispatch','ขายออกและตัดยอดเรียบร้อย'),'ขายออกสำเร็จ');
});

function speechFixture(voices=[{lang:'th-TH',name:'Thai'}]){
 const events=new EventTarget(),synthEvents=new EventTarget(),statuses=[],spoken=[];
 let resumed=0;
 const synth={getVoices:()=>voices,cancel(){},resume(){resumed++},speak(u){spoken.push(u)},addEventListener:synthEvents.addEventListener.bind(synthEvents),removeEventListener:synthEvents.removeEventListener.bind(synthEvents)};
 globalThis.window={speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text}},setTimeout,clearTimeout,dispatchEvent:events.dispatchEvent.bind(events)};
 events.addEventListener('kit-voice-status',event=>statuses.push(event.detail));
 return{spoken,statuses,get resumed(){return resumed},loadVoices(v){voices=v;synthEvents.dispatchEvent(new Event('voiceschanged'))},cleanup(){stopThaiVoice();delete globalThis.window;}};
}
test('Thai voice is selected, paused engine resumes, and actual playback status is reported',()=>{
 const f=speechFixture();try{assert.equal(speakThaiAlert('success','arrange','test success'),true);assert.equal(f.resumed,1);assert.equal(f.spoken[0].text,'จัดงานสำเร็จ');assert.equal(f.spoken[0].voice.lang,'th-TH');f.spoken[0].onstart();assert.equal(f.statuses.at(-1).state,'playing');f.spoken[0].onend();assert.equal(f.statuses.at(-1).state,'ready');}finally{f.cleanup();}
});
test('late voice list is loaded before speaking and disabled speech never starts',()=>{
 const f=speechFixture([]);try{assert.equal(speakThaiAlert('error','stock','โหลดเสียงทดสอบ',false),false);assert.equal(f.spoken.length,0);speakThaiAlert('error','stock','โหลดเสียงทดสอบ');assert.equal(f.spoken.length,0);f.loadVoices([{lang:'th_TH'}]);assert.equal(f.spoken.length,1);}finally{f.cleanup();}
});
test('missing Thai voice and blocked playback show actionable errors instead of silent success',()=>{
 const f=speechFixture([{lang:'en-US'}]);try{speakThaiAlert('error','stock','test missing');assert.equal(f.spoken.length,0);assert.match(f.statuses.at(-1).message,/ไม่พบเสียงภาษาไทย/);f.loadVoices([{lang:'th-TH'}]);speakThaiAlert('error','stock','test blocked');f.spoken[0].onerror({error:'not-allowed'});assert.match(f.statuses.at(-1).message,/เบราว์เซอร์บล็อกเสียง/);}finally{f.cleanup();}
});

test('voice alerts read the actual warning reason',()=>{
 assert.equal(voiceAlertMessage('error','arrange','จำนวนสินค้าไม่เพียงพอ'),'จำนวนสินค้าไม่เพียงพอ');
 assert.equal(voiceAlertMessage('error','dispatch','สแกน Tag ผิด กรุณาตรวจสอบอีกครั้ง'),'สแกน Tag ผิด กรุณาตรวจสอบอีกครั้ง');
 assert.equal(voiceAlertMessage('error','stock','   '),'');
});
