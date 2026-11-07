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
// Growth must reconcile with Panel de flota, never the commercial directory.
const commercialOnly=(await call('clients',{name:'Solo Commercial',segment:'Lubricants Wholesale'})).data.client;
let growth=(await call('fleet',undefined,'?view=growth')).data;
overview=(await call('fleet')).data;
assert.equal(growth.clients.length,overview.clients.length);
assert.ok(!growth.clients.some(c=>c.customerId===commercialOnly.id));
const sumGrowth=(g,key)=>g.clients.reduce((sum,c)=>sum+c.periods.reduce((s,p)=>s+p[key],0),0);
assert.equal(sumGrowth(growth,'volume'),overview.total.volume);
assert.equal(sumGrowth(growth,'amount'),overview.total.amount);
assert.equal(sumGrowth(growth,'rows'),overview.total.purchases+overview.total.refunds);
assert.ok(growth.clients.find(c=>c.name==='Cliente Uno').codes.length===2);
ok(true,'Fleet growth uses only Payment24 clients and reconciles approved purchases minus refunds with the fleet panel');
const october=[{...row,transaction_id:'oct-buy',date:'2026-10-01',volume_milli:20000,amount_cents:8000},{...refund,transaction_id:'oct-refund',date:'2026-10-02',volume_milli:5000,amount_cents:2000},{...preauth,transaction_id:'oct-preauth',date:'2026-10-03',volume_milli:100000,amount_cents:40000},{...declined,transaction_id:'oct-declined',date:'2026-10-04',volume_milli:100000,amount_cents:40000}];
job=await start('f',october.length);await batch(job,0,october);await finish(job);
const comparison='?view=growth&baseStart=2026-09-01&baseEnd=2026-09-30&currentStart=2026-10-01&currentEnd=2026-10-30';
growth=(await call('fleet',undefined,comparison)).data;
const firstGrowth=growth.clients.find(c=>c.name==='Cliente Uno');assert.equal(firstGrowth.current.volume,15);assert.equal(firstGrowth.current.amount,60);assert.equal(firstGrowth.current.rows,2);assert.equal(firstGrowth.baseline.volume,18.125);
const growthDomain=await import(pathToFileURL(tmp+'/lib/fleet-growth-domain.mjs'));
assert.ok(Math.abs(growthDomain.compareGrowth(firstGrowth.baseline,firstGrowth.current,'volume').pct-(-17.24137931034483))<1e-9);
assert.deepEqual(growthDomain.defaultComparison('2026-10-30','month'),{baseline:{start:'2026-09-01',end:'2026-09-30'},current:{start:'2026-10-01',end:'2026-10-30'}});
assert.deepEqual(growthDomain.defaultComparison('2024-03-31','month'),{baseline:{start:'2024-02-01',end:'2024-02-29'},current:{start:'2024-03-01',end:'2024-03-29'}});
assert.equal(growthDomain.growthChange(0,10).pct,null);assert.equal(growthDomain.growthChange(-5,10).delta,15);assert.equal(growthDomain.growthChange(10,null).status,'onlyBaseline');
assert.equal((await call('fleet',undefined,'?view=growth&baseStart=2026-10-01&baseEnd=2026-10-20&currentStart=2026-10-10&currentEnd=2026-10-30')).status,400);
assert.equal((await call('fleet',undefined,'?view=growth&start=2026-02-30')).status,400);
assert.equal((await call('fleet',undefined,'?view=growth&cadence=invalid')).status,400);
assert.equal((await call('fleet',undefined,'?view=growth',null)).status,401);
assert.equal((await call('fleet',undefined,'?view=growth','viewer')).status,200);
const missingProduct=(await call('fleet',undefined,'?view=growth&product=unknown')).data;assert.equal(missingProduct.clients.length,growth.clients.length);assert.equal(sumGrowth(missingProduct,'rows'),0);
ok(true,'Fleet growth custom dates, exact consumption/amounts, missing periods, positive-base percentages, filters and access control verified');


