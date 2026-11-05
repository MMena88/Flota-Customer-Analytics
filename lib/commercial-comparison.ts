import {commercialIdentity, matchCustomers, type CommercialRow} from './commercial';
import {validDate} from './domain';
import {calendarPeriod, rangeDays, shiftDay, type DateRange} from './fleet-growth-domain';

export type ComparisonMode = 'months' | 'ytd' | 'custom';
export type ComparisonQuery = {
  mode?: string;
  baseMonth?: string;
  currentMonth?: string;
  cutoff?: string;
  baseStart?: string;
  baseEnd?: string;
  currentStart?: string;
  currentEnd?: string;
  segment?: string;
  product?: string;
};
export class ComparisonInputError extends Error {}

const validReportDate = (s: string) => /^20\d{2}-/.test(s) && validDate(s);

function checkRange(start: string, end: string): DateRange {
  const range = {start, end};
  if (!validReportDate(start) || !validReportDate(end) || start > end || rangeDays(range) > 3660) {
    throw new ComparisonInputError('Elegí fechas válidas, en orden, para cada período (máximo diez años).');
  }
  return range;
}

function monthRange(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new ComparisonInputError('Elegí dos meses válidos.');
  return calendarPeriod(month + '-01', 'month');
}

// Match the day of the month, clamping February 29 in a non-leap year.
function throughDay(range: DateRange, day: string) {
  const target = range.start.slice(0, 8) + day.slice(-2);
  return target < range.end ? target : range.end;
}

export function comparisonRanges(latest: string, q: ComparisonQuery) {
  const mode = q.mode || 'months';
  let base: DateRange, current: DateRange, matchedDays = false;
  if (mode === 'ytd') {
    const cutoff = q.cutoff || latest;
    if (!validReportDate(cutoff) || cutoff > latest) throw new ComparisonInputError('Elegí un corte YTD hasta el último día cargado.');
    const year = Number(cutoff.slice(0, 4));
    current = {start: year + '-01-01', end: cutoff};
    const priorMonth = calendarPeriod((year - 1) + cutoff.slice(4, 7) + '-01', 'month');
    base = {start: (year - 1) + '-01-01', end: throughDay(priorMonth, cutoff)};
  } else if (mode === 'custom') {
    base = checkRange(q.baseStart || '', q.baseEnd || '');
    current = checkRange(q.currentStart || '', q.currentEnd || '');
  } else if (mode === 'months') {
    current = monthRange(q.currentMonth || latest.slice(0, 7));
    base = q.baseMonth ? monthRange(q.baseMonth) : calendarPeriod(shiftDay(current.start, -1), 'month');
    if (current.start > latest) throw new ComparisonInputError('El mes a comparar empieza después del último día cargado.');
    if (current.end > latest) {
      const days = Math.min(rangeDays(base), rangeDays({start: current.start, end: latest}));
      base = {...base, end: shiftDay(base.start, days - 1)};
      current = {...current, end: shiftDay(current.start, days - 1)};
      matchedDays = true;
    }
  } else {
    throw new ComparisonInputError('Modo de comparación inválido.');
  }
  if (base.end >= current.start) throw new ComparisonInputError('El período base debe terminar antes de que empiece el período a comparar.');
  return {mode, base, current, matchedDays};
}

const inPeriod = (day: string, range: DateRange) => day >= range.start && day <= range.end;

function coverage(range: DateRange, reportDays: Set<string>) {
  const days = rangeDays(range);
  let loaded = 0;
  const gaps: DateRange[] = [];
  let gap: DateRange | undefined;
  for (let day = range.start; day <= range.end; day = shiftDay(day, 1)) {
    if (reportDays.has(day)) { loaded++; gap = undefined; }
    else if (gap) gap.end = day;
    else { gap = {start: day, end: day}; gaps.push(gap); }
  }
  return {...range, days, loaded, complete: loaded === days, gaps};
}
export type Coverage = ReturnType<typeof coverage>;

