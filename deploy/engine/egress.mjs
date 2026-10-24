import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
// Explicit IP+port declarations. No DNS egress is granted. Operators provision
// stable addresses/extra_hosts and regenerate the policy when addresses change.
let startupPhase='policy_read';
async function main() {
if(process.env.EGRESS_DYNAMIC_CONFIG){startupPhase='controller_load';await (await import('../../sidecar/egress/infrastructure/controller.js')).startController(process.env.EGRESS_DYNAMIC_CONFIG,value=>{startupPhase=value;});return;}
const policy = JSON.parse(await readFile(process.argv[2], 'utf8'));
startupPhase='policy_validate';
if (!Array.isArray(policy.sources)) throw new Error('Declare a source endpoint list.');
const endpoints = [...policy.sources, ...(policy.receipt ? [policy.receipt] : [])];
for (const endpoint of endpoints) {
  if (typeof endpoint !== 'object' || endpoint === null || !isIP(endpoint.address) ||
      (endpoint.port !== undefined && (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535))) {
    throw new Error('Endpoints require an IP address and an optional valid TCP port.');
  }
}
startupPhase='firewall_apply';
for (const [command, version] of [['iptables', 4], ['ip6tables', 6]]) {
  const apply = (...args) => execFileSync(command, ['-w', ...args], { stdio: 'inherit' });
  // Install DROP first. An incomplete policy never exposes unrestricted egress.
  apply('-P', 'OUTPUT', 'DROP');
  apply('-F', 'OUTPUT');
  apply('-A', 'OUTPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT');
  // Docker's DNS proxy is expressly denied; loopback has no implicit exemption.
  apply('-A', 'OUTPUT', '-d', version === 4 ? '127.0.0.11' : '::ffff:127.0.0.11', '-j', 'DROP');
  for (const endpoint of endpoints.filter(endpoint => isIP(endpoint.address) === version)) {
    apply('-A', 'OUTPUT', '-p', 'tcp', '-d', endpoint.address, ...(endpoint.port === undefined ? [] : ['--dport', String(endpoint.port)]), '-j', 'ACCEPT');
  }
}
startupPhase='readiness_marker';
await writeFile('/run/egress-ready', 'ready\n');
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 60000);

}
void main().catch(() => {
  console.error({event:'engine.egress_startup_failed', phase:startupPhase, message:'Egress policy could not be installed.', withheld:['exception message','cause chain']});
  process.exit(1);
});
