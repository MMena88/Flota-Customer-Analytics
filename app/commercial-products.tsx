'use client';

import {useMemo, useState} from 'react';
import {familyIds, groupLabel, groupProducts, isFuelFamily, productName, type ProductSelection} from '@/lib/commercial-products';

export function ProductPicker({catalog, products, selected, onChange, disabled = false}: {
  catalog: string[]; products: string[]; selected: ProductSelection; onChange: (choice: ProductSelection) => void; disabled?: boolean;
}) {
  const [showCodes, setShowCodes] = useState(false);
  const {byProduct} = useMemo(() => groupProducts(catalog), [catalog]);
  const ids = new Set(products.map(p => byProduct.get(p)).filter((id): id is string => !!id));
  if (selected.family) ids.add(selected.family);
  const groups = [...ids].sort((a,b) => Number(isFuelFamily(b))-Number(isFuelFamily(a)) || groupLabel(a).localeCompare(groupLabel(b)));
  const refs = products.filter(p => showCodes || !byProduct.has(p) || selected.product === p);
  if (selected.product !== undefined && !refs.includes(selected.product)) refs.push(selected.product);
  const value = selected.family ? 'group:' + selected.family : selected.product === undefined ? '' : 'sku:' + selected.product;
  function choose(next: string) {
    if (next === 'toggle-codes') { setShowCodes(!showCodes); return; }
    onChange(next.startsWith('group:') ? {family:next.slice(6)} : next.startsWith('sku:') ? {product:next.slice(4)} : {});
  }
  return <label>Producto o grupo<select value={value} disabled={disabled} onChange={e => choose(e.target.value)}>
    <option value="">Todos los productos</option>
    {!!groups.length && <optgroup label="Productos agrupados">{groups.map(id => <option key={id} value={'group:' + id}>{groupLabel(id)}</option>)}</optgroup>}
    {!!refs.length && <optgroup label={showCodes ? 'Referencias originales' : 'Productos individuales'}>{refs.map(raw => <option key={raw} value={'sku:' + raw}>{productName(raw)}</option>)}</optgroup>}
    {!!groups.length && <option value="toggle-codes">{showCodes?'Ocultar códigos agrupados':'Ver también los códigos individuales…'}</option>}
  </select></label>;
}

export function FuelGroupGuide({catalog}: {catalog: string[]}) {
  const {members} = useMemo(() => groupProducts(catalog), [catalog]);
  if (!members.size) return null;
  const ids = [...familyIds.filter(id => members.has(id)), ...[...members.keys()].filter(id => !isFuelFamily(id)).sort()];
  return <details className="fuel-group-guide"><summary>Ver productos por grupo</summary>
    <p>Diésel, Regular y Premium reúnen las referencias Puma y Shell. Fuel Oil reúne 50050 y 50060. En lubricantes se combinan las presentaciones con la misma marca, formulación y grado.</p>
    <div className="fuel-group-list">{ids.map(id => <section key={id}><h3>{groupLabel(id)} <small>({members.get(id)!.length})</small></h3>
      <ul>{members.get(id)!.map(raw => <li key={raw}>{raw}</li>)}</ul></section>)}</div>
    <p>Fuel Oil 475 (50047) y los demás productos con especificaciones propias se muestran por separado.</p>
  </details>;
}
