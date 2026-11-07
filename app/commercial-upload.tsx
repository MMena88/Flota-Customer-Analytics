'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowRight, Check, Clock} from 'lucide-react';
import {readCommercialReport, missingProductMessage, type CommercialReport} from '@/lib/commercial';
import type {ImportStatus, RepairSummary, UpdateMode, UpdateSummary} from '@/lib/commercial-import';
import {browserSupabase} from '@/lib/supabase/client';
import {api, date, number} from './ui';
import './commercial-upload.css';

type Chosen={file:File;report:CommercialReport};
type Planned={path:string;token:string;summary:UpdateSummary};
type Recovery={badPath:string;originalPath:string;token:string;summary:RepairSummary};
type FileRole='detail'|'bad'|'original';

async function stage(file:File,repair=false){
  const prepared=await api<{path:string;bucket:string;token:string}>('commercial',{action:'prepare',name:file.name,size:file.size,purpose:repair?'repair':'import'});
  const {error}=await browserSupabase().storage.from(prepared.bucket).uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:'text/csv'});
  if(error)throw new Error('No se pudo subir el CSV. Volvé a intentarlo.');
  return prepared.path;
}

function FileChoice({label,chosen,busy,onFile}:{label:string;chosen:Chosen|null;busy:boolean;onFile:(file:File)=>void}){
  return <label className="commercial-file-choice"><span>{label}</span>
    <input type="file" aria-label={label} accept=".csv,text/csv,text/tab-separated-values" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)onFile(file);}}/>
    {chosen&&<small><b>{chosen.file.name}</b> · {number(chosen.report.rows.length)} filas · {date(chosen.report.from)} – {date(chosen.report.to)}</small>}
  </label>;
}

