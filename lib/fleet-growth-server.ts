import {all,db} from './server';
import {purchase,refund,sign,fleetFilters} from './fleet-server';
import {fleetTmOptions,matchesFleetTm} from './fleet-tm';
import {planFleetGrowth,summarizeFleetGrowth,type Cadence,type FleetGrowthAccount,type FleetGrowthDaily,type GrowthResult} from './fleet-growth-domain';

export async function fleetGrowth(p:URLSearchParams):Promise<GrowthResult>{
 const raw=await db().prepare('SELECT MIN(date) AS first,MAX(date) AS last FROM fleet_current').first<{first:string|null;last:string|null}>();
 const bounds={first:raw?.first||'',last:raw?.last||''};
 const filter={cadence:(p.get('cadence')||'month') as Cadence,start:p.get('start')||'',end:p.get('end')||'',baseStart:p.get('baseStart')||'',baseEnd:p.get('baseEnd')||'',currentStart:p.get('currentStart')||'',currentEnd:p.get('currentEnd')||''};
 const plan=planFleetGrowth(bounds,filter);
 const accounts=await all<FleetGrowthAccount>('SELECT a.client_id,a.account,c.name,c.owner FROM fleet_accounts a JOIN clients c ON c.id=a.client_id WHERE EXISTS (SELECT 1 FROM fleet_current ft WHERE ft.account=a.account) ORDER BY c.name,a.account');
 const tm=(p.get('tm')||'').trim(),selectedAccounts=accounts.filter(a=>matchesFleetTm(a.owner,tm));
 const products=await all<{product:string}>('SELECT DISTINCT product FROM fleet_current ORDER BY product');
 const latest=await db().prepare("SELECT source,completed_at FROM fleet_imports WHERE status='complete' ORDER BY sequence DESC LIMIT 1").first<{source:string;completed_at:string}>();
 let daily:FleetGrowthDaily[]=[];
 if(bounds.last){
  const from=[plan.history.start,plan.baseline.start,plan.current.start].sort()[0],to=[plan.history.end,plan.baseline.end,plan.current.end].sort().at(-1)!;
  const filters=fleetFilters(p,from,to);
  // Identical eligibility/sign rules and the same corrected, completed-import
  // view as Panel de flota. Do not read Commercial or sum preauthorisations.
  daily=await all<FleetGrowthDaily>(`SELECT a.client_id,t.date,COUNT(*) AS rows,SUM((${sign})*t.volume_milli)/1000.0 AS volume,SUM((${sign})*t.amount_cents)/100.0 AS amount FROM fleet_current t JOIN fleet_accounts a ON a.account=t.account WHERE ${filters.where} AND (${purchase} OR ${refund}) GROUP BY a.client_id,t.date ORDER BY t.date,a.client_id`,...filters.args);
 }
 return {...summarizeFleetGrowth(daily,selectedAccounts,bounds,filter),tms:fleetTmOptions(accounts),products:products.map(x=>x.product),source:latest?.source||'Payment24',updatedAt:latest?.completed_at||''};
}
