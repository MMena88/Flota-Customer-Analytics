import {withApi} from '@/lib/api';
export const runtime='nodejs';
export const maxDuration=120;
import {fleetOverview} from '@/lib/fleet-server';
import {fleetGrowth} from '@/lib/fleet-growth-server';
import {json} from '@/lib/server';
async function handleGET(req:Request){try{const p=new URL(req.url).searchParams;return json(await (p.get('view')==='growth'?fleetGrowth(p):fleetOverview(p)));}catch(e){return json({error:(e as Error).message},400);}}

export const GET=withApi(handleGET);
