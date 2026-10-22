import {body,planImport,db,insert,update,revision,json,now} from '@/lib/server';
export async function POST(req:Request){try{const b=await body(req),plan=await planImport(b.kind,b.rows);const summary={created:plan.prepared.filter(x=>x.action==='Nuevo').length,updated:plan.prepared.filter(x=>x.action==='Actualizar').length,unchanged:plan.prepared.filter(x=>x.action==='Sin cambios').length};
 if(!b.commit)return json({...summary,errors:plan.errors,preview:plan.prepared.map(x=>({label:x.label,action:x.action})),token:plan.token});
 if(plan.errors.length)return json({error:'Corregí las filas antes de confirmar.',errors:plan.errors},400);if(b.token!==plan.token)return json({error:'Los datos cambiaron. Volvé a revisar la carga.'},409);
 const batch=crypto.randomUUID(),statements=[];for(const p of plan.prepared){if(p.action==='Sin cambios')continue;statements.push(p.before?update(b.kind,p.after):insert(b.kind,p.after),revision(b.kind,p.before,p.after,batch));}
 statements.push(insert('imports',{id:batch,kind:b.kind,source:String(b.source||'Carga manual').slice(0,300),...summary,created_at:now()}));await db().batch(statements);return json({...summary,saved:true});
 }catch(e){return json({error:(e as Error).message},400);}}
