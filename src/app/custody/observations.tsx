import { ErrorState } from '../../shared/ui/index.js';
import { useTokenKey } from './data.js';
export { custodyKeys } from './data.js';
/** Read-only custody failures; no general observation workflow or key screen. */
export function CustodyObservations({projectId}:{projectId:string}){
 const query=useTokenKey(projectId);
 if(query.isPending)return null;
 // Key status is administrator-only; other project members see no key metadata.
 if(query.isError)return query.error.code==='forbidden'?null:<ErrorState title="Key custody status could not be loaded" description={query.error.message} retry={()=>{void query.refetch();}}/>;
 const failures=query.data.versions.filter(v=>v.lastRehearsal==='failed'||v.lastRehearsal==='mismatch');
 if(!failures.length)return null;
 return <section className="card" aria-label="Token key custody observations"><div className="card-h"><h2>Token key custody needs attention</h2><span className="meta">Restore rehearsals</span></div><ul className="feed">{failures.map(v=><li key={v.version}><span className="sev hi" aria-hidden="true">!</span><div className="fb"><p className="t">Key version {v.version}: {v.lastRehearsal==='mismatch'?'escrow does not match the recorded key':'escrow could not be verified'}</p><p className="d">{v.state==='retired'?'This retained key is needed to verify earlier evidence.':'Source connections are refused until backup verification succeeds.'} Ask the custody operator to check the independent backup location and run a restore rehearsal. Do not rotate to repair a missing key: rotation cannot recover earlier tokens.</p>{v.lastRehearsedAt?<time className="when" dateTime={v.lastRehearsedAt}>{v.lastRehearsedAt}</time>:null}</div></li>)}</ul></section>;
}
