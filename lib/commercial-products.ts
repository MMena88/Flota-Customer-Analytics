// The product code identifies the fuel. Broad name matches would also pick up
// diesel additives, motor oils and premium outboard lubricants in this report.
export const fuelFamilies = {
  'fuel-oil': {label: 'Fuel Oil', codes: ['50050', '50060'], names: ['Fuel Oil 500 cSt', 'Fuel Oil 600 cSt']},
  diesel: {
    label: 'Diésel', codes: ['30005', '30015', '32005', '32015', '44005', '44015'],
    names: ['Diesel', 'Ultra Low Sulfur Diesel (ULSD)', 'Diesel Bajo Azufre', 'ION Diesel', 'Diesel Bajo Azufre con Hitec 6600D', 'Shell Fuel Save Diesel (ULSD)', 'Shell FuelSave Diesel', 'Diesel 50ppm', 'Low Sulphur Diesel 50', 'Shell Diesel', 'Puma Diesel'],
  },
  regular: {
    label: 'Regular', codes: ['10087', '12087', '44087'],
    names: ['Regular', 'Gasolina Regular', 'Gasolina Regular con CLEANTEC', 'Shell FuelSave Regular'],
  },
  premium: {
    label: 'Premium', codes: ['10091', '12091', '44091'],
    names: ['Premium', 'Gasolina Premium', 'Gasolina Premium con CLEANTEC PRO', 'Shell V-Power', 'Gasolina Super'],
  },
} as const;

export type FuelFamily = keyof typeof fuelFamilies;
export const familyIds = Object.keys(fuelFamilies) as FuelFamily[];
export const isFuelFamily = (key: string): key is FuelFamily => Object.hasOwn(fuelFamilies, key);
export type ProductSelection = {family?: string; product?: never} | {family?: never; product?: string};
export const productName = (raw: string) => !raw || raw === 'NONE' ? 'Sin producto informado' : raw;
const presentationPrefix = 'presentation:';
export const groupLabel = (id: string) => isFuelFamily(id) ? fuelFamilies[id].label : id.slice(presentationPrefix.length);
export function selectionName(selection: {family?: string | null; product?: string | null}) {
  if (selection.family) return groupLabel(selection.family);
  return selection.product == null ? 'Todos los productos' : productName(selection.product);
}

const byCode = new Map<string, FuelFamily>();
const byName = new Map<string, FuelFamily>();
const nameKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/ SI$/, '');
for (const family of familyIds) {
  for (const code of fuelFamilies[family].codes) byCode.set(code, family);
  for (const name of fuelFamilies[family].names) byName.set(nameKey(name), family);
}

export function fuelFamilyOf(product: string): FuelFamily | null {
  const raw = product.trim();
  if (/^\d/.test(raw)) {
    const code = /^(\d+)(?:\s*SI)?(?=\s|[-–—:]|$)/i.exec(raw)?.[1];
    return code ? byCode.get(code) ?? null : null;
  }
  // Legacy exports can contain just the original description. A new, explicit
  // code remains independent until it is mapped, even if its name is familiar.
  return byName.get(nameKey(raw)) ?? null;
}

// For packaged lubricants, combine only references with the same brand,
// formulation and grade. A pack size is not the unit of the Volume column.
function presentationOf(raw: string): string | null {
  const description = /^\d+\s+[-–—]\s+(.+)$/.exec(raw)?.[1];
  if (!description || !/^(Puma|Shell|Raloy|Spirax)\b/i.test(description)) return null;
  const base = description.replace(/(?:,\s*|\s+)(?:CJ\s*)?(?:\d+\s*[x*]\s*)?\d+(?:[.,]\d+)?\s*(?:AG|QT|OZ|ML|LT|L|LB|KG|G)\.?$/i, '').trim();
  return base !== description ? presentationPrefix + base.toUpperCase().replace(/\s+/g, ' ') : null;
}
export function groupProducts(products: Iterable<string>) {
  const refs = [...new Set(products)].sort();
  const members = new Map<string, string[]>();
  const byProduct = new Map<string, string>();
  for (const raw of refs) {
    const id = fuelFamilyOf(raw) || presentationOf(raw);
    if (!id) continue;
    const list = members.get(id) || [];
    list.push(raw);
    members.set(id, list);
  }
  for (const [id, list] of members) {
    if (!isFuelFamily(id) && list.length < 2) { members.delete(id); continue; }
    for (const raw of list) byProduct.set(raw, id);
  }
  return {members, byProduct};
}

export function fleetProductOptions(catalog: string[]) {
  const {byProduct} = groupProducts(catalog);
  const options = new Map<string,string>();
  for (const raw of catalog) {
    const id = byProduct.get(raw);
    options.set(id ? 'group:'+id : raw || '__missing__', id ? groupLabel(id) : raw || 'Producto no informado');
  }
  return [...options].sort(([,a],[,b]) => a.localeCompare(b));
}
export function fleetProductQuery(choice: string): Record<string,string> {
  if (!choice) return {};
  return choice.startsWith('group:') ? {family:choice.slice(6)} : {product:choice};
}
export function fleetMix(rows: {product:string;volume:number}[], catalog:string[]) {
  const {byProduct} = groupProducts(catalog);
  const mix = new Map<string,{value:string;label:string;volume:number}>();
  for (const row of rows) {
    const id = byProduct.get(row.product);
    const value = id ? 'group:'+id : row.product || '__missing__';
    const entry = mix.get(value) || {value, label:id ? groupLabel(id) : row.product || 'Producto no informado', volume:0};
    entry.volume += row.volume;
    mix.set(value, entry);
  }
  return [...mix.values()].sort((a,b)=>b.volume-a.volume);
}
