import {Link} from '@tanstack/react-router';
import {useStore} from 'zustand';
import {useShallow} from 'zustand/react/shallow';
import {Button,WeightedActionBar,PickerChevron} from '../../shared/ui/index.js';
import {BulkEntitlementBody,BulkEntitlementError} from '../../shared/api/bulk-entitlements.js';
import {useBulk} from './data.js';
import {createEntitlementsState} from './state.js';
export function DecisionBar({store,projectId,editable,bulk,poolName='this pool',disabled=false}:{disabled?:boolean;poolName?:string;store:ReturnType<typeof createEntitlementsState>;projectId:string;editable:boolean;bulk:ReturnType<typeof useBulk>}){
 const state=useStore(store,useShallow(s=>({selected:s.selected,treatment:s.treatment,maskKind:s.maskKind,justification:s.justification,requestKey:s.requestKey,form:s.form,clearSelection:s.clearSelection})));
 const errors=BulkEntitlementError.shape.error.shape.details.safeParse(bulk.error?.details);
 const body={projectId,elementIds:[...state.selected],treatment:state.treatment,maskKind:state.treatment==='masked'?state.maskKind:null,justification:state.justification};
 return <>
 {bulk.isSuccess?<p role="status">{bulk.data.count} entitlement decisions saved.</p>:null}

 {editable&&state.selected.size?<WeightedActionBar count={<><b>{state.selected.size}</b> selected</>} consequence={<>Setting {state.selected.size===1?'this member':`these ${state.selected.size} members`} to {state.treatment.replaceAll('_',' ')} changes future access for every agent in {poolName}. Answers already given are unaffected.</>}>
 <span className="pick"><label htmlFor="bulk-treatment">Treatment</label><select id="bulk-treatment" disabled={bulk.isPending||disabled} value={state.treatment} onChange={e=>state.form({treatment:BulkEntitlementBody.shape.treatment.parse(e.target.value)})}><option value="clear">In the clear</option><option value="tokenized">Tokenized</option><option value="masked">Masked</option><option value="aggregate_only">Aggregate only</option><option value="withheld">Withheld</option></select><PickerChevron/></span>
 {state.treatment==='masked'?<span className="pick"><label htmlFor="bulk-mask">Mask kind</label><select id="bulk-mask" disabled={bulk.isPending||disabled} value={state.maskKind} onChange={e=>state.form({maskKind:BulkEntitlementBody.shape.maskKind.unwrap().parse(e.target.value)??'all'})}><option value="all">All</option><option value="last4">Last four</option><option value="email">Email</option><option value="year">Year</option></select><PickerChevron/></span>:null}
 <span data-part="justification"><label htmlFor="bulk-justification" style={{color:'var(--surface)'}}>Justification{state.treatment==='clear'?' (required)':''}</label><input className="inp" id="bulk-justification" disabled={bulk.isPending||disabled} required={state.treatment==='clear'} value={state.justification} onChange={e=>state.form({justification:e.target.value})}/></span>
 <Button variant="go" disabled={bulk.isPending||disabled||!BulkEntitlementBody.safeParse(body).success} onClick={()=>bulk.mutate({body,key:state.requestKey},{onSuccess:()=>state.clearSelection()})}>{bulk.isPending?'Applying…':'Apply to selection'}</Button><Button variant="ghost" style={{color:'var(--surface)',borderColor:'var(--ink-2)'}} disabled={bulk.isPending||disabled} onClick={state.clearSelection}>Cancel selection</Button> {bulk.isError?<div role="alert" style={{flexBasis:'100%'}}><p>{bulk.error.message}</p>{(errors.success?errors.data?.invalidElements:[])?.map(element=><p key={element.elementId}>{element.qualifiedName??'Unavailable element'}: {element.reasons.join('; ')} {element.declarationFields?.length?<Link style={{color:'var(--surface)',textDecoration:'underline'}} to="/projects/$projectId/$screen" params={{projectId,screen:'catalog'}} search={{elementId:element.elementId}}>Open declarations</Link>:null}</p>)}</div>:null}</WeightedActionBar>:null}
 </>;
}
