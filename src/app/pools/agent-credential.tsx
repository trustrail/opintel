import {useId,useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import type {AgentPresenceView} from '../../shared/api/agent-presence.js';
export function AgentCredential({agentId,credential}:{agentId:string;credential:NonNullable<AgentPresenceView['credential']>}){
 const id=useId(),store=useMemo(()=>createStore<{open:boolean}>(()=>({open:false})),[credential.custodyAlias]),{open}=useStore(store);
 return <><div>{credential.label}</div><button type="button" className="toolchip" title={credential.custodyAlias} aria-label={`Credential alias for ${agentId}`} aria-expanded={open} aria-controls={id} onClick={()=>store.setState({open:!open})}><span className="mono">{credential.custodyAlias.slice(0,20)}{credential.custodyAlias.length>20?'…':''}</span></button><div id={id} hidden={!open} className="mono" style={{overflowWrap:'anywhere'}}>{credential.custodyAlias}</div></>;
}
