"use client";
import {useEffect,useRef,useState} from 'react';
import {reportOperationWarning} from './operation-warning';
import {renderSplitLabels,splitLabelPayload,type SplitTagSnapshot,type SplitTagLabel,type SplitLabelKind} from './split-tag-label';
type Data={snapshot:SplitTagSnapshot;labels?:SplitTagLabel[];labelId?:string;issuedAt?:string;issuedBy?:string;historical?:boolean;current?:SplitTagSnapshot|null};
export default function SplitTagPopup({pickId,stockTagCode,labelId,page,onClose}:{pickId?:number;stockTagCode?:string;labelId?:string;page:string;onClose:()=>void}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[printing,setPrinting]=useState(false);
 const [delivery,setDelivery]=useState(true),[remaining,setRemaining]=useState(true),[paper,setPaper]=useState<'a4'|'62mm'>('a4');
 const dialog=useRef<HTMLElement>(null),lock=useRef(false);
 useEffect(()=>{const old=document.activeElement as HTMLElement;dialog.current?.focus();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;old?.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();const query=new URLSearchParams(labelId?{labelId}:pickId?{pickId:String(pickId)}:{stockTagCode:stockTagCode||''});void fetch('/api/split-tags?'+query,{cache:'no-store',signal:controller.signal}).then(async r=>{const value=await r.json() as Data&{error?:string};if(!r.ok)throw new Error(value.error||'โหลด Tag ไม่สำเร็จ');setData(value);setDelivery(value.snapshot.waitingQty>0);setRemaining(value.snapshot.availableQty>0);}).catch(e=>{if(e.name!=='AbortError'){setError(e.message);reportOperationWarning({page,message:e.message});}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[pickId,stockTagCode,labelId,page]);
 async function print(){
  if(!data||data.historical||lock.current)return;
  const kinds:SplitLabelKind[]=[];if(delivery&&data.snapshot.waitingQty>0)kinds.push('delivery');if(remaining&&data.snapshot.availableQty>0)kinds.push('remaining');
  if(!kinds.length)return;
  const popup=window.open('','_blank','width=850,height=850');
  if(!popup){reportOperationWarning({page,message:'เบราว์เซอร์บล็อกหน้าพิมพ์ กรุณาอนุญาต Pop-up'});return;}
  popup.document.write('<html lang="th"><body><p>กำลังตรวจยอดและเตรียม Tag…</p></body></html>');popup.document.close();
  lock.current=true;setPrinting(true);setError('');
  try{
   const response=await fetch('/api/split-tags',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pickId:data.snapshot.pick?.id||0,stockTagCode:data.snapshot.tag.tagId,expectedAvailableQty:data.snapshot.availableQty,expectedWaitingQty:data.snapshot.waitingQty,kinds})});
   const result=await response.json() as Data&{labels:SplitTagLabel[];labelId:string;issuedAt:string;error?:string};if(!response.ok)throw new Error(result.error||'ออก Tag ไม่สำเร็จ');
   const qrcode=await import('qrcode');const qrs=await Promise.all(result.labels.map(label=>qrcode.toDataURL(splitLabelPayload(label,result.labelId,window.location.origin+'/'),{width:500,margin:4,errorCorrectionLevel:'M'})));
   popup.document.open();popup.document.write(renderSplitLabels(result.labels,result.labelId,result.issuedAt,qrs,paper));popup.document.close();
   setData(current=>current?{...current,labelId:result.labelId,issuedAt:result.issuedAt,issuedBy:result.issuedBy}:current);
  }catch(e){popup.close();const message=e instanceof Error?e.message:'พิมพ์ Tag ไม่สำเร็จ';setError(message);reportOperationWarning({page,message});}
  finally{lock.current=false;setPrinting(false);}
 }
 const snapshot=data?.snapshot;
 return <div className="modal-backdrop dispatch-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="split-tag-title"><section ref={dialog} tabIndex={-1} className="dispatch-confirm-modal" onKeyDown={event=>{if(event.key==='Escape'&&!printing)onClose();if(event.key==='Tab'){const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));const first=items[0],last=items[items.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
  <header><div><span>▤</span><div><small>KIT · แบ่งงาน / Tag เศษ</small><h3 id="split-tag-title">{data?.historical?'ตรวจสอบ Tag ที่ออกแล้ว':'พิมพ์ Tag ส่งงาน / คงเหลือ'}</h3></div></div><button aria-label="ปิด" type="button" disabled={printing} onClick={onClose}>×</button></header>
  <div className="dispatch-confirm-info" style={{padding:24}}>{loading?<p>กำลังอ่านจำนวนล่าสุดจากระบบ…</p>:snapshot&&<>
   <div className="dispatch-confirm-part"><small>PART / MATERIAL</small><b>{snapshot.tag.materialCode}</b><p>{snapshot.tag.partName}</p></div>
   <div className="dispatch-confirm-details"><div><small>Tag เดิม</small><b>{snapshot.tag.tagId}</b></div><div><small>Job / วันที่ผลิต</small><b>{snapshot.tag.jobNo} / {snapshot.tag.productionDate}</b></div>{snapshot.pick&&<><div><small>รอบ / FAC</small><b>{snapshot.pick.deliveryTime} / {snapshot.pick.fact}</b></div><div><small>วันที่ส่ง / DO</small><b>{snapshot.pick.deliveryDate} / {snapshot.pick.doNo}</b></div></>}</div>
   {data?.historical?<><p>ออกโดย {data.issuedBy} · {data.issuedAt}</p>{data.labels?.map(label=><p key={label.kind}><b>{label.kind==='delivery'?'ส่งพร้อมงาน':'คงเหลือ Stock'}: {label.qty.toLocaleString()} ชิ้น</b></p>)}<p>ยอดบนฉลากเป็นยอด ณ เวลาออก Tag</p>{data.current?<p>ปัจจุบัน: Stock พร้อมใช้ {data.current.availableQty.toLocaleString()} · งานรอส่ง {data.current.waitingQty.toLocaleString()} ชิ้น</p>:<p>ไม่พบรายการต้นทางในปัจจุบัน</p>}</>:<>
    <div className="dispatch-confirm-qty"><label style={{padding:16}}><input type="checkbox" disabled={!snapshot.waitingQty||printing} checked={delivery} onChange={event=>setDelivery(event.target.checked)}/><small>Tag ส่งพร้อมงาน</small><b>{snapshot.waitingQty.toLocaleString()}</b><em>ชิ้น</em></label><label style={{padding:16}}><input type="checkbox" disabled={!snapshot.availableQty||printing} checked={remaining} onChange={event=>setRemaining(event.target.checked)}/><small>Tag คงเหลือใน Stock</small><b>{snapshot.availableQty.toLocaleString()}</b><em>ชิ้น</em></label></div>
    <p>พิมพ์เฉพาะประเภทที่เลือก · Tag คงเหลือใช้แทนฉลากเดิมบนกล่อง · ไม่เพิ่มยอด Stock</p>
    <label>กระดาษ <select disabled={printing} value={paper} onChange={event=>setPaper(event.target.value as 'a4'|'62mm')}><option value="a4">A4 (2 Tag ต่อแถว)</option><option value="62mm">ฉลาก 62 × 100 mm</option></select></label>
    {data.labelId&&<p role="status">เตรียม Tag และบันทึกประวัติแล้ว · {data.labelId}</p>}
   </>}
  </>}{error&&<p role="alert">{error}</p>}</div>
  <footer><button className="button secondary" disabled={printing} onClick={onClose}>ปิด</button>{!data?.historical&&<button className="button confirm-dispatch-button" disabled={loading||printing||!snapshot||(!delivery&&!remaining)||(!snapshot.waitingQty&&!snapshot.availableQty)} onClick={()=>void print()}>{printing?'กำลังเตรียม Tag…':'เตรียม Tag / เปิดหน้าพิมพ์'}</button>}</footer>
 </section></div>;
}