export function CommercialUpload({openCommercial}:{openCommercial:()=>void}){
  const [status,setStatus]=useState<ImportStatus|null>(null),[loadVersion,setLoadVersion]=useState(0);
  const stagedFiles=useRef({normal:new WeakMap<File,string>(),repair:new WeakMap<File,string>()});
  async function filePath(file:File,repair=false){
    const cache=repair?stagedFiles.current.repair:stagedFiles.current.normal;
    const existing=cache.get(file);if(existing)return existing;
    const path=await stage(file,repair);cache.set(file,path);return path;
  }
  const [detail,setDetail]=useState<Chosen|null>(null),[bad,setBad]=useState<Chosen|null>(null),[original,setOriginal]=useState<Chosen|null>(null);
  const [mode,setMode]=useState<UpdateMode>('rows'),[plan,setPlan]=useState<Planned|null>(null),[repair,setRepair]=useState<Recovery|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirmUndo,setConfirmUndo]=useState(false);
  useEffect(()=>{
    let active=true;
    api<ImportStatus>('commercial?view=imports').then(v=>{if(active)setStatus(v);}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[loadVersion]);
  async function run(fn:()=>Promise<void>){
    setBusy(true);setError('');setMessage('');
    try{await fn();}catch(err){setError((err as Error).message||'No se pudo completar la operación.');}
    finally{setBusy(false);}
  }
  function choose(file:File,role:FileRole){
    setPlan(null);setRepair(null);setConfirmUndo(false);
    (role==='detail'?setDetail:role==='bad'?setBad:setOriginal)(null);
    void run(async()=>{
      if(!file.name.toLowerCase().endsWith('.csv')||file.size>30*1024*1024)throw new Error('Seleccioná un CSV Commercial de hasta 30 MB.');
      const report=readCommercialReport(new Uint8Array(await file.arrayBuffer()));
      if(report.kind==='customer-summary'&&role!=='bad'){
        if(role==='detail'&&status?.suspectRows)setBad({file,report});
        throw new Error(missingProductMessage);
      }
      if(role==='bad'&&report.kind!=='customer-summary')throw new Error('Para comparar con la carga afectada, elegí el resumen por cliente que se leyó sin producto.');
      (role==='detail'?setDetail:role==='bad'?setBad:setOriginal)({file,report});
    });
  }
  async function preview(){
    if(!detail)return;
    await run(async()=>{
      setPlan(null);
      const path=await filePath(detail.file);
      const result=await api<UpdateSummary&{token:string}>('commercial',{action:'preview',path,name:detail.file.name,mode});
      setPlan({path,token:result.token,summary:result});
    });
  }
  async function save(){
    if(!detail||!plan)return;
    await run(async()=>{
      const result=await api<ImportStatus&{unchanged?:boolean}>('commercial',{action:'finish',path:plan.path,token:plan.token,name:detail.file.name,mode});
      setStatus({...result,canEdit:true});setPlan(null);setDetail(null);
      setMessage(result.unchanged?'El archivo ya estaba al día. Todas las filas coinciden con el histórico.':'Carga guardada. El histórico y los gráficos ya reflejan los datos revisados.');
    });
  }
  async function previewRepair(){
    if(!bad||!original)return;
    await run(async()=>{
      setRepair(null);
      const badPath=await filePath(bad.file,true),originalPath=await filePath(original.file,true);
      const result=await api<RepairSummary&{token:string}>('commercial',{action:'previewRepair',badPath,originalPath,originalName:original.file.name});
      setRepair({badPath,originalPath,token:result.token,summary:result});
    });
  }
  async function applyRepair(){
    if(!repair||!original)return;
    await run(async()=>{
      const result=await api<ImportStatus>('commercial',{action:'applyRepair',badPath:repair.badPath,originalPath:repair.originalPath,originalName:original.file.name,token:repair.token});
      setStatus({...result,canEdit:true});setRepair(null);setDetail(null);setBad(null);setOriginal(null);
      setMessage('Base reparada y respaldo verificado. Se retiraron '+number(repair.summary.quarantined)+' filas mal leídas y se recuperaron '+number(repair.summary.restored)+' filas de detalle. '+(repair.summary.matchesReference?'El histórico coincide fila por fila con el CSV de detalle anterior.':'Los demás días y segmentos conservaron sus registros.'));
    });
  }
  async function undo(){
    if(!status)return;
    await run(async()=>{
      const result=await api<ImportStatus>('commercial',{action:'undo',version:status.updatedAt});
      setStatus({...result,canEdit:true});setConfirmUndo(false);setDetail(null);setPlan(null);
      setMessage('Se deshizo la última carga de ventas y se verificó la versión restaurada.');
    });
  }
  return <div className="commercial-upload">
    <section className="panel">
      <div className="panel-head"><div><h2>Actualizar ventas de Commercial</h2><p>Clientes de todos los segmentos · Volumen, ventas, costos y márgenes por día y producto.</p></div>
        <button className="button secondary" onClick={openCommercial} disabled={busy}>Ver análisis <ArrowRight size={15}/></button></div>
      {status?<div className="commercial-upload-body">
        <p className="commercial-upload-status"><strong>Histórico activo</strong> {status.totalRows?date(status.first)+' – '+date(status.last)+' · '+number(status.totalRows)+' filas':'Aún no hay registros'}</p>
        {status.canEdit?<><p>Exportá <b>Commercial All Values</b> como CSV con segmento, día, mes, código de cliente (opcional), nombre del cliente y producto. Exportá Volume en galones estadounidenses para todos los productos. El panel permite verlos también en m³.</p>
          <FileChoice label="Seleccionar CSV de Commercial" chosen={detail} busy={busy} onFile={f=>choose(f,'detail')}/>
          {detail&&<><label className="commercial-update-mode">Tipo de actualización<select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as UpdateMode);setPlan(null);}}>
            <option value="rows">Actualizar solo las filas del archivo</option><option value="scopes">Reemplazar días y segmentos completos</option></select></label>
            <p>{mode==='rows'?'Cada fila se identifica por fecha, segmento, cliente y producto. Los importes corregidos sustituyen la fila anterior.':'Usá esta opción para una exportación completa. La vista previa indica cuántas filas guardadas se retirarían de esos días y segmentos.'}</p>
            <button className="button secondary" disabled={busy||!!status.suspectRows} onClick={()=>void preview()}>Revisar cambios</button></>}
          {plan&&<div className="commercial-upload-preview"><strong>Vista previa de la actualización</strong><p>{number(plan.summary.added)} nuevas · {number(plan.summary.changed)} corregidas · {number(plan.summary.unchanged)} sin cambios · {number(plan.summary.removed)} por retirar</p>
            <button className="button" disabled={busy} onClick={()=>void save()}><Check size={16}/> Guardar actualización</button></div>}
        </>:<p>Tu cuenta tiene acceso de consulta. Un editor puede actualizar los archivos.</p>}
      </div>:!error&&<p className="panel-empty-text" role="status">Leyendo el histórico de Commercial…</p>}
    </section>
    {!!status?.suspectRows&&<section className="panel commercial-repair"><div className="panel-head"><div><h2>Reparar una carga sin producto</h2><p>Detectamos filas con códigos en el campo de nombre y posibles nombres de clientes en el campo de producto.</p></div></div>
      {status.canEdit&&<div className="commercial-upload-body">
        <p>Elegí el CSV de resumen que se cargó por error y el CSV de detalle de la carga anterior. La revisión compara las filas completas por día y segmento. La reparación guarda primero una copia privada de la base.</p>
        <FileChoice label="CSV de resumen mal leído" chosen={bad} busy={busy} onFile={f=>choose(f,'bad')}/>
        <FileChoice label="CSV de detalle anterior" chosen={original} busy={busy} onFile={f=>choose(f,'original')}/>
        <button className="button secondary" disabled={busy||!bad||!original} onClick={()=>void previewRepair()}>Revisar reparación</button>
        {repair&&<div className="commercial-upload-preview"><strong>Reparación verificada contra los archivos</strong>
          <p>{number(repair.summary.quarantined)} filas mal leídas · {number(repair.summary.restored)} filas por recuperar · {number(repair.summary.preserved)} filas que se conservan</p>
          <p>{number(repair.summary.verifiedScopes)} combinaciones de día y segmento coinciden exactamente. {number(repair.summary.withoutDetail)} filas del resumen quedan respaldadas a la espera de su detalle por producto.</p>
          {repair.summary.unmatchedScopes>0&&<p>{number(repair.summary.unmatchedScopes)} combinaciones con datos distintos se conservan para revisión.</p>}
          <p><b>Resultado previsto</b> · {number(repair.summary.totalRows)} filas{repair.summary.matchesReference?' · coincide con todo el CSV de detalle anterior':''}</p>
          <button className="button" disabled={busy} onClick={()=>void applyRepair()}>Respaldar y reparar</button></div>}
      </div>}</section>}
    {busy&&<p className="commercial-notice" role="status">Procesando el archivo de Commercial…</p>}
    {error&&<div className="error-banner" role="alert">{error}{!status&&<button className="text-link" onClick={()=>{setError('');setLoadVersion(v=>v+1);}}>Volver a intentar</button>}</div>}
    {message&&<p className="commercial-notice" role="status">{message}</p>}
    {status&&<section className="panel"><div className="panel-head"><div><h2>Historial de Commercial</h2><p>La base activa se actualiza desde esta pantalla. Borrar un CSV en Storage conserva los datos que ya se publicaron.</p></div><Clock size={18}/></div>
      {status.canEdit&&status.canUndo&&<div className="commercial-upload-body">{confirmUndo?<><p>Se restaurará el histórico de ventas anterior a <b>{status.history[0].source}</b>. La operación guarda una copia de la versión actual.</p><div className="actions"><button className="button" disabled={busy} onClick={()=>void undo()}>Confirmar restauración</button><button className="button secondary" onClick={()=>setConfirmUndo(false)} disabled={busy}>Cancelar</button></div></>:<button className="button secondary" disabled={busy} onClick={()=>setConfirmUndo(true)}>Deshacer última carga</button>}</div>}
      {status.history.length?<div className="table-scroll"><table><thead><tr><th>Operación</th><th>Archivo</th><th>Período</th><th>Filas</th></tr></thead><tbody>{status.history.map((h,i)=><tr key={h.at+i}><td>{h.kind==='repair'?'Reparación':h.kind==='undo'?'Carga deshecha':'Carga'}<small>{date(h.at)}</small></td><td>{h.source}</td><td>{date(h.from)} – {date(h.to)}</td><td>{number(h.rows)}</td></tr>)}</tbody></table></div>:<p className="panel-empty-text">Las cargas confirmadas aparecerán aquí.</p>}
    </section>}
  </div>;
}
