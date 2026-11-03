import type {z} from 'zod';
import type {CredentialMetadata} from '../../shared/api/pools.js';
import {useTimestamp} from '../components/account.js';
export function IdentitySummary({credential}:{credential:z.infer<typeof CredentialMetadata>}){
 const stamp=useTimestamp(),identity=credential.identity;
 if(!identity)return null;
 if(identity.kind==='bearer-only')return <span data-pill>Bearer-only</span>;
 if(!identity.fingerprint)return <span data-pill>Not bound yet</span>;
 return <><span data-pill title={identity.fingerprint}>{identity.fingerprint.slice(0,12)} · {identity.status}</span>{identity.deviceName&&<span title="Self-declared display label; never authorizes access">{identity.deviceName} <small>self-declared label</small></span>}{identity.certificateId!==null&&<small>Certificate label {identity.certificateId} · self-declared</small>}{identity.boundAt&&<time dateTime={identity.boundAt}>{stamp(identity.boundAt)}</time>}</>;
}
