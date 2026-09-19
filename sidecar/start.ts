import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { DevelopmentVaultAdapter } from '../src/platform/vault/index.js';
import { loadSidecarConfig } from './config.js';
import { createPostgresConnector } from './create-postgres-connector.js';
import { FileSamplingAudit } from './infrastructure/file-sampling-audit.js';
import { createSidecarServer } from './http/server.js';

async function main(): Promise<void> {
  loadEnvironment({path:resolve('.env.sidecar.local')});
  const file = process.argv[2] ?? process.env.SIDECAR_CONFIG_FILE ?? resolve('tmp/sidecar/service.json');
  const {config,tls} = await loadSidecarConfig(file);
  const audit = await FileSamplingAudit.open(config.auditFile);
  const host = createSidecarServer({config,tls,connector:createPostgresConnector({vault:new DevelopmentVaultAdapter(),audit,limits:config.limits})});
  try { await host.listen(); } catch { await audit.close(); throw new Error('Sidecar could not listen. Check the configured host and port.'); }
  console.info('Sidecar ready.',{host:config.host,port:config.port});
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void host.close().then(()=>audit.close()).then(()=>{process.exitCode=0;}).catch(()=>{console.error('Sidecar shutdown failed.');process.exitCode=1;});
  };
  process.once('SIGTERM',stop); process.once('SIGINT',stop);
}
void main().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : 'Sidecar startup failed.');process.exitCode=1;});
