export type MarkFinding={mark:string;reason:string;row:string};
/** Rule 14 applies to each named thing, including several chips in one receipt
 * row. Control icons and chart SVGs are separate from those passive kind marks. */
export function inspectMarkPlacement():MarkFinding[]{
 const roots=[document.querySelector('#console-next'),...document.querySelectorAll('[data-dialog],[data-activity-receipt],[data-popover]')].filter((e):e is Element=>e!==null),findings:MarkFinding[]=[];
 const kinds=['source','table','view','column','pool','row_rule','agent','person','credential','receipt'];
 const elements=[...new Set(roots.flatMap(r=>[...r.querySelectorAll('[data-kind],[data-treatment],[data-kind-chip]')]))];
 for(const e of elements){
  const kind=e.getAttribute('data-kind'),treatment=e.getAttribute('data-treatment');
  const report=(reason:string)=>findings.push({mark:kind??treatment??'',reason,row:e.closest('li')?.getAttribute('data-row-kind')??''});
  if(kind){if(!kinds.includes(kind))report('Kind is unknown.');if(e.getAttribute('role')!=='img'||!e.getAttribute('aria-label')?.trim()||e.querySelectorAll('svg').length!==1)report('Kind mark must contain one passive SVG and a named kind.');}
  if(treatment&&(!['clear','tokenized','masked','aggregate_only','custody','withheld','undecided'].includes(treatment)||e.getAttribute('role')!=='img'||!e.getAttribute('aria-label')?.trim()||e.querySelectorAll('svg').length!==1))report('Treatment mark must have a known treatment, passive SVG and accessible name.');
  if(Boolean(e.getAttribute('data-kind-chip'))&&e.querySelectorAll('[data-kind]').length!==1)report('A named chip must carry exactly one kind mark.');
 }
 return findings;
}
