// Explicitly invoked browser layout regression and manual captures. No historical pixels.
import {it,expect} from 'vitest';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const id='00000000-0000-4000-8000-000000000001',sourceId='00000000-0000-4000-8000-000000000002',at='2026-10-30T09:00:00Z';
const project={id,name:'Reinsurance demo',company:{id,name:'Customer'},industry:{id,name:'Reinsurance'},region:'us-east-1',role:'admin',firstReceiptAt:null};
const engine={id,name:'Engine 1',address:'https://engine.test',certificatePin:'review',contractVersion:3,verifiedAt:at,lastSeenAt:at,health:'healthy',healthMessage:null,custody:true,sources:[]};
const source={id:sourceId,engineId:id,name:'Claims warehouse',exposedAlias:'claims',kind:'postgres',origin:'customer',status:'connected',error:null,landingStrategy:null,filingCount:null,elementCount:8,unsupportedCount:0,undecidedCount:8,latestIntrospectionId:null,lastIntrospectedAt:at};
const needs=['timeoutSeconds','rowLimit','memoryMb','concurrency'].map(path=>({id:'setting:query.'+path,kind:'setting_required',title:path+' needs a value',count:1,targetRoute:`/projects/${id}/settings-query`,roles:['admin']}));
it('Welcome and Home have no horizontal scrolling at 390; tracker titles fit at 390 and 1440',async()=>{
 const vite=await createServer({configFile:'src/console-next/vite.config.ts',server:{host:'0.0.0.0',allowedHosts:['host.docker.internal']}});await vite.listen();
 const browser=await chromium.connect('ws://127.0.0.1:9324/',{exposeNetwork:'<loopback>'}),context=await browser.newContext({viewport:{width:1440,height:1180},reducedMotion:'reduce'}),page=await context.newPage();const directory='docs/review/console-backend/first-run-fixes-screenshots';await mkdir(directory,{recursive:true});let welcome=true,registered=false;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;let body:unknown={items:[],nextCursor:null};
  if(path==='/api/v1/projects')body={items:welcome?[]:[project],nextCursor:null};
  else if(path==='/api/v1/auth/me')body={email:'owner@example.test'};
  else if(path==='/api/v1/industries')body=[{id,slug:'reinsurance',name:'Reinsurance',description:null,inheritedTermCount:0,hasDemoPack:false}];
  else if(path==='/api/v1/companies')body={items:[{id,name:'Customer',role:'admin',projectCount:0}],nextCursor:null};
  else if(path.endsWith('/paired-engines'))body={items:[{id:'a'.repeat(64),name:'Engine 1'}]};
  else if(path.includes('/companies/')&&path.endsWith('/settings'))body={id,name:'Customer',defaultIndustryId:id,defaultRegion:'us-east-1',allowedDomains:[],idleTimeoutMins:60,ssoEnforced:false,enabledProviders:[]};
  else if(path.endsWith('/engines'))body={items:[engine],nextCursor:null};
  else if(path.endsWith('/sources/test'))body={reachable:false,reason:'Save and assign first. Connectivity is tested after policy acknowledgement.',schemas:[]};
  else if(path.endsWith('/sources')&&route.request().method()==='POST'){registered=true;body=source;}
  else if(path.endsWith('/sources'))body={items:registered?[source]:[],nextCursor:null};
  else if(path.endsWith('/stats'))body={asOf:at,utcDay:'2026-10-30',pools:0,sources:0,spectrum:{clear:0,tokenized:0,masked:0,aggregate_only:0,custody:0,withheld:0,undecided:0},requests:0,queries:0,prompts:0,refused:0,incomplete:0,connectedAgents:0,staleAgents:0};
  else if(path.endsWith('/runs/summary'))body={counts:{all:0,refused:0,incomplete:0,answerTreated:0},days:[],custody:[]};
  else if(path.endsWith('/needs-you'))body={items:needs,nextCursor:null};
  else if(path.endsWith('/health'))body={items:[]};
  else if(path.endsWith('/catalog'))body={nodes:[{id:sourceId,kind:'object',label:'records',childCount:8,rowEstimate:11,exposedType:null,state:'undecided'}],nextCursor:null};
  else if(path.endsWith('/stream')){await route.fulfill({status:200,contentType:'text/event-stream',body:'event: message\ndata: {"type":"snapshot","sequence":0}\n\n'});return;}
  await route.fulfill({json:body});
 });
 const capture=async(name:string,width=1440)=>{await page.setViewportSize({width,height:1180});await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});await page.screenshot({path:`${directory}/${width}-light-${name}.png`,animations:'disabled',fullPage:width===1440});};
 const noScroll=async()=>{const overflow=await page.evaluate(()=>({root:document.documentElement.scrollWidth,viewport:innerWidth,scrolling:[...document.querySelectorAll<HTMLElement>('body *')].filter(e=>e.clientWidth>0&&['auto','scroll'].includes(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1).map(e=>e.outerHTML.slice(0,100))}));expect(overflow.root).toBeLessThanOrEqual(overflow.viewport);expect(overflow.scrolling).toEqual([]);};
 try{
 await page.goto('http://host.docker.internal:5174/console-next/');await page.getByText('Engine 1 is already paired and joins this project').waitFor();await page.getByLabel('Project name').fill('Reinsurance demo');for(const width of [1440,390]){await capture('welcome',width);const labels=await page.locator('[data-welcome] li>strong').evaluateAll(elements=>elements.map(e=>({text:e.textContent,scroll:e.scrollWidth,width:e.clientWidth})));for(const label of labels)expect(label.scroll,label.text??'').toBeLessThanOrEqual(label.width);}await noScroll();
 welcome=false;await page.goto(`http://host.docker.internal:5174/console-next/?project=${id}`);await page.getByText('First hour · 2 of 6 done').waitFor();
 for(const width of [1440,390]){await capture('home-step3',width);if(width===390){await noScroll();for(const action of await page.locator('[data-needs-row] [data-row-action]').all()){const box=await action.boundingBox();expect(box).not.toBeNull();expect(box!.x+box!.width).toBeLessThanOrEqual(390);}}const titles=await page.locator('[data-first-hour] li>strong>span').evaluateAll(elements=>elements.map(e=>({text:e.textContent,scroll:e.scrollWidth,width:e.clientWidth})));expect(titles).toHaveLength(6);for(const title of titles)expect(title.scroll,title.text??'').toBeLessThanOrEqual(title.width);}
 await page.setViewportSize({width:1440,height:1180});await page.getByRole('button',{name:'Connect a source',exact:true}).click();await page.getByLabel('Source name').fill('Claims warehouse');await page.getByLabel('Stored reference name').fill('claims-db');await page.getByLabel('Engine',{exact:true}).selectOption(id);await page.getByLabel('Schemas to include').fill('public');await page.getByRole('button',{name:'Test reference'}).click();await page.getByText(/Save and assign first/).waitFor();expect(await page.getByText('reachable',{exact:true}).count()).toBe(0);await capture('connect-before-registration');
 await page.getByRole('button',{name:'Save and assign'}).click();await page.getByRole('button',{name:'Done',exact:true}).waitFor();await page.getByText('scanned just now · rows are estimates').waitFor();expect(await page.getByText('reachable',{exact:true}).count()).toBe(1);await capture('connect-after-scan');
 expect(errors).toEqual([]);await writeFile(`${directory}/capture.json`,JSON.stringify({fixture:'Deterministic endpoint response fixtures through the actual console application. No backend code changes. Not an archive acceptance run.',screenshots:['1440-light-welcome.png','390-light-welcome.png','1440-light-home-step3.png','390-light-home-step3.png','1440-light-connect-before-registration.png','1440-light-connect-after-scan.png'],phoneOverflowAssertions:'Welcome and Home: document and all horizontal scroll containers; visible Needs-you action; six untruncated tracker titles at both widths.',errors},null,2)+'\n');
 }finally{await context.close();await browser.close();await vite.close();}
});
