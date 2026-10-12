import type {ReleaseContext} from './ports.js';
import type {Result} from '../../../shared/kernel/index.js';
export interface QueryReleasePort {
 available(ctx:ReleaseContext):Promise<Result<void>>;
 discard(ctx:ReleaseContext,grants:readonly {grant:string}[]):Promise<void>;
 seal(ctx:ReleaseContext,alias:string,receipt:string,columns:string[],rows:unknown[][],indices:number[]):Promise<Result<{rows:unknown[][];custody:{columns:string[];grant:string}[]}>>;
}
