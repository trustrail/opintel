import type {z} from 'zod';
import type {CredentialMetadata} from '../../shared/api/pools.js';
import type {AgentPresenceView} from '../../shared/api/agent-presence.js';
import {useTimestamp} from '../components/account.js';
import {KindIcon} from '../components/kind.js';
export const certificateHint='Certificate authenticated and bound to this credential. The agent id is a label chosen by the agent.';
export function certificateName(identity:AgentPresenceView['certificateIdentity']){return identity?`${identity.certificateId===null?'certificate':'cert '+identity.certificateId} · ${identity.fingerprintPrefix}`:'no certificate';}
export function AgentIdentity({agent}:{agent:Pick<AgentPresenceView,'certificateIdentity'|'agentId'|'verified'>}){return <><KindIcon kind="agent"/><code>{agent.verified&&!agent.certificateIdentity?'certificate not recorded':certificateName(agent.certificateIdentity)}</code> · <small title="Nickname chosen by the agent">{agent.agentId}</small> · <span data-badge data-status={agent.verified?'ok':'warning'} title={agent.verified?certificateHint:'No authenticated bound certificate.'}>{agent.verified?'verified':'unverified'}</span></>;}
export function IdentitySummary({credential,compact=false,showTime=true}:{credential:z.infer<typeof CredentialMetadata>;compact?:boolean;showTime?:boolean}){
 const stamp=useTimestamp(),identity=credential.identity;
 if(!identity)return <span data-pill>no certificate · unverified</span>;
 const verified=identity.kind==='identity-bound'&&identity.status==='bound';
 return <><code>{identity.fingerprint?`${identity.certificateId===null?'certificate':'cert '+identity.certificateId} · ${identity.fingerprint.slice(0,12)}`:'no certificate'}</code> · <span data-pill title={verified?certificateHint:'Not bound to an authenticated certificate'}>{verified?'verified':'unverified'}</span>{!compact&&identity.deviceName&&<> · <small title="Device nickname; never authorizes access">{identity.deviceName}</small></>}{!compact&&showTime&&identity.boundAt&&<> · <time aria-label="Bound at" dateTime={identity.boundAt} title={stamp(identity.boundAt)}>{stamp(identity.boundAt)}</time></>}</>;
}

export function RecordedIdentity({agentId,identity}:{agentId:string|null;identity?:{verified:boolean;certificateIdentity:AgentPresenceView['certificateIdentity']}|null}){return identity?<AgentIdentity agent={{agentId:agentId??'Nickname not recorded',verified:identity.verified,certificateIdentity:identity.certificateIdentity}}/>:<><KindIcon kind="agent"/><code>certificate not recorded</code>{agentId&&<> · <small title="Recorded nickname">{agentId}</small></>}</>;}
