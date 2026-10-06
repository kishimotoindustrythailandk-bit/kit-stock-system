import assert from 'node:assert/strict';
import test from 'node:test';
import {voiceAlertMessage} from '../app/voice-alert.ts';

test('voice alerts use concise Thai phrases for operational success',()=>{
 assert.equal(voiceAlertMessage('success','arrange','จัด 50 ชิ้นจาก Job DEMO รอขายออก'),'จัดงานสำเร็จ');
 assert.equal(voiceAlertMessage('success','stock','รับ Tag เข้า Stock 50 ชิ้น'),'รับเข้า Stock สำเร็จ');
 assert.equal(voiceAlertMessage('success','dispatch','ขายออกและตัดยอดเรียบร้อย'),'ขายออกสำเร็จ');
});

test('voice alerts read the actual warning reason',()=>{
 assert.equal(voiceAlertMessage('error','arrange','จำนวนสินค้าไม่เพียงพอ'),'จำนวนสินค้าไม่เพียงพอ');
 assert.equal(voiceAlertMessage('error','dispatch','สแกน Tag ผิด กรุณาตรวจสอบอีกครั้ง'),'สแกน Tag ผิด กรุณาตรวจสอบอีกครั้ง');
 assert.equal(voiceAlertMessage('error','stock','   '),'');
});
