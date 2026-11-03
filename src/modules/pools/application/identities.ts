import type {Result} from '../../../shared/kernel/index.js';
import type {CustodyIdentities} from '../../../shared/api/custody-identities.js';
export interface CustodyIdentitiesReader {list():Promise<Result<CustodyIdentities>>;}
