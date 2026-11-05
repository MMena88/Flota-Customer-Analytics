'use client';

import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, Download, Search} from 'lucide-react';
import {customerKey} from '@/lib/commercial';
import type {CommercialComparison, ComparisonClient, ComparisonMode, ComparisonQuery, Coverage} from '@/lib/commercial-comparison';
import {date, download, Empty, Kpi, number} from './ui';
import './commercial-comparison.css';

type Periods = NonNullable<CommercialComparison['periods']>;
type Segment = CommercialComparison['segments'][number];
type Scope = {segment: string; product: string | null};
const volume = (n: number) => number(n, 2);
const signed = (n: number | null, suffix = '') => n === null ? '—' : (n > 0 ? '+' : '') + volume(n) + suffix;
const direction = (n: number | null) => n === null || !n ? '' : n > 0 ? 'volume-gain' : 'volume-loss';
const observed = (value: number, coverage: Coverage) => coverage.loaded ? volume(value) : 'Sin datos';
const periodLabel = (p: {start: string; end: string}) => date(p.start) + ' – ' + date(p.end);
const productName = (p: string) => !p || p === 'NONE' ? 'Sin producto informado' : p;
const modeNames: Record<ComparisonMode, string> = {months: 'Dos meses', ytd: 'Acumulado del año (YTD)', custom: 'Fechas personalizadas'};
const monthLabel = (s: string) => new Date(s + '-01T12:00:00Z').toLocaleDateString('es-SV', {year: 'numeric', month: 'long', timeZone: 'UTC'});

function PeriodForm({data, onApply}: {data: CommercialComparison; onApply: (q: ComparisonQuery) => void}) {
  const p = data.periods!;
  const [error, setError] = useState('');
  const options = [...new Set([...data.months, p.base.start.slice(0, 7), p.current.start.slice(0, 7)])].sort().reverse();
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (p.mode === 'months' && fields.baseMonth >= fields.currentMonth) {
      setError('Elegí un mes base anterior al mes a comparar.'); return;
    }
    if (p.mode === 'custom' && (fields.baseEnd >= fields.currentStart || fields.baseStart > fields.baseEnd || fields.currentStart > fields.currentEnd)) {
      setError('Revisá las fechas. El período base debe terminar antes de que comience el período a comparar.'); return;
    }
    setError('');
    onApply({mode: p.mode, ...fields});
  }
  return <form className="volume-period-form" onSubmit={apply}>
    {p.mode === 'months' && <>
      <label>Mes base<select name="baseMonth" defaultValue={p.base.start.slice(0, 7)}>{options.map(m => <option value={m} key={m}>{monthLabel(m)}</option>)}</select></label>
      <label>Mes a comparar<select name="currentMonth" defaultValue={p.current.start.slice(0, 7)}>{options.map(m => <option value={m} key={m}>{monthLabel(m)}</option>)}</select></label>
    </>}
    {p.mode === 'ytd' && <label>Fecha de corte YTD<input type="date" name="cutoff" required max={data.bounds.last} defaultValue={p.current.end}/></label>}
    {p.mode === 'custom' && <>
      <fieldset><legend>Período base</legend><label>Desde<input type="date" name="baseStart" required defaultValue={p.base.start}/></label><label>Hasta<input type="date" name="baseEnd" required defaultValue={p.base.end}/></label></fieldset>
      <fieldset><legend>Período a comparar</legend><label>Desde<input type="date" name="currentStart" required defaultValue={p.current.start}/></label><label>Hasta<input type="date" name="currentEnd" required max={data.bounds.last} defaultValue={p.current.end}/></label></fieldset>
    </>}
    <button className="button" type="submit">Comparar períodos <ArrowRight size={16}/></button>
    {error && <p className="volume-form-error" role="alert">{error}</p>}
  </form>;
}

