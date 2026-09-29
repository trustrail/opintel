import type {ValidationRequest} from '../../src/shared/execution-contract.js';
import type {SessionInspection} from './ports.js';
/** Parsing and binding only: no executable statement or source capability crosses this port. */
export interface ValidationSession extends Pick<SessionInspection,'build'|'columns'|'objects'|'hasExternalState'> {
 parse(sql:string):Promise<{kind:'parse_failed'|'serialization_refused';error:string}|{kind:'parsed';tree:unknown;bind():Promise<boolean>}>;
 close():void;
}
export interface ValidationSessions {open(request:ValidationRequest,signal:AbortSignal):Promise<ValidationSession>}
