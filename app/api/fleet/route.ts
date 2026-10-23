import {withApi} from '@/lib/api';
export const runtime='nodejs';
export const maxDuration=120;
import {fleetOverview} from '@/lib/fleet-server';
import {json} from '@/lib/server';
async function handleGET(req:Request){try{return json(await fleetOverview(new URL(req.url).searchParams));}catch(e){return json({error:(e as Error).message},400);}}

export const GET=withApi(handleGET);
