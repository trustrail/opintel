import {useId,useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import type {AgentPresenceView} from '../../shared/api/agent-presence.js';
export function AgentCredential({agentId,authenticatedWith}:{agentId:string;authenticatedWith:Extract<AgentPresenceView['authenticatedWith'],{kind:'credential'}>}){
 const id=useId(),store=useMemo(()=>createStore<{open:boolean}>(()=>({open:false})),[authenticatedWith.alias]),{open}=useStore(store);
 return <><div>{authenticatedWith.label}</div><button type="button" className="toolchip" title={authenticatedWith.alias} aria-label={`Credential alias for ${agentId}`} aria-expanded={open} aria-controls={id} onClick={()=>store.setState({open:!open})}><span className="mono">{authenticatedWith.alias.slice(0,20)}{authenticatedWith.alias.length>20?'…':''}</span></button><div id={id} hidden={!open} className="mono" style={{overflowWrap:'anywhere'}}>{authenticatedWith.alias}</div></>;
}
