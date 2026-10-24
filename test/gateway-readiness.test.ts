import {afterEach,expect,it,vi} from 'vitest';
import {GatewayReadiness,readinessRoutes} from '../src/platform/http/readiness.js';
import {assertMigrationCompatibility} from '../src/platform/db/deployment-contract.js';

afterEach(()=>vi.useRealTimers());
it('DEP-008: startup compatibility requires known migrations and exact original checksums while accepting forward additions',()=>{
 const hash='a'.repeat(64),expected={'001_init.up.sql':hash};
 expect(()=>assertMigrationCompatibility(expected,[])).toThrow('pending');
 expect(()=>assertMigrationCompatibility(expected,[{version:'001',name:'init',checksum:'b'.repeat(64)}])).toThrow('checksums');
 expect(()=>assertMigrationCompatibility(expected,[{version:'001',name:'init',checksum:hash},{version:'002',name:'addition',checksum:hash}])).not.toThrow();
});
it('DEP-004: readiness names a failed dependency and declares its public permission',async()=>{
 const probe=new GatewayReadiness({PostgreSQL:async()=>{},Redis:async()=>{throw new Error('private diagnostic');},'SpiceDB schema':async()=>{}});
 expect(await probe.unavailable()).toEqual(['Redis']);
 expect(readinessRoutes(probe)[0]).toMatchObject({path:'/healthz',permission:'public'});
});
it('DEP-004: an unresponsive dependency stays bounded without accumulating probe connections',async()=>{
 vi.useFakeTimers();const database=vi.fn(()=>new Promise<void>(()=>{}));
 const readiness=new GatewayReadiness({PostgreSQL:database,Redis:async()=>{},'SpiceDB schema':async()=>{}},100);
 const first=readiness.unavailable();await vi.advanceTimersByTimeAsync(101);expect(await first).toEqual(['PostgreSQL']);
 const second=readiness.unavailable();await vi.advanceTimersByTimeAsync(101);expect(await second).toEqual(['PostgreSQL']);
 expect(database).toHaveBeenCalledTimes(1);
});
