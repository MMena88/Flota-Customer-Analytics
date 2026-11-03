'use client';
import {useEffect,useId,useMemo,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,ArrowRight,CalendarDays,Download,RefreshCw,Search,TrendingUp,Users} from 'lucide-react';
import {api,number,money,date,Empty,download} from './ui';
import {norm as customerKey} from '@/lib/domain';
import {addTotals,emptyTotals,growthValue,compareGrowth,growthChange,growthStatusLabels,type Cadence,type GrowthMetric,type GrowthResult,type GrowthPeriod,type GrowthTotals} from '@/lib/fleet-growth-domain';

const metrics:Record<GrowthMetric,string>={volume:'Consumo neto · galones',amount:'Ventas · importe USD'};
const cadences:Record<Cadence,string>={month:'Mes',quarter:'Trimestre',week:'Semana'};
const format=(value:number|null,metric:GrowthMetric)=>value===null?'—':metric==='volume'?number(value,3):money(value,2);
const percent=(v:number|null)=>v===null?'—':`${v>0?'+':''}${number(v,1)}%`;
const tone=(v:number|null)=>v===null?'neutral':v>0?'up':v<0?'down':'flat';
const rangeText=(r:{start:string;end:string})=>r.start&&r.end?`${date(r.start)} — ${date(r.end)}`:'Sin datos';
const productLabel=(p:string)=>!p||p==='__missing__'?'Producto no informado':p;
const blankDates={start:'',end:'',baseStart:'',baseEnd:'',currentStart:'',currentEnd:''};
type Dates=typeof blankDates;
const totalOf=(rows:GrowthTotals[])=>rows.reduce((sum,r)=>addTotals(sum,r),emptyTotals());
const changesFor=(values:(number|null)[],periods:GrowthPeriod[])=>values.map((v,i)=>i===0||periods[i].partial||periods[i-1].partial?null:growthChange(values[i-1],v).pct);

