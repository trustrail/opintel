import {expect,it,vi} from 'vitest';
import {QueryRelease} from '../src/modules/release-custody/infrastructure/query-release.js';
import {ReleaseRuntime} from '../src/modules/release-custody/index.js';
import {ProjectId,UserId} from '../src/shared/kernel/index.js';
import type {ReleaseProvider} from '../src/modules/release-custody/application/ports.js';
import type {ReleaseService} from '../src/modules/release-custody/application/service.js';
const ctx={projectId:ProjectId('00000000-0000-4000-8000-000000000001'),userId:UserId('00000000-0000-4000-8000-000000000002')};
it('refuses absent Engine shares before settings, provider access or key handling',async()=>{
 const escrow=vi.fn(),service={} as ReleaseService,provider={escrow} as unknown as ReleaseProvider;
 const release=new QueryRelease(provider,service,'https://app.invalid/redeem');
 expect(await release.seal(ctx,'alias','receipt',['value'],[['unsealed']],[0])).toMatchObject({ok:false,error:{code:'validation_failed',message:expect.stringContaining('custodyShares'),details:{cause:'missing_engine_custody_shares',input:'custodyShares'}}});
 expect(escrow).not.toHaveBeenCalled();
 // Runtime must reject before looking up a configured provider as well.
 expect(await new ReleaseRuntime().seal(ctx,'alias','receipt',['value'],[['unsealed']],[0])).toMatchObject({ok:false,error:{code:'validation_failed',details:{cause:'missing_engine_custody_shares'}}});
});
it('refuses malformed shares with a typed boundary error',async()=>{
 const release=new QueryRelease({} as ReleaseProvider,{} as ReleaseService,'https://app.invalid/redeem');
 expect(await release.seal(ctx,'alias','receipt',['value'],[['unsealed']],[0],{first:'bad',second:'bad'})).toMatchObject({ok:false,error:{code:'validation_failed',details:{cause:'invalid_engine_custody_shares',input:'custodyShares'}}});
});
