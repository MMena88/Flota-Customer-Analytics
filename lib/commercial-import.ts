import {customerKey, matchCustomers, type CommercialData, type CommercialReport, type CommercialRow} from './commercial';

const scopeKey = (r: CommercialRow) => JSON.stringify([r.date, r.segment]);
const rowValue = (r: CommercialRow) => JSON.stringify([r.date,r.segment,r.code,r.name,r.product,r.volume,r.sales,r.cost,r.productMargin,r.variableCost,r.grossMargin]);
const dimensionMissing = (v:string) => !v || v === 'NONE';

function scopes(rows: CommercialRow[]) {
  const map = new Map<string,CommercialRow[]>();
  for (const r of rows) {
    const key=scopeKey(r), group=map.get(key);
    if (group) group.push(r); else map.set(key,[r]);
  }
  return map;
}

function sameScope(a: CommercialRow[] | undefined, b: CommercialRow[]) {
  if (!a || a.length !== b.length) return false;
  const left=a.map(rowValue).sort(),right=b.map(rowValue).sort();
  return left.every((value,i)=>value===right[i]);
}

export function commercialImportStatus(data: CommercialData) {
  let first='',last='',suspectRows=0;
  for (const r of data.rows) {
    if (!first || r.date<first) first=r.date;
    if (r.date>last) last=r.date;
    if (!r.code && /^\d{4,}$/.test(r.name) && !dimensionMissing(r.product) && !/^[\w]+(?:\s+SI)?\s+[-–—]\s+/.test(r.product)) suspectRows++;
  }
  const latest=data.history[0];
  return {first,last,totalRows:data.rows.length,suspectRows,source:data.source,updatedAt:data.updatedAt,
    canUndo:!!latest?.backup&&latest.kind==='import',
    history:data.history.map(({at,source,rows,from,to,kind})=>({at,source,rows,from,to,kind:kind||'import'}))};
}
export type ImportStatus=ReturnType<typeof commercialImportStatus>&{canEdit:boolean};

export type UpdateMode='rows'|'scopes';
export function planCommercialUpdate(saved:CommercialRow[],incoming:CommercialRow[],mode:UpdateMode='rows') {
  const affected=new Set(incoming.map(scopeKey));
  const {codes}=matchCustomers([...saved,...incoming],[]);
  function resolve(r:CommercialRow) {
    const name=customerKey(r.name),options=codes.get(name);
    const code=dimensionMissing(r.code)&&options?.size===1?[...options][0]:r.code;
    const labeled=dimensionMissing(code)?'name:'+name:'account:'+code;
    return {key:JSON.stringify([r.date,r.segment,labeled,r.product]),code,ambiguous:dimensionMissing(code)&&(options?.size||0)>1};
  }
  const old=new Map<string,CommercialRow>(),updated=new Set<string>(),ambiguousOld=new Set<string>();
  const nameProduct=(r:CommercialRow)=>JSON.stringify([scopeKey(r),customerKey(r.name),r.product]);
  for(const r of saved) if(affected.has(scopeKey(r))){
    const id=resolve(r);
    if(old.has(id.key))throw new Error('El histórico ya tiene dos filas para esta clave. Revisá la carga antes de sustituir valores.');
    old.set(id.key,r);
    if(id.ambiguous)ambiguousOld.add(nameProduct(r));
  }
  let added=0,changed=0,unchanged=0,largeScale=0,comparable=0;
  const normalized=incoming.map(r=>{
    const id=resolve(r);
    if(id.ambiguous||ambiguousOld.has(nameProduct(r)))throw new Error('Un nombre corresponde a varias cuentas. Exportá el detalle con código de cliente para identificar cada fila.');
    if(updated.has(id.key))throw new Error('El archivo tiene más de una fila para el mismo día, segmento, cliente y producto. Revisá las dimensiones.');
    updated.add(id.key);
    const before=old.get(id.key),row=id.code!==r.code?{...r,code:id.code}:r;
    if(!before)added++;
    else {
      if(rowValue(before)===rowValue(row))unchanged++;else changed++;
      if(before.volume>0&&row.volume>0&&row.sales>0&&Math.abs(before.sales-row.sales)<=1) {
        comparable++;
        const ratio=before.volume/row.volume;
        if(ratio>10||ratio<.1)largeScale++;
      }
    }
    return row;
  });
  if(largeScale>=3 && largeScale>=.8*comparable)throw new Error('El mismo importe de venta aparece con volúmenes en otra escala. Exportá Volume en la misma unidad que el histórico antes de guardar.');
  const removed=mode==='scopes'?[...old.keys()].filter(k=>!updated.has(k)).length:0;
  const summary={added,changed,unchanged,removed,rows:incoming.length};
  if(!added&&!changed&&!removed)return {rows:saved,summary};
  const kept=saved.filter(r=>!affected.has(scopeKey(r)) || mode==='rows'&&!updated.has(resolve(r).key));
  return {rows:[...kept,...normalized],summary};
}
export type UpdateSummary=ReturnType<typeof planCommercialUpdate>['summary'];

// Financial values are evidence for this incident only. A scope is recoverable
// when every saved field equals the old reader's output for the supplied source.
// No customer, partial match, or valid later edit is deleted by name or margin.
export function planCommercialRepair(current:CommercialData, bad:CommercialReport, good:CommercialReport, goodName:string) {
  if(bad.kind!=='customer-summary'||good.kind!=='detail')throw new Error('Seleccioná el resumen sin producto y un CSV de detalle que provenga del histórico anterior.');
  const reference=current.history.find(h=>(h.kind||'import')==='import'&&h.source===goodName&&h.from===good.from&&h.to===good.to&&h.rows===good.rows.length);
  if(!reference)throw new Error('El respaldo de detalle debe coincidir en nombre, fechas y cantidad de filas con una carga anterior del historial.');
  const originals=scopes(good.rows),active=scopes(current.rows);
  const legacy=scopes(bad.rows.map(r=>({...r,code:'',name:r.code,product:r.name})));
  const verified=new Set<string>();
  let quarantined=0,restored=0,withoutDetail=0,overwrittenScopes=0,unmatchedScopes=0;
  const pending=new Set<string>(),replacement:CommercialRow[]=[];
  for(const [scope,wrong] of legacy){
    if(!sameScope(active.get(scope),wrong)){unmatchedScopes++;continue;}
    verified.add(scope);quarantined+=wrong.length;
    const before=originals.get(scope);
    if(before){restored+=before.length;overwrittenScopes++;for(const row of before)replacement.push(row);}
    else{withoutDetail+=wrong.length;pending.add(wrong[0].date);}
  }
  if(!verified.size)throw new Error('Ningún día y segmento guardado coincide exactamente con el archivo mal leído. No hay filas comprobadas para reparar.');
  let anchors=0;
  for(const [scope,rows] of originals)if(!legacy.has(scope)&&sameScope(active.get(scope),rows))anchors+=rows.length;
  if(!anchors)throw new Error('No se pudo verificar el respaldo contra filas del histórico que están fuera de la carga afectada.');
  const kept=current.rows.filter(r=>!verified.has(scopeKey(r))),rows=[...kept,...replacement];
  const matchesReference=sameScope(rows,good.rows);
  return {rows:matchesReference?good.rows:rows,summary:{matchesReference,quarantined,restored,withoutDetail,verifiedScopes:verified.size,overwrittenScopes,unmatchedScopes,anchors,
    preserved:kept.length,totalRows:rows.length,pendingDates:[...pending].sort()}};
}
export type RepairSummary=ReturnType<typeof planCommercialRepair>['summary'];
