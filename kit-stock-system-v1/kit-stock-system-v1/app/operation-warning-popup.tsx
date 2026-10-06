"use client";
import { useEffect, useRef, useState } from 'react';
import { WARNING_PAGES, type OperationWarning } from './operation-warning';
type Entry = OperationWarning & { id: number; status: 'pending' | 'saved' | 'failed' };
export default function OperationWarningPopup() {
 const [entries,setEntries] = useState<Entry[]>([]);
 const retry = useRef<(entry:Entry)=>void>(()=>{});
 const nextId = useRef(0), button = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement|null>(null);
 useEffect(() => {
  let alive = true;
  const update = (id:number,status:Entry['status']) => { if(alive) setEntries(rows=>rows.map(row=>row.id===id?{...row,status}:row)); };
  const save = (id:number, warning:OperationWarning) => {
   const controller = new AbortController();
   const timer = window.setTimeout(()=>controller.abort(),12000);
   void fetch('/api/audit-logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'operation_warning',page:warning.page,summary:warning.message,details:warning.context}),signal:controller.signal})
    .then(async response=>{if(!response.ok || !(await response.json() as {success?:boolean}).success)throw new Error('Audit failed');update(id,'saved');})
    .catch(()=>{
      if(alive) setEntries(rows=>rows.some(row=>row.id===id)?rows.map(row=>row.id===id?{...row,status:'failed'}:row):[...rows,{...warning,id,status:'failed'}]);
    }).finally(()=>window.clearTimeout(timer));
  };
  retry.current = entry => { update(entry.id,'pending'); save(entry.id,entry); };
  const receive = (event:Event) => {
   const warning = (event as CustomEvent<OperationWarning>).detail;
   if(!warning || !WARNING_PAGES[warning.page] || !warning.message?.trim())return;
   const id=++nextId.current;
   if(warning.showPopup!==false)setEntries(rows=>[...rows,{...warning,id,status:'pending'}]);
   save(id,warning);
  };
  window.addEventListener('kit-operation-warning',receive);
  return()=>{alive=false;window.removeEventListener('kit-operation-warning',receive);};
 },[]);
 const entry = entries[0];
 useEffect(()=>{if(!entry)return;previousFocus.current=document.activeElement as HTMLElement;button.current?.focus();return()=>previousFocus.current?.focus();},[entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!entry)return null;
 return <div className="modal-backdrop" style={{zIndex:10000}} role="alertdialog" aria-modal="true" aria-labelledby="operation-warning-title" aria-describedby="operation-warning-message" onKeyDown={event=>{event.stopPropagation();if(event.key==='Tab'){const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
  <section className="arrange-warning-modal">
   <header><span>!</span><h3 id="operation-warning-title">แจ้งเตือน {WARNING_PAGES[entry.page]}</h3></header>
   <p id="operation-warning-message">{entry.message}</p>
   <p role="status">{entry.status==='pending'?'กำลังบันทึกประวัติ…':entry.status==='saved'?'บันทึกประวัติการเตือนแล้ว':'บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ'}</p>
   <footer>{entry.status==='failed'&&<button className="button secondary" type="button" onClick={()=>retry.current(entry)}>ลองบันทึกประวัติอีกครั้ง</button>}<button ref={button} className="button primary" type="button" onClick={()=>setEntries(rows=>rows.slice(1))}>รับทราบ{entries.length>1?` (${entries.length} ข้อความ)`:''}</button></footer>
  </section>
 </div>;
}
