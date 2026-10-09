import {ConsoleSelect,DecisionMarks,TreatmentIndicator} from '../../shared/ui/index.js';
import { DeclarationPanel, SchemaDeclarationPanel } from './declaration-panel.js';
import { useMemo, useRef, useSyncExternalStore, useLayoutEffect, type KeyboardEvent, type RefObject,type ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button, EmptyState, ErrorState, LoadingState } from '../../shared/ui/index.js';
import type { CatalogNode } from '../../shared/api/catalog.js';
import type { AppError } from '../../shared/api/index.js';
import { useSources } from '../sources/data.js';
import { catalogOptions } from './data.js';
import { createExplorerState } from './state.js';

type Row = { key: string; depth: number; node: CatalogNode; showSchema?:boolean; position: number; size: number } |
  { key:string;depth:number;panel:ReactNode } |
  { key: string; depth: number; parent: string; message: string; action?: () => void; disabled?: boolean; actionLabel?: string };
// The reference's .trow is 46px high. Window geometry is independent of catalogue size.
const rowHeight = 46; const narrowElementHeight = 76; const windowRows = 24; const overscan = 6;
const isNarrow = () => window.matchMedia('(max-width: 820px)').matches;
function subscribeNarrow(listener: () => void) {
  const media = window.matchMedia('(max-width: 820px)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function subscribeWide(listener:()=>void){const media=window.matchMedia('(min-width:1100px)');media.addEventListener('change',listener);return ()=>media.removeEventListener('change',listener);}
const isWide=()=>window.matchMedia('(min-width:1100px)').matches;
export function CatalogScreen({projectId,search={},onSearch=()=>undefined}:{projectId:string;search?:{sourceId?:string;elementId?:string;declarationSchema?:string};onSearch?:(search:{sourceId?:string;elementId?:string;declarationSchema?:string})=>void}){
 const store=useMemo(createExplorerState,[projectId]);
 const state=useStore(store,useShallow(s=>({branches:s.branches,expanded:s.expanded,searchParent:s.searchParent,sourceId:s.sourceId,filter:s.filter,toggle:s.toggle,search:s.search,select:s.select,more:s.more,chooseSource:s.chooseSource,setFilter:s.setFilter})));
 const viewport=useRef<HTMLDivElement>(null),sources=useSources(projectId),wide=useSyncExternalStore(subscribeWide,isWide,()=>true);
 const selected=state.sourceId||search.sourceId||sources.data?.[0]?.id||'',rootId='objects:'+selected;
 const rootBranch={parent:rootId,prefix:state.branches[rootId]?.prefix??'',cursors:state.branches[rootId]?.cursors??[undefined]};
 const branches=[rootBranch,...Object.values(state.branches).filter(branch=>branch.parent!==rootId&&state.expanded[branch.parent])];
 const requests=selected?branches.flatMap(branch=>branch.cursors.map(cursor=>({parent:branch.parent,prefix:branch.prefix,cursor,filter:state.filter}))):[];
 const queries=useQueries({queries:requests.map(page=>catalogOptions(projectId,page))}),root=queries[0];
 const labels=new Map<string,string>([[rootId,'Objects']]);for(const q of queries)for(const node of q.data?.nodes??[])if(node.label)labels.set(node.id,node.label);
 const panel=search.elementId?<div data-part="declaration-panel"><button className="toolchip" type="button" onClick={()=>onSearch({sourceId:selected})}>Close declarations</button><DeclarationPanel key={search.elementId} projectId={projectId} elementId={search.elementId} onSchema={id=>onSearch({...search,declarationSchema:id})}/>{search.declarationSchema?<SchemaDeclarationPanel projectId={projectId} schemaId={search.declarationSchema}/>:null}</div>:null;
 const rows:Row[]=[];let panelPlaced=false;
 function level(parent:string,depth:number){const indices=requests.flatMap((r,i)=>r.parent===parent?[i]:[]),entries=indices.flatMap(i=>queries[i]?.data?.nodes??[]),last=queries[indices.at(-1)??-1];
  entries.forEach((node,index)=>{rows.push({key:node.id,depth,node,position:index+1,size:last?.data?.nextCursor?-1:entries.length,showSchema:entries.filter(n=>n.kind==='object'&&n.label===node.label).length>1});if(!wide&&node.id===search.elementId&&panel){rows.push({key:'declaration-panel',depth:depth+1,panel});panelPlaced=true;}if(state.expanded[node.id]&&node.kind!=='element')level(node.id,depth+1);});
  if(last?.isFetching&&!last.data)rows.push({key:parent+':loading',parent,depth,message:'Loading this branch…',action:()=>undefined,actionLabel:'Loading…',disabled:true});
  else if(last?.isError)rows.push({key:parent+':error',parent,depth,message:(last.error as unknown as AppError).message,action:()=>{void last.refetch();},actionLabel:'Try again'});
  else if(last?.data?.nextCursor){const cursor=last.data.nextCursor;rows.push({key:parent+':more',parent,depth,message:'More in this branch',action:()=>state.more(parent,cursor),actionLabel:'Load more'});}
  else if(!entries.length)rows.push({key:parent+':empty',parent,depth,message:'No catalogue entries here. Introspect the source to discover its structure.'});
 }
 level(rootId,1);const searchParent=state.searchParent||rootId,prefix=state.branches[searchParent]?.prefix??'';
 return <section className="screen on" data-layout="explorer"><h1>Schema explorer</h1><p className="sub">Every object and element agents can address, with its type and decisions. Select an element to see or change its declarations.</p>
 <div className="filters" data-part="explorer-toolbar"><span className="pick"><label htmlFor="catalog-source">Source</label><ConsoleSelect id="catalog-source" value={selected} onChange={e=>{state.chooseSource(e.target.value);onSearch({sourceId:e.target.value});if(viewport.current)viewport.current.scrollTop=0;}}>{sources.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</ConsoleSelect></span><div className="segbtns" aria-label="Element filter">{(['all','undecided','declared'] as const).map(filter=><button key={filter} type="button" aria-pressed={state.filter===filter} onClick={()=>{state.setFilter(filter);if(viewport.current)viewport.current.scrollTop=0;}}>{filter==='all'?'All':filter==='undecided'?'Undecided':'Declared'}</button>)}</div><span className="pick"><label htmlFor="catalog-level">Search within</label><ConsoleSelect id="catalog-level" value={searchParent} onChange={e=>state.select(e.target.value)}>{branches.map(b=><option key={b.parent} value={b.parent}>{labels.get(b.parent)??'Objects'}</option>)}</ConsoleSelect></span><input className="inp" aria-label="Name prefix" placeholder="Filter by name…" value={prefix} maxLength={63} onChange={e=>{state.search(searchParent,e.target.value);if(viewport.current)viewport.current.scrollTop=0;}}/></div>
 {sources.isError?<ErrorState title="Source display names could not be loaded" description={sources.error.message} retry={()=>sources.refetch()}/>:sources.isPending||root?.isPending?<LoadingState/>:root?.isError?<ErrorState title="Catalogue could not be loaded" description={(root.error as unknown as AppError).message} retry={()=>root.refetch()}/>:!selected||root?.data?.nodes.length===0?<><EmptyState title="No catalogue yet" description="Connect a source and introspect it. Its objects will appear here."/>{panel}</>:<div data-part="explorer-split" data-panel={wide&&!!panel?'open':'closed'}><div className="card"><div className="card-h"><h2>Exposed namespace</h2><span className="meta">Decisions across all pools</span></div><TreeWindow store={store} rows={rows} viewport={viewport} onElement={elementId=>onSearch({sourceId:selected,elementId})}/>{!wide&&!panelPlaced?panel:null}</div>{wide?panel:null}</div>}
 <p className="note">Source aliases are assigned once. Unsupported types cannot be exposed; unnameable elements need a source-column rename or an explicit alias.</p></section>;
}

// Only this window subscribes to scrolling. The query observers and flattened
// tree above update on structural changes, never on each animation frame.
function TreeWindow({store, rows, viewport,onElement}: {
  onElement:(elementId:string)=>void; store: ReturnType<typeof createExplorerState>; rows: Row[];
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const state = useStore(store);
  const narrowScreen = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const narrow=narrowScreen||(state.width>0&&state.width<600);
  useLayoutEffect(()=>{const node=viewport.current;if(!node)return;const measure=()=>store.getState().setWidth(node.clientWidth);const observer=new ResizeObserver(measure);observer.observe(node);measure();return ()=>observer.disconnect();},[store,viewport]);
  const geometry = useMemo(() => {
    let total = 0;
    const positions = rows.map(row => {
      const height = 'panel' in row?state.panelHeight:'node' in row&&row.node.kind==='object'?(narrow?58:42):narrow && 'node' in row && row.node.kind === 'element' ? narrowElementHeight : rowHeight;
      const top = total; total += height;
      return {top, height};
    });
    return {positions, total};
  }, [rows, narrow,state.panelHeight]);
  let low = 0; let high = rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const position = geometry.positions[middle]!;
    if (position.top + position.height <= state.scrollTop) low = middle + 1;
    else high = middle;
  }
  const start = Math.max(0, Math.min(low - overscan, rows.length - 1));
  const visible = rows.slice(start, start + windowRows + overscan * 2);
  function focus(index: number) {
    const row = rows[index]; if (!row || !viewport.current) return;
    viewport.current.scrollTop = geometry.positions[index]!.top; state.scroll(viewport.current.scrollTop);
    requestAnimationFrame(() => document.getElementById(`catalog-row-${index}`)?.focus());
  }
  function keyboard(event: KeyboardEvent, row: Row, index: number) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); focus(Math.min(rows.length - 1, index + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); focus(Math.max(0, index - 1)); }
    if (event.key === 'Home') { event.preventDefault(); focus(0); }
    if (event.key === 'End') { event.preventDefault(); focus(rows.length - 1); }
    if ('node' in row && row.node.kind === 'element' && ['Enter',' '].includes(event.key)) { event.preventDefault(); onElement(row.node.id); }
    if ('node' in row && row.node.kind !== 'element' && ['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowRight' && state.expanded[row.node.id]) return;
      if (event.key === 'ArrowLeft' && !state.expanded[row.node.id]) return;
      state.toggle(row.node.id);
    }
  }
  return (
      <div ref={viewport} data-catalog-tree role="tree" data-mark-list="uniform" aria-label="Catalogue" tabIndex={0} style={{ height: `min(60vh, ${geometry.total}px)`, maxHeight: rowHeight * windowRows, overflow: 'auto',containerType:'inline-size',containerName:'catalogue' }} onScroll={event => state.scroll(event.currentTarget.scrollTop)}>
        <div role="none" style={{ height: geometry.total, position: 'relative', minWidth: 0 }}>
          {visible.map((row, offset) => { const index = start + offset; const node = 'node' in row ? row.node : null;
            if('panel' in row)return <div key={row.key} role="treeitem" data-row-kind="declaration" data-mark-row="true" aria-label="Element declarations" aria-level={row.depth} style={{position:'absolute',top:geometry.positions[index]!.top,width:'100%'}}><MeasuredPanel onHeight={state.setPanelHeight}>{row.panel}</MeasuredPanel></div>;
            return <div key={row.key} id={`catalog-row-${index}`} role="treeitem" data-mark-row="true" data-row-kind={node?.kind??'message'} tabIndex={0} aria-level={row.depth} aria-expanded={node && node.kind !== 'element' ? !!state.expanded[node.id] : undefined} aria-posinset={'position' in row ? row.position : undefined} aria-setsize={'size' in row ? row.size : undefined}
              className={node?.kind==='element'?'trow lvl1':'trow lvl0'} onKeyDown={event => keyboard(event, row, index)}
              style={{ position: 'absolute', top: geometry.positions[index]!.top, height: geometry.positions[index]!.height, boxSizing: 'border-box', width: '100%',  }}>
              {node ? <><div className="tname">{node.kind!=='element'?<button className="toolchip" type="button" aria-label={`${state.expanded[node.id]?'Collapse':'Expand'} ${node.label}`} onClick={()=>state.toggle(node.id)}><span aria-hidden="true">{state.expanded[node.id]?'▾':'▸'}</span></button>:null}<span data-column-name><span className="nm" title={node.qualifiedName??node.label??'Unnameable element'}>{node.label??'Unnameable element'}</span>{node.kind==='object'&&'showSchema' in row&&row.showSchema&&node.schemaName?<span className="meta">{node.schemaName}</span>:null}{node.kind==='element'?<span data-part="declaration-chips">{node.declarations?.tokenDomain?<span className="tr" title="Declared token domain">domain {node.declarations.tokenDomain}</span>:node.declarations?.isolated?<span className="tr" title="Derived from element identity">isolated</span>:null}{node.declarations?.sourceTimezone?<span className="tr" title={node.declarations.timezoneProvenance}>tz {node.declarations.sourceTimezone}</span>:null}</span>:null}</span></div>
              {node.kind==='element'?<><span data-column-type className="type">{node.exposedType??(node.state==='unsupported'?'Unsupported type':'Unnameable')}</span><span data-column-treatment>{node.decisions?.length===1?<TreatmentIndicator value={node.decisions[0]!.value}/>:node.state==='undecided'?<TreatmentIndicator value="undecided"/>:node.state==='mixed'?<><DecisionMarks decisions={node.decisions??[]}/><span>Mixed</span></>:<span>{node.state==='unsupported'?'Unsupported type':node.state==='unnameable'?'Unnameable':node.state}</span>}</span><button data-column-declarations className="toolchip" type="button" aria-label={`Declarations for ${node.label??'unnameable element'}`} onClick={()=>onElement(node.id)}>Declarations</button></>:<><DecisionMarks decisions={node.decisions??[]}/><span className="meta">{node.childCount} elements · {node.undecidedCount??0} undecided</span></>}</> : <><span className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={'message' in row ? row.message : ''}>{'message' in row ? row.message : ''}</span>{'action' in row && row.action ? <Button variant="ghost" disabled={row.disabled} onClick={row.action}>{row.actionLabel}</Button> : null}</>}
            </div>;
          })}
        </div>
      </div>
  );
}

function MeasuredPanel({children,onHeight}:{children:ReactNode;onHeight:(height:number)=>void}){const ref=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{const node=ref.current;if(!node)return;const measure=()=>onHeight(Math.ceil(node.getBoundingClientRect().height));const observer=new ResizeObserver(measure);observer.observe(node);measure();return ()=>observer.disconnect();},[onHeight]);return <div ref={ref}>{children}</div>;}
