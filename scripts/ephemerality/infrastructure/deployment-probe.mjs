import process from 'node:process';
import console from 'node:console';
import {setTimeout} from 'node:timers';
import { connect } from 'node:net';
import { request } from 'node:https';
import { readFile, writeFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
async function tcp(host, port) {
  return new Promise(resolve => {
    const socket = connect({ host, port });
    socket.setTimeout(1500);
    const finish = success => { socket.destroy(); resolve(success); };
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}
for (const path of ['/usr/bin/python3','/usr/bin/strace','/usr/bin/psql','/usr/bin/openssl','/work/node_modules/vitest/package.json']) {
  await assert.rejects(access(path), {code:'ENOENT'});
}
assert.equal(process.getuid(), 65534);
assert.match(await readFile('/proc/self/status', 'utf8'), /CapEff:\s+0+\n/u);
assert.match(await readFile('/proc/self/limits', 'utf8'), /Max core file size\s+0\s+0/u);
assert.equal((await readFile('/sys/fs/cgroup/memory.swap.max', 'utf8')).trim(), '0');
for (const path of ['/tmp/s5-write', '/dev/shm/s5-write', '/work/s5-write', '/s5-write']) {
  await assert.rejects(writeFile(path, 'forbidden'), error => ['EROFS','EACCES'].includes(error.code));
}
assert.equal(await tcp('source.opintel.test', 5432), true, 'declared source must be reachable');
assert.equal(await tcp('undeclared.opintel.test', 8444), false, 'undeclared host must be blocked');
assert.equal(await tcp('172.30.84.13', 8444), false, 'undeclared port must be blocked');
assert.equal(await tcp('1.1.1.1', 443), false, 'external undeclared host must be blocked');
assert.equal(await tcp('2606:4700:4700::1111', 443), false, 'IPv6 undeclared host must be blocked');
const base = '/ingest/control/tls-config/tls/';
const ca = await readFile(base+'ca.pem');
const cert = await readFile(base+'server.pem');
const key = await readFile(base+'server.key');
const status = await new Promise((resolve, reject) => {
  const req = request({ hostname: 'receipt.opintel.test', port: 8443, path: '/landing-receipt', method: 'POST', ca, cert, key, minVersion:'TLSv1.3', rejectUnauthorized:true, signal:globalThis.AbortSignal.timeout(5000)}, res => {res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error', reject); req.end('{"probe":"SD-005"}');
});
assert.equal(status, 204, 'declared receipt endpoint must reach the application');
// Start the shipped entry point too, under the same controls, with genuine mTLS.
const config = JSON.parse(await readFile('/ingest/control/tls-config/service.json', 'utf8'));
config.host = '127.0.0.1'; config.port = 3100; config.auditFile = '/audit/sampling.jsonl';
config.custody = {keyStore:'/custody/primary', keyEscrow:'/custody/escrow'};
delete config.demo;
for (const name of ['caFile','certFile','keyFile','clientPinFile']) config.tls[name] = '/ingest/control/tls-config/'+config.tls[name];
await writeFile('/ingest/control/shipping.json', JSON.stringify(config));
const child = spawn('node', ['sidecar/start.js', '/ingest/control/shipping.json'], {stdio:['ignore','pipe','pipe']});
const logs = []; child.stdout.on('data', data => logs.push(data.toString())); child.stderr.on('data', data => logs.push(data.toString()));
try {
  let ready = false;
  for(let attempt=0;attempt<100;attempt++) {
    if(child.exitCode !== null) throw Error('Shipping entry point failed: '+logs.join(''));
    if(logs.join('').includes('Opintel Engine ready.')) {ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready, true, 'shipping engine must start');
} finally { child.kill('SIGTERM'); await new Promise(resolve=>child.on('exit',resolve)); }
console.log(JSON.stringify({status:'VERIFIED', sourceReachable:true, undeclaredHostBlocked:true, undeclaredPortBlocked:true, receiptDelivered:true, forbiddenWritesBlocked:true, nonRoot:true, noCapabilities:true, noSwap:true, noCore:true, shippingStartup:true}));
