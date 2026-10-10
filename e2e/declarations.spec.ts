import {capture} from './capture.js';
import {ProjectId,ElementId} from '../src/shared/kernel/value-objects.js';
import {domainMigrationConfirmation,derivedTokenDomain} from '../src/shared/token-domain.js';
import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mock,expand,project,openDeclarations} from './catalog-fixture.js';
const element='018f8f9d-7f83-7abc-8def-000000000004',source='018f8f9d-7f83-7abc-8def-000000000002';
async function declarations(page:Page){
 await mock(page);
 const state={loading:false,error:false,readOnly:false,writes:[] as Record<string,unknown>[],data:{elementId:element,sourceId:source,schemaName:'public',qualifiedName:'warehouse.public.records.record_id',exposedType:'INTEGER',projectName:'Reporting',stored:{tokenDomain:null as string|null,caseInsensitive:null as boolean|null,sourceTimezone:null as string|null,epochUnit:null as 'seconds'|'milliseconds'|null,canonId:null as string|null},schemaTimezone:'America/Toronto',effective:{tokenDomain:derivedTokenDomain({projectId:ProjectId(project),elementId:ElementId(element)}),caseInsensitive:false,sourceTimezone:'America/Toronto',epochUnit:null as 'seconds'|'milliseconds'|null,canonId:'stdnum1',mode:'number'},tokenizedEntitlements:0,canonicalisers:['stdtext1','stdnum1','stdtime1','stddate1'],discoveryError:null as string|null}};
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/catalog')&&url.searchParams.get('parent')?.endsWith('000000000003'))return route.fulfill({json:{nodes:[{id:element,label:'record_id',kind:'element',exposedType:'INTEGER',childCount:null,state:'undecided'}],nextCursor:null}});
  if(url.pathname.includes('/declarations')){
   if(state.loading)await new Promise(resolve=>setTimeout(resolve,800));
   if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Declarations are temporarily unavailable.',requestId:'test',retryable:true}}});
   if(url.pathname.includes('/schemas/'))return route.fulfill({json:{sourceId:source,schemaName:'public',qualifiedName:'warehouse.public',sourceTimezone:'America/Toronto',projectName:'Reporting',tokenizedInheritors:0}});
   if(route.request().method()==='PUT'){
    const body=route.request().postDataJSON() as typeof state.data.stored;state.writes.push(body);state.data.stored={tokenDomain:body.tokenDomain,caseInsensitive:body.caseInsensitive,sourceTimezone:body.sourceTimezone,epochUnit:body.epochUnit,canonId:body.canonId};
    state.data.effective={tokenDomain:body.tokenDomain??derivedTokenDomain({projectId:ProjectId(project),elementId:ElementId(element)}),caseInsensitive:false,sourceTimezone:body.sourceTimezone??'America/Toronto',epochUnit:body.epochUnit,canonId:body.canonId??(body.epochUnit?'stdtime1':'stdnum1'),mode:body.epochUnit?'timestamp':'number'};
   }
   return route.fulfill({json:state.data});
  }
  return route.fallback();
 });return state;
}
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test('DECL-001/002/003/004: drawer to declarations, defaults, first domain and confirmed atomic epoch edit',async({page})=>{
 const state=await declarations(page);await page.goto(`/projects/${project}/data-sources`);
 await page.getByRole('link',{name:'Explore schema',exact:true}).click();await expand(page);
 await page.getByRole('button',{name:'Declarations for record_id',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Token declarations',exact:true})).toBeVisible();await openDeclarations(page);
 await expect(page.getByText(/Stored: Not assigned. Effective: stdnum1 — derived from mode/)).toBeVisible();
 await expect(page.getByText(/Stored on element: Not declared. Schema declaration: America\/Toronto/)).toBeVisible();
 await expect(page.getByText(/Effective: Isolated — joins only this element/)).toBeVisible();
 await page.getByLabel('Token domain',{exact:true}).fill('customer');await expect(page.getByLabel(/Type project name/)).toHaveCount(0);
 await page.getByRole('button',{name:'Declare token domain',exact:true}).click();await expect(page.getByText('Declarations saved.',{exact:true})).toBeVisible();await openDeclarations(page);expect(state.writes[0]?.tokenDomain).toBe('customer');
 state.data.tokenizedEntitlements=2;state.data.stored.canonId='stdnum1';await page.reload();await openDeclarations(page);
 await page.getByLabel('Epoch unit',{exact:true}).selectOption('seconds');await expect(page.getByRole('alert')).toContainText('explicit canonicaliser stdnum1 conflicts');
 await expect(page.getByRole('button',{name:'Save declarations',exact:true})).toBeDisabled();
 await page.getByLabel('Canonicaliser',{exact:true}).selectOption('stdtime1');await expect(page.getByText(/Previously issued tokens will no longer match them/)).toBeVisible();
 await page.getByLabel('Type project name: Reporting',{exact:true}).fill('Reporting ');await expect(page.getByRole('button',{name:'Save declarations',exact:true})).toBeDisabled();
 await page.getByLabel('Type project name: Reporting',{exact:true}).fill('Reporting');await page.getByRole('button',{name:'Save declarations',exact:true}).click();await expect(page.getByText('Declarations saved.',{exact:true})).toBeVisible();await openDeclarations(page);expect(state.writes.at(-1)).toMatchObject({epochUnit:'seconds',canonId:'stdtime1',confirmation:'Reporting'});
 await page.getByRole('button',{name:'Edit schema timezone',exact:true}).click();await expect(page.getByRole('heading',{name:'Schema timezone declaration',exact:true})).toBeVisible();await accessible(page);
});
test('ISO-004: isolated domain stays behind a keyboard-accessible diagnostic disclosure',async({page})=>{
 const state=await declarations(page);await page.setViewportSize({width:390,height:1000});await page.goto(`/projects/${project}/catalog?elementId=${element}`);await openDeclarations(page);
 await expect(page.getByText(/Effective: Isolated — joins only this element/)).toBeVisible();
 const domain=page.getByText(state.data.effective.tokenDomain,{exact:true});await expect(domain).toBeHidden();
 const disclosure=page.getByRole('button',{name:'Show derived domain',exact:true});await expect(disclosure).toHaveAttribute('aria-expanded','false');const target=await disclosure.getAttribute('aria-controls');expect(target).toBeTruthy();const panel=page.locator(`[id="${target}"]`);await expect(panel).toBeHidden();await disclosure.focus();await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('aria-expanded','true');await expect(panel).toBeVisible();await expect(domain).toBeVisible();
 await expect(page.getByText('Derived from element identity. For token diagnostics.',{exact:true})).toBeVisible();await accessible(page);
 await disclosure.focus();await page.keyboard.press('Space');await expect(disclosure).toHaveAttribute('aria-expanded','false');await expect(panel).toBeHidden();await expect(domain).toBeHidden();expect(state.writes).toEqual([]);
});
test('ISO-004: first shared domain and return to isolation require confirmation when already tokenized',async({page})=>{
 const state=await declarations(page);state.data.tokenizedEntitlements=1;
 await page.goto(`/projects/${project}/catalog?elementId=${element}`);await openDeclarations(page);
 await expect(page.getByText(/Stored: Not declared. Effective: Isolated — joins only this element/)).toBeVisible();
 await page.getByLabel('Token domain',{exact:true}).fill('shared');
 await expect(page.getByText(domainMigrationConfirmation,{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Declare token domain',exact:true})).toBeDisabled();
 await page.getByLabel('Type project name: Reporting',{exact:true}).fill('Reporting');
 await page.getByRole('button',{name:'Declare token domain',exact:true}).click();await expect(page.getByText('Declarations saved.',{exact:true})).toBeVisible();await openDeclarations(page);
 expect(state.writes.at(-1)).toMatchObject({tokenDomain:'shared',confirmation:'Reporting'});
 await page.getByLabel('Token domain',{exact:true}).fill('');await expect(page.getByRole('button',{name:'Save declarations',exact:true})).toBeDisabled();
 await page.getByLabel('Type project name: Reporting',{exact:true}).fill('Reporting');await page.getByRole('button',{name:'Save declarations',exact:true}).click();await expect(page.getByText('Declarations saved.',{exact:true})).toBeVisible();await openDeclarations(page);
 await expect(page.getByText(/Stored: Not declared. Effective: Isolated — joins only this element/)).toBeVisible();
 expect(state.writes.at(-1)).toMatchObject({tokenDomain:null,confirmation:'Reporting'});await accessible(page);
});
test('DECL-009: deep-linked element survives unloaded tree; loading, error and retry states',async({page})=>{
 const state=await declarations(page);state.loading=true;await page.goto(`/projects/${project}/catalog?elementId=${element}`);await expect(page.getByText('Preparing this view',{exact:true}).first()).toBeVisible();await expect(page.getByRole('heading',{name:'Token declarations',exact:true})).toBeVisible();await openDeclarations(page);
 state.loading=false;state.error=true;await page.reload();await expect(page.getByText('Declarations are temporarily unavailable.',{exact:true})).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Token declarations',exact:true})).toBeVisible();await openDeclarations(page);await accessible(page);
});
for(const width of [390,900,1440])test(`DECL-009: declaration panel at ${width}`,{tag:'@visual'},async({page})=>{
 await declarations(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/catalog?elementId=${element}`);await openDeclarations(page);await expect(page.getByRole('heading',{name:'Token declarations',exact:true})).toBeVisible();await openDeclarations(page);await accessible(page);await capture(page,test.info(),`declarations-${width}.png`,{fullPage:true});
});
