import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../app/api/stock/route.ts',import.meta.url),'utf8');
const block=source.slice(source.indexOf('    if (action === "save_part")'),source.indexOf('    if (action === "import_parts")'));
async function attempt({permissions=['parts','parts-add'],role='stock',existing=null,changes=1}={}){
 const queries=[],logs=[];
 const runtimeDb={prepare(sql){queries.push(sql);return{bind(){return this},async first(){return existing},async run(){return{meta:{changes}}}}}};
 const run=new Function('user','body','runtimeDb','hasPermission','clean','writeAuditLog','request',`return (async()=>{const action='save_part';${block}})()`);
 const response=await run({role,permissions},{materialCode:'NEW-001',partName:'New part',standardQty:100},runtimeDb,(u,k)=>u.role==='admin'||u.permissions.includes(k),(v)=>String(v??'').trim(),async(u,event)=>logs.push({u,event}),new Request('https://kit.test/api/stock'));
 return{response,queries,logs};
}
test('adding Part requires both page access and explicit add permission',async()=>{
 for(const permissions of [[],['parts'],['parts-add']]){const r=await attempt({permissions});assert.equal(r.response.status,403);assert.equal(r.queries.length,0);}
 const r=await attempt();assert.equal(r.response.status,200);assert.match(r.queries[1],/DO NOTHING/);assert.equal(r.logs[0].event.action,'create_part');assert.equal(r.logs[0].u.role,'stock');
});
test('add-only staff cannot overwrite existing or concurrently inserted Parts',async()=>{
 for(const options of [{existing:{materialCode:'NEW-001'}},{changes:0}]){const r=await attempt(options);assert.equal(r.response.status,409);assert.equal(r.logs.length,0);}
});
test('Admin retains existing Part editing',async()=>{const r=await attempt({role:'admin',existing:{materialCode:'NEW-001'}});assert.equal(r.response.status,200);assert.match(r.queries[1],/DO UPDATE/);assert.equal(r.logs[0].event.action,'update_part');});
