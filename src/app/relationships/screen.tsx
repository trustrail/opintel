import {Timestamp} from '../settings/preferences.js';
import {useState} from 'react';
import type {z} from 'zod';
import {useStore} from 'zustand';
import {Link} from '@tanstack/react-router';
import {Button,LoadingState,ErrorState,EmptyState,RelationshipBand,Mark,SegmentedFilters} from '../../shared/ui/index.js';
import {SuggestionAction,DomainOption,type Suggestion} from '../../shared/api/suggestions.js';
import {useProjects} from '../tenancy/data.js';
import {useSuggestions,useDomains,useAttempts,useDecision} from './data.js';
import {reviewForm,suggestionListState,domainMemberDisclosure} from './state.js';
export function SuggestionsScreen({projectId,filter={}}:{projectId:string;filter?:{elementId?:string;poolId?:string}}){
 const [listStore]=useState(suggestionListState),list=useStore(listStore);
 const query=useSuggestions(projectId,{...filter,view:list.view}),projects=useProjects(),admin=projects.data?.find(p=>p.id===projectId)?.role==='admin';
 return <section className="screen on" data-layout="suggestions"><h1>Suggested relationships</h1><p className="sub">An agent tried to join these columns and could not. Whether they identify the same thing is a judgement about your business, so it stays with you. No source values are read to produce a suggestion.</p>
 {(filter.elementId||filter.poolId)?<p className="note">Showing suggestions for the linked scope. <Link className="btn ghost" to="/projects/$projectId/$screen" params={{projectId,screen:'relationship-suggestions'}} search={{}}>Show all suggestions</Link></p>:null}
 <div className="filters"><SegmentedFilters label="Suggestion list" value={list.view} options={[{value:'open',label:'Open'},{value:'reviewed',label:'Reviewed'}]} onChange={list.show}/></div>
 {list.notice?<p className="note" role="status">{list.notice}</p>:null}
 {query.isPending?<LoadingState/>:query.isError?<ErrorState title="Suggestions could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:!query.data.items.length?<EmptyState title={list.view==='open'?'No open join suggestions':'No reviewed suggestions'} description={list.view==='open'?'Refused equality joins will appear here. Confirmed and rejected suggestions remain in Reviewed.':'Confirmed and rejected suggestions retain their decisions and assignment history here.'}/>:query.data.items.map(item=><Review key={item.id} item={item} projectId={projectId} projectName={query.data.projectName} admin={admin} onRecorded={list.recorded}/>)}
 </section>;
}
const treatmentName=(value:string|null)=>value===null?'Undecided':value==='clear'?'In the clear':value.replaceAll('_',' ').replace(/^./u,c=>c.toUpperCase());
function Column({column,label}:{column:Suggestion['left'];label:string}){
 const treatments=[...new Set(column.treatments.map(t=>t.treatment))],value=treatments[0]??null;
 const tokenized=treatments.includes('tokenized'),mixed=treatments.length>1;
 return <div data-mark-row="true" data-row-kind="element"><div data-part="column-label">{label}</div><div data-part="column-name" title={column.name}>
 {!mixed?<span title={treatmentName(value)}><Mark name={`treatment-${value==='aggregate_only'?'aggregate':value??'undecided'}`} size={17} label={treatmentName(value)}/></span>:null}
 <span>{column.address.column??'Unnameable element'}</span></div>
 <div data-part="column-address" title={column.name}>{column.address.object} · <span className="mono">{column.exposedType??'Unsupported type'}</span> · {mixed?'Mixed decisions':treatmentName(value)}</div>
 <div data-part="domain">{!tokenized?'Not tokenized — a domain does not change this decision.':column.domain.provenance==='element_identity'?<span title="Derived from element identity">Isolated — joins only this element</span>:<>Domain <b className="mono">{column.domain.declared}</b> · {column.domain.memberCount} {column.domain.memberCount===1?'member':'members'}</>}</div>
 {mixed?<p data-part="column-address">{column.treatments.map(t=>`${t.poolName}: ${treatmentName(t.treatment)}`).join(' · ')}</p>:null}
 </div>;
}
function Trend({item}:{item:Suggestion}){
 const peak=Math.max(1,...item.trend.map(d=>d.queries+d.explains));
 return <div><span>Last 7 days (UTC)</span><div data-part="attempt-trend" role="img" aria-label={item.trend.map(d=>`${d.day}: ${d.queries} query, ${d.explains} explain`).join('; ')}>{item.trend.map(d=><span key={d.day} title={`${d.day}: ${d.queries} query · ${d.explains} explain`}><i data-operation="query" style={{height:26*d.queries/peak}}/><i data-operation="explain" style={{height:26*d.explains/peak}}/></span>)}</div></div>;
}
function Review({item,projectId,projectName,admin,onRecorded}:{item:Suggestion;projectId:string;projectName:string;admin:boolean;onRecorded:(action:'confirm'|'reject'|'not_sure')=>void}){
 const [store]=useState(reviewForm),form=useStore(store),domains=useDomains(projectId),action=useDecision(projectId,item.id,onRecorded);
 const selected=domains.data?.find(d=>d.domain===form.domain),members=selected?.members??[];
 const draft=SuggestionAction.safeParse({action:'confirm',domain:form.domain,confirmation:form.confirmation,latestAttemptId:item.latestAttemptId,members:members.map(m=>({elementId:m.elementId,version:m.version}))});
 const canConfirm=admin&&!item.confirmationBlocked&&!domains.isPending&&!domains.isError&&draft.success&&form.confirmation===projectName&&(form.mode==='existing'?!!selected:!selected);
 const resolved=item.status==='confirm'||item.status==='reject',disabled=!admin||action.isPending,blocked=!!item.confirmationBlocked;
 const decide=(input:Parameters<typeof action.mutate>[0])=>action.mutate(input,{onError:()=>form.confirm('')});
 const targets=[item.left,item.right].flatMap(column=>column.active?column.treatments.filter(t=>t.treatment!=='tokenized').map(t=>({column,...t})):[]);
 const status=item.status==='not_sure'?'Not sure':item.status==='confirm'?'Confirmed':item.status==='reject'?'Rejected':'Awaiting review';
 const controls=<><Button type="button" variant="ghost" disabled={disabled} onClick={()=>decide({action:'not_sure',latestAttemptId:item.latestAttemptId})}>Not sure</Button><Button type="button" variant="ghost" disabled={disabled} onClick={()=>decide({action:'reject',latestAttemptId:item.latestAttemptId})}>Reject</Button></>;
 return <article className="card" data-layout="suggestion" aria-label={`${item.left.name} and ${item.right.name}`}>
 <RelationshipBand left={<Column column={item.left} label="This column"/>} right={<Column column={item.right} label="Against this one"/>}/>
 <div data-part="demand"><span data-part="attempt-count" className="mono">{item.queries+item.explains}</span><div style={{overflowWrap:'anywhere'}}><b>Join attempted</b> · {item.queries} query · {item.explains} explain<br/>By {item.agents.join(', ')} · Most recent <Timestamp value={item.latestAt}/></div><Trend item={item}/><button className="toolchip" type="button" aria-expanded={form.attemptsOpen} aria-controls={`attempts-${item.id}`} onClick={form.toggleAttempts}>Attempts and SQL</button></div>
 <div id={`attempts-${item.id}`} hidden={!form.attemptsOpen}>{form.attemptsOpen?<Attempts projectId={projectId} id={item.id}/>:null}</div>
 <div className="sheetb">
 {item.raisedAgain?<p className="note">A later attempt raised this deferred suggestion again.</p>:null}
 {!admin?<p className="note">Read-only. A project administrator reviews suggestions.</p>:null}
 {resolved?<p data-part="question-detail">{status}. The decision and assignment versions remain in its history.</p>:blocked?<><div className="effect" data-state="blocked"><b>{item.left.active&&item.right.active&&targets.length?'A domain cannot help here.':'This suggestion cannot be confirmed.'}</b><p>{item.confirmationBlocked}</p>{targets.map(t=><p key={`${t.column.id}-${t.poolId}`}><b>{t.column.address.object}.{t.column.address.column}</b> is {treatmentName(t.treatment).toLowerCase()} in {t.poolName}; it must be tokenized first. <Link className="btn ghost" aria-label={`Open entitlements for ${t.column.name} in ${t.poolName}`} to="/projects/$projectId/$screen" params={{projectId,screen:'entitlements'}} search={{poolId:t.poolId,elementId:t.column.id,sourceId:t.column.address.sourceId,decision:'all',layout:'name'}}>Open entitlements</Link></p>)}</div><div data-part="confirmation">{controls}</div></>:<form onSubmit={e=>{e.preventDefault();if(canConfirm&&draft.success)decide(draft.data);}}>
 <p data-part="question">Do these two columns identify the same thing?</p><p data-part="question-detail">Confirming puts both in one token domain, so compatible tokens match and an agent can join them. It does not reveal either value.</p>
 {domains.isPending?<LoadingState/>:domains.isError?<ErrorState title="Domains could not be loaded" description={domains.error.message} retry={()=>domains.refetch()}/>:<div className="scopepick" data-layout="paired" role="group" aria-label="Shared domain choice">
 {domains.data.map(d=><DomainCard key={d.domain} domain={d} itemId={item.id} selected={form.mode==='existing'&&form.domain===d.domain} disabled={disabled} choose={()=>form.selectExisting(d.domain)}/>)}
 <label className="opt" data-selected={form.mode==='new'} htmlFor={`choice-new-${item.id}`}><input type="radio" id={`choice-new-${item.id}`} name={`choice-${item.id}`} checked={form.mode==='new'} disabled={disabled} onChange={()=>form.choose('new')}/><div><b>Start a new domain</b><p>Only these two columns join this namespace. No other members are added.</p></div></label>
 </div>}
 {form.mode==='new'?<div className="fld"><label htmlFor={`domain-${item.id}`}>New shared domain</label><input className="inp" id={`domain-${item.id}`} value={form.domain} disabled={disabled} onChange={e=>form.edit(e.target.value)}/><p className="hint">Lowercase letters and digits. sentinel and the opintelisolated prefix are reserved.</p>{selected?<p className="note">This domain already exists. Choose its card to review its members.</p>:null}</div>:null}
 {(!!selected&&form.mode==='existing')||(form.mode==='new'&&!selected)?<section className="effect" data-state="consequence" aria-label="What this changes"><b>What this changes.</b><ul><li>Changing domains makes earlier tokens incompatible with tokens from future queries.</li><li>{form.mode==='new'?'Only these two columns join the new domain.':`Both columns join the ${members.length} existing ${members.length===1?'member':'members'}, wherever entitlements permit compatible token joins.`}</li><li>No stored data is rewritten. Past evidence keeps its key and domain assignment versions.</li></ul></section>:null}
 <div data-part="confirmation"><label htmlFor={`confirm-${item.id}`}>Type project name: <b>{projectName}</b></label><input className="inp" id={`confirm-${item.id}`} value={form.confirmation} disabled={disabled} onChange={e=>form.confirm(e.target.value)} autoComplete="off"/>{controls}<Button type="submit" disabled={!canConfirm||action.isPending}>{action.isPending&&action.variables?.action==='confirm'?'Confirming…':'Confirm'}</Button></div>
 </form>}
 {action.isError?<p className="note" role="alert">{action.error.message}</p>:null}
 </div><footer className="sheetf"><span data-part="review-state">Review state: <b>{status}</b></span><span>Raised by an attempted join.</span><button className="toolchip" type="button" aria-expanded={form.historyOpen} aria-controls={`history-${item.id}`} onClick={form.toggleHistory}>Decision and assignment history ({item.history.length})</button></footer>
 <div id={`history-${item.id}`} hidden={!form.historyOpen}>{form.historyOpen?<div className="sheetb">{item.history.length?item.history.map(h=><p key={h.id} style={{overflowWrap:'anywhere'}}>{h.action==='not_sure'?'Not sure':h.action==='confirm'?'Confirmed':'Rejected'} by {h.actorName} ({h.actorId}) at <Timestamp value={h.at}/>{h.domain?` · Shared domain: ${h.domain}`:''}. {h.assignments.map(a=>`${a.elementId}: assignment version ${a.version}`).join(', ')}</p>):<p>No decisions recorded.</p>}</div>:null}</div>
 </article>;
}
function Attempts({projectId,id}:{projectId:string;id:string}){const query=useAttempts(projectId,id);return query.isPending?<LoadingState/>:query.isError?<ErrorState title="Attempts could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:<div className="sheetb"><p className="sub">Agent ids are self-declared. These count attempts, not independent needs.</p>{query.data.map(a=><div className="joinbox" key={a.id}><p>{a.operation} · <Timestamp value={a.at}/> · {a.agentId}</p>{a.statement?<pre className="mono" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{a.statement}</pre>:<p>SQL hidden by Activity permissions or redaction policy.</p>}</div>)}</div>;}

function DomainCard({domain,itemId,selected,disabled,choose}:{domain:z.infer<typeof DomainOption>;itemId:string;selected:boolean;disabled:boolean;choose:()=>void}){
 const [store]=useState(domainMemberDisclosure),disclosure=useStore(store),choiceId=`choice-existing-${domain.domain}-${itemId}`,membersId=`members-${domain.domain}-${itemId}`;
 const member=(m:z.infer<typeof DomainOption>['members'][number])=><p className="mono" key={m.elementId} title={m.name} style={{overflowWrap:'anywhere'}}>{m.objectLabel}.{m.columnName??'[unnameable element]'}</p>;
 return <div className="opt" data-selected={selected}><input type="radio" id={choiceId} name={`choice-${itemId}`} checked={selected} disabled={disabled} onChange={choose}/><div><label htmlFor={choiceId}><b>Join the <span className="mono">{domain.domain}</span> domain</b><p>{domain.members.length} existing {domain.members.length===1?'member':'members'}. Both columns join this namespace.</p>{domain.members.slice(0,4).map(member)}</label>
 {domain.members.length>4?<><button className="toolchip" type="button" aria-expanded={disclosure.open} aria-controls={membersId} onClick={disclosure.toggle}>{disclosure.open?'Show fewer':`+${domain.members.length-4} more`}</button><div id={membersId} hidden={!disclosure.open}>{domain.members.slice(4).map(member)}</div></>:null}</div></div>;
}
