import type {NeedsYouItem} from '../../shared/api/needs-you.js';
import {KindIcon} from '../components/kind.js';
export function needsAreas(items:NeedsYouItem[]){
 const decisions=items.some(i=>i.kind==='undecided_entitlement'||i.kind==='missing_row_decision');
 return {Home:items.length>0,Activity:false,Pools:decisions,Data:decisions,Settings:items.some(i=>['setting_required','check_required','check_failed'].includes(i.kind))};
}
export function poolBadge(name:string){
 const number=name.trim().split(/\s+/).at(-1);if(number&&/^\d{1,3}$/.test(number))return (name.trim()[0]??'').toUpperCase()+String(Number(number));
 const first=name.trim().split(/\s+/)[0]??'';
 return /^[a-z]\d+$/i.test(first)?first.toUpperCase():name.trim().split(/\s+/).slice(0,2).map(w=>w[0]??'').join('').toUpperCase();
}
export function NeedName({item}:{item:NeedsYouItem}){
 const context=item.context;
 if(!context)return <strong>{item.title.replaceAll(' — ',' · ')}</strong>;
 const column=context.targets[0]?.columnName;
 return <strong data-need-name>
  <span data-pool-badge title={context.pool.name}><KindIcon kind="pool"/>{poolBadge(context.pool.name)}</span>
  <span data-table-names>{context.targets.map((table,i)=><span key={table.tableId} title={[table.sourceName,table.schemaName,table.name].filter(Boolean).join(' · ')}>{i>0&&<span aria-hidden="true">, </span>}<KindIcon kind={table.kind}/><span>{table.name}</span></span>)}</span>
  <span aria-hidden="true">·</span>
  {item.kind==='undecided_entitlement'?<span data-column-name title={column??'Unnameable column'}><KindIcon kind="column"/><span>{column??'Unnameable column'}</span></span>:<span data-column-name><KindIcon kind="row_rule"/><span>rows</span></span>}
 </strong>;
}

/** Only these destinations use one shared settings editor. Preserve every other item. */
export function groupSettingNeeds(items:NeedsYouItem[],project:string):NeedsYouItem[]{
 const forms=new Map<string,NeedsYouItem[]>();
 for(const item of items)if(item.kind==='setting_required'&&/\/settings-(query|discovery)$/.test(item.targetRoute)){const group=forms.get(item.targetRoute)??[];group.push(item);forms.set(item.targetRoute,group);}
 const emitted=new Set<string>();return items.flatMap(item=>{
  const group=forms.get(item.targetRoute);if(item.kind!=='setting_required'||!group)return [item];if(emitted.has(item.targetRoute))return [];emitted.add(item.targetRoute);
  const section=item.targetRoute.endsWith('settings-query')?'query':'discovery',count=group.reduce((n,i)=>n+i.count,0);
  return [{...item,id:'settings-form:'+section,title:`Set ${section==='query'?'query limits':'discovery'} · ${count} ${count===1?'value':'values'}`,count,roles:item.roles.filter(r=>group.every(i=>i.roles.includes(r))),targetRoute:`?project=${project}&screen=settings&section=${section}&edit=true`}];
 });
}