// TM membership is current client metadata, independent of financial rows.
const beforeTm=(await call('fleet')).data;
const firstClient=(await engine.query("SELECT * FROM app_private.clients WHERE name='Cliente Uno'")).rows[0];
const assigned=await call('clients',{...firstClient,owner:'TM Norte'});assert.equal(assigned.status,200);
await call('clients',{...commercialOnly,owner:'TM Norte'});
const afterTm=(await call('fleet')).data;
assert.deepEqual(afterTm.total,beforeTm.total);
assert.equal(afterTm.clients.length,beforeTm.clients.length);
const queryTm='?tm='+encodeURIComponent('TM Norte');
const tmPanel=(await call('fleet',undefined,queryTm)).data,tmGrowth=(await call('fleet',undefined,queryTm+'&view=growth')).data,tmEvents=(await call('fleet/transactions',undefined,queryTm)).data;
assert.equal(tmPanel.clients.length,1);assert.equal(tmGrowth.clients.length,1);
assert.equal(tmPanel.clients[0].owner,'TM Norte');assert.equal(tmGrowth.clients[0].owner,'TM Norte');
assert.equal(tmPanel.clients[0].accounts.length,2);
assert.equal(tmPanel.tms.find(t=>t.value==='TM Norte').clients,1);
assert.equal(tmPanel.tms.find(t=>t.value==='__unassigned__').clients,1);
assert.deepEqual(tmGrowth.tms,tmPanel.tms);
assert.equal(sumGrowth(tmGrowth,'volume'),tmPanel.total.volume);assert.equal(sumGrowth(tmGrowth,'amount'),tmPanel.total.amount);
assert.equal(tmEvents.total,tmPanel.total.events);assert.ok(tmEvents.rows.every(r=>r.client_id===firstClient.id));
const noTm=(await call('fleet',undefined,'?tm=__unassigned__')).data,noTmGrowth=(await call('fleet',undefined,'?tm=__unassigned__&view=growth')).data;
assert.equal(noTm.clients.length,1);assert.equal(noTmGrowth.clients.length,1);assert.equal(noTm.clients[0].name,'Cliente Dos');
assert.equal(tmPanel.total.volume+noTm.total.volume,afterTm.total.volume);
assert.equal(sumGrowth(noTmGrowth,'volume'),noTm.total.volume);
const intersect=(await call('fleet',undefined,queryTm+'&client='+noTm.clients[0].client_id)).data;assert.equal(intersect.clients.length,0);assert.equal(intersect.total.volume,0);
const unknown=(await call('fleet',undefined,'?tm='+encodeURIComponent("Unknown' OR 1=1 --"))).data;assert.equal(unknown.clients.length,0);assert.equal(unknown.total.volume,0);
const dateTm=(await call('fleet',undefined,queryTm+'&start=2026-10-01&end=2026-10-31&product=Diesel')).data;assert.equal(dateTm.total.volume,15);
const tmPlan=await call('import',{kind:'clients',rows:[{nombre:firstClient.name,segmento:firstClient.segment,codigo:firstClient.code,ejecutivo:'TM Sur'}]});assert.equal(tmPlan.status,200);assert.equal(tmPlan.data.created,0);assert.equal(tmPlan.data.updated,1);
const tmImport=await call('import',{kind:'clients',rows:[{nombre:firstClient.name,segmento:firstClient.segment,codigo:firstClient.code,ejecutivo:'TM Sur'}],source:'TM fixture',token:tmPlan.data.token,commit:true});assert.equal(tmImport.status,200);
const moved=(await call('fleet',undefined,'?tm=TM%20Sur')).data;assert.deepEqual(moved.total,tmPanel.total);
assert.equal((await call('fleet',undefined,queryTm)).data.clients.length,0);
job=await start('1',1);await batch(job,0,[{...row,transaction_id:'new-account-same-client',account:'a4'}]);await finish(job);
const retained=(await call('fleet',undefined,'?tm=TM%20Sur')).data;assert.equal(retained.clients[0].owner,'TM Sur');assert.equal(retained.clients[0].accounts.length,3);assert.equal(retained.tms.find(t=>t.value==='TM Sur').clients,1);
assert.equal((await call('fleet',undefined,'?tm=TM%20Sur','viewer')).status,200);
ok(true,'TM filters reconcile panel, growth, transactions, dates and fuel; unassigned clients remain visible, multi-account clients count once, assignments persist across Payment24 imports');
const fleetFamilyRows=[{...row,transaction_id:'family-puma',product:'Ion Diesel',volume_milli:10000},{...row,transaction_id:'family-shell',product:'Shell FuelSave Diesel',volume_milli:5000}];
const familyJob=await start('7',2);await batch(familyJob,0,fleetFamilyRows);await finish(familyJob);
const grouped=(await call('fleet',undefined,'?family=diesel')).data;
const events=(await call('fleet/transactions',undefined,'?family=diesel')).data;
const groupedGrowth=(await call('fleet',undefined,'?view=growth&family=diesel')).data;
const bySku=await Promise.all(['Diesel','Ion Diesel','Shell FuelSave Diesel'].map(p=>call('fleet',undefined,'?product='+encodeURIComponent(p))));
assert.equal(grouped.total.volume,bySku.reduce((s,r)=>s+r.data.total.volume,0));
assert.equal(grouped.total.events,events.total);assert.equal(sumGrowth(groupedGrowth,'volume'),grouped.total.volume);
ok(true,'One diesel family reconciles Payment24 overview, growth and transaction drilldown across both brands');

