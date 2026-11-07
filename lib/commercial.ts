import {fuelFamilyOf, groupProducts, groupLabel} from './commercial-products';
import {fromGallons, type DisplayUnit} from './volume-units';

export type CommercialRow={date:string;segment:string;code:string;name:string;product:string;volume:number;sales:number;cost:number;productMargin:number;variableCost:number;grossMargin:number};
export type CommercialHistory={at:string;source:string;rows:number;from:string;to:string;kind?:'import'|'repair'|'undo';backup?:string;operation?:string};
export type CommercialData={rows:CommercialRow[];updatedAt:string;source:string;paymentNames:string[];confirmedNames?:string[];history:CommercialHistory[]};
export const customerKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function csv(text:string,delimiter:string){const result:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}else if(!quoted&&(c===delimiter||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){result.push(row);row=[]}}else cell+=c;}if(quoted)throw new Error('Comillas sin cerrar en el archivo.');if(cell||row.length){row.push(cell.replace(/\r$/,''));result.push(row)}return result;}
function numericValue(s:string,label:string){const t=s.trim().replace(/,/g,'').replace(/^\((.*)\)$/,'-$1');if(!t)return 0;if(!/^-?\d+(\.\d+)?$/.test(t))throw new Error('Número inválido en '+label);const v=Number(t);if(!Number.isFinite(v)||Math.abs(v)>1e13)throw new Error('Valor fuera de rango en '+label);return v;}
export const missingProductMessage='Este CSV es un resumen por código y nombre de cliente. Para actualizar volumen y margen por producto, exportá Segmento, Día, Mes, Código de cliente, Nombre del cliente y Producto, con la misma unidad de volumen del histórico.';
const isAccountNumber=(s:string)=>/^\d+$/.test(s.trim());
const isBlankDimension=(s:string)=>!s.trim()||s.trim().toUpperCase()==='NONE';
const looksLikeSku=(s:string)=>/^\s*(?=[\w]*\d)[\w]+(?:\s+SI)?\s+[-–—]\s+\S/i.test(s);
const looksLikeCompany=(s:string)=>/\b(?:S\s*\.?\s*A\s*\.?\s*(?:DE\s+)?C\s*\.?\s*V\b|DE\s+C\s*\.?\s*V\b)/i.test(s);
export type CommercialReport={kind:'detail'|'customer-summary';rows:CommercialRow[];totals:number;from:string;to:string};
export function readCommercialReport(bytes:Uint8Array):CommercialReport {
 const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
 const text=new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 const first=text.split('\n').slice(0,3).join('\n'),delimiter=first.includes('\t')?'\t':first.includes(';')?';':',';
 const lines=csv(text,delimiter),hi=lines.findIndex(r=>r.includes('Volume')&&r.includes('Product Cost'));
 if(hi<0)throw new Error('No se encontraron las columnas Volume y Product Cost de Commercial All Values.');
 const header=lines[hi],vi=header.indexOf('Volume');
 if(![5,6].includes(vi))throw new Error('Revisá el orden de las columnas. Usá Segmento, Día, Mes, Código de cliente (opcional), Nombre del cliente y Producto.');
 const metrics=['Volume','Product Sales','Product Cost','Product Margin','Variable Cost','Total Gross Margin'] as const;
 const indices=metrics.map(m=>{const i=header.indexOf(m);if(i<0)throw new Error('Falta '+m);return i;});
 const years=lines.slice(0,hi).flat().map(s=>s.trim()).filter(x=>/^20\d{2}$/.test(x));
 if(new Set(years).size!==1)throw new Error('Exportá un año por archivo, con el año en el encabezado.');
 const year=years[0],months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const detail:{r:string[];line:number}[]=[];let totals=0;
 for(let i=hi+1;i<lines.length;i++){
  const r=lines[i];if(!r.some(x=>x.trim()))continue;
  if(r[0]==='Grand Total'||r[1]==='Total'){totals++;continue;}
  if(r.length!==header.length)throw new Error(`Fila ${i+1}: cantidad de columnas inválida.`);
  detail.push({r,line:i+1});
 }
 if(!detail.length||detail.length>250000)throw new Error('El archivo debe contener entre 1 y 250.000 filas de detalle.');
 // Tableau exports label the dimensions "Selected Column N". Two different
 // five-dimension layouts exist; determine the grain before assigning fields.
 const named=detail.filter(({r})=>!isBlankDimension(r[3]));
 const numeric=named.filter(({r})=>isAccountNumber(r[3])).length;
 const allAccounts=vi===5&&numeric>0&&numeric===named.length;
 if(allAccounts&&detail.some(({r})=>looksLikeSku(r[4])))throw new Error('El archivo trae códigos de cuenta y productos, pero falta el nombre del cliente. Revisá las dimensiones del reporte.');
 const kind=allAccounts?'customer-summary':'detail';
 if(vi===5&&kind==='detail'&&!/^(?:producto?|sku|item|product (?:code|name))$/i.test(header[4].trim())&&!detail.some(({r})=>looksLikeSku(r[4])||fuelFamilyOf(r[4])!==null)){
  throw new Error('Las cinco columnas no identifican un producto verificable. Incluí Producto con su código y descripción, o usá el encabezado Producto para el detalle sin código de cliente.');
 }
 if(kind==='detail'&&detail.some(({r})=>!looksLikeSku(r[vi-1])&&looksLikeCompany(r[vi-1])))throw new Error('La columna de producto contiene nombres de clientes. Exportá el detalle con Producto después del nombre del cliente.');
 if(vi===5&&(!named.length&&!detail.some(({r})=>looksLikeSku(r[4]))||numeric>0&&!allAccounts))throw new Error('No se distinguen nombre, código y producto. Exportá las seis dimensiones de Commercial con el código de cliente separado.');
 const ci=vi===6||allAccounts?3:-1,ni=allAccounts?4:vi-2;
 const rows:CommercialRow[]=[],keys=new Set<string>();let from='',to='';
 for(const {r,line} of detail){
  const month=months.indexOf(r[2].trim().toLowerCase())+1,day=Number(r[1]);
  if(!r[0].trim()||!month||!Number.isInteger(day)||day<1||day>31)throw new Error(`Segmento o fecha inválidos en fila ${line}.`);
  const date=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error(`Fecha inválida en fila ${line}.`);
  const [volume,sales,cost,productMargin,variableCost,grossMargin]=indices.map((idx,i)=>numericValue(r[idx],metrics[i]));
  const row={date,segment:r[0].trim(),code:ci>=0?r[ci].trim():'',name:r[ni].trim(),product:allAccounts?'':r[vi-1].trim(),volume,sales,cost,productMargin,variableCost,grossMargin};
  const key=JSON.stringify([date,row.segment,row.code||customerKey(row.name),allAccounts?row.name:row.product]);
  if(keys.has(key))throw new Error(`Clave repetida en fila ${line}. Exportá una sola fila por día, segmento, cliente y producto. Si hay nombres iguales, incluí el código de cuenta.`);
  keys.add(key);rows.push(row);if(!from||date<from)from=date;if(date>to)to=date;
 }
 return {kind,rows,totals,from,to};
}
export function parseCommercial(bytes:Uint8Array){
 const report=readCommercialReport(bytes);
 if(report.kind!=='detail')throw new Error(missingProductMessage);
 return report;
}
// Replace only dates actually present for each channel, including removed/corrected products.
export function mergeCommercial(old:CommercialRow[],incoming:CommercialRow[]){const scopes=new Set(incoming.map(r=>JSON.stringify([r.date,r.segment])));return [...old.filter(r=>!scopes.has(JSON.stringify([r.date,r.segment]))),...incoming];}
export function matchCustomers(rows:CommercialRow[],names:string[]){
 const codes=new Map<string,Set<string>>();
 const latestName=new Map<string,{date:string;name:string}>();
 for(const r of rows){
  const k=customerKey(r.name);if(!k||k==='NONE')continue;
  let set=codes.get(k);if(!set){set=new Set();codes.set(k,set)}
  if(r.code&&r.code!=='NONE'){
   set.add(r.code);
   const prior=latestName.get(r.code);
   if(!prior||r.date>prior.date||r.date===prior.date&&r.name<prior.name) latestName.set(r.code,{date:r.date,name:r.name});
  }
 }
 return {payment:new Set(names.map(customerKey)),codes,latestName};
}
export type CustomerView = 'name' | 'account';
// Payment24 classification uses the original linkage rules, independently of
// the display identity used to combine purchases across account codes.
export function commercialIdentity(row:CommercialRow,matches:ReturnType<typeof matchCustomers>,confirmedNames:ReadonlySet<string>,view?:CustomerView){
 const key=customerKey(row.name),known=!!key&&key!=='NONE',codes=matches.codes.get(key);
 const code=row.code&&row.code!=='NONE'?row.code:codes?.size===1?[...codes][0]:'';
 const name=(view&&code?matches.latestName.get(code)?.name:undefined)||(known?row.name:'');
 const nameKey=customerKey(name),identified=!!nameKey;
 const payment=known&&matches.payment.has(key)&&((codes?.size??0)<=1||confirmedNames.has(key));
 const customerId=!identified?'unassigned':view==='name'?'name:'+nameKey:view==='account'&&code?'code:'+code:payment?'payment:'+key:code?'code:'+code:'name:'+nameKey;
 return {identified,payment,customerId,code,name,segment:payment?'B2B · Payment24':row.segment};
}
export type CommercialPoint={key:string;customerId:string;name:string;code:string;codes:string[];segment:string;product:string;sourceProducts?:string[];identified:boolean;sourceSegments:string[];volume:number;sales:number;cost:number;margin:number;unitMargin:number|null;payment:boolean};
export function summarizeCommercial(rows:CommercialRow[],names:string[],metric:'grossMargin'|'productMargin',filter:{start?:string;end?:string;segment?:string;product?:string;family?:string;groupFuels?:boolean;customerView?:CustomerView;search?:string;confirmedNames?:string[]}={}){
 const matches=matchCustomers(rows,names),confirmed=new Set(filter.confirmedNames),map=new Map<string,CommercialPoint>();let adjustments=0,unidentified=0;
 const catalog=groupProducts(rows.map(r=>r.product));
 const search=customerKey(filter.search||'');
 const searchedNames=new Set<string>();
 if(search&&filter.customerView==='name'){
  for(const [code,canonical] of matches.latestName) if(code.includes(search)||customerKey(canonical.name).includes(search)) searchedNames.add(customerKey(canonical.name));
  for(const [alias,codes] of matches.codes) if(alias.includes(search)) for(const code of codes) searchedNames.add(customerKey(matches.latestName.get(code)!.name));
 }
 for(const r of rows){if(filter.start&&r.date<filter.start||filter.end&&r.date>filter.end||filter.product!==undefined&&r.product!==filter.product)continue;
 const family=catalog.byProduct.get(r.product);
 if(filter.family&&family!==filter.family)continue;
 const {identified,payment,customerId,segment,name,code}=commercialIdentity(r,matches,confirmed,filter.customerView);
 if(filter.segment&&segment!==filter.segment||search&&!searchedNames.has(customerKey(name))&&!customerKey(r.name+' '+r.code).includes(search))continue;
 if(!identified)unidentified++;if(r.volume===0&&r[metric]!==0)adjustments++;
 // Include every original row once in its displayed client, segment and product.
 const group=filter.groupFuels&&filter.product===undefined?family:null;
 const key=JSON.stringify(group?[customerId,segment,'family',group]:[customerId,segment,r.product]);
 let p=map.get(key);
 if(!p){
  p={key,customerId,name:identified?name:'Sin cliente informado',code:'',codes:[],segment,
   product:group?'Grupo · '+groupLabel(group):r.product,...(group?{sourceProducts:[]}:{}),
   identified,sourceSegments:[],volume:0,sales:0,cost:0,margin:0,unitMargin:null,payment};
  map.set(key,p);
 }
 if(p.sourceProducts&&!p.sourceProducts.includes(r.product))p.sourceProducts.push(r.product);
 if(code&&!p.codes.includes(code))p.codes.push(code);
 if(!p.sourceSegments.includes(r.segment))p.sourceSegments.push(r.segment);
 p.volume+=r.volume;p.sales+=r.sales;p.cost+=r.cost;p.margin+=r[metric];
 }const points=[...map.values()].map(p=>({...p,code:p.codes.sort().join(', '),...(p.sourceProducts?{sourceProducts:p.sourceProducts.sort()}:{}),unitMargin:p.volume>0?p.margin/p.volume:null})).sort((a,b)=>b.volume-a.volume);return {points,adjustments,unidentified,ambiguous:[...matches.codes].filter(([k,v])=>matches.payment.has(k)&&v.size>1&&!filter.confirmedNames?.includes(k)).length};
}

export function commercialPointInUnit(point:CommercialPoint, unit:DisplayUnit):CommercialPoint {
 if(unit==='gal')return point;
 const volume=fromGallons(point.volume,unit);
 return {...point,volume,unitMargin:volume>0?point.margin/volume:null};
}

export function customerAudit(points:CommercialPoint[]) {
 const names=new Map<string,{name:string;codes:Set<string>}>();
 const accounts=new Set<string>();
 for(const p of points){
  if(!p.identified)continue;
  const id=customerKey(p.name), entry=names.get(id)||{name:p.name,codes:new Set<string>()};
  for(const code of p.codes){entry.codes.add(code);accounts.add(code);}
  names.set(id,entry);
 }
 const shared=[...names.values()].filter(n=>n.codes.size>1)
  .sort((a,b)=>b.codes.size-a.codes.size||a.name.localeCompare(b.name))
  .map(n=>({name:n.name,codes:[...n.codes].sort()}));
 return {customers:names.size,accounts:accounts.size,shared};
}
