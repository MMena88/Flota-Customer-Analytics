/** Original Puma Flota artwork supplied in PU_Flota_Brochure_SPA.pdf. */
export function Brand({className = ''}: {className?: string}) {
  return <div className={`puma-logo ${className}`}><img src="/brand/puma-flota.png" alt="Puma Flota" width={979} height={343}/></div>;
}
