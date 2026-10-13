import {engineCustodyShares} from '../../../shared/execution-contract.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {ReleaseContext} from './ports.js';
import type {Result} from '../../../shared/kernel/index.js';
export interface QueryReleasePort {
 available(ctx:ReleaseContext):Promise<Result<void>>;
 discard(ctx:ReleaseContext,grants:readonly {grant:string}[]):Promise<void>;
 seal(ctx:ReleaseContext,alias:string,receipt:string,columns:string[],rows:unknown[][],indices:number[],shares:{first:string;second:string}):Promise<Result<{rows:unknown[][];custody:{columns:string[];grant:string}[]}>>;
}

/** Validate before settings, provider access, decoding or key handling. */
export function requireEngineShares(shares:unknown):Result<void>{
 if(shares===undefined||shares===null)return err(new DomainError('validation_failed','Engine-produced custodyShares (K1 and K2) are required. No result was released.',{cause:'missing_engine_custody_shares',input:'custodyShares'}));
 if(!engineCustodyShares.safeParse(shares).success)return err(new DomainError('validation_failed','Engine-produced custodyShares must contain valid K1 and K2 shares. No result was released.',{cause:'invalid_engine_custody_shares',input:'custodyShares'}));
 return ok(undefined);
}
