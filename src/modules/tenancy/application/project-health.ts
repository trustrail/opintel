import type {ProjectId,UserId,Result} from '../../../shared/kernel/index.js';
import type {ProjectHealth,ProjectHealthItem} from '../../../shared/api/project-health.js';
export type HealthContext={projectId:ProjectId;userId:UserId};
export interface ProjectHealthReader {read(ctx:HealthContext):Promise<Result<ProjectHealth>>;}
export type HealthFacts={
 engines:Array<{health:'unverified'|'healthy'|'unavailable'|'contract_mismatch';at:string|null}>;
 sources:Array<{status:string;at:string|null}>;
 custody:{available:boolean;reason:string|null;checkedAt:string|null;dashboard:'authenticated'|'failed'|'not_set'|null;isXq:boolean};
 tokenKey:{backupAt:string|null;rehearsedAt:string|null;rehearsal:'ok'|'mismatch'|'failed'|null}|null;
 tls:{selfSignedTls:boolean;at:string}|null;
};
const oldest=(values:Array<string|null>)=>values.some(v=>v===null)?null:[...values].sort()[0]??null;
/** Safe summaries only: no addresses, key material, provider bodies or customer values. */
export function projectHealth(project:ProjectId,f:HealthFacts):ProjectHealth {
 const item=(kind:ProjectHealthItem['kind'],status:ProjectHealthItem['status'],checked_at:string|null,reason:string,label:string,path:string):ProjectHealthItem=>({kind,status,checked_at,reason,next_action:status==='ok'?null:{label,href:`/projects/${project}/${path}`}});
 const engineProblem=f.engines.some(e=>e.health==='unavailable'||e.health==='contract_mismatch'),engineSetup=!f.engines.length||f.engines.some(e=>e.health==='unverified');
 const sourceProblem=f.sources.some(s=>['unreachable','introspection_failed','failed','unavailable'].includes(s.status)),sourceSetup=!f.sources.length||f.sources.some(s=>s.status!=='connected'||s.at===null);
 const c=f.custody,custodyStatus=!c.available?(['provider_not_configured','provider_not_checked','provider_configuration_changed','provider_check_failed'].includes(c.reason??'')?'warning':'unknown'):c.isXq&&c.dashboard!=='authenticated'?'warning':'ok';
 const k=f.tokenKey,keyStatus=!k?'warning':k.rehearsal==='failed'||k.rehearsal==='mismatch'?'warning':!k.backupAt||k.rehearsal!=='ok'?'warning':'ok';
 return {items:[
  item('engine',engineProblem||engineSetup?'warning':'ok',oldest(f.engines.map(e=>e.at)),engineProblem?'An engine verification failed.':engineSetup?'An engine needs registration or verification.':'Last engine verifications passed.','Verify engine','settings-engines'),
  item('sources',sourceProblem||sourceSetup?'warning':'ok',oldest(f.sources.map(s=>s.at)),sourceProblem?'A source connection or scan failed.':sourceSetup?'Source checks are incomplete.':'Last source scans passed.','Check sources','data-sources'),
  item('custody',custodyStatus,c.checkedAt,!c.available?({provider_not_configured:'Custody provider is not configured.',provider_not_checked:'Custody provider has not been checked.',provider_configuration_changed:'Custody configuration changed; check it again.',provider_check_failed:'Custody provider check failed.'}[c.reason??'']??'Custody check is unavailable.'):custodyStatus==='warning'?'XQ dashboard key has not passed its check.':'Last custody provider check passed.','Check custody','settings-project'),
  item('tls',f.tls?(f.tls.selfSignedTls?'warning':'ok'):'unknown',f.tls?.at??null,f.tls?(f.tls.selfSignedTls?'Self-signed TLS is in use.':'Externally supplied TLS is configured; expiry is not checked.'):'TLS deployment flag is unavailable.','Review TLS','settings-project'),
  item('token_key',keyStatus,k?.rehearsedAt??k?.backupAt??null,!k?'Token key has not been initialized.':k.rehearsal==='failed'||k.rehearsal==='mismatch'?'Token-key backup rehearsal failed.':keyStatus==='warning'?'Verify the token-key backup and rehearse recovery.':'Last token-key backup rehearsal passed.','Review token key','token-key'),
 ]};
}
