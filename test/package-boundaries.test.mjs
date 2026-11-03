import {expect,it} from 'vitest';
import {assertPackageInputs} from '../scripts/engine-package/package-boundaries.mjs';
it.each(['api','engine','console','egress','migrations','provisioning'])('%s rejects misplaced agent and verification inputs',target=>{
 for(const file of ['scripts/agent/main.ts','scripts/operator/identity-import.ts','scripts/steps/infrastructure/device.ts','scripts/verification/steps/main.ts','scripts/operator/demo.ts','scripts/operator/reinsurance.ts','scripts/soak/agent.ts'])expect(()=>assertPackageInputs(target,[file])).toThrow('Package boundary');
 expect(()=>assertPackageInputs(target,['src/shared/api/mcp.ts'])).not.toThrow();
});
it('agent and verification entrypoints cannot cross package ownership',()=>{
 expect(()=>assertPackageInputs('agent-kit',['scripts/verification/steps/main.ts'])).toThrow();expect(()=>assertPackageInputs('demo-tools',['scripts/agent/main.ts'])).toThrow();
 expect(()=>assertPackageInputs('agent-kit',['scripts/agent/main.ts','scripts/steps/infrastructure/device.ts'])).not.toThrow();
});
