import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCommercial, summarizeCommercial, type CommercialRow} from '../lib/commercial';
import {compareCommercialVolume} from '../lib/commercial-comparison';
import {fuelFamilyOf, type FuelFamily} from '../lib/commercial-products';

const expected: Record<FuelFamily, string[]> = {
  'fuel-oil': ['50050', '50060'],
  diesel: ['30005', '30015', '30015 SI', '32005', '32005 SI', '32015', '44005', '44015'],
  regular: ['10087', '10087 SI', '12087', '44087'],
  premium: ['10091', '10091 SI', '12091', '44091'],
};
for (const [family, codes] of Object.entries(expected)) {
  for (const code of codes) assert.equal(fuelFamilyOf(code + ' - Producto'), family);
}
for (const unmapped of ['50047 - Fuel Oil 475','550047000 - Shell Rimula R5 10W30 Diesel','550049771 - Shell Nautilus Premium Outboard TCW3 1QT','8003 - Aditivo HiTEC 46001 Diesel Bulk','500500 - Fuel Oil 500 cSt','99001 - Shell V-Power','Fuel Oil','Shell Rimula R5 10W30 Diesel','', 'NONE']) {
  assert.equal(fuelFamilyOf(unmapped), null, unmapped);
}
assert.equal(fuelFamilyOf('44091 — Shell V-Power'), 'premium');
assert.equal(fuelFamilyOf('Shell V–Power'), 'premium');
assert.equal(fuelFamilyOf('Diésel bajo azufre SI'), 'diesel');
assert.equal(fuelFamilyOf('30015SI - Diésel'), 'diesel');

const segment = 'Canal de prueba', dateA = '2026-09-01', dateB = '2026-10-01';
function row(date: string, product: string, volume: number, margin: number, name = 'Cliente A'): CommercialRow {
  return {date, product, volume, grossMargin:margin, productMargin:margin*2, sales:volume*4, cost:volume*4-margin, variableCost:0, segment, name, code:name};
}
const prior = '50050 - Fuel Oil 500 cSt', other = '50060 - Fuel Oil 600 cSt';
const rows = [row(dateA,prior,100,20),row(dateB,other,200,60),row(dateB,prior,-20,-5),row(dateA,other,0,-2),row(dateA,'50047 - Fuel Oil 475',80,65),row(dateB,'44091 - Shell V-Power',30,10),row(dateB,prior,10,5,'Cuenta Payment')];
const options = {family:'fuel-oil' as const, groupFuels:true};
const points = summarizeCommercial(rows,['Cuenta Payment'],'grossMargin',options).points;
assert.equal(points.length,2);
const combined=points.find(p=>p.segment===segment)!;
assert.deepEqual(new Set(combined.sourceProducts),new Set([prior,other]));
assert.deepEqual([combined.volume,combined.margin,combined.unitMargin], [280,73,73/280]);
assert.equal(summarizeCommercial(rows,[],'productMargin',{...options,segment}).points.find(p=>p.name==='Cliente A')?.unitMargin,146/280);
assert.equal(summarizeCommercial(rows,[],'grossMargin',{...options,groupFuels:false}).points.length,3);
assert.equal(summarizeCommercial(rows,[],'grossMargin',{product:prior,groupFuels:true}).points[0].product,prior);
const q={mode:'custom',baseStart:dateA,baseEnd:dateA,currentStart:dateB,currentEnd:dateB, family:'fuel-oil'};
const c=compareCommercialVolume(rows,['Cuenta Payment'],[],{...q,segment});
assert.deepEqual([c.clients.length,c.clients[0].base,c.clients[0].current,c.clients[0].delta,c.clients[0].points], [1,100,180,80,80]);
assert.equal(compareCommercialVolume(rows,['Cuenta Payment'],[],q).fuelSummary[0].current,190);
assert.deepEqual(c.fuelSummary.map(x=>x.id),['fuel-oil']);
assert.equal(compareCommercialVolume(rows,['Cuenta Payment'],[],{...q,segment:'B2B · Payment24'}).clients[0].current,10);
assert.equal(compareCommercialVolume(rows,[],[],{...q,mode:'ytd'}).fuelSummary[0].delta,null);
assert.equal(compareCommercialVolume(rows,[],[],{...q,family:undefined,product:prior}).segments[0].current,-10);
assert.ok(c.catalog.includes('50047 - Fuel Oil 475'));
console.log('PASS: exact codes, Shell and Puma, SI, exclusions, unlisted codes, signed volume, weighted margins, customer attribution and YTD.');

