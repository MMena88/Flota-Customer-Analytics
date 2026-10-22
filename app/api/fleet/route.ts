import {fleetOverview} from '@/lib/fleet-server';
import {json} from '@/lib/server';
export async function GET(req:Request){try{return json(await fleetOverview(new URL(req.url).searchParams));}catch(e){return json({error:(e as Error).message},400);}}
