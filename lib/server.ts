import {env} from 'cloudflare:workers';
import {str,num,norm,validDate,units,recordKey,type Client,type Daily} from './domain';
export const db=()=>{if(!env.DB)throw new Error('La base de datos todavía no está disponible.');return env.DB;};
export const now=()=>new Date().toISOString();
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function checkOrigin(req:Request){const o=req.headers.get('Origin');if(o&&o!==new URL(req.url).origin)throw new Error('Origen no permitido.');}
export async function body(req:Request){checkOrigin(req);const t=await req.text();if(t.length>2_000_000)throw new Error('La carga supera 2 MB.');return JSON.parse(t);}
export async function all<T>(sql:string,...args:(string|number|null)[]){return (await db().prepare(sql).bind(...args).all<T>()).results;}
export function insert(table:string,row:Record<string,unknown>,replace=false){const cols=Object.keys(row);return db().prepare(`INSERT ${replace?'OR REPLACE ':''}INTO ${table} (${cols.map(c=>'"'+c+'"').join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c]??null));}
export function update(table:string,row:Record<string,unknown>){const cols=Object.keys(row).filter(k=>k!=='id');return db().prepare(`UPDATE ${table} SET ${cols.map(k=>'"'+k+'"=?').join(',')} WHERE id=?`).bind(...cols.map(c=>row[c]??null),row.id);}
export function revision(entity:string,before:unknown,after:{id:string},batchId:string|null=null){return insert('revisions',{id:crypto.randomUUID(),entity,entity_id:after.id,before_json:before?JSON.stringify(before):null,after_json:JSON.stringify(after),batch_id:batchId,created_at:now()});}
export function cleanClient(input:Record<string,unknown>,old?:Client):Client{
 const c:Client={id:old?.id||crypto.randomUUID(),code:str(input.code)||null,name:str(input.name),segment:str(input.segment),status:str(input.status)||'Actual',department:str(input.department),district:str(input.district),owner:str(input.owner),products:str(input.products,1000),supplier:str(input.supplier),contact:str(input.contact),email:str(input.email),phone:str(input.phone),website:str(input.website),notes:str(input.notes,10000),strategic:input.strategic===true||input.strategic===1?1:0,potential:num(input.potential,'Potencial'),potential_unit:str(input.potential_unit)||'gal',next_action:str(input.next_action,1000),next_date:str(input.next_date)||null,created_at:old?.created_at||now(),updated_at:now()};
 if(!c.name||!c.segment)throw new Error('Completá nombre y segmento.');if(!['Actual','Potencial','Inactivo'].includes(c.status))throw new Error('Estado: Actual, Potencial o Inactivo.');if(!units.includes(c.potential_unit))throw new Error('Unidad de potencial no válida.');if(c.next_date&&!validDate(c.next_date))throw new Error('Fecha de próxima acción inválida.');if(c.website&&!/^https?:\/\//i.test(c.website))throw new Error('La web debe empezar con https:// o http://.');return c;
}
export async function clientById(id:string){const c=await db().prepare('SELECT * FROM clients WHERE id=?').bind(id).first<Client>();if(!c)throw new Error('No se encontró el cliente.');return c;}
export async function fingerprint(value:unknown){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function planImport(kind:string,rows:Record<string,string>[]){
 if(!['clients','records'].includes(kind)||!Array.isArray(rows)||!rows.length||rows.length>500)throw new Error('Carga no válida. El máximo es 500 filas por lote.');
 const clients=await all<Client>('SELECT * FROM clients');const prepared:{before:Client|Daily|null;after:Client|Daily;action:string;label:string}[]=[];const seen=new Set<string>();const errors:string[]=[];
 let existing:Daily[]=[];if(kind==='records'){const dates=rows.map(r=>r.fecha).filter(validDate).sort();if(dates.length)existing=await all<Daily>('SELECT * FROM records WHERE date>=? AND date<=?',dates[0],dates.at(-1)!);}
 const map=new Map(existing.map(r=>[recordKey(r),r]));
 for(let i=0;i<rows.length;i++){try{const r=rows[i];let before:Client|Daily|null=null,after:Client|Daily,label='';
  if(kind==='clients'){
   if(!r.nombre||!r.segmento)throw new Error('Nombre y segmento son obligatorios.');
   let matches=clients.filter(c=>r.codigo?norm(c.code)===norm(r.codigo):norm(c.name)===norm(r.nombre));
   if(r.codigo&&!matches.length){const byName=clients.filter(c=>norm(c.name)===norm(r.nombre));if(byName.length>1||byName.some(c=>c.code))throw new Error('Ese nombre ya existe. Revisá el código o editá su ficha.');matches=byName;}
   if(matches.length>1)throw new Error('Nombre ambiguo. Agregá el código de cliente.');const old=matches[0];before=old||null;
   const fields:Record<string,string>={nombre:'name',segmento:'segment',codigo:'code',estado:'status',departamento:'department',distrito:'district',ejecutivo:'owner',productos:'products',proveedor:'supplier',contacto:'contact',correo:'email',telefono:'phone',web:'website',notas:'notes'};
   const input:Record<string,unknown>={...(old||{})};for(const [k,v]of Object.entries(fields))if(r[k]?.trim())input[v]=r[k];
   after=cleanClient(input,old);const key=old?.id||norm(r.codigo||r.nombre);if(seen.has(key))throw new Error('El cliente aparece más de una vez en este lote.');seen.add(key);label=after.name;
   const code=after.code;if(code&&clients.some(c=>c.id!==after.id&&norm(c.code)===norm(code)))throw new Error('El código pertenece a otro cliente.');
  }else{
   const matches=clients.filter(c=>r.codigo?norm(c.code)===norm(r.codigo):norm(c.name)===norm(r.nombre));if(matches.length!==1)throw new Error(matches.length?'Cliente ambiguo; usá el código.':'Cliente no encontrado. Primero cargá su ficha.');
   if(!validDate(r.fecha))throw new Error('Fecha inválida; usá AAAA-MM-DD.');const product=str(r.producto),unit=str(r.unidad);if(!product)throw new Error('Falta producto.');if(!units.includes(unit))throw new Error('Unidad: gal, L, bbl, kg o t.');
   after={id:crypto.randomUUID(),client_id:matches[0].id,date:r.fecha,product:norm(product),unit,location:norm(str(r.sucursal)),volume:num(r.volumen,'Volumen',true)!,revenue:num(r.ingreso,'Ingreso'),cost:num(r.costo,'Costo'),source:str(r.fuente),updated_at:now()};
   const key=recordKey(after);if(seen.has(key))throw new Error('Se repite cliente, fecha, producto, unidad y sucursal. Consolidá esa fila.');seen.add(key);before=map.get(key)||null;if(before)after.id=before.id;label=matches[0].name+' · '+r.fecha+' · '+product;
  }
  const clean=(v:Client|Daily|null)=>v?Object.fromEntries(Object.entries(v).filter(([k])=>!['created_at','updated_at','id'].includes(k))):null;
  const action=!before?'Nuevo':JSON.stringify(clean(before))===JSON.stringify(clean(after))?'Sin cambios':'Actualizar';prepared.push({before,after,action,label});
 }catch(e){errors.push(`Fila ${i+2}: ${(e as Error).message}`);}}
 return {prepared,errors,token:await fingerprint({kind,rows,clients,existing})};
}
