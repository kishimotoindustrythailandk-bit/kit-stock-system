import {getCurrentUser,hasPermission} from '../../cloudflare-auth';
import {getRuntimeEnv} from '../../../runtime/env';
import {writeAuditLog} from '../../audit-log';
import {safeErrorMessage} from '../../api-error';
import {AVAILABLE_STOCK_SQL} from '../../stock-quantities';
import {createSplitLabels,type SplitLabelKind,type SplitTagSnapshot} from '../../split-tag-label';
const allowed=(user:Parameters<typeof hasPermission>[0])=>['arrange','dispatch','tags','stock'].some(page=>hasPermission(user,page as Parameters<typeof hasPermission>[1]));
const allowedToIssue=(user:Parameters<typeof hasPermission>[0])=>['arrange','dispatch','tags','stock'].some(page=>hasPermission(user,page as Parameters<typeof hasPermission>[1])&&hasPermission(user,`${page}-edit` as Parameters<typeof hasPermission>[1]));
export async function readSplitSnapshot(DB:D1Database,pickId:number,stockTagCode:string):Promise<SplitTagSnapshot|null>{
 const row=await DB.prepare(`SELECT t.tag_id AS tagId,t.material_code AS materialCode,
  coalesce(m.part_name,'') AS partName,coalesce(m.customer,'') AS customer,coalesce(m.location,'') AS location,
  t.job_no AS jobNo,t.production_date AS productionDate,t.remaining_qty AS remainingQty,t.status AS tagStatus,
  ${AVAILABLE_STOCK_SQL.replaceAll("tag.","t.")} AS availableQty,
  p.id AS pickId,p.due_line_id AS dueLineId,p.picked_qty AS pickedQty,p.dispatched_qty AS dispatchedQty,p.status AS pickStatus,
  d.delivery_date AS deliveryDate,d.delivery_time AS deliveryTime,d.fact,d.do_no AS doNo
 FROM stock_tags t LEFT JOIN stock_parts m ON m.material_code=t.material_code
 LEFT JOIN stock_picks p ON p.stock_tag_id=t.id AND p.id=?1
 LEFT JOIN delivery_due_lines d ON d.id=p.due_line_id
 WHERE (?1>0 AND p.id=?1) OR (?1=0 AND t.tag_id=?2) LIMIT 1`).bind(pickId,stockTagCode).first<Record<string,unknown>>();
 if(!row)return null;
 return {tag:{tagId:String(row.tagId),materialCode:String(row.materialCode),partName:String(row.partName),customer:String(row.customer),location:String(row.location),jobNo:String(row.jobNo),productionDate:String(row.productionDate),remainingQty:Number(row.remainingQty),status:String(row.tagStatus)},
  pick:row.pickId?{id:Number(row.pickId),dueLineId:Number(row.dueLineId),pickedQty:Number(row.pickedQty),dispatchedQty:Number(row.dispatchedQty),status:String(row.pickStatus),deliveryDate:String(row.deliveryDate),deliveryTime:String(row.deliveryTime),fact:String(row.fact),doNo:String(row.doNo)}:null,
  availableQty:['in_stock','depleted'].includes(String(row.tagStatus))?Number(row.availableQty):0,
  waitingQty:['staged','partial'].includes(String(row.pickStatus))?Math.max(Number(row.pickedQty)-Number(row.dispatchedQty),0):0,loadedAt:new Date().toISOString()};
}
export async function GET(request:Request){
 try{
  const user=await getCurrentUser();if(!user)return Response.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});
  if(!allowed(user))return Response.json({error:'ไม่มีสิทธิ์ดู Tag แบ่งงาน'},{status:403});
  const {DB}=getRuntimeEnv();if(!DB)throw new Error('ไม่พบฐานข้อมูล');
  const url=new URL(request.url),labelId=url.searchParams.get('labelId');
  if(labelId){
   if(!/^SPLIT-[A-F0-9]{32}$/.test(labelId))return Response.json({error:'รหัส Tag ไม่ถูกต้อง'},{status:400});
   const record=await DB.prepare("SELECT detail_json AS detailJson,actor_name AS actorName,actor_code AS actorCode,created_at AS createdAt FROM audit_logs WHERE action_key='issue_split_labels' AND entity_id=?1 ORDER BY id DESC LIMIT 1").bind(labelId).first<{detailJson:string;actorName:string;actorCode:string;createdAt:string}>();
   if(!record)return Response.json({error:'ไม่พบประวัติ Tag นี้'},{status:404});
   const data=JSON.parse(record.detailJson) as {snapshot:SplitTagSnapshot;labels:unknown[]};
   const current=await readSplitSnapshot(DB,data.snapshot.pick?.id||0,data.snapshot.tag.tagId);
   return Response.json({...data,labelId,issuedBy:record.actorName,issuedByCode:record.actorCode,issuedAt:record.createdAt,current,historical:true},{headers:{'cache-control':'no-store'}});
  }
  const pickId=Number(url.searchParams.get('pickId')||0),tag=(url.searchParams.get('stockTagCode')||'').trim().toUpperCase();
  if(!Number.isSafeInteger(pickId)||pickId<0||(!pickId&&!/^KITSTK-[A-Z0-9-]+$/.test(tag)))return Response.json({error:'กรุณาเลือกรายการจัดงานหรือ Tag Stock'},{status:400});
  const snapshot=await readSplitSnapshot(DB,pickId,tag);if(!snapshot)return Response.json({error:'ไม่พบรายการ Tag หรือจัดงาน'},{status:404});
  return Response.json({snapshot},{headers:{'cache-control':'no-store'}});
 }catch(error){return Response.json({error:safeErrorMessage(error,'โหลด Tag แบ่งงานไม่สำเร็จ')},{status:500});}
}
export async function POST(request:Request){
 try{
  const user=await getCurrentUser();if(!user)return Response.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});
  if(!allowedToIssue(user))return Response.json({error:'บัญชีนี้ดูข้อมูลได้ แต่ไม่มีสิทธิ์ออก Tag แบ่งงาน'},{status:403});
  const body=await request.json() as {pickId?:number;stockTagCode?:string;expectedAvailableQty?:number;expectedWaitingQty?:number;kinds?:SplitLabelKind[]};
  const pickId=Number(body.pickId||0),tag=String(body.stockTagCode||'').trim().toUpperCase();
  if(!Number.isSafeInteger(pickId)||pickId<0||(!pickId&&!/^KITSTK-[A-Z0-9-]+$/.test(tag)))return Response.json({error:'รายการจัดงานหรือ Tag ไม่ถูกต้อง'},{status:400});
  const {DB}=getRuntimeEnv();if(!DB)throw new Error('ไม่พบฐานข้อมูล');
  const snapshot=await readSplitSnapshot(DB,pickId,tag);if(!snapshot)return Response.json({error:'ไม่พบรายการ Tag หรือจัดงาน'},{status:404});
  if(snapshot.availableQty!==body.expectedAvailableQty||snapshot.waitingQty!==body.expectedWaitingQty)return Response.json({error:'ยอดเปลี่ยนจากอีกเครื่อง กรุณาปิดและเปิดรายการ Tag ใหม่ก่อนพิมพ์'},{status:409});
  let labels;try{labels=createSplitLabels(snapshot,Array.isArray(body.kinds)?body.kinds:[]);}catch(error){return Response.json({error:error instanceof Error?error.message:'ประเภท Tag ไม่ถูกต้อง'},{status:400});}
  const labelId='SPLIT-'+crypto.randomUUID().replaceAll('-','').toUpperCase();
  const saved=await writeAuditLog(user,{module:'tags',moduleLabel:'Tag แบ่งงาน',action:'issue_split_labels',actionLabel:'ออก Tag แบ่งงาน / คงเหลือ',entityType:'split_label',entityId:labelId,
   summary:`${snapshot.tag.materialCode} · Job ${snapshot.tag.jobNo} · Tag เดิม ${snapshot.tag.tagId} · ${labels.map(l=>`${l.kind==='delivery'?'ส่งพร้อมงาน':'คงเหลือ Stock'} ${l.qty} ชิ้น`).join(' / ')}`,
   details:{snapshot,labels,labelId,preparedAt:snapshot.loadedAt}},request);
  if(!saved)return Response.json({error:'บันทึกประวัติ Tag ไม่สำเร็จ ยังไม่ออก Tag กรุณาลองใหม่'},{status:503});
  return Response.json({snapshot,labels,labelId,issuedBy:user.displayName,issuedByCode:user.employeeCode,issuedAt:snapshot.loadedAt},{status:201});
 }catch(error){return Response.json({error:safeErrorMessage(error,'ออก Tag แบ่งงานไม่สำเร็จ')},{status:500});}
}