if(process.argv[2]){
  const {rows}=parseCommercial(fs.readFileSync(process.argv[2]));
  const overview=compareCommercialVolume(rows,[],[],{});
  const tag=(r: CommercialRow)=>r.product.split(' - ')[0];
  const near=(x:number,y:number)=>assert.ok(Math.abs(x-y)<1e-5, x+' != '+y);
  for(const [family,codes] of Object.entries(expected)){
    const raw=rows.filter(r=>codes.includes(tag(r)));
    assert.deepEqual(new Set(overview.catalog.filter(p=>fuelFamilyOf(p)===family)),new Set(raw.map(r=>r.product)));
    const summary=overview.fuelSummary.find(s=>s.id===family)!;
    const scoped=compareCommercialVolume(rows,[],[],{family});
    for(const side of ['base','current'] as const){
      const dates=overview.periods![side],source=raw.filter(r=>r.date>=dates.start&&r.date<=dates.end);
      const expectedVolume=source.reduce((n,r)=>n+r.volume,0);
      near(summary[side],expectedVolume);
      near(scoped.segments.reduce((n,s)=>n+s[side],0),expectedVolume);
      const plot=summarizeCommercial(rows,[],'grossMargin',{family:summary.id,groupFuels:true,start:dates.start,end:dates.end});
      near(plot.points.reduce((n,p)=>n+p.volume,0),expectedVolume);
      near(plot.points.reduce((n,p)=>n+p.margin,0),source.reduce((n,r)=>n+r.grossMargin,0));
      assert.ok(plot.points.every(p=>p.unitMargin===(p.volume>0?p.margin/p.volume:null)));
    }
    console.log(JSON.stringify({family,refs:new Set(raw.map(r=>r.product)).size,base:summary.base,current:summary.current,delta:summary.delta}));
  }
  const all=summarizeCommercial(rows,[],'grossMargin',{groupFuels:true}).points;
  near(all.reduce((n,p)=>n+p.volume,0),rows.reduce((n,r)=>n+r.volume,0));
  near(all.reduce((n,p)=>n+p.margin,0),rows.reduce((n,r)=>n+r.grossMargin,0));
  near(all.reduce((n,p)=>n+p.sales,0),rows.reduce((n,r)=>n+r.sales,0));
  near(all.reduce((n,p)=>n+p.cost,0),rows.reduce((n,r)=>n+r.cost,0));
  console.log('PASS: every source product and both monthly totals reconciled to the report; full portfolio revenue basis and volume preserved.');
}

