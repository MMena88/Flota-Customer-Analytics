export type Member={id:string;email:string;displayName:string;role:'admin'|'editor'|'viewer'};
export class AccessError extends Error{constructor(message:string,readonly status:number){super(message)}}
type Handler=(req:Request,member:Member)=>Promise<Response>;
type Options={serialize?:boolean};
export function createApiGuard(authenticate:(req:Request)=>Promise<Member>,runTransaction:<T>(fn:()=>Promise<T>,options:{readOnly?:boolean;serialize?:boolean})=>Promise<T>){
 return (handler:Handler,options:Options={})=>async(req:Request)=>{
  try{
   const member=await authenticate(req),write=!['GET','HEAD'].includes(req.method);
   if(write){const origin=req.headers.get('origin');if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')throw new AccessError('Origen no permitido.',403);if(member.role==='viewer')throw new AccessError('Tu acceso es de consulta. Solicitá permiso de edición.',403);}
   return await runTransaction(async()=>{const response=await handler(req,member);if(response.status>=400)throw response;return response},{readOnly:!write,serialize:write&&options.serialize});
  }catch(error){if(error instanceof Response)return error;if(error instanceof AccessError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});console.error('API request failed',{path:new URL(req.url).pathname,name:(error as Error).name});return Response.json({error:'No se pudo completar la operación. Revisá la configuración del servicio.'},{status:500,headers:{'Cache-Control':'no-store'}});}
 };
}
