/** Reviewed control contracts. The master selector must exist; a utility class is
 * never sufficient. Input kinds are separate so .fld cannot bless a raw checkbox. */
export const controlPatterns = [
  ...['btn','toolchip','dtoggle','projbtn','pmitem','pmfoot','acct','iconbtn','shield','rhead','gchip','eg','pcard','newproj','sw','copy','eo','wh','audh','xbtn','relh','ch2','opt','th3','cellbox'].map(name => ({
    kind: 'button', selector: `.${name}`, master: `#opintel-app .${name}`,
  })),
  ...['.dnav button','.pop button','.segbtns button','.setnav button','.wbeg button'].map(selector => ({kind:'button',selector,master:`#opintel-app ${selector}`})),
  ...['.inp','.fld input','.search input'].map(selector => ({kind:'text',selector,master:`#opintel-app ${selector}`})),
  ...['.inp','.pick select','.tsel select','.bulkbar select'].map(selector => ({kind:'select',selector,master:`#opintel-app ${selector}`})),
  ...['.pgbox textarea','.wbp textarea'].map(selector => ({kind:'textarea',selector,master:`#opintel-app ${selector}`})),
  {kind:'checkbox',selector:'input[type=checkbox]',master:'#opintel-app input[type=checkbox]'},
  {kind:'radio',selector:'input[type=radio]',master:'#opintel-app input[type=radio]'},
] as const;
export type Finding = {screen:string;name:string;markup:string;reason:string};
export type Scan = {screen:string;heading:string;controls:number;states:string[];findings:Finding[]};

/** Self-contained for page.evaluate/addInitScript. No source values are collected. */
export function inspectControls(patterns: readonly {kind:string;selector:string;master:string}[]): Scan {
  const root=document.querySelector('#opintel-app');
  const screen=location.pathname;
  const findings:Finding[]=[];
  const controls=[...(root?.querySelectorAll('button,input:not([type="hidden"]),select,textarea,details,summary,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[role="combobox"],[contenteditable="true"]')??[])];
  const visible=(element:Element)=>element instanceof HTMLElement&&element.checkVisibility({checkVisibilityCSS:true});
  const name=(element:Element)=>(element.getAttribute('aria-label')??
    element.getAttribute('aria-labelledby')?.split(/\s+/u).map(id=>document.getElementById(id)?.textContent??'').join(' ')??
    ('labels' in element?Array.from((element as HTMLInputElement).labels??[]).map(label=>label.textContent).join(' '):''))||element.textContent?.trim()||element.getAttribute('name')||element.id||element.tagName.toLowerCase();
  const report=(element:Element,reason:string)=>{
    // Only structural markup, never input values or key text.
    const attrs=['class','type','role','id','aria-expanded','aria-controls'].flatMap(key=>element.hasAttribute(key)?[`${key}=${JSON.stringify(element.getAttribute(key))}`]:[]);
    findings.push({screen,name:name(element).slice(0,160),markup:`<${element.tagName.toLowerCase()} ${attrs.join(' ')}>`,reason});
  };
  const states=new Set<string>();
  if(root?.querySelector('[role="alert"]'))states.add('error');
  if(root?.querySelector('.blank'))states.add('empty-or-message');
  if(root?.querySelector('[aria-busy="true"]'))states.add('busy');
  if(root?.querySelector('[role="dialog"]'))states.add('dialog');
  for(const element of controls){
    const tag=element.tagName.toLowerCase();
    if(tag==='details'||tag==='summary'){report(element,'Native disclosure is forbidden; use a master button disclosure pattern.');continue;}
    const type=element instanceof HTMLInputElement?element.type:'';
    const kind=tag==='button'||element.getAttribute('role')==='button'?'button':tag==='select'?'select':tag==='textarea'?'textarea':tag==='input'?(['button','submit','reset'].includes(type)?'button':['checkbox','radio','range','file','color','image'].includes(type)?type:'text'):element.getAttribute('role')??'unclassified';
    if(!patterns.some(pattern=>pattern.kind===kind&&element.matches(pattern.selector)))report(element,`Unclassified ${kind} control: no matching master control pattern.`);
    if((element.hasAttribute('aria-expanded')||element.hasAttribute('aria-controls')||element.matches('.dtoggle,.projbtn,button[data-disclosure]'))&&visible(element)){
      const expanded=element.getAttribute('aria-expanded');
      const ids=element.getAttribute('aria-controls')?.trim().split(/\s+/u).filter(Boolean)??[];
      if(expanded!=='true'&&expanded!=='false')report(element,'Disclosure aria-expanded must be true or false.');
      if(!ids.length)report(element,'Disclosure has no aria-controls target.');
      for(const id of ids){const target=document.getElementById(id);if(!target)report(element,'Disclosure target does not exist.');else if(element.matches('.dtoggle')){
        // The documented compact drawer keeps icons visible. Its controlled
        // target is the drawer; expansion is represented by .shell.collapsed.
        if(!target.matches('.drawer')||!target.closest('.shell')||(target.closest('.shell')!.classList.contains('collapsed')===(expanded==='true')))report(element,'Compact drawer state disagrees with aria-expanded.');
      }else if(visible(target)!==(expanded==='true'))report(element,'Disclosure target visibility disagrees with aria-expanded.');}
      if(expanded==='true')states.add('expanded');
    }
  }
  return {screen,heading:root?.querySelector('h1')?.textContent??'',controls:controls.length,states:[...states],findings};
}
