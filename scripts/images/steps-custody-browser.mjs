import {URLSearchParams} from 'node:url';
import {randomUUID} from 'node:crypto';
// Existing console API path using Playwright's normal cookie-authenticated client.
import {readFileSync,writeFileSync} from 'node:fs';
import {request} from 'playwright';
import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('/input/request.json','utf8')),cookie=readFileSync('/input/session','utf8').trim();
assert.match(cookie,/^opintel_session=[^;\s]+$/u);
const client=await request.newContext({ignoreHTTPSErrors:true,extraHTTPHeaders:{cookie,origin:config.base}});
async function api(path,method='GET',data){const reply=await client.fetch(config.base+path,{method,data,headers:{'content-type':'application/json','idempotency-key':randomUUID()}});assert.equal(reply.status(),200,`${method} ${path}: HTTP ${reply.status()}`);return reply.json();}
try{
 let result;
 if(config.operation==='prepare'){
  const base=`/api/v1/projects/${config.project}`,settings=(await api(base+'/settings')).settings;
  await api(base+'/settings','PATCH',{...settings,custody:{...settings.custody,provider:'xq',tenant:config.team,region:'us-east-1',grant_ttl:600}});
  const engines=(await api(base+'/engines')).items,engine=engines.find(e=>e.custody)??engines.find(e=>e.verifiedAt);assert.ok(engine,'No verified engine');if(!engine.custody)await api(base+`/engines/${engine.id}/custody`,'POST',{});
  const check=await api(base+'/custody-provider/check','POST',{});assert.ok(check.reachable&&check.authenticated&&!check.failure,'XQ provider check did not pass');
  const members=(await api(`/api/v1/pools/${config.pool}/entitlement-members?projectId=${config.project}&mode=name&decision=all&limit=100`)).items,field=members.find(m=>m.name==='custody_label');assert.ok(field,'Fixture custody column missing');assert.match(field.objectName,/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){2}$/u);
  await api(`/api/v1/pools/${config.pool}/entitlements/bulk`,'POST',{projectId:config.project,elementIds:[field.id],treatment:'custody',maskKind:null,justification:null});
  const identities=(await api(base+'/custody-identities?limit=100')).items;assert.ok(identities.some(i=>i.deviceName===config.deviceName),'Imported public identity not listed');for(const identity of identities)assert.deepEqual(Object.keys(identity).sort(),['certificateId','deviceName','recipientIdentifier']);
  result={status:'passed',operation:'prepare',sql:`SELECT id, custody_label FROM ${field.objectName} ORDER BY id`,provider:'xq',publicIdentitiesOnly:true};
 }else if(config.operation==='revoke'){
  const pool=await api(`/api/v1/pools/${config.pool}?projectId=${config.project}`),credential=pool.credentials.find(c=>c.label==='Custody terminal agent');assert.equal(credential?.xqIdentity?.deviceName,config.deviceName);assert.equal(credential?.xqIdentity?.certificateId,223);
  await api(`/api/v1/projects/${config.project}/releases/${config.grantId}/revoke`,'POST',{});
  const runs=(await api(`/api/v1/projects/${config.project}/runs?limit=100`)).items,run=runs.find(r=>r.id===config.receiptId);assert.ok(run,'Pending receipt missing');const detail=await api(`/api/v1/runs/${run.id}?`+new URLSearchParams({projectId:config.project,startedAt:run.startedAt}));assert.ok(detail.releaseEvents.some(e=>e.grantId===config.grantId&&e.kind==='revoked'),'Revocation event missing');
  result={status:'passed',operation:'revoke',grantId:config.grantId,receiptId:config.receiptId,revocationRecorded:true,credentialAssociationRecorded:true};
 }else throw new Error('Unknown custody acceptance operation');
 writeFileSync('/result/result.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
}finally{await client.dispose();}