function TrendChart({periods,values,metric,title}:{periods:GrowthPeriod[];values:(number|null)[];metric:GrowthMetric;title:string}){
 const fillId=useId().replace(/:/g,''),[active,setActive]=useState<string>(''),[mode,setMode]=useState<'value'|'percent'>('value');
 const index=periods.findIndex(p=>p.key===active),selected=index>=0?index:Math.max(0,values.findLastIndex(v=>v!==null));
 const changes=changesFor(values,periods),valid=values.filter((v):v is number=>v!==null);
 if(!valid.length)return <Empty title="Sin valores para graficar" text="Elegí un cliente o un rango con registros. Los períodos sin datos no se convierten en cero."/>;
 const width=Math.max(820,periods.length*65),height=340,left=85,right=35,top=25,bottom=275;
 const low=Math.min(0,...valid),high=Math.max(0,...valid),span=high-low||1,min=low<0?low-span*.1:0,max=high+span*.12;
 const x=(i:number)=>left+(i+.5)*(width-left-right)/periods.length,y=(v:number)=>bottom-(v-min)/(max-min)*(bottom-top),zero=y(0);
 let path='',area='',run:number[]=[];
 const closeRun=()=>{if(run.length){area+=`M ${x(run[0])} ${zero} `+run.map(i=>`L ${x(i)} ${y(values[i]!)}`).join(' ')+` L ${x(run.at(-1)!)} ${zero} Z `;run=[]}};
 values.forEach((v,i)=>{if(v===null){closeRun();return;}path+=`${run.length?'L':'M'} ${x(i)} ${y(v)} `;run.push(i);});closeRun();
 const current=periods[selected];
 return <>
  <div className="growth-chart-tabs" aria-label="Vista de la evolución"><button aria-pressed={mode==='value'} onClick={()=>setMode('value')}>Valor acumulado</button><button aria-pressed={mode==='percent'} onClick={()=>setMode('percent')}>Cambio % por período</button></div>
  {mode==='percent'?<ChangeChart periods={periods} changes={changes}/>:<div className="growth-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:width}} role="group" aria-label={`Evolución de ${title}. ${metrics[metric]}. ${periods.length} períodos.`} className="growth-trend">
   <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20875f" stopOpacity=".22"/><stop offset="100%" stopColor="#20875f" stopOpacity=".02"/></linearGradient></defs>
   {[0,1,2,3,4].map(i=>{const value=min+(max-min)*i/4;return <g key={i} className="growth-axis"><line x1={left} x2={width-right} y1={y(value)} y2={y(value)}/><text x={left-12} y={y(value)+4} textAnchor="end">{new Intl.NumberFormat('es-SV',{notation:'compact',maximumFractionDigits:1}).format(value)}</text></g>})}
   <path d={area} fill={`url(#${fillId})`}/><path d={path} stroke="#22815b" strokeWidth="3" fill="none" strokeLinejoin="round"/>
   {periods.map((p,i)=><g key={p.key}>
    <text x={x(i)} y={bottom+26} textAnchor="middle" className="growth-x-label">{p.label}</text>
    {p.partial&&<text x={x(i)} y={bottom+44} textAnchor="middle" className="growth-partial-label">Parcial</text>}
    {values[i]!==null?<circle cx={x(i)} cy={y(values[i]!)} r={selected===i?7:5} fill={p.partial?'white':'#22815b'} stroke="#22815b" strokeWidth="2.5" tabIndex={0} role="button" aria-label={`${p.label}: ${format(values[i],metric)}${p.partial?', período parcial':''}`} onFocus={()=>setActive(p.key)} onPointerEnter={()=>setActive(p.key)} onClick={()=>setActive(p.key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActive(p.key)}}}><title>{p.label}: {format(values[i],metric)} · {rangeText(p)}{p.partial?' · Parcial':''}</title></circle>:<text x={x(i)} y={zero-12} textAnchor="middle" className="growth-partial-label">Sin registros</text>}
   </g>)}
  </svg></div>}
  {current&&mode==='value'&&<div className="growth-chart-detail" aria-live="polite"><div><span>{current.label}{current.partial?' · Parcial':''}</span><strong>{format(values[selected],metric)}</strong></div><div><span>{rangeText(current)}</span><b className={'growth-text-'+tone(changes[selected])}>{changes[selected]===null?(current.partial?'Período parcial':selected===0?'Primer período':periods[selected-1].partial?'Base parcial':'Sin base comparable'):`${percent(changes[selected])} vs. ${periods[selected-1].label}`}</b></div></div>}
 </>;
}

function ChangeChart({periods,changes}:{periods:GrowthPeriod[];changes:(number|null)[]}){
 const available=changes.filter((v):v is number=>v!==null);
 if(!available.length)return <Empty title="Todavía no hay dos períodos comparables" text="El cambio porcentual requiere dos períodos consecutivos completos, con registros y base positiva. Podés usar la comparación A → B para elegir tus propios rangos."/>;
 const width=Math.max(820,periods.length*100),height=300,top=30,bottom=235,left=85,right=35;
 const low=Math.min(0,...available),high=Math.max(0,...available),span=high-low||1,min=low-span*.13,max=high+span*.22;
 const y=(v:number)=>bottom-(v-min)/(max-min)*(bottom-top),step=(width-left-right)/periods.length,barWidth=Math.min(72,step*.48);
 return <><div className="growth-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:width}} role="group" aria-label="Cambio porcentual respecto al período anterior" className="growth-trend">
  {[0,1,2,3,4].map(i=>{const v=min+(max-min)*i/4;return <g className="growth-axis" key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)}/><text x={left-12} y={y(v)+4} textAnchor="end">{number(v,1)}%</text></g>})}
  <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} stroke="#9db1a0"/>
  {periods.map((p,i)=>{const value=changes[i],x=left+(i+.5)*step;return <g key={p.key}><text x={x} y={bottom+30} textAnchor="middle" className="growth-x-label">{p.label}</text>{value===null?<text x={x} y={y(0)-10} textAnchor="middle" className="growth-partial-label">{p.partial?'Parcial':i===0?'Sin base':periods[i-1].partial?'Base parcial':'Sin base'}</text>:<><rect x={x-barWidth/2} width={barWidth} y={Math.min(y(0),y(value))} height={Math.max(2,Math.abs(y(value)-y(0)))} rx="5" fill={value<0?'#c97b59':'#3b9169'} role="img" aria-label={`${p.label}: ${percent(value)} vs. ${periods[i-1].label}`}><title>{percent(value)} · {p.label} frente a {periods[i-1].label}</title></rect><text x={x} y={value>=0?y(value)-10:y(value)+16} textAnchor="middle" className="growth-bar-label">{percent(value)}</text></>}</g>})}
 </svg></div><p className="growth-change-note">Cada barra compara el acumulado con el período calendario anterior. Los períodos parciales o sin base positiva quedan sin porcentaje.</p></>;
}

