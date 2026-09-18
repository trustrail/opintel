import { DomainError, err, type Result, type RunId, type SourceId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { SourceConnector } from './source-connector.js';
import type { IntrospectionContext, IntrospectionRun, IntrospectionSource, IntrospectionStore } from './introspection-store.js';

export class IntrospectionJob {
  private readonly active = new Map<RunId, { controller: AbortController; done: Promise<Result<IntrospectionRun>> }>();
  constructor(private readonly store: IntrospectionStore,
    private readonly connector: (source: IntrospectionSource, runId: RunId) => SourceConnector,
    private readonly lifecycle: (runId: RunId, state: string) => void = () => {},
    private readonly authorization?: AuthorizationPort) {}
  async enqueue(ctx: IntrospectionContext, sourceId: SourceId, include: string[] = [], options: { adoptRenamedNames?: boolean } = {}) {
    if (options.adoptRenamedNames && !await this.canAdopt(ctx)) return err(new DomainError('forbidden','You must administer the project to adopt renamed names.'));
    return this.store.enqueue(ctx,sourceId,include,options.adoptRenamedNames ?? false);
  }
  private async canAdopt(ctx: IntrospectionContext): Promise<boolean> {
    if (this.authorization === undefined) return false;
    return (await this.authorization.check({ resource:{type:'project',id:ctx.projectId}, permission:'administer', subject:{type:'user',id:ctx.userId} })).allowed;
  }
  read(ctx: IntrospectionContext, id: RunId) { return this.store.read(ctx,id); }
  source(ctx: IntrospectionContext, id: SourceId) { return this.store.source(ctx,id); }
  async cancel(ctx: IntrospectionContext,id: RunId) {
    const cancelled = await this.store.cancel(ctx,id);
    if (!cancelled.ok) return cancelled;
    const local = this.active.get(id);
    local?.controller.abort();
    if (local !== undefined) await local.done;
    this.lifecycle(id,'cancelled');
    return this.store.read(ctx,id);
  }
  execute(ctx: IntrospectionContext,id: RunId,signal?: AbortSignal): Promise<Result<IntrospectionRun>> {
    if (this.active.has(id)) return Promise.resolve(err(new DomainError('conflict','This worker is already executing the run.')));
    const controller = new AbortController();
    const done = this.perform(ctx,id,controller,signal).then((result) => {
      if (result.ok) this.lifecycle(id,result.value.state);
      return result;
    }).finally(() => this.active.delete(id));
    this.active.set(id,{controller,done});
    return done;
  }
  private async perform(ctx: IntrospectionContext,id: RunId,controller: AbortController,signal?: AbortSignal): Promise<Result<IntrospectionRun>> {
    let cancellable = true;
    const abort = () => { if (cancellable) controller.abort(); };
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) abort();
    let polling = false;
    const poll = setInterval(() => {
      if (!cancellable || polling) return;
      polling = true;
      void this.store.read(ctx,id).then((run) => {
        if (!run.ok || run.value.state === 'cancelled') controller.abort();
      }).catch(() => controller.abort()).finally(() => { polling=false; });
    },100);
    const advance = async (from: 'queued'|'connecting'|'reading',to: 'connecting'|'reading'|'diffing') => {
      const result = await this.store.advance(ctx,id,from,to);
      if (result.ok) this.lifecycle(id,to);
      return result;
    };
    try {
      if (controller.signal.aborted) return await this.store.cancel(ctx,id);
      const claim = await advance('queued','connecting');
      if (!claim.ok) return claim;
      const source = await this.store.source(ctx,claim.value.sourceId);
      if (!source.ok || source.value.credentialRef === null || source.value.status === 'archived') {
        return await this.store.fail(ctx,id,'Source is unavailable for introspection.',false);
      }
      const connector = this.connector(source.value,id);
      const connected = await connector.testConnection(source.value.credentialRef,controller.signal);
      if (controller.signal.aborted) return await this.store.cancel(ctx,id);
      if (!connected.ok) return await this.store.fail(ctx,id,'Source connection failed.',true);
      const reading = await advance('connecting','reading');
      if (!reading.ok) return reading;
      const snapshot = await connector.introspect(source.value.credentialRef,claim.value.include,controller.signal);
      if (controller.signal.aborted) return await this.store.cancel(ctx,id);
      if (!snapshot.ok) return await this.store.fail(ctx,id,'Source introspection failed.',snapshot.error.code === 'source_unavailable');
      if (claim.value.adoptRenamedNames && !await this.canAdopt(ctx)) return await this.store.fail(ctx,id,'Project administration is required to adopt renamed names.',false);
      const diffing = await advance('reading','diffing');
      if (!diffing.ok) return diffing;
      cancellable=false;
      const result = await this.store.publish(ctx,id,snapshot.value);
      if (!result.ok) return await this.store.fail(ctx,id,'Catalogue publication failed.',false);
      return result;
    } catch {
      if (controller.signal.aborted && cancellable) return await this.store.cancel(ctx,id);
      return await this.store.fail(ctx,id,'Introspection failed.',false);
    } finally {
      clearInterval(poll);
      signal?.removeEventListener('abort',abort);
    }
  }
}
