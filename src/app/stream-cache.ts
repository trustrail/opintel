import {observationKeys} from './observations/keys.js';
import {projectKeys} from './tenancy/data.js';
import {agentKeys,poolKeys} from './pools/keys.js';
import type { QueryClient, QueryKey, InfiniteData } from '@tanstack/react-query';
import { streamEventSchema } from '../shared/api/stream.js';
import type { RunView } from '../shared/api/introspection.js';
import { active, introspectionKeys } from './introspection/data.js';
import { sourceKeys } from './sources/data.js';
import { elementKeys } from './catalog/data.js';
import { filingKeys } from './filings/data.js';

export function projectStreamCache(cache: QueryClient, project: string) {
 let sequence = -1;
 let timer: ReturnType<typeof setTimeout> | undefined;
 let disposed = false;
 const pending = new Map<string, QueryKey>();
 const invalidate = (key: QueryKey) => {
  const covers = (prefix: QueryKey, full: QueryKey) => prefix.length <= full.length && prefix.every((part, i) => JSON.stringify(part) === JSON.stringify(full[i]));
  if ([...pending.values()].some(existing => covers(existing, key))) return;
  for (const [id, existing] of pending) if (covers(key, existing)) pending.delete(id);
  pending.set(JSON.stringify(key), key);
  timer ??= setTimeout(() => {
   timer = undefined;
   const keys = [...pending.values()]; pending.clear();
   for (const queryKey of keys) void cache.invalidateQueries({ queryKey });
  }, 50);
 };
 const families: Record<string, () => void> = {
  introspection: () => { invalidate(introspectionKeys.all(project)); invalidate(observationKeys.all(project)); },
  catalogElement: () => {invalidate(elementKeys.all(project));invalidate(sourceKeys.lists(project));},
  dataSource: () => { invalidate(observationKeys.all(project)); invalidate(sourceKeys.typeObservations(project)); invalidate(sourceKeys.lists(project)); invalidate(sourceKeys.details(project)); },
  filing: () => { invalidate(observationKeys.all(project)); invalidate(filingKeys.list(project)); },
  agentPresence: () => { invalidate(agentKeys.presence(project)); invalidate(poolKeys.lists(project)); invalidate(poolKeys.details(project)); },
 };
 return {
  receive(raw: unknown) {
   if (disposed) return;
   const parsed = streamEventSchema.safeParse(raw);
   if (!parsed.success) return;
   const event = parsed.data;
   if (event.type === 'snapshot') { invalidate(projectKeys.stats(project)); sequence = event.sequence; for (const family of event.invalidate) families[family]?.(); return; }
   if (event.sequence <= sequence) return;
   sequence = event.sequence;
   invalidate(projectKeys.stats(project));
   if (event.type === 'introspection.progress') {
    const update = (run: RunView): RunView => run.id === event.runId && active(run.state) ? { ...run, state: event.state, progress: { objects: event.objects, total: event.total } } : run;
    cache.setQueryData<RunView>(introspectionKeys.detail(project, event.runId), run => run ? update(run) : undefined);
    cache.setQueriesData<InfiniteData<{ items: RunView[]; nextCursor: string | null }>>({ queryKey: introspectionKeys.lists(project) }, data => data ? { ...data, pages: data.pages.map(page => ({ ...page, items: page.items.map(update) })) } : undefined);
   } else if (event.type === 'introspection.finished') {
    invalidate(observationKeys.all(project)); invalidate(sourceKeys.typeObservations(project)); invalidate(sourceKeys.lists(project));
    invalidate(introspectionKeys.detail(project, event.runId)); invalidate(introspectionKeys.lists(project));
   } else if (event.type === 'catalog.changed') {invalidate(elementKeys.all(project));invalidate(sourceKeys.lists(project));}
   else if (event.type === 'source.changed') { invalidate(observationKeys.all(project)); invalidate(sourceKeys.typeObservations(project)); invalidate(introspectionKeys.lists(project)); invalidate(sourceKeys.lists(project)); invalidate(sourceKeys.detail(project, event.sourceId)); }
   else if (event.type === 'agent.presence') { invalidate(agentKeys.pool(project,event.poolId)); invalidate(poolKeys.lists(project)); invalidate(poolKeys.detail(project,event.poolId)); }
   else if (event.type === 'filing.arrived') { invalidate(observationKeys.all(project)); invalidate(filingKeys.list(project)); invalidate(sourceKeys.lists(project)); }
  },
  dispose() { disposed = true; if (timer) clearTimeout(timer); pending.clear(); },
 };
}
