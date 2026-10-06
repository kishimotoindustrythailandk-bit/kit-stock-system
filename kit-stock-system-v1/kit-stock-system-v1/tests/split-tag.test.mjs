import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createSplitLabels,splitLabelPayload,renderSplitLabels} from '../app/split-tag-label.ts';
import {AVAILABLE_STOCK_SQL} from '../app/stock-quantities.ts';
const code=await readFile(new URL('../app/api/split-tags/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(options={}){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE stock_tags(id INTEGER,tag_id TEXT,material_code TEXT,job_no TEXT,production_date TEXT,remaining_qty INTEGER,status TEXT);
 CREATE TABLE stock_parts(material_code TEXT,part_name TEXT,customer TEXT,location TEXT);
 CREATE TABLE stock_picks(id INTEGER,stock_tag_id INTEGER,due_line_id INTEGER,picked_qty INTEGER,dispatched_qty INTEGER,status TEXT);
 CREATE TABLE stock_allocations(stock_tag_id INTEGER,qty INTEGER,status TEXT);
 CREATE TABLE delivery_due_lines(id INTEGER,delivery_date TEXT,delivery_time TEXT,fact TEXT,do_no TEXT);
 CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,detail_json TEXT,actor_name TEXT,actor_code TEXT,created_at TEXT,action_key TEXT,entity_id TEXT);
 INSERT INTO stock_tags VALUES(1,'KITSTK-TEST','PART','JOB','2026-10-06',100,'in_stock');
 INSERT INTO stock_parts VALUES('PART','Part Name','Customer','LOC');
 INSERT INTO stock_picks VALUES(1,1,1,50,0,'staged');
 INSERT INTO delivery_due_lines VALUES(1,'2026-10-07','09:00','FAC1','DO');`);
 const logs=[];const DB={prepare(sql){return{bind(...args){return{async first(){return db.prepare(sql).get(...args)||null;}}}}}};
 const user=options.user===null?null:{id:1,employeeCode:'62043',displayName:'Operator'};
 const m={exports:{}};const imports={'../../cloudflare-auth':{getCurrentUser:async()=>user,hasPermission:()=>options.permitted!==false},'../../../runtime/env':{getRuntimeEnv:()=>({DB})},'../../audit-log':{writeAuditLog:async(actor,event)=>{logs.push({actor,event});if(options.auditFailure)return false;db.prepare("INSERT INTO audit_logs(detail_json,actor_name,actor_code,created_at,action_key,entity_id) VALUES(?,?,?,'2026-10-06 09:00:00',?,?)").run(JSON.stringify(event.details),actor.displayName,actor.employeeCode,event.action,event.entityId);return true;}},'../../api-error':{safeErrorMessage:(_,fallback)=>fallback},'../../stock-quantities':{AVAILABLE_STOCK_SQL},'../../split-tag-label':{createSplitLabels}};
 new Function('require','module','exports',compiled)(name=>{if(!(name in imports))throw new Error(name);return imports[name]},m,m.exports);
 const call=async(method,query='',body)=>{const response=await m.exports[method](new Request('https://kit.test/api/split-tags'+query,{method,...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,data:await response.json()};};
 return{db,logs,call};
}
const issueBody={pickId:1,expectedAvailableQty:50,expectedWaitingQty:50,kinds:['delivery','remaining']};
test('100 stock arranged 50 creates two 50 labels without changing stock or active tag count',async()=>{
 const {db,logs,call}=fixture();try{
  const before=await call('GET','?pickId=1');assert.equal(before.data.snapshot.availableQty,50);assert.equal(before.data.snapshot.waitingQty,50);
  const issued=await call('POST','',issueBody);assert.equal(issued.status,201);assert.deepEqual(issued.data.labels.map(label=>label.qty),[50,50]);assert.deepEqual(issued.data.labels.map(label=>label.sourceTagId),['KITSTK-TEST','KITSTK-TEST']);assert.equal(db.prepare('SELECT count(*) AS count,sum(remaining_qty) AS qty FROM stock_tags').get().qty,100);assert.equal(db.prepare('SELECT count(*) AS count FROM stock_tags').get().count,1);assert.equal(db.prepare('SELECT picked_qty FROM stock_picks').get().picked_qty,50);
  assert.equal(logs[0].actor.employeeCode,'62043');assert.equal(logs[0].event.action,'issue_split_labels');
  const historical=await call('GET','?labelId='+issued.data.labelId);assert.equal(historical.status,200);assert.equal(historical.data.historical,true);assert.equal(historical.data.labels[0].qty,50);
  db.exec("UPDATE stock_tags SET remaining_qty=50;UPDATE stock_picks SET dispatched_qty=50,status='completed'");
  const after=await call('GET','?labelId='+issued.data.labelId);assert.equal(after.data.labels[0].qty,50);assert.equal(after.data.current.waitingQty,0);assert.equal(after.data.current.availableQty,50);
 }finally{db.close();}
});
test('stale quantities are rejected and no label is issued',async()=>{const {db,logs,call}=fixture();try{db.exec('UPDATE stock_picks SET picked_qty=60');const r=await call('POST','',issueBody);assert.equal(r.status,409);assert.equal(logs.length,0);assert.equal(db.prepare('SELECT remaining_qty FROM stock_tags').get().remaining_qty,100);}finally{db.close();}});
test('partial dispatch and legacy reservation use current stock quantities',async()=>{const {db,call}=fixture();try{db.exec("UPDATE stock_tags SET remaining_qty=80;UPDATE stock_picks SET dispatched_qty=20,status='partial';INSERT INTO stock_allocations VALUES(1,10,'reserved')");const r=await call('GET','?pickId=1');assert.equal(r.data.snapshot.availableQty,40);assert.equal(r.data.snapshot.waitingQty,30);}finally{db.close();}});
test('zero remaining and completed picks cannot create zero labels',async()=>{const {db,call}=fixture();try{db.exec("UPDATE stock_tags SET remaining_qty=0,status='depleted';UPDATE stock_picks SET dispatched_qty=50,status='completed'");const r=await call('POST','',{...issueBody,expectedAvailableQty:0,expectedWaitingQty:0});assert.equal(r.status,400);}finally{db.close();}});
test('print-only source tag request emits remainder at current available quantity',async()=>{const {db,call}=fixture();try{const preview=await call('GET','?stockTagCode=KITSTK-TEST');assert.equal(preview.data.snapshot.pick,null);const issue=await call('POST','',{stockTagCode:'KITSTK-TEST',expectedAvailableQty:50,expectedWaitingQty:0,kinds:['remaining']});assert.equal(issue.status,201);assert.equal(issue.data.labels[0].qty,50);}finally{db.close();}});
test('login and permissions are checked for reading and issuing tags',async()=>{for(const options of [{user:null},{permitted:false}]){const{db,call,logs}=fixture(options);try{for(const method of ['GET','POST']){const r=await call(method,method==='GET'?'?pickId=1':'',method==='POST'?issueBody:undefined);assert.equal(r.status,options.user===null?401:403);}assert.equal(logs.length,0);}finally{db.close();}}});
test('failed audit prevents issuing printable labels',async()=>{const{db,call}=fixture({auditFailure:true});try{const r=await call('POST','',issueBody);assert.equal(r.status,503);assert.equal(r.data.labels,undefined);}finally{db.close();}});
test('QR identities distinguish outbound trace labels and existing remainder stock tags; print escapes text',async()=>{const{db,call}=fixture();try{const r=await call('POST','',issueBody);const [delivery,remaining]=r.data.labels;const payload=splitLabelPayload(delivery,r.data.labelId,'https://kit.test/?page=stock');assert.equal(new URL(payload).searchParams.get('splitLabel'),r.data.labelId);assert.equal(splitLabelPayload(remaining,r.data.labelId,'https://kit.test/'),'KITSTK-TEST');const output=renderSplitLabels([{...delivery,partName:'<script>alert(1)</script>'},remaining],r.data.labelId,r.data.issuedAt,['data:image/png;base64,AAAA','data:image/png;base64,BBBB'],'62mm');assert.ok(output.includes('62mm 100mm'));assert.ok(output.includes('&lt;script&gt;'));assert.ok(!output.includes('<script>alert'));assert.ok(output.includes('TAG คงเหลือใน Stock'));}finally{db.close();}});
test('mobile print flow renders an in-app preview and prints its iframe without opening a blank popup',async()=>{
 const source=await readFile(new URL('../app/split-tag-popup.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/window\.open\(/);
 assert.match(source,/srcDoc=\{preparedHtml\}/);
 assert.match(source,/previewFrame\.current/);
 assert.match(source,/contentWindow\.print\(\)/);
 assert.match(source,/เตรียมและดูตัวอย่าง Tag/);
});
