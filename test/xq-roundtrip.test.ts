import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {checkXqRoundTrips} from '../scripts/operator/xq-roundtrip.js';

const associations=[{certificateId:223,deviceName:'test-device',recipientIdentifier:'test-recipient'}];
it('requires 200 fresh exact share comparisons and leaves neither shares nor comparison digests in its result',async()=>{
 const digests=new Map<string,string>(),buffers:Uint8Array[]=[];
 const provider={async escrow(share:Uint8Array){buffers.push(share);const locator='synthetic-'+buffers.length;digests.set(locator,createHash('sha256').update(share).digest('hex'));return locator;},async revoke(){throw new Error('Successful single-use retrieval needs no revocation');}};
 const result=await checkXqRoundTrips(provider,associations,async(_association,locator,digest)=>({ok:digests.get(locator)===digest,status:200}));
 expect(result).toMatchObject({status:'passed',required:200,attempted:200,verified:200});
 expect(new Set(digests.values()).size).toBe(200);expect(new Set(result.attempts.map(attempt=>attempt.id)).size).toBe(200);
 for(const buffer of buffers)expect(buffer.every(value=>value===0)).toBe(true);
 for(const [locator,digest] of digests){expect(JSON.stringify(result)).not.toContain(locator);expect(JSON.stringify(result)).not.toContain(digest);}
});
it('fails 199/200, continues the required sample, and never retries a refused escrow',async()=>{
 let escrowCalls=0;
 const provider={async escrow(){if(++escrowCalls===7)throw {failure:{kind:'http_refused',subcall:'subscription',status:400,attempt:1}};return 'synthetic';},async revoke(){}};
 const result=await checkXqRoundTrips(provider,associations,async()=>({ok:true,status:200}));
 expect(escrowCalls).toBe(200);expect(result).toMatchObject({status:'failed',attempted:200,verified:199});
 expect(result.attempts[6]).toMatchObject({verified:false,failure:{kind:'http_refused',status:400,attempt:1}});
});
it('refuses a mismatched retrieved share and records failed cleanup',async()=>{
 let calls=0,revocations=0;
 const provider={async escrow(){return 'synthetic';},async revoke(){revocations++;throw new Error('unavailable');}};
 const result=await checkXqRoundTrips(provider,associations,async()=>({ok:++calls!==1,status:200}));
 expect(result).toMatchObject({status:'failed',attempted:200,verified:199});expect(revocations).toBe(1);
 expect(result.attempts[0]).toMatchObject({verified:false,fetchStatus:200,cleanupFailed:true});
});
