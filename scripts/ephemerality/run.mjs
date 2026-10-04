import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reports = fileURLToPath(new URL('../../test-results/ephemerality/'+new Date().toISOString().replaceAll(':','-')+'/', import.meta.url));
mkdirSync(reports, { recursive: true });
process.env.S4_REPORT_DIRECTORY=reports;
console.info('Proof artifacts: '+reports);
const args = ['compose', '-p', 'opintel-s4', '-f', 'scripts/ephemerality/compose.yml'];
// Isolated disposable services. Never connects to the developer's databases.
try {
  const result = spawnSync('docker', [...args, 'up', '--build', '--abort-on-container-exit', '--exit-code-from', 'proof'], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
  const container = spawnSync('docker', [...args, 'ps', '-a', '-q', 'engine'], {cwd:root,encoding:'utf8'});
  if(container.status !== 0 || !container.stdout.trim()) throw new Error('Missing shipping engine container');
  const evidence = spawnSync('docker', ['inspect', container.stdout.trim()], {cwd:root,encoding:'utf8'});
  if(evidence.status !== 0) throw new Error('Cannot inspect engine runtime controls');
  const [details] = JSON.parse(evidence.stdout);
  const image = spawnSync('docker', ['image','inspect','opintel-engine:local','--format','{{.Id}}'], {cwd:root,encoding:'utf8'});
  if(image.status !== 0 || details.Image !== image.stdout.trim()) throw new Error('S4 target differs from shipping image');
  const mounts = details.Mounts.map(({Destination,RW})=>({destination:Destination,writable:RW}));
  const controls = {imageId:details.Image, shippingImageId:image.stdout.trim(), readOnlyRoot:details.HostConfig.ReadonlyRootfs,
    user:details.Config.User, capDrop:details.HostConfig.CapDrop, capAdd:details.HostConfig.CapAdd,
    memory:details.HostConfig.Memory, memorySwap:details.HostConfig.MemorySwap, ulimits:details.HostConfig.Ulimits,
    tmpfs:details.HostConfig.Tmpfs, mounts};
  if(!controls.readOnlyRoot || controls.user!=='65534:65534' || controls.memory<=0 || controls.memorySwap!==controls.memory ||
     !controls.capDrop?.includes('ALL') || (controls.capAdd?.length ?? 0)!==0 ||
     !controls.ulimits?.some(limit=>limit.Name==='core' && limit.Soft===0 && limit.Hard===0) ||
     !['/tmp','/dev/shm'].every(path=>controls.tmpfs[path]?.split(',').includes('ro')) ||
     mounts.some(mount=>mount.writable && !['/audit','/custody','/ingest'].includes(mount.destination))) throw new Error('Shipping container controls differ from the proof contract');
  writeFileSync(reports+'/shipping-runtime.json',JSON.stringify(controls,null,2)+'\n');
  if(result.status === 0) {
    for(const name of ['clear','treated','aggregate','cancel','deadline','source_failure','staging_failure','memory_pressure','application']) {
      const report = JSON.parse(readFileSync(reports+'/'+name+'.json','utf8'));
      if(report.status!=='VERIFIED' || report.failures.length || report.incomplete.length) throw new Error('Incomplete scenario: '+name);
    }
  }
} finally {
  const cleanup = spawnSync('docker', [...args, 'down', '--volumes'], { cwd: root, stdio: 'inherit' });
  if (cleanup.status !== 0) process.exitCode = 1;
}
