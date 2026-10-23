import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export default async function verifyFleet({engine,call,response,ok,tmp,one,clear,objects}){
const domain=await import(pathToFileURL(tmp+'/lib/fleet-domain.mjs'));
const parser=await import(pathToFileURL(tmp+'/lib/payment-xlsx.mjs'));
await clear();
const raw={'TransactionId':'t1','Account Number':'a1','Customer Name':'Cliente Uno','Formatted Transaction Date':'01/09/2026','Transaction Time':'12:33:44','Transcation Result':'Approved','Transcation Type':'Spend','Merchant Name':'Estación Prueba','Product Name':'Diesel','Gallons':'10.125','Amount':'40.50','Card Number':'4900030010004042'};
const row=domain.normalizePaymentRow(raw);assert.equal(row.volume_milli,10125);assert.equal(row.card_last4,'4042');assert.equal(row.date,'2026-09-01');ok(!JSON.stringify(row).includes(raw['Card Number']),'Only last four card digits retained');
assert.throws(()=>domain.normalizePaymentRow({...raw,'Formatted Transaction Date':'31/02/2026'}));assert.throws(()=>domain.normalizePaymentRow({...raw,'Transaction Time':'28:12:00'}));assert.throws(()=>domain.normalizePaymentRow({...raw,Gallons:''}));
const refund=domain.normalizePaymentRow({...raw,TransactionId:'t2','Transcation Type':'Refund Fleet Transaction',Gallons:'-2.125',Amount:'-8.50'}),preauth=domain.normalizePaymentRow({...raw,TransactionId:'t3','Transcation Type':'Pre-Authorisation',Gallons:'10',Amount:'40'}),declined=domain.normalizePaymentRow({...raw,TransactionId:'t4','Transcation Result':'Declined - Insufficient Funds',Gallons:'10',Amount:'40'}),second=domain.normalizePaymentRow({...raw,TransactionId:'t5','Account Number':'a2'});
async function start(hash,rows){const result=await call('fleet/import',{action:'start',fileHash:hash.repeat(64),source:'test.xlsx',totalRows:rows});assert.equal(result.status,200,JSON.stringify(result.data));return result.data.job;}
async function batch(job,offset,rows){const r=await call('fleet/import',{action:'batch',importId:job.id,offset,rows});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function finish(job){const r=await call('fleet/import',{action:'finish',importId:job.id});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.job;}
let job=await start('a',5);await batch(job,0,[row,refund]);ok((await call('fleet')).data.empty,'Partial import stays out of dashboard');ok((await call('fleet/import',{action:'finish',importId:job.id})).status===400,'Incomplete import cannot publish');
const replay=await batch(job,0,[row,refund]);ok(replay.replayed&&replay.processed===2,'A retried block is idempotent');await batch(job,2,[preauth,declined,second]);await finish(job);
let overview=(await call('fleet')).data;ok(overview.clients.length===1&&overview.clients[0].accounts.length===2,'Multiple accounts consolidate into one client');assert.equal(overview.total.purchases,2);assert.equal(overview.total.refunds,1);assert.equal(overview.total.volume,18.125);assert.equal(overview.total.amount,72.5);ok(overview.total.issues===1,'Declines and preauthorisations do not inflate consumption');
job=await start('b',2);await batch(job,0,[row,refund]);const repeated=await finish(job);ok(repeated.unchanged===2&&(await one('SELECT COUNT(*) AS n FROM fleet_current')).n===5,'Overlapping files leave totals unchanged');
const changed={...row,volume_milli:20000,amount_cents:8000};job=await start('c',1);await batch(job,0,[changed]);assert.equal((await call('fleet')).data.total.volume,18.125);await finish(job);assert.equal((await call('fleet')).data.total.volume,28);ok((await one("SELECT COUNT(*) AS n FROM fleet_transactions WHERE transaction_id='t1'")).n===2,'Corrections replace current values and retain history');
let workspace=(await call('workspace',undefined,'?start=2026-09-01&end=2026-09-01')).data;ok(workspace.records.length===1&&workspace.records[0].volume===28&&workspace.records[0].revenue===null,'Commercial workspace includes volume without inventing net revenue');
const tx=(await call('fleet/transactions',undefined,'?class=refund')).data;ok(tx.total===1&&tx.rows[0].time==='12:33:44','Transaction drilldown retains time and correct class');
const noEvents=(await call('fleet',undefined,'?start=2026-10-01&end=2026-10-21')).data;ok(noEvents.total.purchases===0&&noEvents.total.missing_products===0,'An empty filtered period shows zero event counts');
const later={...row,transaction_id:'t6',account:'a3',customer_name:'Cliente Dos'};job=await start('e',1);await batch(job,0,[later]);ok((await call('fleet')).data.clients.length===1,'A staged new account does not enter a published ranking');
await call('fleet/import',{action:'discard',importId:job.id});const resumed=await start('e',1);assert.equal(resumed.processed,1);await finish(resumed);ok((await call('fleet')).data.clients.length===2,'A discarded file resumes its received blocks and completes');
const tiers=domain.rankFleet([{client_id:'1',name:'A',volume:50},{client_id:'2',name:'B',volume:30},{client_id:'3',name:'C',volume:15},{client_id:'4',name:'D',volume:5},{client_id:'5',name:'E',volume:0}]);assert.deepEqual(tiers.map(t=>t.tier),['S','A','B','C','—']);ok(domain.rankFleet([{client_id:'1',name:'A',volume:50},{client_id:'2',name:'B',volume:50}]).every(t=>t.tier==='S'),'Tier thresholds and equal-volume ties are deterministic');
const source=new Blob(['test-only workbook bytes'],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
const sourceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
const sourceJob=(await call('fleet/import',{action:'start',fileHash:sourceHash,source:'source.xlsx',totalRows:1})).data.job;
await batch(sourceJob,0,[row]);await finish(sourceJob);
const intent=await call('uploads',{action:'prepare',kind:'fleet',importId:sourceJob.id,name:'source.xlsx',size:source.size,mime:source.type});assert.equal(intent.status,200);
objects.set(intent.data.path,new Blob(['x'.repeat(source.size)]));
ok((await call('uploads',{action:'finish',uploadId:intent.data.uploadId})).status===400,'A source file with the wrong SHA-256 cannot be linked');
objects.set(intent.data.path,source);
ok((await call('uploads',{action:'finish',uploadId:intent.data.uploadId})).status===200,'The exact original source can be archived privately');
ok((await response('fleet/import',undefined,'?id='+sourceJob.id+'&download=1')).status===302,'Original source download redirects after authorization');
if(process.argv[2]){
 await clear();const file=await fs.readFile(process.argv[2]),parsed=await parser.readPaymentXlsx(new Blob([file]));ok(parsed.rows.length>0&&parsed.errors.length===0,'Full Payment24 XLSX parses without dropping rows');ok(parsed.duplicates===0,'File IDs and independent decimal control totals reconcile');
 job=await start('d',parsed.rows.length);for(let i=0;i<parsed.rows.length;i+=250){await batch(job,i,parsed.rows.slice(i,i+250));if(i%25000===0)console.log('Imported locally '+i);}await finish(job);overview=(await call('fleet')).data;assert.equal(overview.total.events,parsed.rows.length);assert.equal(overview.clients.length,parsed.clients);assert.equal(overview.total.volume,parsed.volume);assert.equal(overview.total.amount,parsed.amount);assert.equal(overview.total.purchases,parsed.purchases);assert.equal(overview.total.refunds,parsed.refunds);ok(overview.accounts.length===parsed.accounts,'All source rows reconcile through authenticated routes and PostgreSQL');
 const current=(await call('fleet',undefined,'?start=2026-10-01&end=2026-10-21')).data;ok(current.period.compareCovered&&current.clients.every(c=>c.days_since===null||c.days_since>=0),'Same-length period comparisons and recency use source cutoff');
 const first=overview.clients[0];const detail=(await call('fleet',undefined,'?client='+first.client_id)).data;assert.equal(detail.total.volume,first.volume);const events=(await call('fleet/transactions',undefined,'?client='+first.client_id+'&class=purchase')).data;assert.equal(events.total,first.purchases);ok(events.rows.length===100,'Top client drilldown and pagination reconcile with ranking');

 console.log(JSON.stringify({fullFileVerified:true,rows:overview.total.events,clients:overview.clients.length,volume:overview.total.volume,amount:overview.total.amount}));
}

}
