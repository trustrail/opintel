import { Link } from '@tanstack/react-router';
import { useEffect, useRef, type FormEvent } from 'react';
import { Button, Card, CardHeader, EmptyState, ErrorState, LoadingState } from '../../shared/ui/index.js';
import { useCompanies, useProjects } from '../tenancy/data.js';
import { useCustodyAction, useTokenKey } from './data.js';
import { useCustodyUi } from './state.js';
const time = (value:string|null) => value === null ? 'Never' : new Date(value).toISOString().slice(0,16).replace('T',' ')+' UTC';
export function TokenKeyScreen({projectId}:{projectId:string}) {
  const query=useTokenKey(projectId),projects=useProjects(),companies=useCompanies();
  const mutation=useCustodyAction(projectId),ui=useCustodyUi();
  const input=useRef<HTMLInputElement>(null);
  const project=projects.data?.find(p=>p.id===projectId);
  const canRestore=project?.role==='admin' && !companies.isError && !companies.isPending && companies.data?.some(c=>c.id===project.company.id&&c.role==='admin')===true;
  const action=ui.projectId===projectId?ui.action:null;
  useEffect(()=>{if(action)input.current?.focus();},[action,ui.version]);
  useEffect(()=>()=>useCustodyUi.getState().close(),[projectId]);
  const begin=(next:'rotate'|'restore',version?:number)=>{mutation.reset();ui.show(projectId,next,version);};
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!project||ui.confirmation!==project.name||mutation.isPending||(action==='rotate'&&!ui.reason.trim()))return;
    const request=action==='rotate'?{action:'rotate' as const,confirmation:ui.confirmation,reason:ui.reason,idempotencyKey:ui.idempotencyKey}
      :action==='restore'&&canRestore&&ui.version!==null?{action:'restore' as const,confirmation:ui.confirmation,keyVersion:ui.version}:null;
    if(!request)return;
    try{await mutation.mutateAsync(request);ui.close();}catch{/* The API's safe message is rendered unchanged below. */}
  }
  const failures=query.data?.versions.filter(v=>v.lastRehearsal==='failed'||v.lastRehearsal==='mismatch')??[];
  return <section className="screen on">
    <h1>Token key</h1><p className="sub">The key that makes tokens reproducible across sources and over time. {project?.name}</p>
    <p className="note"><Link to="/projects/$projectId/$screen" params={{projectId,screen:'access'}}>Back to Access</Link></p>
    <section className="dangerzone" aria-label="Key custody responsibility"><div><b>Opintel cannot recover a lost key.</b><span>You hold the key and its escrow copy in your environment. If both are lost, earlier tokens cannot be reproduced and historical evidence cannot be verified. Keep every retained version and verify its backup.</span></div></section>
    {query.isPending||projects.isPending?<LoadingState/>:query.isError?<ErrorState title="Token key could not be loaded" description={query.error.message} retry={()=>{void query.refetch();}}/>
    :projects.isError?<ErrorState title="Project could not be loaded" description={projects.error.message} retry={()=>{void projects.refetch();}}/>
    :!project?<EmptyState icon="!" title="Project unavailable" description="Return to All projects to choose a project you can administer."/>
    :query.data.currentVersion===null?<EmptyState icon="◇" title="No token key yet" description="The key is created and its escrow backup verified when the first source connects. Nothing needs to be rotated or restored yet."/>
    :<>
      {failures.length?<section className="seg" role="alert" aria-label="Rehearsal failure"><Card><CardHeader title="Key backup verification needs attention"/><div className="sheetb">
        <p><b>Do not rely on an unverified backup.</b> Check the escrow copy and run a rehearsal again. Rotation cannot recover a missing key.</p>
        {failures.map(v=><p key={v.version}><b>Version {v.version}: {v.lastRehearsal==='mismatch'?'escrow does not match the recorded key':'escrow could not be verified'}.</b> {v.state==='current'?'New source connections are refused until verification succeeds.':'This retained key is needed to reproduce earlier tokens.'} Last checked: {time(v.lastRehearsedAt)}.</p>)}
      </div></Card></section>:null}
      <section className="seg"><Card><CardHeader title={`Current version · ${query.data.currentVersion}`}/><div className="frow"><div className="fl"><b>Restore rehearsals</b><span>A rehearsal reads each retained escrow copy in isolation and checks that it reproduces the expected verification token. It does not replace the stored key.</span></div><Button disabled={mutation.isPending||action!==null} onClick={()=>{mutation.reset();mutation.mutate({action:'rehearse'});}}>{mutation.isPending&&mutation.variables?.action==='rehearse'?'Rehearsing…':'Rehearse now'}</Button></div>
      <div className="frow"><div className="fl"><b>Rotate deliberately</b><span>Rotation changes every future token and breaks joins against earlier results. Old keys are retained, but old tokens cannot be translated into new ones. This is not routine maintenance.</span></div><Button variant="ghost" disabled={mutation.isPending||action!==null} onClick={()=>begin('rotate')}>Rotate key</Button></div></Card></section>
      {companies.isError?<ErrorState title="Company administration could not be checked" description={companies.error.message} retry={()=>{void companies.refetch();}}/>:null}
      {!canRestore?<p className="note">{companies.isPending?'Checking company administration…':'Restoring a key requires both project and company administration.'}</p>:null}
      <section className="seg"><Card><CardHeader title="Retained versions" meta="Never deleted"/>
        <div role="region" aria-label="Token key versions" tabIndex={0} style={{overflowX:'auto'}}><table><thead><tr><th>Version</th><th>Backup</th><th>Last rehearsal</th><th>Created</th><th>Recovery</th></tr></thead><tbody>
          {query.data.versions.map(v=><tr key={v.version}><td><b className="mono">{v.version}</b><br/>{v.state==='current'?'Current':'Retained'}</td><td>{v.backupVerifiedAt?'Verified':'Not verified'}<br/><span className="mono">{time(v.backupVerifiedAt)}</span></td><td>{v.lastRehearsal===null?'Not rehearsed':v.lastRehearsal==='ok'?'Passed':v.lastRehearsal==='mismatch'?'Mismatch':'Failed'}<br/><span className="mono">{time(v.lastRehearsedAt)}</span></td><td><span className="mono">{time(v.createdAt)}</span>{v.createdBy?<><br/>{v.createdBy.email}</>:null}{v.reason?<><br/>{v.reason}</>:null}</td><td>{canRestore?<Button variant="ghost" disabled={mutation.isPending||action!==null} onClick={()=>begin('restore',v.version)} aria-label={`Restore version ${v.version}`}>Restore</Button>:<span>Company admin required</span>}</td></tr>)}
        </tbody></table></div></Card></section>
      {action?<section className="seg"><Card><CardHeader title={action==='rotate'?'Confirm key rotation':`Restore version ${ui.version}`}/><form className="sheetb" onSubmit={submit} aria-busy={mutation.isPending}>
        <p id="key-action-impact">{action==='rotate'?'Rotation creates and verifies a new key before making it current. Every future token changes and joins against earlier results break. Previous keys remain retained.':'Restore replaces this version of the stored key with its verified escrow copy. The application checks that the copy matches the recorded key before writing it. Restoring a retained version does not make it current.'}</p>
        {action==='rotate'?<div className="fld"><label htmlFor="key-reason">Reason for rotation</label><input id="key-reason" required maxLength={500} value={ui.reason} disabled={mutation.isPending} onChange={e=>{ui.edit({reason:e.target.value});mutation.reset();}}/></div>:null}
        <div className="fld"><label htmlFor="key-confirmation">Type {project.name} to confirm</label><input ref={input} id="key-confirmation" autoComplete="off" required value={ui.confirmation} disabled={mutation.isPending} aria-describedby="key-action-impact" onChange={e=>ui.edit({confirmation:e.target.value})}/></div>
        <div className="filters"><Button type="submit" disabled={mutation.isPending||ui.confirmation!==project.name||(action==='rotate'?!ui.reason.trim():!canRestore)}>{mutation.isPending?'Working…':action==='rotate'?'Confirm rotation':'Confirm restore'}</Button><Button variant="ghost" disabled={mutation.isPending} onClick={()=>{ui.close();mutation.reset();}}>Cancel</Button></div>
      </form></Card></section>:null}
    </>}
    {mutation.isError?<div className="fld err" role="alert"><p className="err-msg">{mutation.error.message}</p></div>:null}
    {mutation.isSuccess?<p className="note" role="status" aria-label="Token key operation">{mutation.variables?.action==='rehearse'?(mutation.data.versions.some(v=>v.lastRehearsal==='failed'||v.lastRehearsal==='mismatch')?'Rehearsal finished with failures. Review the affected versions above.':'All retained key versions passed the rehearsal.'):mutation.variables?.action==='rotate'?`Rotation complete. Current version: ${mutation.data.currentVersion}.`:'The verified escrow copy was restored.'}</p>:null}
  </section>;
}
