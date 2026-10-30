import type {CompanyId,UserId} from '../../../shared/kernel/index.js';
export type PairedEngine={id:string;name:string;address:string;certificatePin:string};
/** Only trusted installation pairing state may supply engine identity. */
export interface InstallationEngines {read():Promise<PairedEngine[]>;}
export interface PairedEngineCandidates {list(company:CompanyId,actor:UserId):Promise<Array<Pick<PairedEngine,'id'|'name'>>>;}
