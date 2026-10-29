import type {NeedsYouItem} from '../../shared/api/needs-you.js';
import {KindIcon} from '../components/kind.js';
export function needsAreas(items:NeedsYouItem[]){
 const decisions=items.some(i=>i.kind==='undecided_entitlement'||i.kind==='missing_row_decision');
 return {Home:items.length>0,Activity:false,Pools:decisions,Data:decisions,Settings:items.some(i=>['setting_required','check_required','check_failed'].includes(i.kind))};
}
export function poolBadge(name:string){
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