// Two accounts under the same customer purchase different brands at different
// margins. Reconcile both axes, all money and the two-period attribution.
const {commercialPointInUnit,customerAudit}=await import('../lib/commercial');
const {comparisonInUnit}=await import('../lib/commercial-comparison');
const {groupProducts,fleetMix}=await import('../lib/commercial-products');
const {recordsInUnit,fromGallons}=await import('../lib/volume-units');
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const shell='44015 - Shell FuelSave Diesel',puma='30015 - DIESEL BAJO AZUFRE';
const accountRows=[
  {...row(dateA,puma,100,10,'Transportes, S.A.'),code:'100'},
  {...row(dateB,shell,300,90,'TRANSPÓRTES S.A.'),code:'200'},
  {...row(dateB,shell,-20,-2,'Transportes S.A.'),code:'200'},
  {...row(dateB,shell,0,-3,'Transportes S.A.'),code:'200'},
  {...row(dateB,shell,9,5,'Transportes del Sur'),code:'201'},
  {...row(dateB,puma,0,7,'NONE'),code:'NONE'}
];
const optionsByName={customerView:'name' as const,groupFuels:true};
const summary=summarizeCommercial(accountRows,[],'grossMargin',optionsByName).points;
const audit=customerAudit(summary);
assert.deepEqual([audit.customers,audit.accounts,audit.shared.length],[2,3,1]);
assert.deepEqual(audit.shared[0].codes,['100','200']);
const diesel=summary.find(p=>p.codes.length===2)!;
assert.equal(diesel.product,'Grupo · Diésel');
assert.deepEqual(new Set(diesel.sourceProducts),new Set([shell,puma]));
assert.deepEqual([diesel.margin,diesel.volume,diesel.unitMargin],[95,380,.25]);
const m3=commercialPointInUnit(diesel,'m³');close(m3.volume,1.43845647792);close(m3.unitMargin!,95/m3.volume);
assert.deepEqual([m3.sales,m3.cost,m3.margin],[diesel.sales,diesel.cost,diesel.margin]);
const searchByCode=summarizeCommercial(accountRows,[],'grossMargin',{...optionsByName,search:'100'}).points;
assert.deepEqual(searchByCode,[diesel]);
assert.equal(summarizeCommercial(accountRows,[],'grossMargin',{customerView:'account',groupFuels:true}).points.filter(p=>p.identified).length,3);
assert.equal(commercialPointInUnit(summary.find(r=>!r.identified)!,'m³').unitMargin,null);
const periodResults=compareCommercialVolume(accountRows,[],[],{...q,segment,customerView:'name',family:'diesel'});
const periodMetric=comparisonInUnit(periodResults,'m³'),a=periodResults.clients.find(c=>c.codes.length===2)!,b=periodMetric.clients.find(c=>c.id===a.id)!;
assert.deepEqual([a.base,a.current,a.delta],[100,280,180]);close(b.delta!,fromGallons(180,'m³'));assert.equal(b.pct,a.pct);assert.equal(b.points,a.points);
const packs=['5000052 - Puma SUPER HD 25W50, 55AG','5000053 - Puma SUPER HD 25W50, 5AG','5000048 - Puma SUPER HD 15W40, 55AG','550047000 - Shell Rimula R5 10W30 Diesel'];
const groupedPacks=groupProducts(packs);
assert.equal(groupedPacks.members.size,1);const [packId]=groupedPacks.members.keys();assert.deepEqual(groupedPacks.members.get(packId),packs.slice(0,2));
const packRows=packs.map((p,i)=>row(i===0?dateA:dateB,p,10,2));
assert.equal(summarizeCommercial(packRows,[],'grossMargin',{...optionsByName,family:packId}).points[0].volume,20);
assert.equal(compareCommercialVolume(packRows,[],[],{...q,family:packId,segment}).clients[0].current,10);
assert.deepEqual(fleetMix([{product:'Diesel',volume:12},{product:'Low Sulphur Diesel 50',volume:-2}],['Diesel','Low Sulphur Diesel 50']),[{value:'group:diesel',label:'Diésel',volume:10}]);
const mixed=recordsInUnit([{volume:1000,unit:'gal'},{volume:1,unit:'m³'},{volume:1000,unit:'L'},{volume:1,unit:'bbl'},{volume:5,unit:'kg'}],'m³');
assert.equal(mixed.length,4);close(mixed.reduce((s,r)=>s+r.volume,0),3.785411784+2+.158987294928);
console.log('PASS: name and account audit, cross-brand customer, signed volumes, weighted USD/m³, returns, comparison percentages, source codes, lube presentations and source units.');
