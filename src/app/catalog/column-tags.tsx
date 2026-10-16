import {useId,useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {readColumnTags,saveColumnTags} from '../../shared/api/column-tags.js';
import {Button,ErrorState,LoadingState} from '../../shared/ui/index.js';
import {elementKeys} from './data.js';
type TagDraft={open:boolean;domain:string;tag:string};
const newDraft=(open:boolean)=>createStore<TagDraft>(()=>({open,domain:'',tag:''}));
const prototypeTagDrafts=new Map<string,ReturnType<typeof newDraft>>();
export const hasPrototypeTagDrafts=()=>[...prototypeTagDrafts.values()].some(store=>{const s=store.getState();return !!(s.domain||s.tag);});
export const clearPrototypeTagDrafts=()=>prototypeTagDrafts.clear();
export function ColumnTagsEditor({projectId,elementId,initialOpen=false}:{projectId:string;elementId:string;initialOpen?:boolean}){
 const id=useId(),cache=useQueryClient(),store=useMemo(()=>{if(!initialOpen)return newDraft(false);const key=projectId+elementId;let cached=prototypeTagDrafts.get(key);if(!cached){cached=newDraft(true);prototypeTagDrafts.set(key,cached);}return cached;},[elementId]),state=useStore(store);
 const key=elementKeys.tags(projectId,elementId);
 const query=useQuery({queryKey:key,enabled:state.open,queryFn:async()=>{const r=await readColumnTags(projectId,elementId);if(!r.ok)throw r.error;return r.value;}});
 const save=useMutation({mutationFn:async()=>{const r=await saveColumnTags(elementId,{projectId,tags:{...query.data?.tags,[state.domain]:state.tag}});if(!r.ok)throw r.error;return r.value;},onSuccess:async()=>{store.setState({domain:'',tag:''});await cache.invalidateQueries({queryKey:key});}});
 return <section className="seg"><button type="button" className="toolchip" aria-expanded={state.open} aria-controls={id} onClick={()=>store.setState({open:!state.open})}>Scope tags</button><div id={id} hidden={!state.open}>{state.open?<>{query.isPending?<LoadingState/>:query.isError?<ErrorState title="Scope tags could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>:<><p className="note">Catalogue bindings for future tag rules. Tags do not change row access today. One tag per domain.</p>{Object.entries(query.data.tags).map(([domain,tag])=><p key={domain}>{domain}: {tag}</p>)}<div className="fld"><label htmlFor={id+'domain'}>Tag domain</label><input id={id+'domain'} value={state.domain} onChange={e=>store.setState({domain:e.target.value})}/></div><div className="fld"><label htmlFor={id+'tag'}>Tag</label><input id={id+'tag'} value={state.tag} onChange={e=>store.setState({tag:e.target.value})}/></div>{query.data.suggestions.length?<div className="filters" aria-label="Vocabulary suggestions">{query.data.suggestions.map(term=><Button key={term} variant="ghost" onClick={()=>store.setState({tag:term})}>{term}</Button>)}</div>:null}<Button variant="ghost" disabled={!state.domain||!state.tag||save.isPending} onClick={()=>save.mutate()}>Save tag binding</Button>{save.isError?<p role="alert">{save.error.message}</p>:null}{save.isSuccess?<p role="status">Tag binding saved.</p>:null}</>}</>:null}</div></section>;
}
