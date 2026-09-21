import { useMemo, useRef, type KeyboardEvent, type RefObject } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Link } from '@tanstack/react-router';
import { Button, EmptyState, ErrorState, LoadingState } from '../../shared/ui/index.js';
import type { CatalogNode } from '../../shared/api/catalog.js';
import type { AppError } from '../../shared/api/index.js';
import { useSources } from '../sources/data.js';
import { catalogOptions } from './data.js';
import { createExplorerState } from './state.js';

type Row = { key: string; depth: number; node: CatalogNode; position: number; size: number } |
  { key: string; depth: number; parent: string; message: string; action?: () => void; actionLabel?: string };
// The reference's .trow is 46px high. Window geometry is independent of catalogue size.
const rowHeight = 46; const windowRows = 24; const overscan = 6;
export function CatalogScreen({ projectId }: { projectId: string }) {
  const store = useMemo(createExplorerState, [projectId]); const state = useStore(store, useShallow(s => ({ branches: s.branches, expanded: s.expanded, searchParent: s.searchParent,
    toggle: s.toggle, search: s.search, select: s.select, more: s.more })));
  const viewport = useRef<HTMLDivElement>(null);
  const sources = useSources(projectId);
  const branches = Object.values(state.branches).filter(branch => !branch.parent || state.expanded[branch.parent]);
  const requests = branches.flatMap(branch => branch.cursors.map(cursor => ({ parent: branch.parent, prefix: branch.prefix, cursor })));
  const queries = useQueries({ queries: requests.map(page => catalogOptions(projectId, page)) });
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
  const prefix = state.branches[state.searchParent]?.prefix ?? '';
  return <section className="screen on"><h1>Schema explorer</h1><p className="sub">The DuckDB names and types agents address, with each element's decision state. Undecided elements are visible here and omitted from the agent's describe response.</p>
    {sources.isError ? <ErrorState title="Source display names could not be loaded" description={sources.error.message} retry={() => { void sources.refetch(); }} /> : null}
    <div className="filters" style={{alignItems:'end'}}><Link className="btn ghost" to="/projects/$projectId/$screen" params={{ projectId, screen: 'data-sources' }}>Data sources</Link>
      <span className="pick"><label htmlFor="catalog-level">Search within</label><select id="catalog-level" value={state.searchParent} onChange={event => state.select(event.target.value)}>{branches.map(branch => <option key={branch.parent} value={branch.parent}>{labels.get(branch.parent) ?? branch.parent}</option>)}</select></span>
      <div className="fld" style={{marginBottom:0,maxWidth:'100%'}}><label htmlFor="catalog-prefix">Name prefix</label><input id="catalog-prefix" value={prefix} maxLength={63} onChange={event => { state.search(state.searchParent, event.target.value); if (viewport.current) viewport.current.scrollTop = 0; }} /></div>
    </div>
    {root?.isPending ? <LoadingState /> : root?.isError ? <ErrorState title="Catalogue could not be loaded" description={(root.error as unknown as AppError).message} retry={() => { void root.refetch(); }} /> : root?.data?.nodes.length === 0 ? <EmptyState icon="⊟" title={prefix ? 'No matching sources' : 'No catalogue yet'} description={prefix ? 'Try a shorter source-name prefix.' : 'Connect a source and introspect it. Its schema will appear here, with every supported element undecided.'} /> : <div className="card">
      <div className="card-h"><h2>Exposed namespace</h2><span className="meta">Expand one level at a time</span></div>
      <TreeWindow store={store} rows={rows} viewport={viewport} sourceNames={new Map(sources.data?.map(source => [source.id, source.name]))} />
    </div>}
    <p className="note">Source aliases are assigned once. Renaming the display name does not change the namespace. Unsupported types cannot be exposed; unnameable elements need a source-column rename or an explicit alias.</p>
  </section>;
}

// Only this window subscribes to scrolling. The query observers and flattened
// tree above update on structural changes, never on each animation frame.
function TreeWindow({store, rows, viewport, sourceNames}: {
  store: ReturnType<typeof createExplorerState>; rows: Row[];
  viewport: RefObject<HTMLDivElement | null>; sourceNames: ReadonlyMap<string, string>;
}) {
  const state = useStore(store);
  const start = Math.max(0, Math.min(Math.floor(state.scrollTop / rowHeight) - overscan, rows.length - 1));
  const visible = rows.slice(start, start + windowRows + overscan * 2);
  function focus(index: number) {
    const row = rows[index]; if (!row || !viewport.current) return;
    viewport.current.scrollTop = index * rowHeight; state.scroll(viewport.current.scrollTop);
    requestAnimationFrame(() => document.getElementById(`catalog-row-${index}`)?.focus());
  }
  function keyboard(event: KeyboardEvent, row: Row, index: number) {
    if (event.target !== event.currentTarget) return;
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
      <div ref={viewport} role="tree" aria-label="Catalogue" tabIndex={0} style={{ height: `min(60vh, ${rows.length * rowHeight}px)`, maxHeight: rowHeight * windowRows, overflow: 'auto' }} onScroll={event => state.scroll(event.currentTarget.scrollTop)}>
        <div role="none" style={{ height: rows.length * rowHeight, position: 'relative', minWidth: 0 }}>
          {visible.map((row, offset) => { const index = start + offset; const node = 'node' in row ? row.node : null;
            const sourceName = node?.kind === 'source' ? sourceNames.get(node.id) : undefined;
            return <div key={row.key} id={`catalog-row-${index}`} role="treeitem" tabIndex={0} aria-level={row.depth} aria-expanded={node && node.kind !== 'element' ? !!state.expanded[node.id] : undefined} aria-posinset={'position' in row ? row.position : undefined} aria-setsize={'size' in row ? row.size : undefined}
              className={row.depth <= 2 ? 'trow lvl0' : row.depth === 3 ? 'trow lvl1' : 'trow lvl2'} onKeyDown={event => keyboard(event, row, index)}
              style={{ position: 'absolute', top: index * rowHeight, height: rowHeight, boxSizing: 'border-box', width: '100%', gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              {node ? <><div className="tname">
                {node.kind !== 'element' ? <button type="button" className="toolchip" aria-label={`${state.expanded[node.id] ? 'Collapse' : 'Expand'} ${node.label}`} onClick={() => state.toggle(node.id)}><span aria-hidden="true">{state.expanded[node.id] ? '▾' : '▸'}</span></button> : null}
                <span style={{display:'flex',flexDirection:'column',minWidth:0}}><span className="nm" title={node.label ?? 'Unnameable element'}>{node.label ?? 'Unnameable element'}</span>{sourceName && sourceName !== node.label ? <span className="type" title={sourceName} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sourceName}</span> : null}</span>
              </div><span className="tname" style={{flexDirection:'column',alignItems:'end',gap:0,paddingLeft:0}}>{node.duckdbType ? <span className="type">{node.duckdbType}</span> : null}<span className={node.state === 'undecided' ? 'tr wait' : node.state ? 'tr held' : 'type'}>{node.state === 'unsupported' ? 'Unsupported type' : node.state === 'unnameable' ? 'Unnameable' : node.state === 'undecided' ? 'Undecided' : node.state ?? `${node.kind} · ${node.childCount}`}</span></span></> : <><span className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={'message' in row ? row.message : ''}>{'message' in row ? row.message : ''}</span>{'action' in row && row.action ? <Button variant="ghost" onClick={row.action}>{row.actionLabel}</Button> : null}</>}
            </div>;
          })}
        </div>
      </div>
  );
}
