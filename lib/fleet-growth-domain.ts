export type Cadence='month'|'quarter'|'week';
export type GrowthMetric='volume'|'amount';
export type GrowthTotals={rows:number;volume:number;amount:number};
export type DateRange={start:string;end:string};
export type GrowthPeriod=DateRange&{key:string;label:string;partial:boolean;recordDays:number};
export type GrowthClient={key:string;customerId:string;name:string;codes:string[];baseline:GrowthTotals;current:GrowthTotals;periods:GrowthTotals[]};
export type GrowthStatus='up'|'down'|'flat'|'onlyCurrent'|'onlyBaseline'|'noBase'|'noData';
export const growthStatusLabels:Record<GrowthStatus,string>={up:'En crecimiento',down:'En caída',flat:'Sin cambio',onlyCurrent:'Solo período actual',onlyBaseline:'Sin registros actuales',noBase:'Sin base comparable',noData:'Sin registros en ambos'};
export const emptyTotals=():GrowthTotals=>({rows:0,volume:0,amount:0});
export function addTotals(target:GrowthTotals,source:GrowthTotals){target.rows+=source.rows;target.volume+=source.volume;target.amount+=source.amount;return target;}
export function growthValue(t:GrowthTotals,metric:GrowthMetric):number|null{return t.rows?t[metric]:null;}
export function growthChange(previous:number|null,current:number|null):{pct:number|null;delta:number|null;status:GrowthStatus}{
 if(previous===null||current===null)return {pct:null,delta:null,status:previous===null&&current===null?'noData':previous===null?'onlyCurrent':'onlyBaseline'};
 const delta=current-previous;if(previous<=0)return {pct:null,delta,status:'noBase'};
 const pct=delta/previous*100;return {pct,delta,status:Math.abs(pct)<1e-8?'flat':pct>0?'up':'down'};
}
export const compareGrowth=(previous:GrowthTotals,current:GrowthTotals,metric:GrowthMetric)=>growthChange(growthValue(previous,metric),growthValue(current,metric));
export type GrowthFilter={cadence?:Cadence;start?:string;end?:string;baseStart?:string;baseEnd?:string;currentStart?:string;currentEnd?:string};
export type FleetGrowthDaily=GrowthTotals&{client_id:string;date:string};
export type FleetGrowthAccount={client_id:string;account:string;name:string};
export type GrowthBounds={first:string;last:string};
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
export function planFleetGrowth(bounds:GrowthBounds,filter:GrowthFilter={}){
 const cadence=filter.cadence||'month';if(!['month','quarter','week'].includes(cadence))throw new Error('Agrupación de períodos inválida.');
 const blank={start:'',end:''};if(!bounds.last)return {cadence,history:blank,baseline:blank,current:blank,periods:[] as GrowthPeriod[]};
 const defaults=defaultComparison(bounds.last,cadence),history=checkedRange(filter.start||bounds.first,filter.end||bounds.last,'la gráfica'),baseline=checkedRange(filter.baseStart||defaults.baseline.start,filter.baseEnd||defaults.baseline.end,'el período base'),current=checkedRange(filter.currentStart||defaults.current.start,filter.currentEnd||defaults.current.end,'el período actual');
 if(baseline.end>=current.start)throw new Error('El período base debe terminar antes de que comience el período actual.');
 const periods:GrowthPeriod[]=[];
 for(let day=calendarPeriod(history.start,cadence).start;day<=history.end;){const natural=calendarPeriod(day,cadence),start=natural.start<history.start?history.start:natural.start,end=natural.end>history.end?history.end:natural.end;periods.push({key:natural.start,label:periodLabel(natural.start,cadence),start,end,partial:start!==natural.start||end!==natural.end||start<bounds.first||end>bounds.last,recordDays:0});day=shiftDay(natural.end,1);}
 if(periods.length>240)throw new Error('La gráfica admite hasta 240 períodos. Acortá el rango o agrupá por mes o trimestre.');
 return {cadence,history,baseline,current,periods};
}
export function summarizeFleetGrowth(daily:FleetGrowthDaily[],accounts:FleetGrowthAccount[],bounds:GrowthBounds,filter:GrowthFilter={}){
 const {cadence,history,baseline,current,periods}=planFleetGrowth(bounds,filter),clients=new Map<string,GrowthClient>();
 // Only accounts present in published Payment24 transactions enter this list.
 for(const a of accounts){let c=clients.get(a.client_id);if(!c){c={key:a.client_id,customerId:a.client_id,name:a.name,codes:[],baseline:emptyTotals(),current:emptyTotals(),periods:periods.map(emptyTotals)};clients.set(a.client_id,c);}if(!c.codes.includes(a.account))c.codes.push(a.account);}
 const indices=new Map(periods.map((p,i)=>[p.key,i])),periodDates=periods.map(()=>new Set<string>()),baseDates=new Set<string>(),currentDates=new Set<string>();
 for(const r of daily){const client=clients.get(r.client_id);if(!client)continue;
  if(inside(r.date,baseline)){addTotals(client.baseline,r);baseDates.add(r.date);}
  if(inside(r.date,current)){addTotals(client.current,r);currentDates.add(r.date);}
  if(inside(r.date,history)){const index=indices.get(calendarPeriod(r.date,cadence).start);if(index!==undefined){addTotals(client.periods[index],r);periodDates[index].add(r.date);}}
 }
 periods.forEach((p,i)=>p.recordDays=periodDates[i].size);
 const baselineDays=baseline.start?rangeDays(baseline):0,currentDays=current.start?rangeDays(current):0,warnings:string[]=[];
 if(bounds.last){
  if(baselineDays!==currentDays)warnings.push(`Los períodos tienen distinta duración: ${baselineDays} y ${currentDays} días. El cambio compara acumulados, sin extrapolar.`);
  for(const [label,range,count] of [['base',baseline,baseDates.size],['actual',current,currentDates.size]] as const){if(!count)warnings.push(`No hay compras o devoluciones aprobadas en el período ${label} con este filtro de combustible.`);else if(range.start<bounds.first||range.end>bounds.last)warnings.push(`El período ${label} se extiende fuera del histórico Payment24 cargado.`);}
  if(periods.some(p=>p.partial))warnings.push('La gráfica incluye períodos parciales. Sus cambios porcentuales frente a períodos de distinta cobertura no se calculan.');
 }
 return {clients:[...clients.values()].sort((a,b)=>a.name.localeCompare(b.name)),periods,bounds,comparison:{baseline,current,baselineDays,currentDays,baselineRecordDays:baseDates.size,currentRecordDays:currentDates.size},history,cadence,warnings};
}
export type GrowthResult=ReturnType<typeof summarizeFleetGrowth>&{products:string[];source:string;updatedAt:string};
