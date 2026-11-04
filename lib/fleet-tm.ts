export const UNASSIGNED_TM = '__unassigned__';
export type FleetTmOption = { value: string; label: string; clients: number };

export function matchesFleetTm(owner: string | null | undefined, filter: string) {
  if (!filter) return true;
  const selectedOwner = filter === UNASSIGNED_TM ? '' : filter;
  return (owner || '').trim() === selectedOwner;
}

/** Count clients once, even when they have several Payment24 accounts. */
export function fleetTmOptions(accounts: { client_id: string; owner?: string | null }[]): FleetTmOption[] {
  const clients = new Map(accounts.map(account => [account.client_id, (account.owner || '').trim()]));
  const counts = new Map<string, number>();
  for (const owner of clients.values()) counts.set(owner, (counts.get(owner) || 0) + 1);

  const options = [...counts]
    .filter(([owner]) => owner !== '')
    .sort(([left], [right]) => left.localeCompare(right, 'es'))
    .map(([owner, count]) => ({ value: owner, label: owner, clients: count }));
  return [...options, { value: UNASSIGNED_TM, label: 'Sin TM asignado', clients: counts.get('') || 0 }];
}
