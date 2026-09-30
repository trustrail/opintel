import type {SessionId} from '../../../shared/kernel/index.js';

export type MagicLinkUse = {stage:'link_issuance_authorized'|'sign_in_completed'|'session_accepted';sessionId?:SessionId};
/** Rechecks current restrictions. A successful exception is recorded before use. */
export interface MagicLinkAccess {
 check(email:string,use?:MagicLinkUse):Promise<boolean>;
}
