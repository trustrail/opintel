import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';
import {mockPools,poolPath,project,version,nextVersion,credential} from './pools-fixture.js';
for(const width of [390,900,1440])test(`Credential list: independent rotation and confirmed grant revocation at ${width}`,async({page})=>{
 const state=await mockPools(page),alias=`agent:${project}:${version}`,secondAlias=`agent:${project}:${nextVersion}`;
 state.detail.credentials=[{id:version,label:'Reporter',custodyAlias:alias,state:'active',lastUse:'2026-10-06T12:00:00Z'},{id:nextVersion,label:'Analyst',custodyAlias:secondAlias,state:'active',lastUse:null}];
 state.detail.keys=[{...state.detail.keys[0]!,credentialId:version,label:'Reporter',custodyAlias:alias},{...state.detail.keys[0]!,credentialId:nextVersion,keyVersion:nextVersion,label:'Analyst',custodyAlias:secondAlias}];
 let rotation:unknown,revocations=0;
 await page.route('**/keys/rotate',route=>{rotation=route.request().postDataJSON() as unknown;return route.fulfill({json:{...state.detail.keys[1],keyShown:true,key:credential}});});
 await page.route('**/credentials/revoke',route=>{
  const body=route.request().postDataJSON() as {credentialId:string;confirmedLiveGrants?:number};expect(body.credentialId).toBe(nextVersion);revocations++;
  if(body.confirmedLiveGrants!==3)return route.fulfill({status:409,json:{error:{code:'conflict',message:'Revoke 3 live grants and revoke this credential?',details:{cause:'credential_revocation',liveGrantCount:3},requestId:'test',retryable:false}}});
  state.detail.credentials![1]={...state.detail.credentials![1]!,state:'revoked'};
  return route.fulfill({json:{poolId:state.detail.id,credentialId:nextVersion,label:'Analyst',custodyAlias:secondAlias,state:'revoked',keyShown:false}});
 });
 await page.setViewportSize({width,height:1000});await page.goto(poolPath);
 const region=page.getByRole('region',{name:'Pool credentials',exact:true}),analyst=region.getByRole('row').filter({hasText:'Analyst'});
 await expect(region.getByRole('row')).toHaveCount(3);await expect(region).toContainText(alias);await expect(region).toContainText(secondAlias);
 await analyst.getByRole('button',{name:'Rotate key',exact:true}).click();await page.getByRole('button',{name:'Confirm rotation'}).click();expect(rotation).toEqual({projectId:project,credentialId:nextVersion});await page.getByRole('button',{name:'Copy key',exact:true}).click();await page.getByRole('button',{name:'I copied the key — dismiss'}).click();
 await analyst.getByRole('button',{name:'Revoke credential',exact:true}).click();await page.getByLabel('Type Analyst to confirm').fill('Analyst');await page.getByRole('button',{name:'Confirm credential revocation'}).click();
 await expect(page.getByRole('alert')).toHaveText('Revoke 3 live grants and revoke this credential?');await expect(page.getByRole('button',{name:'Confirm credential revocation'})).toBeDisabled();await page.getByRole('checkbox',{name:'Revoke 3 live grants and revoke this credential'}).check();await page.getByRole('button',{name:'Confirm credential revocation'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(analyst).toContainText('revoked');expect(revocations).toBe(2);
 await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
