import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {sidecarConfigSchema} from './config.js';
import {certificatePin} from './certificate.js';
import {startupCheck} from './startup-check.js';

const help=`Opintel Engine certificate pin

  npm run sidecar:pin -- [CONFIG]
  node sidecar/pin-command.js [CONFIG]

Print the configured server certificate's SHA-256 fingerprint as 64 hex characters
for Settings → Engines. CONFIG defaults to SIDECAR_CONFIG_FILE, then
tmp/sidecar/service.json. This command reads only configuration and the public
certificate. It can run while the Engine is running; no stop or state lock is
needed. If certificate files were replaced, restart the Engine before updating
its pin: this command reads the file, not the running listener's loaded identity.
`;

async function main():Promise<void> {
  const args=process.argv.slice(2);
  if(args.length===1&&['--help','-h','help'].includes(args[0]!)){process.stdout.write(help);return;}
  if(args.length>1)throw new Error('Usage: npm run sidecar:pin -- [CONFIG]');
  const file=args[0]??process.env.SIDECAR_CONFIG_FILE??resolve('tmp/sidecar/service.json');
  const config=await startupCheck(`configuration file ${file}`,async()=>sidecarConfigSchema.parse(JSON.parse(await readFile(file,'utf8')) as unknown));
  const certificate=await startupCheck('TLS certFile',()=>readFile(resolve(dirname(file),config.tls.certFile),'utf8'));
  const pin=await startupCheck('TLS server certificate',()=>certificatePin(certificate));
  process.stdout.write(pin+'\n');
}
void main().catch((error:unknown)=>{
  process.stderr.write((error instanceof Error?`${error.name}: ${error.message}`:`${typeof error}: ${String(error)}`)+'\n');
  process.exitCode=1;
});
