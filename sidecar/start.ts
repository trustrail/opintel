import { FilingLander } from './ingest/land.js';
import { PostgresLanding } from './ingest/infrastructure/postgres-landing.js';
import { HttpsLandingReceipts } from './ingest/infrastructure/receipt-client.js';
import { resolve } from 'node:path';
import { SpreadsheetExtractor } from './ingest/extract.js';
import { LocalWorkbookReader } from './ingest/infrastructure/workbook-reader.js';
import { LandingWatcher, MissingLandingStateError } from './ingest/watch.js';
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
  const watchers: LandingWatcher[] = [];
  try {
    for (const zone of config.landingZones ?? []) {
      if (!zone.landing || !config.receiptUrl) throw new Error('Landing requires a source strategy and receipt URL.');
      const source = { ...zone.landing, sourceId: zone.sourceId, projectId: zone.projectId };
      const writer = new PostgresLanding(new DevelopmentVaultAdapter(), config.limits.statementTimeoutMs);
      const connected = await writer.connect(source);
      if (!connected.ok) throw new Error(connected.error.message);
      const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
      const receipts = new HttpsLandingReceipts(config.receiptUrl, { ca: tls.ca, cert: tls.cert, key: tls.key, pinnedCertificate: tls.clientPin });
      const lander = new FilingLander(zone.directory, source, writer, extractor, receipts);
      watchers.push(await LandingWatcher.open(zone, undefined, extractor, lander));
    }
    await host.listen();
    for (const watcher of watchers) watcher.start();
  } catch (error) {
    await Promise.all(watchers.map((watcher) => watcher.close()));
    await audit.close();
    if (error instanceof MissingLandingStateError) throw error;
    throw new Error('Sidecar startup failed. Check TLS, port, landing paths, rule snapshots and state locks.');
  }
  console.info('Sidecar ready.',{host:config.host,port:config.port});
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void Promise.all([host.close(), ...watchers.map((watcher) => watcher.close())]).then(()=>audit.close()).then(()=>{process.exitCode=0;}).catch(()=>{console.error('Sidecar shutdown failed.');process.exitCode=1;});
  };
  process.once('SIGTERM',stop); process.once('SIGINT',stop);
}
void main().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : 'Sidecar startup failed.');process.exitCode=1;});
