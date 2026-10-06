import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {operationWarningEvent,WARNING_PAGES,reportOperationWarning} from '../app/operation-warning.ts';
const source=await readFile(new URL('../app/api/audit-logs/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function attempt({user={employeeCode:'62043',displayName:'Tester'},permitted=true,saved=true,page='stock',message='Tag ไม่ถูกต้อง',spoof}={}){
 const logs=[];const m={exports:{}};
 const imports={ '../../cloudflare-auth':{getCurrentUser:async()=>user,hasPermission:()=>permitted}, '../../api-error':{safeErrorMessage:()=>''}, '../../../runtime/env':{getRuntimeEnv:()=>({})}, '../../audit-log':{writeAuditLog:async(actor,event)=>{logs.push({actor,event});return saved;}}, '../../operation-warning':{operationWarningEvent}};
 new Function('require','module','exports',compiled)(name=>{if(!(name in imports))throw new Error(name);return imports[name]},m,m.exports);
 const response=await m.exports.POST(new Request('https://kit.test/api/audit-logs',{method:'POST',body:JSON.stringify({action:'operation_warning',page,summary:message,details:{tagId:'KITSTK-TEST'},actor:spoof})}));
 return {status:response.status,data:await response.json(),logs};
}
test('warning events support each operational page and reject unknown pages',()=>{
 for(const page of Object.keys(WARNING_PAGES))assert.ok(operationWarningEvent(page,'เตือน'));
 assert.equal(operationWarningEvent('unknown','เตือน'),null);assert.equal(operationWarningEvent('stock',' '),null);
 assert.doesNotThrow(()=>reportOperationWarning({page:'stock',message:'เตือน'}));
});
test('warning history records authenticated actor and exact message/page',async()=>{
 const result=await attempt({spoof:{employeeCode:'ADMIN'}});assert.equal(result.status,201);assert.equal(result.logs[0].actor.employeeCode,'62043');assert.equal(result.logs[0].event.action,'operation_warning');assert.equal(result.logs[0].event.summary,'Tag ไม่ถูกต้อง');assert.equal(result.logs[0].event.details.page,'stock');assert.equal(result.logs[0].event.details.context.tagId,'KITSTK-TEST');
});
test('repeated warnings produce separate history events',async()=>{const first=await attempt(),second=await attempt();assert.equal(first.logs.length+second.logs.length,2);});
test('warning endpoint enforces login and page permissions before writing',async()=>{for(const options of [{user:null},{permitted:false}]){const result=await attempt(options);assert.equal(result.status,options.user===null?401:403);assert.equal(result.logs.length,0);}});
test('invalid page and empty message cannot write events',async()=>{for(const options of [{page:'unknown'},{message:''}]){const result=await attempt(options);assert.equal(result.status,400);assert.equal(result.logs.length,0);}});
test('audit failure is reported instead of claiming saved history',async()=>{const result=await attempt({saved:false});assert.equal(result.status,503);assert.equal(result.data.success,false);});