export function FleetGrowthView({initialClient='',initialProduct=''}:{initialClient?:string;initialProduct?:string}){
 const [data,setData]=useState<GrowthResult|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [product,setProduct]=useState(initialProduct),[cadence,setCadence]=useState<Cadence>('month'),[metric,setMetric]=useState<GrowthMetric>('volume');
 const [applied,setApplied]=useState<Dates>(blankDates),[draft,setDraft]=useState<Dates>(blankDates),[clientKey,setClientKey]=useState(initialClient),[search,setSearch]=useState(''),[cluster,setCluster]=useState('all'),[order,setOrder]=useState('change');
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');
  const query=new URLSearchParams({view:'growth',product,cadence,...applied});
  void api<GrowthResult>('fleet?'+query).then(result=>{if(cancelled)return;setData(result);setDraft({start:result.history.start,end:result.history.end,baseStart:result.comparison.baseline.start,baseEnd:result.comparison.baseline.end,currentStart:result.comparison.current.start,currentEnd:result.comparison.current.end});}).catch(e=>{if(!cancelled)setError((e as Error).message)}).finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[product,cadence,applied,version]);
 const clients=data?.clients||[],selected=clients.find(c=>c.key===clientKey);
 const totals=useMemo(()=>{const rows=selected?[selected]:clients;return {baseline:totalOf(rows.map(c=>c.baseline)),current:totalOf(rows.map(c=>c.current)),periods:(data?.periods||[]).map((_,i)=>totalOf(rows.map(c=>c.periods[i])))}},[data,selected]);
 const change=compareGrowth(totals.baseline,totals.current,metric),current=growthValue(totals.current,metric),previous=growthValue(totals.baseline,metric),values=totals.periods.map(p=>growthValue(p,metric));
 const records=clients.map(c=>({...c,change:compareGrowth(c.baseline,c.current,metric)}));
 const counts={all:records.length,up:records.filter(c=>c.change.status==='up').length,down:records.filter(c=>c.change.status==='down').length,flat:records.filter(c=>c.change.status==='flat').length,unmatched:records.filter(c=>!['up','down','flat'].includes(c.change.status)).length};
 const visible=records.filter(c=>(!selected||c.key===selected.key)&&(!search||customerKey(c.name+' '+c.codes.join(' ')).includes(customerKey(search)))&&(cluster==='all'||cluster==='unmatched'&&!['up','down','flat'].includes(c.change.status)||c.change.status===cluster)).sort((a,b)=>order==='name'?a.name.localeCompare(b.name):order==='current'?(growthValue(b.current,metric)??-Infinity)-(growthValue(a.current,metric)??-Infinity):order==='decline'?(a.change.pct??Infinity)-(b.change.pct??Infinity):(b.change.pct??-Infinity)-(a.change.pct??-Infinity));
 const reset=()=>{setProduct('');setCadence('month');setMetric('volume');setApplied({...blankDates});setClientKey('');setSearch('');setCluster('all');setOrder('change')};
 function applyDates(){
  const ranges=[[draft.start,draft.end],[draft.baseStart,draft.baseEnd],[draft.currentStart,draft.currentEnd]];
  if(ranges.some(([a,b])=>!a||!b||a>b)){setError('Completá cada rango con la fecha inicial anterior o igual a la final.');return;}
  if(draft.baseEnd>=draft.currentStart){setError('El período base debe terminar antes de que comience el período actual.');return;}
  setApplied({...draft});
 }
 function exportCsv(){
  if(!data)return;
  const quote=(x:unknown)=>'"'+(typeof x==='string'&&/^(\s*[=+@-]|[\t\r\n])/.test(x)?"'":'')+String(x??'').replaceAll('"','""')+'"';
  const lines=[['Cliente de flota','Cuentas Payment24','Combustible','Indicador','Base desde','Base hasta','Actual desde','Actual hasta','Valor base','Valor actual','Diferencia','Cambio %','Estado',...data.periods.flatMap(p=>[p.label+' valor',p.label+' cambio %'])],...visible.map(c=>{const series=c.periods.map(t=>growthValue(t,metric)),changes=changesFor(series,data.periods);return [c.name,c.codes.join(', '),product?productLabel(product):'Todos los combustibles',metrics[metric],data.comparison.baseline.start,data.comparison.baseline.end,data.comparison.current.start,data.comparison.current.end,growthValue(c.baseline,metric),growthValue(c.current,metric),c.change.delta,c.change.pct,growthStatusLabels[c.change.status],...series.flatMap((v,i)=>[v,changes[i]])]})];
  download('crecimiento-clientes-flota.csv',lines.map(r=>r.map(quote).join(',')).join('\r\n'));
 }
 return <div className="growth-view fleet-growth">
  <div className="page-heading"><div><div className="eyebrow">FLOTA · CONSUMO Y VENTAS</div><h2>Crecimiento de flota</h2><p>Seguí el consumo de cada cliente de flota con las transacciones de Payment24.</p></div><button className="button secondary" onClick={()=>setVersion(v=>v+1)} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/> Actualizar</button></div>
  <section className="panel growth-controls" aria-label="Filtros de crecimiento de flota">
   <div className="growth-filters">
    <label>Combustible<select value={product} onChange={e=>{setProduct(e.target.value);setCluster('all')}}><option value="">Todos los combustibles</option>{data?.products.map(p=><option key={p||"missing"} value={p||"__missing__"}>{productLabel(p)}</option>)}</select></label>
    <label>Indicador<select value={metric} onChange={e=>{setMetric(e.target.value as GrowthMetric);setCluster('all')}}>{Object.entries(metrics).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Agrupar por<select value={cadence} onChange={e=>{setCadence(e.target.value as Cadence);setApplied({...blankDates});setCluster('all')}}>{Object.entries(cadences).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="growth-client-select">Cliente de flota<select value={selected?.key||''} onChange={e=>{setClientKey(e.target.value);setCluster('all');setSearch('')}}><option value="">Todos los clientes de flota</option>{clients.map(c=><option key={c.key} value={c.key}>{c.name} · {c.codes.join(', ')}</option>)}</select></label>
    <button className="text-link" onClick={reset}>Restablecer filtros</button>
   </div>
   <details className="growth-date-settings"><summary><CalendarDays size={16}/> Elegir períodos y rango de la gráfica</summary><div className="growth-date-grid">
    <fieldset disabled={loading}><legend>Período base · A</legend><label>Base desde<input type="date" value={draft.baseStart} onChange={e=>{const value=e.target.value;setDraft(d=>({...d,baseStart:value}))}}/></label><label>Base hasta<input type="date" value={draft.baseEnd} onChange={e=>{const value=e.target.value;setDraft(d=>({...d,baseEnd:value}))}}/></label></fieldset>
    <fieldset disabled={loading}><legend>Período actual · B</legend><label>Actual desde<input type="date" value={draft.currentStart} onChange={e=>{const value=e.target.value;setDraft(d=>({...d,currentStart:value}))}}/></label><label>Actual hasta<input type="date" value={draft.currentEnd} onChange={e=>{const value=e.target.value;setDraft(d=>({...d,currentEnd:value}))}}/></label></fieldset>
    <fieldset disabled={loading}><legend>Histórico de la gráfica</legend><label>Gráfica desde<input type="date" value={draft.start} onChange={e=>{const value=e.target.value;setDraft(d=>({...d,start:value}))}}/></label><label>Gráfica hasta<input type="date" value={draft.end} onChange={e=>{const value=e.target.value;setDraft(d=>({...d,end:value}))}}/></label></fieldset>
   </div><div className="growth-date-actions"><span>Compará meses, trimestres o cualquier par de rangos sin solaparlos.</span><button className="button secondary" disabled={loading||!data?.bounds.last} onClick={()=>setApplied({...blankDates})}>Últimos períodos · mismos días</button><button className="button" disabled={loading||!data?.bounds.last} onClick={applyDates}>Aplicar períodos</button></div></details>
  </section>
  {error&&<div className="growth-warning" role="alert">{error}</div>}
  {loading?<div className="growth-loading" role="status"><RefreshCw className="spin" size={20}/> Calculando consumo y ventas de flota…</div>:!error&&data&&<>
   {!data.bounds.last?<Empty title="Tu evolución empieza con Payment24" text="Usá Cargar Payment24 en este panel. El crecimiento se calculará con el mismo histórico de flota."/>:<>
    <div className="growth-period-strip"><span><b>A · Base</b>{rangeText(data.comparison.baseline)}</span><ArrowRight size={18}/><span><b>B · Actual</b>{rangeText(data.comparison.current)}</span><small>{data.comparison.baselineDays} y {data.comparison.currentDays} días · acumulados cargados</small></div>
    <>
     <div className="growth-kpis">
      <section><span>Período actual · {metrics[metric]}</span><strong>{format(current,metric)}</strong><small>{selected?selected.name:'Clientes de flota · Payment24'}</small></section>
      <section><span>Período base</span><strong>{format(previous,metric)}</strong><small>{rangeText(data.comparison.baseline)}</small></section>
      <section className={'growth-kpi-'+tone(change.pct)}><span>Cambio entre períodos</span><strong>{percent(change.pct)}</strong><small>{change.pct===null?growthStatusLabels[change.status]:'(Actual − base) / base × 100'}</small></section>
      <section><span>Diferencia absoluta</span><strong className={'growth-text-'+tone(change.delta)}>{change.delta!==null&&change.delta>0?'+':''}{format(change.delta,metric)}</strong><small>Actual menos base</small></section>
     </div>
     <section className="panel growth-chart-panel" id="growth-trend-panel"><div className="panel-head"><div><div className="eyebrow">{cadence==='month'?'MES A MES':cadence==='quarter'?'TRIMESTRE A TRIMESTRE':'SEMANA A SEMANA'}</div><h2>{selected?selected.name:metric==='volume'?'Evolución del consumo de flota':'Evolución de ventas de flota'}</h2><p>{metrics[metric]} · Payment24{product?' · '+productLabel(product):''}</p></div><span className="growth-period-count">{data.periods.length} períodos</span></div><TrendChart periods={data.periods} values={values} metric={metric} title={selected?.name||'los clientes de flota'}/></section>
     <div className="growth-clusters" aria-label="Agrupar clientes por crecimiento">
      {([['all','Todos',Users],['up','En crecimiento',ArrowUpRight],['down','En caída',ArrowDownRight],['flat','Sin cambio',ArrowRight],['unmatched','Sin base comparable',TrendingUp]] as const).map(([key,label,Icon])=><button key={key} className={'growth-cluster '+key} aria-pressed={cluster===key} onClick={()=>{setCluster(key);setClientKey('')}}><Icon size={18}/><span>{label}<strong>{number(counts[key])}</strong></span></button>)}
     </div>
     <section className="panel growth-clients-panel"><div className="panel-head"><div><h2>Cambio por cliente</h2><p>{visible.length} de {clients.length} clientes de flota · cuentas consolidadas como en el panel</p></div><button className="button secondary" onClick={exportCsv} disabled={!visible.length}><Download size={15}/> Exportar CSV</button></div>
      <div className="growth-table-toolbar"><label className="search"><Search size={16}/><input aria-label="Buscar cliente de flota en crecimiento" placeholder="Buscar cliente o cuenta" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Ordenar<select value={order} onChange={e=>setOrder(e.target.value)} aria-label="Ordenar crecimiento"><option value="change">Mayor crecimiento %</option><option value="decline">Mayor caída %</option><option value="current">Mayor valor actual</option><option value="name">Nombre</option></select></label>{selected&&<button className="text-link" onClick={()=>setClientKey('')}>Ver todos los clientes</button>}</div>
      <div className="growth-table-scroll"><table className="growth-table"><thead><tr><th>Cliente de flota / cuentas</th><th>Base · A</th><th>Actual · B</th><th>Diferencia</th><th>Cambio %</th><th>Estado</th>{data.periods.map(p=><th key={p.key} title={rangeText(p)}>{p.label}{p.partial&&<small>Parcial</small>}</th>)}</tr></thead><tbody>{visible.map(c=>{const series=c.periods.map(p=>growthValue(p,metric)),monthly=changesFor(series,data.periods);return <tr key={c.key}><td><button onClick={()=>{setClientKey(c.key);setCluster('all');document.getElementById('growth-trend-panel')?.scrollIntoView({behavior:'smooth',block:'start'})}} title="Ver evolución de este cliente">{c.name}</button><small>Cuentas: {c.codes.join(', ')}</small></td><td>{format(growthValue(c.baseline,metric),metric)}</td><td>{format(growthValue(c.current,metric),metric)}</td><td className={'growth-text-'+tone(c.change.delta)}>{c.change.delta!==null&&c.change.delta>0?'+':''}{format(c.change.delta,metric)}</td><td><span className={'growth-change '+tone(c.change.pct)}>{percent(c.change.pct)}</span></td><td><span className="growth-status">{growthStatusLabels[c.change.status]}</span></td>{series.map((value,i)=><td key={data.periods[i].key} className={'growth-heat '+tone(monthly[i])}><b>{format(value,metric)}</b><small>{data.periods[i].partial?'Período parcial':i===0?'Primer período':data.periods[i-1].partial?'Base parcial':monthly[i]===null?'Sin base comparable':percent(monthly[i])}</small></td>)}</tr>})}</tbody></table></div>
      {!visible.length&&<Empty title="No hay clientes con estos filtros" text="Probá otro grupo de crecimiento, cliente o búsqueda."/>}
     </section>
    </>
    {!!data.warnings.length&&<div className="growth-warning"><strong>Para interpretar la comparación</strong><ul>{data.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
    <details className="panel growth-method"><summary>Cómo se calcula el crecimiento de flota</summary><p>Consumo neto = galones de compras aprobadas − galones de devoluciones aprobadas. Ventas = Amount de compras aprobadas − Amount de devoluciones aprobadas, en USD y según su fecha de registro. Las preautorizaciones, operaciones pendientes, canceladas y rechazadas quedan fuera.</p><p>Porcentaje = (valor actual − valor base) / valor base × 100. Solo se calcula con base positiva y registros en ambos períodos. Con base cero o negativa se muestra la diferencia absoluta. Los períodos sin registros no se convierten automáticamente en consumo cero.</p><p>La gráfica agrupa por semana, mes o trimestre. “Cambio % por período” compara períodos consecutivos completos dentro del rango cargado. La comparación A → B usa las fechas que seleccionés; al iniciar propone la misma cantidad de días de los dos últimos períodos disponibles.</p><p>Las cuentas se consolidan con la misma ficha de cliente que usa Panel de flota. Cada transacción toma su última versión de una carga completada. Todas las cifras provienen del histórico Payment24; los importes representan consumo cobrado y no acreditan ventas sin impuestos ni margen.</p><p>Hay {data.comparison.baselineRecordDays} fechas con compras/devoluciones en la base y {data.comparison.currentRecordDays} en el actual para el combustible filtrado. Los cortes parciales se indican sin proyectar el resto del período.</p></details>
    <p className="footnote">Fuente: Payment24 · {data.source} · Datos de flota disponibles: {date(data.bounds.first)} — {date(data.bounds.last)}. Cargar Payment24 actualiza también esta evolución.</p>
   </>}
  </>}
 </div>;
}
