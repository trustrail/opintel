import { memo, useMemo, useRef, useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button, EmptyState, ErrorState, LoadingState, Treatment } from '../../shared/ui/index.js';
import type { EntitlementNode as CatalogNode } from '../../shared/api/entitlement-read.js';
import type { AppError } from '../../shared/api/index.js';
import { useSources } from '../sources/data.js';
import { entitlementOptions,usePools,useBulk,useDefinition } from './data.js';
import { useProjects } from '../tenancy/data.js';
import { BulkEntitlementBody,BulkEntitlementError } from '../../shared/api/bulk-entitlements.js';
import { createEntitlementsState } from './state.js';

type Row = { key: string; depth: number; node: CatalogNode; position: number; size: number } |
  { key: string; depth: number; parent: string; message: string; action?: () => void; actionLabel?: string };
// The reference's .trow is 46px high. Window geometry is independent of catalogue size.
const rowHeight = 46; const windowRows = 24; const overscan = 2;
const TreatmentChip=memo(Treatment);
const windowHeight=()=>window.innerHeight;
function subscribeHeight(listener:()=>void){window.addEventListener('resize',listener);return ()=>window.removeEventListener('resize',listener);}
export type EntitlementsSearch={poolId?:string;sourceId?:string;undecided?:boolean};
export function EntitlementsScreen({projectId,search,onSearch}:{projectId:string;search:EntitlementsSearch;onSearch:(search:EntitlementsSearch)=>void}){
 const pools=usePools(projectId),sources=useSources(projectId),projects=useProjects();
 const pool=pools.data?.find(p=>p.id===search.poolId)??(!search.poolId?pools.data?.[0]:undefined);
 const editable=projects.data?.find(p=>p.id===projectId)?.role==='admin';
 return <section className="screen on"><h1>Entitlements</h1><p className="sub">Decide what this pool may see. Elements without a decision are undecided and absent from the agent's view.</p>
 {pools.isPending?<LoadingState/>:pools.isError?<ErrorState title="Pools could not be loaded" description={pools.error.message} retry={()=>{void pools.refetch();}}/>:!pools.data.length?<EmptyState icon="⊟" title="No pools yet" description="Create a pool and bind a source before deciding its entitlements."/>:<>
 <div className="filters"><span className="pick"><label htmlFor="entitlement-pool">Pool</label><select id="entitlement-pool" value={pool?.id??''} onChange={e=>onSearch({poolId:e.target.value})}>{!pool?<option value="">Choose a pool</option>:null}{pools.data.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></span>
 <span className="pick"><label htmlFor="entitlement-source">Source</label><select id="entitlement-source" value={search.sourceId??''} onChange={e=>onSearch({...search,poolId:pool?.id,sourceId:e.target.value||undefined})}><option value="">All bound sources</option>{sources.data?.filter(s=>pool?.sourceIds.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></span>
 <Button variant="ghost" aria-pressed={!!search.undecided} onClick={()=>onSearch({...search,poolId:pool?.id,undecided:!search.undecided})}>Show undecided only</Button></div>
 {pool?<PoolTree key={JSON.stringify([projectId,pool.id,search.sourceId,search.undecided])} projectId={projectId} poolId={pool.id} sourceId={search.sourceId} undecided={!!search.undecided} editable={editable}/>:<EmptyState icon="⊟" title="Pool not found" description="Choose an available pool."/>}</>}
 </section>;
}
function PoolTree({projectId,poolId,sourceId,undecided,editable}:{projectId:string;poolId:string;sourceId?:string;undecided:boolean;editable:boolean}){
  const store = useMemo(createEntitlementsState, [projectId]); const state = useStore(store, useShallow(s => ({ branches: s.branches, expanded: s.expanded, searchParent: s.searchParent,
    toggle: s.toggle, search: s.search, select: s.select, more: s.more })));
  const viewport = useRef<HTMLDivElement>(null);
  const sources = useSources(projectId);
  const branches = Object.values(state.branches).filter(branch => !branch.parent || state.expanded[branch.parent]);
  const requests = branches.flatMap(branch => branch.cursors.map(cursor => ({ parent: branch.parent, prefix: branch.prefix, cursor })));
  const queries = useQueries({ queries: requests.map(page => entitlementOptions(projectId,poolId,{...page,sourceId,undecided:undecided?'true':'false',limit:200})) });
  const root = queries[0];
  const labels = new Map<string, string>([['', 'All sources']]);
  for (const query of queries) for (const node of query.data?.nodes ?? []) if (node.label) labels.set(node.id, node.label);
  const rows: Row[] = [];
  function level(parent: string, depth: number) {
    const indices = requests.flatMap((request, index) => request.parent === parent ? [index] : []);
    const entries = indices.flatMap(index => queries[index]?.data?.nodes ?? []);
    const last = queries[indices.at(-1) ?? -1];
    entries.forEach((node, index) => {
      rows.push({ key: node.id, depth, node, position: index + 1, size: last?.data?.nextCursor ? -1 : entries.length });
      if (state.expanded[node.id] && node.kind !== 'element') level(node.id, depth + 1);
    });
    if (last?.isPending) rows.push({ key: parent + ':loading', parent, depth, message: 'Loading this branch…' });
    else if (last?.isError) rows.push({ key: parent + ':error', parent, depth, message: (last.error as unknown as AppError).message, action: () => { void last.refetch(); }, actionLabel: 'Try again' });
    else if (last?.data?.nextCursor) { const cursor = last.data.nextCursor; rows.push({ key: parent + ':more', parent, depth, message: 'More in this branch', action: () => state.more(parent, cursor), actionLabel: 'Load more' }); }
    else if (!entries.length) rows.push({ key: parent + ':empty', parent, depth, message: state.branches[parent]?.prefix ? 'No names match this prefix. Try a shorter prefix.' : 'No catalogue entries here. Introspect the source to discover its structure.' });
  }
  level('', 1);
  const bulk=useBulk(projectId,poolId);
  const prefix = state.branches[state.searchParent]?.prefix ?? '';
  return <>
    {sources.isError ? <ErrorState title="Source display names could not be loaded" description={sources.error.message} retry={() => { void sources.refetch(); }} /> : null}
    <div className="filters" style={{alignItems:'end'}}>
      <span className="pick"><label htmlFor="catalog-level">Search within</label><select id="catalog-level" value={state.searchParent} onChange={event => state.select(event.target.value)}>{branches.map(branch => <option key={branch.parent} value={branch.parent}>{labels.get(branch.parent) ?? branch.parent}</option>)}</select></span>
      <div className="fld" style={{marginBottom:0,maxWidth:'100%'}}><label htmlFor="catalog-prefix">Name prefix</label><input id="catalog-prefix" value={prefix} maxLength={63} onChange={event => { state.search(state.searchParent, event.target.value);store.getState().clearSelection(); if (viewport.current) viewport.current.scrollTop = 0; }} /></div>
    </div>
    {root?.isPending ? <LoadingState /> : root?.isError ? <ErrorState title="Catalogue could not be loaded" description={(root.error as unknown as AppError).message} retry={() => { void root.refetch(); }} /> : root?.data?.nodes.length === 0 ? <EmptyState icon="⊟" title={prefix ? 'No matching sources' : undecided?'No undecided elements':'No catalogue yet'} description={prefix ? 'Try a shorter source-name prefix.' : undecided?'Show all decisions to inspect the existing entitlements.':'Bind a source to this pool and introspect it. Every discovered element starts undecided.'} /> : <div className="card">
      <div className="card-h"><h2>Decisions</h2><span className="meta">Expand one level at a time</span></div>
      <SelectionTools store={store} ids={rows.flatMap(row=>'node' in row && row.node.kind==='element'?[row.node.id]:[])} editable={editable} disabled={bulk.isPending}/>
      <TreeWindow editable={editable} disabled={bulk.isPending} store={store} rows={rows} viewport={viewport} sourceNames={new Map(sources.data?.map(source => [source.id, source.name]))} />
    </div>}
    <DecisionBar store={store} projectId={projectId} poolId={poolId} editable={editable} bulk={bulk}/>
    <p className="note">Undecided is the absence of a decision. Withheld and undecided fields are omitted from the agent's view. Decisions cannot be reset to undecided.</p>
  </>;
}

// Only this window subscribes to scrolling. The query observers and flattened
// tree above update on structural changes, never on each animation frame.
function TreeWindow({store, rows, viewport, sourceNames,editable,disabled}: {
  editable:boolean;disabled:boolean;store: ReturnType<typeof createEntitlementsState>; rows: Row[];
  viewport: RefObject<HTMLDivElement | null>; sourceNames: ReadonlyMap<string, string>;
}) {
  const state = useStore(store);
  const start = Math.max(0, Math.min(Math.floor(state.scrollTop / rowHeight) - overscan, rows.length - 1));
  const height=useSyncExternalStore(subscribeHeight,windowHeight);
  // Derive the next viewport height, not the previous DOM height: expanding a
  // branch grows the viewport in this same render.
  const viewportRows=Math.min(windowRows,Math.ceil(Math.min(height*0.6,rows.length*rowHeight)/rowHeight));
  const visible = rows.slice(start, start + viewportRows + overscan * 2);
  function focus(index: number) {
    const row = rows[index]; if (!row || !viewport.current) return;
    viewport.current.scrollTop = index * rowHeight; state.scroll(viewport.current.scrollTop);
    requestAnimationFrame(() => document.getElementById(`entitlement-row-${index}`)?.focus());
  }
  function keyboard(event: KeyboardEvent, row: Row, index: number) {
    if (event.target !== event.currentTarget) return;
    if ('node' in row && row.node.kind==='element' && event.key===' ' && editable && !disabled){event.preventDefault();state.check([row.node.id],!state.selected.has(row.node.id));}
    if (event.key === 'ArrowDown') { event.preventDefault(); focus(Math.min(rows.length - 1, index + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); focus(Math.max(0, index - 1)); }
    if (event.key === 'Home') { event.preventDefault(); focus(0); }
    if (event.key === 'End') { event.preventDefault(); focus(rows.length - 1); }
    if ('node' in row && row.node.kind !== 'element' && ['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowRight' && state.expanded[row.node.id]) return;
      if (event.key === 'ArrowLeft' && !state.expanded[row.node.id]) return;
      state.toggle(row.node.id);
    }
  }
  return (
      <div ref={viewport} role="tree" aria-label="Entitlements" aria-multiselectable="true" tabIndex={0} style={{ height: `min(60vh, ${rows.length * rowHeight}px)`, maxHeight: rowHeight * windowRows, overflow: 'auto' }} onScroll={event => state.scroll(event.currentTarget.scrollTop)}>
        <div role="none" style={{ height: rows.length * rowHeight, position: 'relative', minWidth: 0 }}>
          {visible.map((row, offset) => { const index = start + offset; const node = 'node' in row ? row.node : null;
            const sourceName = node?.kind === 'source' ? sourceNames.get(node.id) : undefined;
            return <div key={offset} id={`entitlement-row-${index}`} role="treeitem" tabIndex={0} aria-selected={node?.kind==='element'?state.selected.has(node.id):undefined} aria-level={row.depth} aria-expanded={node && node.kind !== 'element' ? !!state.expanded[node.id] : undefined} aria-posinset={'position' in row ? row.position : undefined} aria-setsize={'size' in row ? row.size : undefined}
              className={row.depth <= 2 ? 'trow lvl0' : row.depth === 3 ? 'trow lvl1' : 'trow lvl2'} onKeyDown={event => keyboard(event, row, index)}
              style={{ position: 'absolute', top: index * rowHeight, height: rowHeight, boxSizing: 'border-box', width: '100%', gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              {node ? <><div className="tname">
                {node.kind==='element' && editable?<input type="checkbox" aria-label={`Select ${node.label??'unnameable element'}`} checked={state.selected.has(node.id)} disabled={disabled} onChange={e=>state.check([node.id],e.target.checked)}/>:null}
                {node.kind !== 'element' ? <button type="button" className="toolchip" aria-label={`${state.expanded[node.id] ? 'Collapse' : 'Expand'} ${node.label}`} onClick={() => state.toggle(node.id)}><span aria-hidden="true">{state.expanded[node.id] ? '▾' : '▸'}</span></button> : null}
                <span style={{display:'flex',flexDirection:'column',minWidth:0}}><span className="nm" title={node.label ?? 'Unnameable element'}>{node.label ?? 'Unnameable element'}</span>{sourceName && sourceName !== node.label ? <span className="type" title={sourceName} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sourceName}</span> : null}</span>
              </div><span className="tname" title={node.justification??undefined} style={{flexDirection:'column',alignItems:'end',gap:0,paddingLeft:0}}>{node.exposedType ? <span className="type">{node.exposedType}</span> : null}{node.kind==='element'?<TreatmentChip kind={node.treatment==='aggregate_only'?'aggregate':node.treatment??'undecided'} label={node.treatment===null?'Undecided':undefined}/>:<span className="type">{node.kind} · {node.childCount}</span>}</span></> : <><span className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={'message' in row ? row.message : ''}>{'message' in row ? row.message : ''}</span>{'action' in row && row.action ? <Button variant="ghost" onClick={row.action}>{row.actionLabel}</Button> : null}</>}
            </div>;
          })}
        </div>
      </div>
  );
}

function SelectionTools({store,ids,editable,disabled}:{store:ReturnType<typeof createEntitlementsState>;ids:string[];editable:boolean;disabled:boolean}){
 const selected=useStore(store,s=>s.selected);if(!editable||!ids.length)return null;
 return <div className="card-h"><label className="tname"><input type="checkbox" aria-label="Select loaded elements" disabled={disabled} checked={ids.every(id=>selected.has(id))} onChange={e=>store.getState().check(ids,e.target.checked)}/>Select loaded elements ({ids.length})</label><span className="meta">Collapsed and unloaded fields are not included</span></div>;
}
const narrowBulkBar=()=>window.matchMedia('(max-width: 820px)').matches;
function subscribeBulkWidth(listener:()=>void){const media=window.matchMedia('(max-width: 820px)');media.addEventListener('change',listener);return ()=>media.removeEventListener('change',listener);}
function DecisionBar({store,projectId,poolId,editable,bulk}:{store:ReturnType<typeof createEntitlementsState>;projectId:string;poolId:string;editable:boolean;bulk:ReturnType<typeof useBulk>}){
 const state=useStore(store,useShallow(s=>({selected:s.selected,treatment:s.treatment,maskKind:s.maskKind,justification:s.justification,requestKey:s.requestKey,showDDL:s.showDDL,form:s.form,clearSelection:s.clearSelection,ddl:s.ddl})));
 const narrow=useSyncExternalStore(subscribeBulkWidth,narrowBulkBar);
 const definition=useDefinition(projectId,poolId,state.showDDL&&editable);
 const errors=BulkEntitlementError.shape.error.shape.details.safeParse(bulk.error?.details);
 const body={projectId,elementIds:[...state.selected],treatment:state.treatment,maskKind:state.treatment==='masked'?state.maskKind:null,justification:state.justification};
 return <>
 {editable?<Button variant="ghost" aria-expanded={state.showDDL} onClick={state.ddl}>View DDL</Button>:null}
 {state.showDDL&&editable?<section className="card" aria-label="View DDL"><div className="card-h"><h2>Pool view definitions</h2></div>{definition.isPending?<LoadingState/>:definition.isError?<ErrorState title="View definitions could not be compiled" description={definition.error.message} retry={()=>{void definition.refetch();}}/>:<div className="card-b">{definition.data.views.length?definition.data.views.map(view=><pre className="code" key={`${view.catalog}.${view.schema}.${view.name}`} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{view.ddl}</pre>):<p>No entitled fields. No views are emitted.</p>}{definition.data.omitted.map(view=><p className="note" key={`${view.catalog}.${view.schema}.${view.name}`}>{view.catalog}.{view.schema}.{view.name}: omitted ({view.reason.replaceAll('_',' ')}).</p>)}</div>}</section>:null}
 {bulk.isSuccess?<p role="status">{bulk.data.count} entitlement decisions saved.</p>:null}
 {bulk.isError?<div role="alert"><p>{bulk.error.message}</p>{(errors.success?errors.data?.invalidElements:[])?.map(element=><p key={element.elementId}>{element.elementId}: {element.reasons.join('; ')}</p>)}</div>:null}
 {editable&&state.selected.size?<div className="bulkbar on" style={narrow?{position:'static'}:undefined} aria-label="Bulk decision"><span className="n"><b>{state.selected.size}</b> selected</span>
 <label htmlFor="bulk-treatment">Treatment</label><select id="bulk-treatment" disabled={bulk.isPending} value={state.treatment} onChange={e=>state.form({treatment:BulkEntitlementBody.shape.treatment.parse(e.target.value)})}><option value="clear">In the clear</option><option value="tokenized">Tokenized</option><option value="masked">Masked</option><option value="aggregate_only">Aggregate only</option><option value="withheld">Withheld</option></select>
 {state.treatment==='masked'?<><label htmlFor="bulk-mask">Mask kind</label><select id="bulk-mask" disabled={bulk.isPending} value={state.maskKind} onChange={e=>state.form({maskKind:BulkEntitlementBody.shape.maskKind.unwrap().parse(e.target.value)??'all'})}><option value="all">All</option><option value="last4">Last four</option><option value="email">Email</option><option value="year">Year</option></select></>:null}
 <div className="fld" style={{marginBottom:0,maxWidth:'100%'}}><label htmlFor="bulk-justification" style={{color:'var(--surface)'}}>Justification{state.treatment==='clear'?' (required)':''}</label><input id="bulk-justification" disabled={bulk.isPending} required={state.treatment==='clear'} value={state.justification} onChange={e=>state.form({justification:e.target.value})}/></div>
 <Button variant="go" disabled={bulk.isPending||!BulkEntitlementBody.safeParse(body).success} onClick={()=>bulk.mutate({body,key:state.requestKey},{onSuccess:()=>state.clearSelection()})}>{bulk.isPending?'Applying…':'Apply to selection'}</Button><Button variant="ghost" style={{color:'var(--surface)',borderColor:'var(--ink-2)'}} disabled={bulk.isPending} onClick={state.clearSelection}>Cancel selection</Button></div>:null}
 </>;
}