function PeriodCoverage({periods}: {periods: Periods}) {
  const {base, current, matchedDays, mode} = periods;
  return <>
    <div className="volume-periods" aria-label="Fechas y cobertura de la comparación">
      {([['Período base', base], ['Período a comparar', current]] as const).map(([label, p]) =>
        <div key={label}><CalendarDays size={18}/><div><span>{label}</span><strong>{periodLabel(p)}</strong>
          <small>{p.loaded} de {p.days} días con registros en Commercial</small></div></div>)}
    </div>
    {(!base.complete || !current.complete) ? <div className="volume-coverage-note" role="status">
      <strong>{mode === 'ytd' ? 'Histórico insuficiente para comparar el YTD' : 'Cobertura incompleta para esta comparación'}</strong>
      <p>Las cifras disponibles muestran el consumo registrado. Para calcular el cambio y los aportes, cargá los días pendientes de Commercial.</p>
      <details><summary>Ver fechas sin registros</summary>{([['Base', base], ['Actual', current]] as const).filter(([, p]) => !p.complete).map(([label, p]) =>
        <p key={label}><b>{label}</b> · {p.gaps.map(g => g.start === g.end ? date(g.start) : periodLabel(g)).join(' · ')}</p>)}</details>
    </div> : matchedDays ? <p className="volume-method">El último mes cargado está en curso. Se comparan los primeros {current.days} días de cada mes.</p>
      : base.days !== current.days ? <p className="volume-method">Se comparan acumulados de {base.days} y {current.days} días, respectivamente.</p> : null}
  </>;
}

