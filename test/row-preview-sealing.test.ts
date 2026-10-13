import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {previewRows} from '../sidecar/execution/application/preview.js';
import {ExecutionQueue} from '../sidecar/execution/application/queue.js';
import type {StagingSource} from '../sidecar/execution/application/ports.js';
import {ok} from '../src/shared/kernel/index.js';
const observed=vi.hoisted(()=>({keys:[] as Uint8Array[]}));
vi.mock('../src/shared/infrastructure/sealed-cell.js',async original=>{
 const real=await original<typeof import('../src/shared/infrastructure/sealed-cell.js')>();
 return {...real,sealCell:(...args:Parameters<typeof real.sealCell>)=>{observed.keys.push(args[1]);return real.sealCell(...args);}};
});
for(const fail of [false,true])it(`Engine preview seals before its response and destroys its temporary key on ${fail?'failure':'success'}`,async()=>{
 observed.keys=[];const elementId=randomUUID(),sourceId=randomUUID();
 const request={requestId:randomUUID(),projectId:randomUUID(),poolId:randomUUID(),policyVersion:1,tokenKeyVersionSelected:null,sql:'SELECT 1',namespace:{catalog:'source',schema:'public'},sources:[{sourceId,credentialRef:'secret://preview/source'}],objects:[{catalog:'source',schema:'public',name:'records',sourceId,readPlan:{catalog:'source',schema:'public',object:'records',columns:[{elementId,sourceIdentifier:'secret',exposedName:'secret',exposedType:'VARCHAR',treatment:'custody',readAs:'native'}]}}],entitlements:[{elementId,treatment:'custody'}],aggregateMinGroupSize:5,limits:{memoryMb:64,threads:1,timeoutMs:10000,rowLimit:5,concurrency:1},entitlementContext:null,orderBy:['secret']};
 const source:StagingSource={estimate:async()=>ok(2),plain:async()=>{throw new Error('Preview must use the treatment boundary');},treated:async(scan,consume)=>{scan.preview!.scanned();scan.preview!.scanned();await consume([['PREVIEW_SENTINEL'],['PREVIEW_SENTINEL']]);if(fail)throw new Error('Source failed');return ok(undefined);}};
 const pending=previewRows(request,source,new ExecutionQueue());
 if(fail)await expect(pending).rejects.toThrow('Source failed');else{const result=await pending;expect(result.ok).toBe(true);if(result.ok){expect(result.value.rows).toHaveLength(2);expect(result.value.rows[0]![0]).toMatch(/^opintelsealed:v1:/);expect(result.value.rows[0]![0]).not.toBe(result.value.rows[1]![0]);expect(JSON.stringify(result)).not.toContain('PREVIEW_SENTINEL');}}
 expect(observed.keys).toHaveLength(2);expect(observed.keys.every(key=>key.every(byte=>byte===0))).toBe(true);
});
