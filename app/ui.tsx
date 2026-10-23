'use client';
import type {ReactNode} from 'react';
import {Database,X,TrendingUp} from 'lucide-react';
export const money=(v:number|null|undefined,d=0)=>v==null?'—':new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD',maximumFractionDigits:d}).format(v);
export const number=(v:number|null|undefined,d=0)=>v==null?'—':new Intl.NumberFormat('es-SV',{maximumFractionDigits:d}).format(v);
export const date=(v:string)=>new Date(v.length===10?v+'T12:00:00Z':v).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Guatemala'});
export function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={'field '+(wide?'wide':'')}><span>{label}</span>{children}</label>}
export function Empty({title,text,action}:{title:string;text:string;action?:ReactNode}){return <div className="empty"><div className="empty-icon"><Database size={26}/></div><h3>{title}</h3><p>{text}</p>{action}</div>}
export function Badge({children,color='green'}:{children:ReactNode;color?:string}){return <span className={'badge '+color}>{children}</span>}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){return <div className="modal-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={title} className="modal" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose()}}><div className="panel-head"><h2>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={20}/></button></div>{children}</section></div>}
export function Kpi({label,value,detail,icon}:{label:string;value:string;detail:string;icon?:ReactNode}){return <section className="kpi"><div><span>{label}</span><i>{icon||<TrendingUp/>}</i></div><strong>{value}</strong><small>{detail}</small></section>}
export function download(name:string,text:string){const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export async function api<T=any>(path:string,payload?:unknown):Promise<T>{const r=await fetch('/api/'+path,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:undefined);const d=await r.json() as T & {error?:string};if(r.status===401){window.location.assign('/login');throw new Error('Tu sesión terminó. Volvé a ingresar.');}if(!r.ok)throw new Error(d.error||'No se pudo completar la operación.');return d;}
