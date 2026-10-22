import {env} from 'cloudflare:workers';
import {all,json} from '@/lib/server';
import {fleetDaily} from '@/lib/fleet-server';
import {today,validDate,priorPeriod,type Client,type Daily,type Activity,type Doc,type Market,type ImportLog,type Chat} from '@/lib/domain';
export async function GET(req:Request){try{const u=new URL(req.url),end=u.searchParams.get('end')||today(),start=u.searchParams.get('start')||end.slice(0,7)+'-01';if(!validDate(start)||!validDate(end)||start>end)throw new Error('Revisá el período seleccionado.');const previous=priorPeriod(start,end);
 const [clients,records,activities,documents,markets,imports,chats]=await Promise.all([all<Client>('SELECT * FROM clients ORDER BY name'),Promise.all([all<Daily>('SELECT * FROM records WHERE date>=? AND date<=? ORDER BY date LIMIT 30001',previous.previousStart,end),fleetDaily(previous.previousStart,end)]).then(([manual,fleet])=>[...manual,...fleet].sort((a,b)=>a.date.localeCompare(b.date))),all<Activity>('SELECT * FROM activities ORDER BY date DESC,created_at DESC LIMIT 500'),all<Doc>('SELECT id,client_id,name,mime,size,summary,created_at FROM documents ORDER BY created_at DESC LIMIT 1000'),all<Market>('SELECT * FROM markets ORDER BY end DESC'),all<ImportLog>('SELECT * FROM imports ORDER BY created_at DESC LIMIT 50'),all<Chat>('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 30')]);
 if(records.length>30000)return json({error:'Este período supera 30.000 registros. Seleccioná un rango menor.'},413);
 return json({clients,records,activities,documents,markets,imports,chats,aiReady:!!env.OPENAI_API_KEY,period:{start,end,...previous},loadedAt:new Date().toISOString()});
 }catch(e){return json({error:(e as Error).message},400);}}
