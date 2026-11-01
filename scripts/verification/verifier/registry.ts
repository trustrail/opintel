import {expectedReturnedRows} from '../../soak/scenarios.js';
import {createHash} from 'node:crypto';
import {demoTables,generateSpecification} from '../../demo-soak-definition.js';
import type {Scenario} from '../../soak/specification.js';
import type {DemoManifest} from '../../soak/manifest.js';
export const verifierVersion='1.0.0';
const names=Object.fromEntries(demoTables.map(t=>[t.name,`v01.${t.schema}.${t.name}`]));
const slots=Array.from({length:10},(_,i)=>({poolIndex:Math.floor(i/5),credentialId:`pool${Math.floor(i/5)}-agent${i%5+1}`,association:{}}));
export const fixtureHash=createHash('sha256').update(JSON.stringify(demoTables)).digest('hex');
export type Cell={id:string;capability:string;dimensions:Record<string,string>;prerequisites:string[];expected:Scenario['expected'];expectedEvidence:{receipt:boolean;caller:boolean;noLiterals:boolean;rowScopes:Array<{object:string;mode:string;rows:number}>;custody?:{fourExchanges:true;unseal:true;noSkipped:true}};scenario:Scenario};
function capability(s:Scenario){return s.requiresCustody?'custody':s.credential==='revoked'?'credentials':s.kind==='declared join'?'joins':s.kind==='declared aggregate'?'aggregates':s.kind==='declared shape'?'shapes':s.kind==='treatment semantics'?'treatment-semantics':'treatments';}
const canonical=generateSpecification(names,slots);
export const cells:Cell[]=canonical.scenarios.map(s=>({id:s.id,capability:capability(s),dimensions:{pool:String(s.poolIndex),kind:s.kind,credential:s.credential,...s.credentialId?{agent:s.credentialId}:{},outcome:s.expected.outcome,sourcePath:'postgres',tables:s.objects.map(o=>o.split('.').at(-1)).join(','),...s.requiresCustody?{treatment:'custody'}:{}},prerequisites:['installation','session','fixture','governance',...(s.requiresCustody?['custody']:[]),...(s.credential!=='normal'?['lifecycle']:[])],expected:s.expected,expectedEvidence:{receipt:s.credential!=='revoked',caller:s.credential!=='revoked',noLiterals:true,rowScopes:s.objects.map(name=>{const object=canonical.objects.find(o=>o.name===name&&o.poolIndex===s.poolIndex)!;return {object:name,mode:name.endsWith('.open_reference')?'explicit_all_rows':object.rowMode,rows:expectedReturnedRows(object,s)};}),...(s.requiresCustody?{custody:{fourExchanges:true as const,unseal:true as const,noSkipped:true as const}}:{})},scenario:s}));
if(cells.length!==115||new Set(cells.map(c=>c.id)).size!==115)throw new Error('V-01 registry must contain exactly 115 unique cells');
export function logicalId(s:Scenario,m:DemoManifest){let id=s.id;for(const [full,name] of Object.entries(m.objects))id=id.replaceAll(full,names[name]!);for(const [i,a] of m.agents.filter(a=>a.poolIndex===s.poolIndex).entries())id=id.replaceAll(a.credentialId,`pool${s.poolIndex}-agent${i+1}`);return id;}
export function selectCells(options:{all?:boolean;capability?:string[];cell?:string[];where?:string[]}){
 if(!options.all&&!options.capability?.length&&!options.cell?.length&&!options.where?.length)throw new Error('Select --all, --capability, --cell or --where');
 for(const name of options.capability??[])if(!cells.some(c=>c.capability===name))throw new Error('Unknown capability: '+name);
 for(const id of options.cell??[])if(!cells.some(c=>c.id===id))throw new Error('Unknown cell: '+id);
 const filters=(options.where??[]).map(filter=>{const split=filter.indexOf('=');if(split<1||!filter.slice(split+1))throw new Error('Use --where DIMENSION=VALUE');const key=filter.slice(0,split),value=filter.slice(split+1);if(!cells.some(c=>c.dimensions[key]===value))throw new Error('Unknown dimension/value: '+filter);return {key,value};});
 const selected=cells.filter(c=>(options.all||options.capability?.includes(c.capability)||options.cell?.includes(c.id)||(!options.capability?.length&&!options.cell?.length&&filters.length>0))&&filters.every(f=>c.dimensions[f.key]===f.value));
 if(!selected.length)throw new Error('Selection contains no valid V-01 cells');return selected;
}
export const invalidCombinations=[{dimensions:{credential:'revoked',receipt:'required'},reason:'Authentication refuses before opening an admitted query receipt.'}];
