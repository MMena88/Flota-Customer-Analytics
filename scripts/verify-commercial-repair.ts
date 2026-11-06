import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mergeCommercial,parseCommercial,readCommercialReport,type CommercialData,type CommercialRow} from '../lib/commercial';
import {planCommercialRepair,planCommercialUpdate,commercialImportStatus} from '../lib/commercial-import';
const a:CommercialRow={date:'2026-10-28',segment:'Retail',name:'Cliente A',code:'12345',product:'Diesel',volume:100,sales:250,cost:200,productMargin:50,variableCost:5,grossMargin:45};
const b={...a,code:'12346',name:'Cliente B',volume:175};
const corrected={...a,name:'CLIENTE A',grossMargin:42};
const net=planCommercialUpdate([a,b],[corrected]);
assert.deepEqual(net.summary,{added:0,changed:1,unchanged:0,removed:0,rows:1});
assert.equal(net.rows.length,2);assert.equal(net.rows.find(r=>r.code===a.code)?.grossMargin,42);
assert.equal(planCommercialUpdate(net.rows,[corrected]).rows,net.rows);
assert.equal(planCommercialUpdate([a,b],[corrected],'scopes').summary.removed,1);
assert.equal(planCommercialUpdate([a],[{...a,code:'',grossMargin:40}]).rows[0].code,a.code);
assert.equal(planCommercialUpdate([{...a,code:''}],[a]).rows.length,1);
assert.throws(()=>planCommercialUpdate([a,{...a,code:'54321'}],[{...a,code:''}]),/varias cuentas/);
const triplet=[a,b,{...a,code:'12347',name:'Cliente C'}];
assert.throws(()=>planCommercialUpdate(triplet,triplet.map(r=>({...r,volume:r.volume/264}))),/escala/);
if(process.argv[2]&&process.argv[3]){
 const base=readCommercialReport(fs.readFileSync(process.argv[2])),bad=readCommercialReport(fs.readFileSync(process.argv[3]));
 assert.equal(base.kind,'detail');assert.equal(bad.kind,'customer-summary');assert.throws(()=>parseCommercial(fs.readFileSync(process.argv[3])),/resumen/);
 const originalName='valid.csv';
 const legacy=bad.rows.map(r=>({...r,code:'',name:r.code,product:r.name}));
 const data:CommercialData={rows:mergeCommercial(base.rows,legacy),source:'bad.csv',updatedAt:'old',paymentNames:[],history:[{source:originalName,at:'prev',rows:base.rows.length,from:base.from,to:base.to}]};
 const res=planCommercialRepair(data,bad,base,originalName);
 assert.ok(res.summary.matchesReference);assert.deepEqual(res.rows,base.rows);assert.equal(commercialImportStatus({...data,rows:res.rows}).suspectRows,0);
 assert.equal(planCommercialUpdate(res.rows,base.rows).summary.unchanged,base.rows.length);
 // A subsequent legitimate edit in a damaged scope is never overwritten.
 const keep=legacy.find(r=>r.name!=='NONE')!;
 const preserve={...data,rows:data.rows.map(r=>r===keep?{...r,grossMargin:r.grossMargin+1}:r)};
 const partial=planCommercialRepair(preserve,bad,base,originalName);
 assert.ok(partial.summary.unmatchedScopes>=1);assert.equal(partial.summary.matchesReference,false);
 console.log(JSON.stringify(res.summary));
}
console.log('PASS: same account with changed margin updates once, partial files preserve other accounts, currency/volume check, repair exactness.');