function csvCell(value: string | number | null) {
  if (value === null) return '';
  if (typeof value === 'number') return String(Number(value.toFixed(6)));
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function exportComparison(data: CommercialComparison, clients = data.clients) {
  const p = data.periods;
  if (!p) return;
  const headers = ['Segmento', 'Producto', ...(data.segment ? ['Cliente', 'Código'] : []), 'Inicio base', 'Fin base', 'Inicio actual', 'Fin actual', 'Días cargados base', 'Días cargados actual', 'Volumen base registrado', 'Volumen actual registrado', 'Cambio en volumen', 'Crecimiento %', ...(data.segment ? ['Aporte al segmento (pp)'] : [])];
  const line = (s: Segment | ComparisonClient) => {
    const client = 'identified' in s ? s : null;
    return [data.segment || s.name, data.product === null ? 'Todos los productos' : productName(data.product), ...(client ? [client.name, client.codes.join(', ')] : []), p.base.start, p.base.end, p.current.start, p.current.end, p.base.loaded, p.current.loaded, p.base.loaded ? s.base : null, p.current.loaded ? s.current : null, s.delta, s.pct, ...(client ? [client.points] : [])];
  };
  const rows = [headers, ...(data.segment ? clients : data.segments).map(line)];
  download('Comparacion_volumen_' + p.current.end + '.csv', rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
}

function SegmentOverview({data, onSelect}: {data: CommercialComparison; onSelect: (name: string) => void}) {
  const p = data.periods!;
  const maxPct = Math.max(1, ...data.segments.map(s => Math.abs(s.pct || 0)));
  return <section className="panel volume-panel">
    <div className="panel-head"><div><h2>Consumo por segmento</h2><p>Elegí un segmento para ver qué clientes explican su variación.</p></div>
      <button className="button secondary" onClick={() => exportComparison(data)}><Download size={16}/> Exportar segmentos</button></div>
    <div className="volume-tablescroll"><table className="volume-table"><thead><tr><th>Segmento</th><th>Volumen base</th><th>Volumen actual</th><th>Cambio en volumen</th><th>Crecimiento</th></tr></thead>
      <tbody>{data.segments.map(s => <tr key={s.name}>
        <td><button type="button" className="volume-drill" onClick={() => onSelect(s.name)}>{s.name}<ArrowRight size={15}/></button></td>
        <td>{observed(s.base, p.base)}</td><td>{observed(s.current, p.current)}</td><td className={direction(s.delta)}>{signed(s.delta)}</td>
        <td><div className="volume-pct-cell"><span className={direction(s.pct)}>{signed(s.pct, ' %')}</span>{s.pct !== null && <i aria-hidden="true" className="volume-mini-track"><i className={s.pct < 0 ? 'loss' : ''} style={{width: Math.max(1, Math.abs(s.pct) / maxPct * 100) + '%'}}/></i>}</div></td>
      </tr>)}</tbody></table></div>
  </section>;
}

function ImpactChart({clients, onSelect}: {clients: ComparisonClient[]; onSelect: (client: ComparisonClient) => void}) {
  const changed = clients.filter(c => c.identified && c.delta !== null && c.delta !== 0);
  if (!changed.length) return null;
  const sorted = changed.sort((a, b) => b.delta! - a.delta! || a.name.localeCompare(b.name));
  const increases = sorted.filter(c => c.delta! > 0).slice(0, 4);
  const decreases = sorted.filter(c => c.delta! < 0).reverse().slice(0, 4);
  const largest = Math.max(...[...increases, ...decreases].map(c => Math.abs(c.delta!)));
  return <section className="panel volume-panel">
    <div className="panel-head"><div><h2>Clientes con mayor impacto</h2><p>Cambio en unidades reportadas. Seleccioná un cliente para ver ambos consumos en el detalle.</p></div></div>
    <div className="volume-drivers">{([{title: 'Mayores aumentos', rows: increases, up: true}, {title: 'Mayores caídas', rows: decreases, up: false}]).map(({title, rows, up}) =>
      <div key={title} className={'volume-driver-group ' + (up ? 'up' : 'down')}>
        <h3>{up ? <ArrowUpRight size={19}/> : <ArrowDownLeft size={19}/>} {title}</h3>
        {rows.length ? rows.map(c => <button key={c.id} onClick={() => onSelect(c)} className="volume-driver">
          <span>{c.name}</span><strong>{signed(c.delta)}</strong><i aria-hidden="true"><i style={{width: Math.abs(c.delta!) / largest * 100 + '%'}}/></i>
        </button>) : <p>Sin {up ? 'aumentos' : 'caídas'} en este período.</p>}
      </div>)}</div>
  </section>;
}

function clientStatus(c: ComparisonClient, comparable: boolean) {
  if (!c.identified) return 'Grupo contable';
  if (!comparable) return '';
  if (!c.baseRows) return 'Solo en el período actual';
  if (!c.currentRows) return 'Solo en el período base';
  return c.base <= 0 ? 'Sin base positiva' : '';
}

function ClientBreakdown({data}: {data: CommercialComparison}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ComparisonClient | null>(null);
  const [order, setOrder] = useState('impact');
  const p = data.periods!;
  const segment = data.segments.find(s => s.name === data.segment)!;
  const clients = useMemo(() => {
    const key = customerKey(query);
    const filtered = data.clients.filter(c => (!picked || picked.id === c.id) && (!key || customerKey([c.name, ...c.codes].join(' ')).includes(key)));
    return filtered.sort((a, b) => {
      if (order === 'name') return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      const x = a.delta ?? 0, y = b.delta ?? 0;
      const diff = order === 'up' ? y - x : order === 'down' ? x - y : Math.abs(y) - Math.abs(x);
      return diff || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }, [data.clients, query, order, picked]);
  function chooseClient(c: ComparisonClient) {
    setPicked(c); setQuery('');
    document.getElementById('volume-client-detail')?.scrollIntoView({block: 'start'});
  }

  return <>
    <div className="volume-detail-title"><h2>{segment.name}</h2><span>{data.product === null ? 'Todos sus productos' : productName(data.product)}</span></div>
    <div className="kpi-grid volume-kpis">
      <Kpi label="Volumen base" value={observed(segment.base, p.base)} detail={p.base.complete ? periodLabel(p.base) : 'Volumen registrado en los días cargados'}/>
      <Kpi label="Volumen actual" value={observed(segment.current, p.current)} detail={p.current.complete ? periodLabel(p.current) : 'Volumen registrado en los días cargados'}/>
      <Kpi label="Cambio en volumen" value={signed(segment.delta)} detail="Volumen actual menos volumen base"/>
      <Kpi label="Crecimiento del segmento" value={signed(segment.pct, ' %')} detail={data.comparable ? (segment.base > 0 ? 'Respecto al volumen base' : 'Se requiere un volumen base positivo') : 'Pendiente de cobertura'}/>
    </div>
    {data.comparable && <ImpactChart clients={data.clients} onSelect={chooseClient}/>}
    <section className="panel volume-panel" id="volume-client-detail">
      <div className="panel-head"><div><h2>Aporte por cliente</h2><p>El cambio en volumen mide cuánto ganó o perdió cada cuenta. Su aporte en puntos porcentuales (pp) se calcula sobre el volumen base del segmento.</p></div>
        <button className="button secondary" disabled={!clients.length} onClick={() => exportComparison(data, clients)}><Download size={16}/> Exportar clientes</button></div>
      <div className="volume-client-controls"><label>Buscar cliente<span className="volume-search"><Search size={16}/><input type="search" value={picked ? picked.name : query} placeholder="Nombre o código" onChange={e => {setPicked(null); setQuery(e.target.value);}}/></span></label>
        <label>Ordenar por<select value={order} onChange={e => setOrder(e.target.value)}><option value="impact">Mayor impacto en volumen</option><option value="up">Mayor aumento</option><option value="down">Mayor caída</option><option value="name">Nombre del cliente</option></select></label>
        {(query || picked) && <button className="text-link" onClick={() => {setPicked(null); setQuery('');}}>Ver todos los clientes</button>}</div>
      {clients.length ? <div className="volume-tablescroll"><table className="volume-table"><thead><tr><th>Cliente</th><th>Volumen base</th><th>Volumen actual</th><th>Cambio en volumen</th><th>Crecimiento</th><th>Aporte (pp)</th></tr></thead>
        <tbody>{clients.map(c => <tr key={c.id}><td><strong>{c.name}</strong>{c.codes.length > 0 && <small>{c.codes.join(', ')}</small>}<small>{clientStatus(c, data.comparable)}</small></td><td>{observed(c.base, p.base)}</td><td>{observed(c.current, p.current)}</td><td className={direction(c.delta)}>{signed(c.delta)}</td><td>{signed(c.pct, ' %')}</td><td className={direction(c.points)}>{signed(c.points)}</td></tr>)}</tbody>
        <tfoot><tr><th>Total del segmento</th><td>{observed(segment.base, p.base)}</td><td>{observed(segment.current, p.current)}</td><td>{signed(segment.delta)}</td><td>{signed(segment.pct, ' %')}</td><td>{signed(segment.pct)}</td></tr></tfoot>
      </table></div> : <Empty title={data.clients.length ? 'Sin coincidencias' : 'Sin registros para estos períodos'} text={data.clients.length ? 'Probá con otro nombre o código.' : 'Elegí otro producto o cambiá las fechas para consultar actividad.'}/>}
      <p className="volume-method">El total incluye a todos los clientes del segmento y los movimientos sin cliente informado. Con ambos períodos cubiertos, una cuenta sin registros en uno de ellos aporta cero volumen en ese período. El guion indica cobertura insuficiente o una base igual a cero o negativa para el porcentaje.</p>
    </section>
  </>;
}

export function CommercialComparisonView({initialSegment, initialProduct}: {initialSegment: string; initialProduct: string}) {
  const [scope, setScope] = useState<Scope>({segment: initialSegment, product: initialSegment && initialProduct ? initialProduct : null});
  const [periodQuery, setPeriodQuery] = useState<ComparisonQuery>({});
  const [retry, setRetry] = useState(0);
  const params = new URLSearchParams({view: 'volume-comparison', ...periodQuery});
  if (scope.segment) params.set('segment', scope.segment);
  if (scope.product !== null) params.set('product', scope.product);
  const url = '/api/commercial?' + params.toString();
  const requestKey = url + '#' + retry;
  const [result, setResult] = useState<{key: string; data: CommercialComparison} | null>(null);
  const [failure, setFailure] = useState<{key: string; message: string} | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, {signal: controller.signal, cache: 'no-store'});
        if (response.status === 401) {window.location.assign('/login'); return;}
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo cargar la comparación.');
        if (!controller.signal.aborted) setResult({key: requestKey, data: body});
      } catch (err) {
        if (!controller.signal.aborted) setFailure({key: requestKey, message: (err as Error).message});
      }
    }
    void load();
    return () => controller.abort();
  }, [url, requestKey]);

  const data = result?.data;
  const current = result?.key === requestKey ? result.data : null;
  const error = !current && failure?.key === requestKey ? failure.message : '';
  const mode = periodQuery.mode || 'months';
  function selectSegment(segment: string) { setScope({segment, product: null}); }
  function switchMode(next: ComparisonMode) {
    const p = data?.periods;
    setPeriodQuery(next === 'custom' && p ? {mode: next, baseStart: p.base.start, baseEnd: p.base.end, currentStart: p.current.start, currentEnd: p.current.end} : {mode: next});
  }

  return <div className="volume-comparison">
    {data?.periods && <section className="panel volume-controls" aria-label="Configurar comparación">
      <div className="volume-scope-controls"><label>Segmento<select value={scope.segment} onChange={e => selectSegment(e.target.value)}><option value="">Todos los segmentos</option>{data.segments.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
        {scope.segment && <label>Producto<select value={scope.product === null ? '*' : 'p' + scope.product} disabled={data.segment !== scope.segment} onChange={e => setScope({...scope, product: e.target.value === '*' ? null : e.target.value.slice(1)})}>
          <option value="*">Todos los productos</option>{data.segment === scope.segment && data.products.map(p => <option key={p} value={'p' + p}>{productName(p)}</option>)}</select></label>}
        <small>Histórico cargado<br/><strong>{date(data.bounds.first)} – {date(data.bounds.last)}</strong></small></div>
      <div className="volume-modes" role="group" aria-label="Tipo de comparación">{(Object.keys(modeNames) as ComparisonMode[]).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}>{modeNames[m]}</button>)}</div>
      {data.periods.mode === mode && <PeriodForm key={JSON.stringify([mode, data.periods.base.start, data.periods.base.end, data.periods.current.start, data.periods.current.end])} data={data} onApply={q => {setPeriodQuery(q); setRetry(v => v + 1);}}/>}
    </section>}
    {error ? <div className="error-banner" role="alert">{error} <button className="text-link" onClick={() => {setFailure(null); setRetry(v => v + 1);}}>Reintentar</button> <button className="text-link" onClick={() => {selectSegment(''); setPeriodQuery({}); setFailure(null); setRetry(v => v + 1);}}>Restablecer comparación</button></div>
      : !current ? <p className="commercial-notice" role="status">Cargando la comparación de volumen…</p>
      : !current.periods ? <Empty title="Todavía no hay datos Commercial" text="Cargá el CSV en la pestaña Dispersión para empezar a comparar el consumo."/>
      : <><PeriodCoverage periods={current.periods}/>
        {current.segment ? <ClientBreakdown data={current}/> : <SegmentOverview data={current} onSelect={selectSegment}/>}
        <p className="volume-method">El volumen sigue la columna Volume y el criterio de los totales por canal del archivo Commercial. Incluye devoluciones y ajustes. Cada segmento se compara consigo mismo. El filtro de producto permite comparar una sola referencia en su unidad original.</p>
      </>}
  </div>;
}
