import process from 'node:process';
import {URL} from 'node:url';
import {setTimeout} from 'node:timers';
const {fetch}=globalThis;
// Acceptance driver only: no routes, API mocks, source server or fixture login.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('/acceptance/browser.json','utf8'));
const restore=process.argv[2]==='restore';
let phase='launch';
const browser=await chromium.launch({args:['--no-sandbox']});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,deviceScaleFactor:2,...(restore?{storageState:'/acceptance/browser-state.json'}:{})});
 const page=await context.newPage();
 let pageErrors=0;page.on('pageerror',()=>pageErrors++);
 phase='index-assets';const index=await context.request.get(config.base+'/sign-in');assert.equal(index.status(),200);
 const html=await index.text(),assets=[...html.matchAll(/(?:src|href)="(\/[^"#]+)"/gu)].map(m=>m[1]);assert.ok(assets.length);
 for(const asset of assets){const response=await context.request.get(config.base+asset);assert.equal(response.status(),200,'Built index asset unavailable');}
 if(!restore){
  const messages=await (await fetch(config.mail+'/api/v1/messages')).json();const before=new Set(messages.messages.map(m=>m.ID));
  phase='sign-in';await page.goto(config.base+'/sign-in');
  await page.getByAltText('Opintel',{exact:true}).waitFor();
  const imagePaths=await page.locator('img').evaluateAll(images=>images.flatMap(image=>[image.getAttribute('src'),...(image.getAttribute('srcset')??'').split(',').map(part=>part.trim().split(' ')[0])]).filter(Boolean));
  for(const imagePath of imagePaths)assert.equal((await context.request.get(new URL(imagePath,config.base).href)).status(),200,'Sign-in image unavailable');
  await page.screenshot({path:'/acceptance/sign-in.png'});
  await page.getByLabel('Email address').fill(config.email);await page.getByRole('button',{name:'Continue with email',exact:true}).click();
  await page.getByRole('heading',{name:'Check your email'}).waitFor();
  phase='smtp-message';let mail;
  for(let i=0;i<60&&!mail;i++){
   const list=await (await fetch(config.mail+'/api/v1/messages')).json();const match=list.messages.find(m=>!before.has(m.ID)&&m.To.some(to=>to.Address===config.email));
   if(match)mail=await (await fetch(config.mail+'/api/v1/message/'+match.ID)).json();else await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(mail,'SMTP magic link missing');const match=mail.Text.match(/https:\/\/[^\s<>]+/u);assert.ok(match);
  phase='callback';const url=new URL(match[0]);await page.goto(config.base+url.pathname+url.search);
  await page.waitForURL(url=>!url.pathname.startsWith('/auth/')&&!url.pathname.startsWith('/sign-in'));
 }
 phase='dashboard';await page.goto(config.base+'/projects/'+config.projectId+'/dashboard');
 await page.getByRole('heading',{name:'Stage4 reinsurance',exact:true}).waitFor();
 assert.equal((await context.request.get(config.base+'/api/v1/auth/me')).status(),200);assert.equal(pageErrors,0);
 await page.screenshot({path:'/acceptance/dashboard-'+(restore?'restored':'initial')+'.png'});
 await context.storageState({path:'/acceptance/browser-state.json'});
 writeFileSync('/acceptance/browser-'+(restore?'restored':'initial')+'.json',JSON.stringify({status:'passed',builtIndexAssets:assets.length,authenticatedDashboard:true,pageErrors,smtpCallback:!restore}),{mode:0o600});
}catch{process.stderr.write('Packaged browser acceptance failed at '+phase+'; no authentication material logged.\n');process.exitCode=1;}finally{await browser.close();}
