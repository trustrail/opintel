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
it('agent and verification bundles start independently and contain their own worker only',async()=>{
 const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'opintel-separated-bundles-'));
 try{
  for(const target of ['agent-kit','demo-tools']){
   const directory=join(root,target);execFileSync(process.execPath,['scripts/engine-package/bundle.mjs',target,directory],{encoding:'utf8'});
   const manifest=JSON.parse(readFileSync(join(directory,'runtime-manifest.json'),'utf8'));
   if(target==='agent-kit'){
    expect(manifest.artifacts).toHaveProperty('scripts/agent/device-worker.mjs');expect(Object.keys(manifest.artifacts).some(name=>name.includes('verification'))).toBe(false);
    expect(execFileSync(process.execPath,[join(directory,'scripts/agent/main.js'),'--help'],{encoding:'utf8'})).toContain('query');
   }else{
    expect(manifest.artifacts).toHaveProperty('scripts/operator/device-worker.mjs');expect(Object.keys(manifest.artifacts).some(name=>name.startsWith('scripts/agent/'))).toBe(false);
    expect(execFileSync(process.execPath,[join(directory,'scripts/verification/steps/main.js'),'--help'],{encoding:'utf8'})).toContain('grant-access');
   }
  }
 }finally{rmSync(root,{force:true,recursive:true});}
},60000);