if(process.argv[2]){
 await clear();const file=await fs.readFile(process.argv[2]),parsed=await parser.readPaymentXlsx(new Blob([file]));ok(parsed.rows.length>0&&parsed.errors.length===0,'Full Payment24 XLSX parses without dropping rows');ok(parsed.duplicates===0,'File IDs and independent decimal control totals reconcile');
 job=await start('d',parsed.rows.length);for(let i=0;i<parsed.rows.length;i+=250){await batch(job,i,parsed.rows.slice(i,i+250));if(i%25000===0)console.log('Imported locally '+i);}await finish(job);overview=(await call('fleet')).data;assert.equal(overview.total.events,parsed.rows.length);assert.equal(overview.clients.length,parsed.clients);assert.equal(overview.total.volume,parsed.volume);assert.equal(overview.total.amount,parsed.amount);assert.equal(overview.total.purchases,parsed.purchases);assert.equal(overview.total.refunds,parsed.refunds);ok(overview.accounts.length===parsed.accounts,'All source rows reconcile through authenticated routes and PostgreSQL');
 const last=overview.bounds.last,startDate=new Date(Date.parse(last)-20*86400000).toISOString().slice(0,10),previousStart=new Date(Date.parse(last)-41*86400000).toISOString().slice(0,10);const current=(await call('fleet',undefined,'?start='+startDate+'&end='+last)).data;ok(current.period.compareCovered===(previousStart>=overview.bounds.first)&&current.clients.every(c=>c.days_since===null||c.days_since>=0),'Same-length period comparisons respect the actual source coverage and cutoff');
 const first=overview.clients[0];const detail=(await call('fleet',undefined,'?client='+first.client_id)).data;assert.equal(detail.total.volume,first.volume);const events=(await call('fleet/transactions',undefined,'?client='+first.client_id+'&class=purchase')).data;assert.equal(events.total,first.purchases);ok(events.rows.length===100,'Top client drilldown and pagination reconcile with ranking');


 const g=(await call('fleet',undefined,'?view=growth')).data;
 assert.equal(g.clients.length,overview.clients.length);
 assert.deepEqual(new Set(g.clients.map(c=>c.customerId)),new Set(overview.clients.map(c=>c.client_id)));
 assert.ok(Math.abs(sumGrowth(g,'volume')-overview.total.volume)<.00001);
 assert.ok(Math.abs(sumGrowth(g,'amount')-overview.total.amount)<.00001);
 assert.equal(sumGrowth(g,'rows'),overview.total.purchases+overview.total.refunds);
 for(const prod of overview.products){const perProduct=(await call('fleet',undefined,'?product='+encodeURIComponent(prod||'__missing__'))).data,pg=(await call('fleet',undefined,'?view=growth&product='+encodeURIComponent(prod||'__missing__'))).data;assert.ok(Math.abs(sumGrowth(pg,'volume')-perProduct.total.volume)<.00001);assert.ok(Math.abs(sumGrowth(pg,'amount')-perProduct.total.amount)<.00001);}
 console.log(JSON.stringify({fleetGrowthVerified:true,clients:g.clients.length,periods:g.periods.map(p=>({label:p.label,partial:p.partial})),volume:sumGrowth(g,'volume'),amount:sumGrowth(g,'amount'),products:overview.products.length}));

 console.log(JSON.stringify({fullFileVerified:true,rows:overview.total.events,clients:overview.clients.length,volume:overview.total.volume,amount:overview.total.amount}));
}

}
