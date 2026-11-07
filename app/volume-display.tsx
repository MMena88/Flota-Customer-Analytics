'use client';

import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import type {DisplayUnit} from '@/lib/volume-units';

const preferenceKey = 'puma.volume.display';
const VolumeContext = createContext<{unit: DisplayUnit; choose: (unit: DisplayUnit) => void}>({unit: 'm³', choose: () => {}});

export function VolumeProvider({children}: {children: ReactNode}) {
  const [unit, setUnit] = useState<DisplayUnit>('m³');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (saved === 'gal' || saved === 'm³') setUnit(saved);
    } catch { /* The preference still works for the current session. */ }
  }, []);
  function choose(next: DisplayUnit) {
    setUnit(next);
    try { localStorage.setItem(preferenceKey, next); } catch { /* Storage is optional. */ }
  }
  return <VolumeContext.Provider value={{unit, choose}}>{children}</VolumeContext.Provider>;
}

export const useVolumeDisplay = () => useContext(VolumeContext);

export function VolumeSelector() {
  const {unit, choose} = useVolumeDisplay();
  return <label className="volume-unit-select">Unidad de volumen
    <select value={unit} onChange={e => choose(e.target.value as DisplayUnit)}>
      <option value="m³">Metros cúbicos (m³)</option>
      <option value="gal">Galones US (gal)</option>
    </select>
  </label>;
}
