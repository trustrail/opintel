import { FileCustody } from './custody/infrastructure/file-custody.js';
import { DevelopmentFileKeyStore,DevelopmentFileKeyEscrow } from './custody/infrastructure/development-file-keys.js';
import { foldingVersion } from './tokenize/unicode/folding.js';
import { SpreadsheetDemoProvisioner } from './demo/provision.js';
import { DemoWorkbookWriter } from './demo/infrastructure/workbook-writer.js';
import { FilingLander } from './ingest/land.js';
import { PostgresLanding } from './ingest/infrastructure/postgres-landing.js';
import { HttpsLandingReceipts } from './ingest/infrastructure/receipt-client.js';
import { resolve } from 'node:path';
import { SpreadsheetExtractor } from './ingest/extract.js';
import { LocalWorkbookReader } from './ingest/infrastructure/workbook-reader.js';
import { LandingWatcher, MissingLandingStateError } from './ingest/watch.js';
import { config as loadEnvironment } from 'dotenv';
import { EnvironmentSecretStore } from '../src/platform/secrets/index.js';
import { loadSidecarConfig } from './config.js';
import { createPostgresConnector } from './create-postgres-connector.js';
import { FileSamplingAudit } from './infrastructure/file-sampling-audit.js';
import { createSidecarServer } from './http/server.js';

async function main(): Promise<void> {
  console.info({event:'tokenization.unicode', runtime:process.versions.unicode, folding:foldingVersion});
  loadEnvironment({path:resolve('.env.sidecar.local')});
  const file = process.argv[2] ?? process.env.SIDECAR_CONFIG_FILE ?? resolve('tmp/sidecar/service.json');
  const {config,tls} = await loadSidecarConfig(file);
  const custody=config.custody?new FileCustody(await DevelopmentFileKeyStore.open(config.custody.keyStore),await DevelopmentFileKeyEscrow.open(config.custody.keyEscrow)):undefined;
  await custody?.sweep();
  const custodyTimer=setInterval(()=>{void custody?.sweep().catch(()=>console.warn({event:'custody.cleanup_failed',category:'storage'}));},60000);custodyTimer.unref();
  const audit = await FileSamplingAudit.open(config.auditFile);
  const host = createSidecarServer({config,tls,custody,demo: config.demo ? new SpreadsheetDemoProvisioner(config.landingZones ?? [],config.demo,new DemoWorkbookWriter()) : undefined,connector:createPostgresConnector({secrets:new EnvironmentSecretStore(),audit,limits:config.limits})});
  const watchers: LandingWatcher[] = [];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;clearInterval(custodyTimer);
    // This deadline covers the entire process, including watcher I/O and audit
    // flushing. exitCode alone cannot terminate a process with live handles.
    const deadline = setTimeout(() => {
      console.error('Sidecar shutdown deadline exceeded. Unfinished register locks require operator recovery.');
      process.exit(1);
    }, config.shutdownTimeoutMs);
    void Promise.all([host.close(), ...watchers.map((watcher) => watcher.close())])
      .then(() => audit.close())
      .then(() => { clearTimeout(deadline); process.exit(0); })
      .catch(() => { console.error('Sidecar shutdown failed.'); process.exit(1); });
  };
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
  try {
    for (const zone of config.landingZones ?? []) {
      if (!zone.landing || !config.receiptUrl) throw new Error('Landing requires a source strategy and receipt URL.');
      const source = { ...zone.landing, sourceId: zone.sourceId, projectId: zone.projectId };
      const writer = new PostgresLanding(new EnvironmentSecretStore(), config.limits.statementTimeoutMs);
      const connected = await writer.connect(source);
      if (!connected.ok) throw new Error(connected.error.message);
      const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
      const receipts = new HttpsLandingReceipts(config.receiptUrl, { ca: tls.ca, cert: tls.cert, key: tls.key, pinnedCertificate: tls.clientPin });
      const lander = new FilingLander(zone.directory, source, writer, extractor, receipts);
      watchers.push(await LandingWatcher.open(zone, undefined, extractor, lander, receipts));
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
}
void main().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : 'Sidecar startup failed.');process.exit(1);});
