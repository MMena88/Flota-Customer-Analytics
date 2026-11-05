import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareCommercialVolume, comparisonRanges, type ComparisonQuery} from '../lib/commercial-comparison';
import {parseCommercial, summarizeCommercial, type CommercialRow} from '../lib/commercial';
import {readPaymentXlsx} from '../lib/payment-xlsx';

const retail = 'Lubricants Retail', wholesale = 'Lubricants Wholesale';
const make = (day: string, name: string, volume: number, code = '', segment = retail, product = 'A'): CommercialRow =>
  ({date: day, name, code, segment, product, volume, sales: 0, cost: 0, productMargin: 0, variableCost: 0, grossMargin: 0});
const a = '2026-09-01', b = '2026-10-01';
const q: ComparisonQuery = {mode: 'custom', baseStart: a, baseEnd: a, currentStart: b, currentEnd: b, segment: retail};
const rows = [
  make(a, 'Ejemplo SA', 100), make(b, 'Ejemplo, S.A.', 130, '10'), make(b, 'Ejemplo SA', 10, '10', retail, 'B'),
  make(a, 'Compra anterior', 20, '20'), make(b, 'Compra actual', 30, '30'),
  make(a, 'Devoluciones', -4, '40'), make(b, 'Devoluciones', 0, '40'),
  make(a, 'NONE', 8), make(b, 'NONE', -2),
  make(a, 'Flota Uno', 10, '50'), make(b, 'FLOTA UNO', 40, '50', wholesale),
  make(a, 'Otro canal', 25, '60', wholesale), make(b, 'Otro canal', 15, '60', wholesale),
];
const compare = (filters: ComparisonQuery) => compareCommercialVolume(rows, ['Flota Uno'], [], filters);
const result = compare(q);
assert.equal(result.comparable, true);
const retailTotal = result.segments.find(s => s.name === retail)!;
assert.deepEqual([retailTotal.base, retailTotal.current, retailTotal.delta], [124, 168, 44]);
assert.equal(result.clients.reduce((sum, c) => sum + c.delta!, 0), retailTotal.delta);
assert.ok(Math.abs(result.clients.reduce((sum, c) => sum + c.points!, 0) - retailTotal.pct!) < 1e-9);
assert.equal(result.clients.find(c => c.id === 'code:10')?.delta, 40);
assert.equal(result.clients.find(c => c.id === 'code:20')?.pct, -100);
assert.equal(result.clients.find(c => c.id === 'code:30')?.pct, null);
assert.equal(result.clients.find(c => c.id === 'code:40')?.pct, null);
assert.equal(result.clients.find(c => !c.identified)?.delta, -10);
assert.equal(compare({...q, product:'B'}).clients[0].delta, 10);
assert.equal(compare({...q, segment:wholesale}).clients.length, 1);
assert.equal(compare({...q, segment:'B2B · Payment24'}).clients[0].delta, 30);
assert.deepEqual(compare({...q, segment:''}).clients, []);
const ambiguousRows = [make(a, 'Homónimo', 30, '1'), make(b, 'Homónimo', 12, '2'), make(b, 'Homónimo', 2)];
assert.equal(compareCommercialVolume(ambiguousRows, ['Homónimo'], [], q).clients.length, 3);
assert.equal(compareCommercialVolume(ambiguousRows, ['Homónimo'], ['HOMONIMO'], {...q, segment:'B2B · Payment24'}).clients.length, 1);

const gap = compare({...q, baseEnd:'2026-09-03'});
assert.deepEqual(gap.periods?.base.gaps, [{start:'2026-09-02', end:'2026-09-03'}]);
assert.equal(gap.comparable, false);
assert.ok(gap.clients.every(c => c.delta === null && c.points === null && c.pct === null));
assert.equal(compare({...q, mode:'ytd'}).periods?.base.loaded, 0);
assert.equal(compareCommercialVolume([], [], [], {}).periods, null);
assert.throws(() => compare({...q, baseEnd:b}));
assert.throws(() => comparisonRanges(b, {mode:'months', baseMonth:'2026-13'}));
assert.throws(() => comparisonRanges(b, {mode:'ytd', cutoff:'2026-02-30'}));

assert.deepEqual(comparisonRanges('2026-10-30', {}).base, {start:'2026-09-01', end:'2026-09-30'});
assert.deepEqual(comparisonRanges('2026-03-30', {}).current, {start:'2026-03-01', end:'2026-03-28'});
assert.equal(comparisonRanges('2026-10-31', {currentMonth:'2026-09', baseMonth:'2026-08'}).base.end, '2026-08-31');
assert.equal(comparisonRanges('2024-02-29', {mode:'ytd'}).base.end, '2023-02-28');
const ytdRows = [make('2025-01-01','A',100), make('2025-01-02','A',10), make('2026-01-01','A',120), make('2026-01-02','A',12)];
const ytd = compareCommercialVolume(ytdRows, [], [], {mode:'ytd', cutoff:'2026-01-02', segment:retail});
assert.equal(ytd.comparable, true); assert.equal(ytd.clients[0].pct, 20);
const offset = compareCommercialVolume([make(a,'A',100), make(a,'B',100), make(b,'A',150), make(b,'B',50)], [], [], q);
assert.equal(offset.segments[0].delta, 0);
assert.deepEqual(offset.clients.map(c => c.points), [25, -25]);
console.log('PASS: two months, matched cutoffs, custom dates, annual comparison, missing days, name-only files, B2B, signed changes and attribution.');

if (process.argv[2]) {
  const parsed = parseCommercial(fs.readFileSync(process.argv[2]));
  const payment = process.argv[3] ? await readPaymentXlsx(new Blob([fs.readFileSync(process.argv[3])])) : null;
  const names = [...new Set(payment?.rows.map(r => r.customer_name) || [])];
  const overview = compareCommercialVolume(parsed.rows, names, [], {});
  assert.ok(overview.comparable);
  const periods = overview.periods!;
  const near = (x: number, y: number) => assert.ok(Math.abs(x-y)<0.0001, 'Totals must reconcile');
  for (const side of ['base','current'] as const) {
    const range = periods[side];
    const raw = parsed.rows.filter(r => r.date >= range.start && r.date <= range.end).reduce((n, r) => n+r.volume, 0);
    near(raw, overview.segments.reduce((n, s) => n + s[side], 0));
  }
  for (const s of overview.segments) {
    const detail = compareCommercialVolume(parsed.rows, names, [], {segment:s.name});
    for (const side of ['base','current'] as const) {
      const scatter = summarizeCommercial(parsed.rows, names, 'grossMargin', {...periods[side], segment:s.name});
      near(s[side], scatter.points.reduce((n, r) => n+r.volume, 0));
      near(s[side], detail.clients.reduce((n, c) => n+c[side], 0));
    }
    near(s.delta!, detail.clients.reduce((n, c) => n+c.delta!, 0));
    if (s.pct !== null) near(s.pct, detail.clients.reduce((n, c) => n+c.points!, 0));
  }
  console.log(JSON.stringify({rows:parsed.rows.length, verifiedSegments:overview.segments.length, base:periods.base, current:periods.current, example:overview.segments.find(s => s.name.includes('122 - Lubricants'))}));
}
