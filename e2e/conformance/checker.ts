/** Approved console-next foundations. A bare control outside these surfaces is
 * still rejected; chart SVGs and Radix's hidden form-transport fields are not controls. */
export const controlPatterns=[
 {kind:'button',selector:'#console-next [data-shell] button,#console-next [data-welcome] button,#console-next [data-auth-content] button,[data-dialog] button,[data-activity-receipt] button,[data-popover] button,[data-treatment-picker] button,[data-temporal-editor] button,[data-comparable-editor] button',master:'button'},
 {kind:'text',selector:'[data-dialog] input:not([type=checkbox]):not([type=radio]),[data-popover] input,[data-inline-rows] input:not([type=checkbox]),[data-queue-search] input,[data-data-toolbar] input,[data-welcome] input,[data-auth-email] input,[data-pool-picker]>input,[data-temporal-editor] input,[data-comparable-editor] input,[data-project-inline] input',master:'[data-dialog] input:not([type=checkbox]):not([type=radio])'},
 {kind:'textarea',selector:'[data-dialog] textarea,[data-treatment-picker] textarea',master:'[data-treatment-picker] textarea'},
 {kind:'combobox',selector:'[data-select][role=combobox]',master:'[data-select][role=combobox]'},
 {kind:'checkbox',selector:'[data-check]>button[role=checkbox],[data-settings-editor] button[role=checkbox],[data-rule-editor] button[role=checkbox],[data-table-picker] button[role=checkbox],[data-comparable-fold] [role=checkbox]',master:'[data-check]>button[role=checkbox]'},
 {kind:'tab',selector:'[data-pool-tabs]>button[role=tab]',master:'[data-pool-tabs]>button'},
 {kind:'radio',selector:'[data-start-option]>input[type=radio]',master:'[data-start-option]>input'},
] as const;
export type Finding={screen:string;name:string;markup:string;reason:string};
export type Scan={screen:string;heading:string;controls:number;states:string[];findings:Finding[]};
/** Self-contained for page.evaluate/addInitScript; never collects input values. */
export function inspectControls(patterns:readonly {kind:string;selector:string;master:string}[]):Scan{
 const root=document.querySelector('#console-next'),screen=location.pathname+location.search,findings:Finding[]=[];
 const surfaces=[root,...document.querySelectorAll('[data-dialog],[data-activity-receipt],[data-menu],[data-popover],[data-treatment-picker],[data-temporal-editor],[data-comparable-editor],[data-select-content]')].filter((e):e is Element=>e!==null);
 const controls=[...new Set(surfaces.flatMap(e=>[...e.querySelectorAll('button,input:not([type=hidden]),select,textarea,details,summary,[role=button],[role=switch],[role=checkbox],[role=radio],[role=combobox],[contenteditable=true]')]))].filter(e=>!(e.getAttribute('aria-hidden')==='true'&&e.getAttribute('tabindex')==='-1'));
 const visible=(e:Element)=>e instanceof HTMLElement&&e.checkVisibility({checkVisibilityCSS:true});
 const name=(e:Element)=>e.getAttribute('aria-label')??e.getAttribute('aria-labelledby')?.split(/\s+/u).map(id=>document.getElementById(id)?.textContent??'').join(' ')??e.textContent?.trim()??e.tagName.toLowerCase();
 const report=(e:Element,reason:string)=>findings.push({screen,name:name(e).slice(0,160),markup:'<'+e.tagName.toLowerCase()+' '+['type','role','id','aria-expanded','aria-controls'].flatMap(k=>e.hasAttribute(k)?[k+'='+JSON.stringify(e.getAttribute(k))]:[]).join(' ')+'>',reason});
 const states=new Set<string>();
 if(surfaces.some(e=>e.querySelector('[role=alert]')))states.add('error');
 if(root?.querySelector('[data-empty],[data-data-empty],[data-list-state=empty]'))states.add('empty-or-message');
 if(root?.querySelector('[aria-busy=true]'))states.add('busy');
 if(document.querySelector('[role=dialog]'))states.add('dialog');
 for(const e of controls){
  const tag=e.tagName.toLowerCase(),type=e instanceof HTMLInputElement?e.type:'',role=e.getAttribute('role');
  if(tag==='details'||tag==='summary'){report(e,'Native disclosure is forbidden; use an approved button disclosure pattern.');continue;}
  const kind=role??(tag==='button'?'button':tag==='select'?'select':tag==='textarea'?'textarea':tag==='input'?(['checkbox','radio','range','file','color','image'].includes(type)?type:'text'):'unclassified');
  if(!patterns.some(p=>p.kind===kind&&e.matches(p.selector)))report(e,`Unclassified ${kind} control: no matching foundation control pattern.`);
  if((e.hasAttribute('aria-expanded')||e.hasAttribute('aria-controls'))&&visible(e)){
   const expanded=e.getAttribute('aria-expanded'),ids=e.getAttribute('aria-controls')?.trim().split(/\s+/u).filter(Boolean)??[];
   // Tabs use aria-selected; each tab must still reference its actual panel.
   if(role==='tab'){for(const id of ids)if(!document.getElementById(id))report(e,'Tab target does not exist.');continue;}
   if(expanded!=='true'&&expanded!=='false')report(e,'Disclosure aria-expanded must be true or false.');
   const lazy=expanded==='false'&&(e.hasAttribute('aria-haspopup')||e.matches('[data-select][role=combobox][data-state=closed]'));
   if(!ids.length&&!lazy)report(e,'Disclosure has no aria-controls target.');
   for(const id of ids){const target=document.getElementById(id);if(!target&&!lazy)report(e,'Disclosure target does not exist.');else if(target&&e.matches('[data-needs-more]')){const rows=[...target.querySelectorAll('[data-needs-row]')];if(rows.length<=5||rows.slice(5).some(row=>visible(row)!==(expanded==='true')))report(e,'Needs-you expansion disagrees with trailing row visibility.');}else if(target&&visible(target)!==(expanded==='true'))report(e,'Disclosure target visibility disagrees with aria-expanded.');}
   if(expanded==='true')states.add('expanded');
  }
 }
 return {screen,heading:(root?.querySelector('[data-auth-content] h2')??root?.querySelector('h1,[role=heading][aria-level="1"]')??document.querySelector('[role=dialog] h2'))?.textContent??'',controls:controls.length,states:[...states],findings};
}
