import {Link} from '@tanstack/react-router';
import {useMemo,useCallback,useRef,useSyncExternalStore,type KeyboardEvent,type RefObject} from 'react';
import {useQueries} from '@tanstack/react-query';
import {useStore} from 'zustand';
import {useShallow} from 'zustand/react/shallow';
import {Button,EmptyState,ErrorState,LoadingState} from '../../shared/ui/index.js';
import type {EntitlementNode as CatalogNode} from '../../shared/api/entitlement-read.js';
import type {AppError} from '../../shared/api/index.js';
import {useSources} from '../sources/data.js';
import {entitlementOptions,useBulk} from './data.js';
import {createEntitlementsState} from './state.js';
import {DecisionBar} from './decision-bar.js';
import {TreatmentIndicator} from './treatment.js';
type Row = { key: string; depth: number; node: CatalogNode; position: number; size: number } |
  { key: string; depth: number; parent: string; message: string; action?: () => void; disabled?: boolean; actionLabel?: string };
// Reviewed Entitlements geometry: 38px members, 42px branches, 76px narrow members.
const rowHeight = 38; const windowRows = 24; const overscan = 2;

const windowHeight=()=>window.innerHeight;
function subscribeHeight(listener:()=>void){window.addEventListener('resize',listener);return ()=>window.removeEventListener('resize',listener);}
export function PoolTree({projectId,poolId,sourceId,undecided,decided=false,editable,externalStore,externalBusy=false,elementPrefix='',poolName='this pool'}:{externalBusy?:boolean;elementPrefix?:string;poolName?:string;externalStore?:ReturnType<typeof createEntitlementsState>;projectId:string;poolId:string;sourceId?:string;undecided:boolean;decided?:boolean;editable:boolean}){
  const localStore = useMemo(createEntitlementsState, [projectId]); const store=externalStore??localStore; const state = useStore(store, useShallow(s => ({ branches: s.branches, expanded: s.expanded, searchParent: s.searchParent,
    toggle: s.toggle, search: s.search, select: s.select, more: s.more })));
  const viewport = useRef<HTMLDivElement>(null);
  const sources = useSources(projectId);
  const branches = Object.values(state.branches).filter(branch => !branch.parent || state.expanded[branch.parent]);
  const requests = branches.flatMap(branch => branch.cursors.map(cursor => ({ parent: branch.parent, prefix: branch.prefix, cursor })));
  const queries = useQueries({ queries: requests.map(page => entitlementOptions(projectId,poolId,{...page,sourceId,undecided:undecided?'true':'false',decided:decided?'true':'false',elementPrefix,limit:200})) });
  const root = queries[0];
  const rows: Row[] = [];
  function level(parent: string, depth: number) {
    const indices = requests.flatMap((request, index) => request.parent === parent ? [index] : []);
    const entries = indices.flatMap(index => queries[index]?.data?.nodes ?? []);
    const last = queries[indices.at(-1) ?? -1];
    entries.forEach((node, index) => {
      rows.push({ key: node.id, depth, node, position: index + 1, size: last?.data?.nextCursor ? -1 : entries.length });
      if (state.expanded[node.id] && node.kind !== 'element') level(node.id, depth + 1);
    });
    if (last?.isFetching) rows.push({ key: parent + ':loading', parent, depth, message: 'Loading this branch…', action:()=>undefined, actionLabel:'Loading…', disabled:true });
    else if (last?.isError) rows.push({ key: parent + ':error', parent, depth, message: (last.error as unknown as AppError).message, action: () => { void last.refetch(); }, actionLabel: 'Try again' });
    else if (last?.data?.nextCursor) { const cursor = last.data.nextCursor; rows.push({ key: parent + ':more', parent, depth, message: 'More in this branch', action: () => state.more(parent, cursor), actionLabel: 'Load more' }); }
    else if (!entries.length) rows.push({ key: parent + ':empty', parent, depth, message: state.branches[parent]?.prefix ? 'No names match this prefix. Try a shorter prefix.' : 'No catalogue entries here. Introspect the source to discover its structure.' });
  }
  level('', 1);
  const bulk=useBulk(projectId,poolId);
  return <>
    {sources.isError ? <ErrorState title="Sources could not be loaded" description={sources.error.message} retry={()=>sources.refetch()} /> : null}
    {root?.isPending ? <LoadingState /> : root?.isError ? <ErrorState title="Catalogue could not be loaded" description={(root.error as unknown as AppError).message} retry={()=>root.refetch()} /> : root?.data?.nodes.length === 0 ? <EmptyState title={elementPrefix ? 'No matching elements' : undecided?'No undecided elements':decided?'No decided elements':'No catalogue yet'} description={elementPrefix ? 'Try a shorter column-name prefix.' : undecided?'Show all decisions to inspect the existing entitlements.':'Bind a source to this pool and introspect it. Every discovered element starts undecided.'} /> : <div className="card">
      
      <SelectionTools store={store} ids={rows.flatMap(row=>'node' in row && row.node.kind==='element'&&row.node.exposedType!==null?[row.node.id]:[])} editable={editable} disabled={bulk.isPending||externalBusy}/>
      <TreeWindow editable={editable} disabled={bulk.isPending||externalBusy} store={store} rows={rows} viewport={viewport} projectId={projectId} />
    </div>}
    {rows.some(row=>'node' in row && /^money(?:\[\])*$/iu.test(row.node.sourceType??''))?<p className="note">Money columns use DECIMAL(38,9). Their fractional digits depend on the source server’s lc_monetary. Different source settings can interpret the same stored amount differently; verify the source’s monetary locale before deciding access. Opintel converts through numeric and does not correct locale differences.</p>:null}
    <DecisionBar store={store} projectId={projectId} editable={editable} bulk={bulk} disabled={externalBusy} poolName={poolName}/>
  </>;
}

