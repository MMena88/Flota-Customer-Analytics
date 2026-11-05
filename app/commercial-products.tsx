'use client';

import {familyIds, fuelFamilies, fuelFamilyOf, isFuelFamily, productName, type ProductSelection} from '@/lib/commercial-products';

export function ProductPicker({products, selected, onChange, disabled = false}: {
  products: string[]; selected: ProductSelection; onChange: (choice: ProductSelection) => void; disabled?: boolean;
}) {
  const available = new Set(products.map(fuelFamilyOf));
  const families = familyIds.filter(id => available.has(id) || id === selected.family);
  // Preserve a selection when drilling down to a segment with no matching rows.
  const refs = selected.product !== undefined && !products.includes(selected.product) ? [selected.product, ...products] : products;
  const value = selected.family ? 'group:' + selected.family : selected.product === undefined ? '' : 'sku:' + selected.product;
  function choose(value: string) {
    if (value.startsWith('sku:')) return onChange({product: value.slice(4)});
    const id = value.slice(6);
    onChange(value.startsWith('group:') && isFuelFamily(id) ? {family: id} : {});
  }
  return <label>Producto o grupo<select value={value} disabled={disabled} onChange={e => choose(e.target.value)}>
    <option value="">Todos los productos</option>
    {!!families.length && <optgroup label="Grupos de combustible">{families.map(id => <option key={id} value={'group:' + id}>{fuelFamilies[id].label}</option>)}</optgroup>}
    <optgroup label="Productos individuales">{refs.map(raw => <option key={raw} value={'sku:' + raw}>{productName(raw)}</option>)}</optgroup>
  </select></label>;
}

export function FuelGroupGuide({catalog}: {catalog: string[]}) {
  if (!catalog.length) return null;
  return <details className="fuel-group-guide"><summary>Ver productos por grupo</summary>
    <p>Estos son los códigos y nombres originales del histórico Commercial. El segmento y las fechas determinan cuáles entran en tus cifras.</p>
    <div className="fuel-group-list">{familyIds.map(id => {
      const members = catalog.filter(raw => fuelFamilyOf(raw) === id);
      return <section key={id}><h3>{fuelFamilies[id].label} <small>({members.length})</small></h3>
        {members.length ? <ul>{members.map(raw => <li key={raw}>{raw}</li>)}</ul> : <p>Sin referencias cargadas.</p>}
      </section>;
    })}</div>
    <p>El 50047 (Fuel Oil 475), los lubricantes, los aditivos y los códigos nuevos sin asignación se consultan como productos individuales.</p>
  </details>;
}
