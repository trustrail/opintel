import type { Result, RunId, SourceId } from '../../../shared/kernel/index.js';
import type { RunView } from '../../../shared/api/introspection.js';
import type { IntrospectionContext } from './introspection-store.js';
export interface IntrospectionQuery {
 read(ctx:IntrospectionContext,id:RunId):Promise<Result<RunView>>;
 list(ctx:IntrospectionContext,source:SourceId,after:RunId|null,limit:number):Promise<Result<RunView[]>>;
 cancel(ctx:IntrospectionContext,id:RunId):Promise<Result<RunView>>;
}