const emptyPair = () => ({base: 0, current: 0, baseRows: 0, currentRows: 0});
type Pair = ReturnType<typeof emptyPair>;
function add(pair: Pair, side: 'base' | 'current', value: number) {
  pair[side] += value;
  if (side === 'base') pair.baseRows++; else pair.currentRows++;
}

function change(pair: Pair, comparable: boolean) {
  const raw = pair.current - pair.base;
  const delta = comparable ? (Math.abs(raw) < 1e-8 ? 0 : raw) : null;
  return {delta, pct: delta !== null && pair.base > 1e-8 ? 100 * delta / pair.base : null};
}

type ClientPair = Pair & {id: string; name: string; codes: Set<string>; identified: boolean};

export function compareCommercialVolume(rows: CommercialRow[], paymentNames: string[], confirmedNames: string[], q: ComparisonQuery = {}) {
  const reportDays = new Set(rows.map(row => row.date));
  const dates = [...reportDays].sort();
  const bounds = {first: dates[0] || '', last: dates.at(-1) || ''};
  const ranges = bounds.last ? comparisonRanges(bounds.last, q) : null;
  const periods = ranges ? {...ranges, base: coverage(ranges.base, reportDays), current: coverage(ranges.current, reportDays)} : null;
  const comparable = !!(periods?.base.complete && periods.current.complete);
  const matches = matchCustomers(rows, paymentNames);
  const confirmed = new Set(confirmedNames);
  const segments = new Map<string, Pair>();
  const clients = new Map<string, ClientPair>();
  const products = new Set<string>();

  for (const row of rows) {
    // Retain the full source segment list, including channels reclassified to Payment24.
    if (!segments.has(row.segment)) segments.set(row.segment, emptyPair());
    const identity = commercialIdentity(row, matches, confirmed);
    let segment = segments.get(identity.segment);
    if (!segment) { segment = emptyPair(); segments.set(identity.segment, segment); }
    const selected = q.segment === identity.segment;
    if (selected) products.add(row.product);
    if (!periods || (q.product !== undefined && row.product !== q.product)) continue;
    const side = inPeriod(row.date, periods.base) ? 'base' : inPeriod(row.date, periods.current) ? 'current' : null;
    if (!side) continue;
    add(segment, side, row.volume);
    if (!selected) continue;

    let client = clients.get(identity.customerId);
    if (!client) {
      client = {id: identity.customerId, name: identity.identified ? row.name : 'Sin cliente informado', identified: identity.identified, codes: new Set(), ...emptyPair()};
      clients.set(client.id, client);
    }
    if (row.code && row.code !== 'NONE') client.codes.add(row.code);
    add(client, side, row.volume);
  }
  if (rows.length && q.segment && !segments.has(q.segment)) throw new ComparisonInputError('El segmento seleccionado ya no está en Commercial.');
  if (q.product !== undefined && !products.has(q.product)) throw new ComparisonInputError('El producto seleccionado no está en este segmento.');

  const segmentBase = segments.get(q.segment || '')?.base ?? 0;
  return {
    bounds, periods, comparable, segment: q.segment || '', product: q.product ?? null,
    products: [...products].sort(), months: [...new Set(dates.map(day => day.slice(0, 7)))],
    segments: [...segments].sort(([a], [b]) => a.localeCompare(b)).map(([name, pair]) => ({name, ...pair, ...change(pair, comparable)})),
    clients: [...clients.values()].map(client => {
      const {delta, pct} = change(client, comparable);
      // Percentage points add to the segment growth rate even when wins and losses offset.
      const points = delta !== null && segmentBase > 1e-8 ? 100 * delta / segmentBase : null;
      return {...client, codes: [...client.codes].sort(), delta, pct, points};
    }),
  };
}

export type CommercialComparison = ReturnType<typeof compareCommercialVolume>;
export type ComparisonClient = CommercialComparison['clients'][number];
