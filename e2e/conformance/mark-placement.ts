export type MarkFinding = {mark:string;reason:string;row:string};
/** Passive identity marks are distinct from control affordances and chart SVGs. */
export function inspectMarkPlacement():MarkFinding[]{
 const root=document.querySelector('#opintel-app');
 if(!root)return [];
 const findings:MarkFinding[]=[];
 const rowSelector='[data-mark-row],tr,[role="listitem"],[role="treeitem"]';
 const report=(mark:Element,reason:string,row:Element|null)=>findings.push({mark:mark.getAttribute('data-mark')??'',reason,row:row?.getAttribute('data-row-kind')??row?.tagName.toLowerCase()??''});
 for(const mark of root.querySelectorAll('[data-mark]')){
  const category=mark.getAttribute('data-mark-category');
  if(!['kind','state','treatment'].includes(category??''))report(mark,'Mark category is missing or unknown.',null);
  if(mark.tagName.toLowerCase()!=='svg'||mark.getAttribute('aria-hidden')!=='true'||mark.getAttribute('focusable')!=='false')report(mark,'Identity marks must be passive decorative SVGs.',null);
  const navigation=mark.closest('[data-mark-navigation]');
  if(category==='kind'&&mark.closest('h1,h2,h3,h4,h5,h6,.blank'))report(mark,'Kind mark repeats a heading or empty state identity.',null);
  if(navigation)continue;
  const row=mark.closest(rowSelector);
  if(!row)continue;
  const ownMarks=[...row.querySelectorAll('[data-mark]')].filter(candidate=>candidate.closest(rowSelector)===row);
  if(ownMarks.length>1&&ownMarks[0]===mark)report(mark,'Row carries more than one identity mark.',row);
  const list=row.closest('[data-mark-list]');
  if(category==='kind'&&!list)report(mark,'Kind-marked row has no declared list kind scope.',row);
  if(category==='kind'&&list?.getAttribute('data-mark-list')==='uniform')report(mark,'Uniform list carries a kind mark.',row);
 }
 for(const navigation of root.querySelectorAll('[data-mark-navigation]')){
  for(const destination of navigation.querySelectorAll('button:not([data-disclosure]),a[href]')){
   const marks=[...destination.querySelectorAll('[data-mark]')];
   if(marks.length!==1)findings.push({mark:marks[0]?.getAttribute('data-mark')??'',reason:'Navigation destination must carry exactly one identity mark.',row:destination.tagName.toLowerCase()});
  }
 }
 for(const list of root.querySelectorAll('[data-mark-list]')){
  if(!['uniform','mixed'].includes(list.getAttribute('data-mark-list')??''))findings.push({mark:'',reason:'List kind scope is unknown.',row:''});
  for(const row of list.querySelectorAll('[data-mark-row]'))if(row.closest('[data-mark-list]')===list&&!row.getAttribute('data-row-kind'))findings.push({mark:'',reason:'Row kind is missing; scope cannot be checked independently of marks.',row:''});
 }
 return findings;
}
