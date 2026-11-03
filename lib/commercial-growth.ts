import {commercialIdentity,matchCustomers,type CommercialRow} from './commercial';

export type Cadence='month'|'quarter'|'week';
export type GrowthMetric='sales'|'volume'|'grossMargin'|'productMargin'|'unitMargin';
export type GrowthTotals={rows:number;volume:number;sales:number;grossMargin:number;productMargin:number};
export type DateRange={start:string;end:string};
export type GrowthPeriod=DateRange&{key:string;label:string;partial:boolean;recordDays:number};
export type GrowthClient={key:string;customerId:string;name:string;codes:string[];segment:string;baseline:GrowthTotals;current:GrowthTotals;periods:GrowthTotals[]};
export type GrowthResult={clients:GrowthClient[];periods:GrowthPeriod[];segments:string[];products:string[];bounds:{first:string;last:string};scopeBounds:{first:string;last:string};comparison:{baseline:DateRange;current:DateRange;baselineDays:number;currentDays:number;baselineRecordDays:number;currentRecordDays:number};history:DateRange;cadence:Cadence;unidentifiedRows:number;warnings:string[];source:string;updatedAt:string};
export type GrowthFilter={segment?:string;product?:string;cadence?:Cadence;start?:string;end?:string;baseStart?:string;baseEnd?:string;currentStart?:string;currentEnd?:string;confirmedNames?:string[]};
export type GrowthStatus='up'|'down'|'flat'|'onlyCurrent'|'onlyBaseline'|'noBase'|'noData';
export const growthStatusLabels:Record<GrowthStatus,string>={up:'En crecimiento',down:'En caída',flat:'Sin cambio',onlyCurrent:'Solo período actual',onlyBaseline:'Sin registros actuales',noBase:'Sin base comparable',noData:'Sin registros en ambos'};
export const emptyTotals=():GrowthTotals=>({rows:0,volume:0,sales:0,grossMargin:0,productMargin:0});
export function addTotals(target:GrowthTotals,source:GrowthTotals){for(const key of ['rows','volume','sales','grossMargin','productMargin'] as const)target[key]+=source[key];return target;}
export function growthValue(t:GrowthTotals,metric:GrowthMetric,productSelected:boolean):number|null{
 if(!t.rows)return null;
 if((metric==='volume'||metric==='unitMargin')&&!productSelected)return null;
 return metric==='unitMargin'?(t.volume>0?t.grossMargin/t.volume:null):t[metric];
}
export function growthChange(previous:number|null,current:number|null):{pct:number|null;delta:number|null;status:GrowthStatus}{
 if(previous===null||current===null)return {pct:null,delta:null,status:previous===null&&current===null?'noData':previous===null?'onlyCurrent':'onlyBaseline'};
 const delta=current-previous;
 // Zero/negative bases cannot express ordinary growth; retain the absolute change.
 if(previous<=0)return {pct:null,delta,status:'noBase'};
 const pct=delta/previous*100;return {pct,delta,status:Math.abs(pct)<1e-8?'flat':pct>0?'up':'down'};
}
export function compareGrowth(previous:GrowthTotals,current:GrowthTotals,metric:GrowthMetric,productSelected:boolean){
 const a=growthValue(previous,metric,productSelected),b=growthValue(current,metric,productSelected);
 if((previous.rows>0&&a===null)||(current.rows>0&&b===null))return {pct:null,delta:null,status:'noBase' as GrowthStatus};
 return growthChange(a,b);
}
const DAY=86400000;
const timestamp=(day:string)=>Date.parse(day+'T00:00:00Z');
const iso=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const shiftDay=(day:string,n:number)=>iso(timestamp(day)+n*DAY);
export const rangeDays=(r:DateRange)=>Math.round((timestamp(r.end)-timestamp(r.start))/DAY)+1;
const validDate=(s:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(timestamp(s))&&iso(timestamp(s))===s;
export function calendarPeriod(day:string,cadence:Cadence):DateRange{
 const d=new Date(timestamp(day)),year=d.getUTCFullYear(),month=d.getUTCMonth();
 if(cadence==='week'){const start=shiftDay(day,-((d.getUTCDay()+6)%7));return {start,end:shiftDay(start,6)};}
 const startMonth=cadence==='quarter'?Math.floor(month/3)*3:month,size=cadence==='quarter'?3:1;
 return {start:iso(Date.UTC(year,startMonth,1)),end:iso(Date.UTC(year,startMonth+size,0))};
}
export function defaultComparison(last:string,cadence:Cadence){
 const current=calendarPeriod(last,cadence),baseline=calendarPeriod(shiftDay(current.start,-1),cadence);
 const days=Math.min(rangeDays({start:current.start,end:last}),rangeDays(baseline));
 return {baseline:{start:baseline.start,end:shiftDay(baseline.start,days-1)},current:{start:current.start,end:shiftDay(current.start,days-1)}};
}
function checkedRange(start:string,end:string,label:string){if(!validDate(start)||!validDate(end)||start>end)throw new Error(`Revisá las fechas de ${label}.`);if(rangeDays({start,end})>3660)throw new Error('Seleccioná un período de hasta diez años.');return {start,end};}
const inside=(day:string,r:DateRange)=>day>=r.start&&day<=r.end;
function periodLabel(start:string,cadence:Cadence){
 if(cadence==='quarter')return `T${Math.floor((Number(start.slice(5,7))-1)/3)+1} ${start.slice(0,4)}`;
 return new Date(timestamp(start)).toLocaleDateString('es-SV',{timeZone:'UTC',...(cadence==='month'?{month:'short' as const,year:'numeric' as const}:{day:'2-digit' as const,month:'short' as const,year:'numeric' as const})});
}
export function summarizeGrowth(rows:CommercialRow[],names:string[],filter:GrowthFilter={}):Omit<GrowthResult,'source'|'updatedAt'>{
 const cadence=filter.cadence||'month';if(!['month','quarter','week'].includes(cadence))throw new Error('Agrupación de períodos inválida.');
 const matches=matchCustomers(rows,names),segments=new Set(rows.map(r=>r.segment)),products=new Set<string>();
 const dates=rows.map(r=>r.date).sort(),bounds={first:dates[0]||'',last:dates.at(-1)||''};
 const scoped: {row:CommercialRow;identity:ReturnType<typeof commercialIdentity>}[]=[];
 for(const row of rows){const identity=commercialIdentity(row,matches,filter.confirmedNames);segments.add(identity.segment);if(filter.segment&&identity.segment!==filter.segment)continue;if(row.product)products.add(row.product);if(filter.product&&row.product!==filter.product)continue;scoped.push({row,identity});}
 const scopeDates=scoped.map(x=>x.row.date).sort(),scopeBounds={first:scopeDates[0]||'',last:scopeDates.at(-1)||''};
 const options={segments:[...segments].sort(),products:[...products].sort(),bounds,scopeBounds,cadence};
 if(!bounds.last)return {...options,clients:[],periods:[],comparison:{baseline:{start:'',end:''},current:{start:'',end:''},baselineDays:0,currentDays:0,baselineRecordDays:0,currentRecordDays:0},history:{start:'',end:''},unidentifiedRows:0,warnings:[]};
 const defaults=defaultComparison(bounds.last,cadence);
 const history=checkedRange(filter.start||bounds.first,filter.end||bounds.last,'la gráfica');
 const baseline=checkedRange(filter.baseStart||defaults.baseline.start,filter.baseEnd||defaults.baseline.end,'el período base');
 const current=checkedRange(filter.currentStart||defaults.current.start,filter.currentEnd||defaults.current.end,'el período actual');
 if(baseline.end>=current.start)throw new Error('El período base debe terminar antes de que comience el período actual.');
 const periods:GrowthPeriod[]=[];
 // Use the loaded file's bounds, not the first/last purchase of a filtered
 // product or customer: an infrequent purchase does not make a month partial.
 for(let date=calendarPeriod(history.start,cadence).start;date<=history.end;){const natural=calendarPeriod(date,cadence),start=natural.start<history.start?history.start:natural.start,end=natural.end>history.end?history.end:natural.end;periods.push({key:natural.start,label:periodLabel(natural.start,cadence),start,end,partial:start!==natural.start||end!==natural.end||start<bounds.first||end>bounds.last,recordDays:0});date=shiftDay(natural.end,1);}
 if(periods.length>240)throw new Error('La gráfica admite hasta 240 períodos. Acortá el rango o agrupá por mes o trimestre.');
 const indices=new Map(periods.map((p,i)=>[p.key,i])),periodDates=periods.map(()=>new Set<string>()),baseDates=new Set<string>(),currentDates=new Set<string>(),clients=new Map<string,GrowthClient>();let unidentifiedRows=0;
 for(const {row:r,identity} of scoped){
  const inBase=inside(r.date,baseline),inCurrent=inside(r.date,current),inHistory=inside(r.date,history);if(!inBase&&!inCurrent&&!inHistory)continue;
  const index=inHistory?indices.get(calendarPeriod(r.date,cadence).start):undefined;
  if(inBase)baseDates.add(r.date);if(inCurrent)currentDates.add(r.date);if(index!==undefined)periodDates[index].add(r.date);
  if(!identity.identified){unidentifiedRows++;continue;}
  const key=JSON.stringify([identity.customerId,identity.segment]);let client=clients.get(key);
  if(!client){client={key,customerId:identity.customerId,name:r.name,codes:[],segment:identity.segment,baseline:emptyTotals(),current:emptyTotals(),periods:periods.map(emptyTotals)};clients.set(key,client);}
  if(r.code&&r.code!=='NONE'&&!client.codes.includes(r.code))client.codes.push(r.code);
  const values={rows:1,volume:r.volume,sales:r.sales,grossMargin:r.grossMargin,productMargin:r.productMargin};
  if(inBase)addTotals(client.baseline,values);if(inCurrent)addTotals(client.current,values);if(index!==undefined)addTotals(client.periods[index],values);
 }
 periods.forEach((p,i)=>p.recordDays=periodDates[i].size);
 const baselineDays=rangeDays(baseline),currentDays=rangeDays(current),warnings:string[]=[];
 if(baselineDays!==currentDays)warnings.push(`Los períodos tienen distinta duración: ${baselineDays} y ${currentDays} días. El cambio compara acumulados, sin extrapolar.`);
 for(const [label,range,count] of [['base',baseline,baseDates.size],['actual',current,currentDates.size]] as const){if(!count)warnings.push(`No hay registros cargados para el período ${label} con estos filtros.`);else if(range.start<bounds.first||range.end>bounds.last)warnings.push(`El período ${label} se extiende fuera del histórico cargado.`);}
 if(periods.some(p=>p.partial))warnings.push('La gráfica incluye períodos parciales. Sus cambios porcentuales frente a períodos de distinta cobertura no se calculan.');
 return {...options,clients:[...clients.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.segment.localeCompare(b.segment)),periods,comparison:{baseline,current,baselineDays,currentDays,baselineRecordDays:baseDates.size,currentRecordDays:currentDates.size},history,unidentifiedRows,warnings};
}
