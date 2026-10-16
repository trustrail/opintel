import {nextSearchSchema,type Destination,type NextSearch} from './state.js';
export function legacyDestination(url:URL,projectId:string):{destination:Destination;search:NextSearch}|null{
 const parts=url.pathname.split('/');if(parts[1]!=='projects'||parts[2]!==projectId)return null;const screen=parts[3],q=url.searchParams,search:NextSearch={pool:q.get('poolId')??undefined,source:q.get('sourceId')??undefined,column:q.get('elementId')??undefined,object:q.get('rowObjectId')??undefined,decisionId:q.get('rowDecisionId')??undefined};
 if(screen==='dashboard')return {destination:'home',search:{}};
 if(screen==='pools')return {destination:'pools',search:{pool:parts[4],panel:parts[5]==='agents'?'agent':parts[4]?'pool':undefined,agent:parts[6]}};
 if(screen==='entitlements')return {destination:'decisions',search:nextSearchSchema.parse({...search,view:search.object?'rows':'columns',rowState:q.get('rowFilter')==='unscoped'?'unscoped':undefined,groupBy:q.get('layout')??undefined,decision:q.get('decision')??undefined})};
 if(screen==='catalog')return {destination:'sources',search:{...search,view:'schema',schema:q.get('declarationSchema')??undefined,panel:search.column?'declarations':undefined}};
 if(screen==='relationship-suggestions')return {destination:'sources',search:{...search,view:'suggestions'}};
 if(screen==='data-sources')return {destination:'sources',search:{view:'sources'}};
 if(screen==='observations')return {destination:'sources',search:{panel:'problems'}};
 if(screen==='sources'&&parts[5]==='introspections')return {destination:'sources',search:{source:parts[4],panel:'introspections'}};
 if(screen==='introspections')return {destination:'sources',search:{run:parts[4],panel:'introspection'}};
 if(screen==='activity'||screen==='runs')return {destination:'activity',search:{...search,agent:q.get('agentId')??undefined,run:parts[4],startedAt:q.get('startedAt')??undefined,panel:parts[4]?'receipt':undefined}};
 if(screen==='access'||screen==='token-key'||screen?.startsWith('settings'))return {destination:'settings',search:{view:screen==='access'?'users':screen==='token-key'?'token-key':screen.replace('settings-','')==='settings'?'project':screen.replace('settings-','')}};
 return null;
}
