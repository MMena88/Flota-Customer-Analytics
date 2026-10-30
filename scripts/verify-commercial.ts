import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCommercial,mergeCommercial,summarizeCommercial,customerKey} from '../lib/commercial';
import {readPaymentXlsx} from '../lib/payment-xlsx';
const path=process.argv[2],paymentPath=process.argv[3];
const sample={date:'2026-10-01',segment:'113 - Fuels - BtoB',code:'1',name:'Ejemplo, S.A.',product:'Diesel',volume:100,sales:400,cost:370,productMargin:30,variableCost:5,grossMargin:25};
const adjusted={...sample,date:'2026-10-02',volume:0,grossMargin:-5};
const base=[sample,adjusted];assert.deepEqual(mergeCommercial(base,base),base);assert.equal(mergeCommercial(base,[{...sample,volume:120}]).length,2);assert.equal(mergeCommercial(base,[{...sample,volume:120}])[1].volume,120);
const s=summarizeCommercial(base,['EJEMPLO S.A.'],'grossMargin');assert.equal(s.points[0].unitMargin,.2);assert.equal(s.points[0].segment,'B2B · Payment24');assert.equal(s.adjustments,1);
assert.equal(summarizeCommercial([{...sample,volume:0}],[],'grossMargin').points[0].unitMargin,null);
assert.equal(summarizeCommercial([sample,{...sample,code:'2'}],['Ejemplo SA'],'grossMargin').ambiguous,1);
assert.equal(summarizeCommercial([{...sample,name:'NONE'}],[],'grossMargin').points.length,0);
if(path){const parsed=parseCommercial(fs.readFileSync(path));assert.deepEqual(mergeCommercial(parsed.rows,parsed.rows),parsed.rows);const sum=(key:'volume'|'grossMargin')=>parsed.rows.reduce((a,r)=>a+r[key],0);console.log(JSON.stringify({rows:parsed.rows.length,totalsExcluded:parsed.totals,from:parsed.from,to:parsed.to,volume:sum('volume'),grossMargin:sum('grossMargin')}));
 if(paymentPath){const p=await readPaymentXlsx(new Blob([fs.readFileSync(paymentPath)]));assert.equal(p.errors.length,0);const names=[...new Set(p.rows.map(r=>r.customer_name))];const commercialNames=new Set(parsed.rows.map(r=>customerKey(r.name)));const matched=names.filter(n=>commercialNames.has(customerKey(n)));const summary=summarizeCommercial(parsed.rows,names,'grossMargin',{product:'32015 - Diesel Bajo Azufre con Hitec 6600D'});console.log(JSON.stringify({paymentRows:p.rows.length,paymentNames:names.length,namesMatched:matched.length,ambiguous:summary.ambiguous,dieselClients:summary.points.length,b2bDieselClients:summary.points.filter(p=>p.payment).length}));}}
console.log('PASS: replacement, repeated upload, adjustments, weighted margin, zero volume, ambiguous names, unidentified customer.');
