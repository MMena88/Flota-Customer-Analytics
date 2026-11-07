// Commercial Volume and Payment24 Gallons are both reported in US liquid gallons.
export const CUBIC_METRES_PER_GALLON = 0.003785411784;
export type DisplayUnit = 'gal' | 'm³';
export const fromGallons = (gallons: number, unit: DisplayUnit) =>
  unit === 'm³' ? gallons * CUBIC_METRES_PER_GALLON : gallons;

export function cubicMetreFactor(source: string): number | null {
  switch (source) {
    case 'm³': case 'm3': return 1;
    case 'gal': return CUBIC_METRES_PER_GALLON;
    case 'L': return 0.001;
    case 'bbl': return 42 * CUBIC_METRES_PER_GALLON;
    default: return null;
  }
}

export function displayFactor(source: string, target: string): number | null {
  if (source === target) return 1;
  if (target !== 'm³' && target !== 'gal') return null;
  const factor = cubicMetreFactor(source);
  return factor === null ? null : factor / cubicMetreFactor(target)!;
}

export function recordsInUnit<T extends {volume: number; unit: string}>(rows: T[], unit: string): T[] {
  return rows.flatMap(r => {
    const factor = displayFactor(r.unit, unit);
    if (factor === null) return [];
    return [r.unit === unit ? r : {...r, volume: r.volume * factor, unit}];
  });
}