// Only this window subscribes to scrolling. The query observers and flattened
// tree above update on structural changes, never on each animation frame.
function TreeWindow({store, rows, viewport,editable,disabled,projectId}: {
  projectId:string;editable:boolean;disabled:boolean;store: ReturnType<typeof createEntitlementsState>; rows: Row[];
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const state = useStore(store);
  const subscribeWidth=useCallback((listener:()=>void)=>{const node=viewport.current;if(!node)return ()=>{};const observer=new ResizeObserver(listener);observer.observe(node);return ()=>observer.disconnect();},[viewport]);
  const widthSnapshot=useCallback(()=>(viewport.current?.clientWidth??window.innerWidth)<=820,[viewport]);
  const narrow=useSyncExternalStore(subscribeWidth,widthSnapshot,()=>false);
 const geometry=useMemo(()=>{let total=0;const positions=rows.map(row=>{const height='node' in row&&row.node.kind==='element'?(narrow?76:rowHeight):42;const top=total;total+=height;return {top,height};});return {positions,total};},[rows,narrow]);
 let low=0,high=rows.length;while(low<high){const middle=Math.floor((low+high)/2),position=geometry.positions[middle]!;if(position.top+position.height<=state.scrollTop)low=middle+1;else high=middle;}
 const start=Math.max(0,low-overscan);
  const height=useSyncExternalStore(subscribeHeight,windowHeight);
  // Derive the next viewport height, not the previous DOM height: expanding a
  // branch grows the viewport in this same render.
  const viewportRows=Math.min(windowRows,Math.ceil(Math.min(height*0.6,geometry.total)/rowHeight));
  const visible = rows.slice(start, start + viewportRows + overscan * 2);
  function focus(index: number) {
    const row = rows[index]; if (!row || !viewport.current) return;
    viewport.current.scrollTop = geometry.positions[index]!.top; state.scroll(viewport.current.scrollTop);
    requestAnimationFrame(() => document.getElementById(`entitlement-row-${index}`)?.focus());
  }
  function keyboard(event: KeyboardEvent, row: Row, index: number) {
    if (event.target !== event.currentTarget) return;
    if ('node' in row && row.node.kind==='element' && event.key===' ' && row.node.exposedType!==null && editable && !disabled){event.preventDefault();state.check([row.node.id],!state.selected.has(row.node.id));}
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
      <div ref={viewport} data-catalog-tree role="tree" data-mark-list="uniform" aria-label="Entitlements" aria-multiselectable="true" tabIndex={0} style={{ height: `min(60vh, ${geometry.total}px)`, maxHeight: rowHeight * windowRows, overflow: 'auto' }} onScroll={event => state.scroll(event.currentTarget.scrollTop)}>
        <div role="none" style={{ height: geometry.total, position: 'relative', minWidth: 0 }}>
          {visible.map((row, offset) => { const index = start + offset; const node = 'node' in row ? row.node : null;
            return <div key={offset} id={`entitlement-row-${index}`} role="treeitem" data-mark-row="true" data-row-kind={node?.kind??'message'} tabIndex={0} aria-selected={node?.kind==='element'?state.selected.has(node.id):undefined} aria-level={row.depth} aria-expanded={node && node.kind !== 'element' ? !!state.expanded[node.id] : undefined} aria-posinset={'position' in row ? row.position : undefined} aria-setsize={'size' in row ? row.size : undefined}
              className="trow" data-row={node?.kind==='element'?'entitlement-member':'entitlement-branch'} data-depth={row.depth} data-selected={node?.kind==='element'&&state.selected.has(node.id)} onKeyDown={event => keyboard(event, row, index)}
              style={{ position: 'absolute', top: geometry.positions[index]!.top, height: geometry.positions[index]!.height, boxSizing: 'border-box', width: '100%' }}>
              {node ? <>
                <span data-part="selection">{node.kind==='element' && editable?<input type="checkbox" aria-label={`Select ${node.label??'unnameable element'}`} checked={state.selected.has(node.id)} disabled={disabled||node.exposedType===null} onChange={e=>state.check([node.id],e.target.checked)}/>:null}</span>
                <div data-part="identity"><b title={node.label??'Unnameable element'}>{node.label??'Unnameable element'}</b>{node.kind!=='element'?<span className="meta">{node.childCount} {node.kind==='object'?'members':node.kind==='schema'?'tables':'schemas'}</span>:null}</div>
                <span data-part="type" className="type">{node.kind==='element'?(node.exposedType??(node.unsupportedReason==='explicitly_excluded'?'Explicitly excluded':'Unmapped type')):node.kind}</span>
                <span data-part="treatments">{node.kind==='element'?<TreatmentIndicator value={node.treatment??'undecided'}/>:null}</span>
                {node.kind==='element'?<Link data-part="declarations" className="btn ghost" to="/projects/$projectId/$screen" params={{projectId,screen:'catalog'}} search={{elementId:node.id}} aria-label={`Declarations for ${node.label??'unnameable element'}`}>Declarations</Link>:<button type="button" className="btn ghost" aria-label={`${state.expanded[node.id]?'Collapse':'Expand'} ${node.label}`} onClick={()=>state.toggle(node.id)}><span aria-hidden="true">{state.expanded[node.id]?'▾':'▸'}</span></button>}
              </> : <><span className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={'message' in row ? row.message : ''}>{'message' in row ? row.message : ''}</span>{'action' in row && row.action ? <Button variant="ghost" disabled={row.disabled} onClick={row.action}>{row.actionLabel}</Button> : null}</>}
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
