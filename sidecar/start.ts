import { startupCheck, StartupCheckError } from './startup-check.js';
import { StagedExecutor,PostgresStagingSource } from './execution/index.js';
import { PostgresSourceScope } from './infrastructure/postgres-source-scope.js';
import { DuckDBSessionEngine } from './session/index.js';
import { SidecarTokenizer,IanaZoneResolver } from './tokenize/index.js';
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
import { LandingWatcher } from './ingest/watch.js';
import { config as loadEnvironment } from 'dotenv';
import { EnvironmentSecretStore } from '../src/platform/secrets/index.js';
import { loadSidecarConfig } from './config.js';
import { createPostgresConnector } from './create-postgres-connector.js';
import { FileSamplingAudit } from './infrastructure/file-sampling-audit.js';
import { createSidecarServer,sidecarBuild } from './http/server.js';
import {certificatePin} from './certificate.js';

async function main(): Promise<void> {
  console.info({event:'tokenization.unicode', runtime:process.versions.unicode, folding:foldingVersion});
  loadEnvironment({path:resolve('.env.sidecar.local')});
  const file = process.argv[2] ?? process.env.SIDECAR_CONFIG_FILE ?? resolve('tmp/sidecar/service.json');
  const {config,tls} = await loadSidecarConfig(file);
  const custody=config.custody?new FileCustody(await startupCheck('custody key store', () => DevelopmentFileKeyStore.open(config.custody!.keyStore)),await startupCheck('custody key escrow', () => DevelopmentFileKeyEscrow.open(config.custody!.keyEscrow))):undefined;
  await startupCheck('custody cleanup', () => custody?.sweep());
  const custodyTimer=setInterval(()=>{void custody?.sweep().catch(()=>console.warn({event:'custody.cleanup_failed',category:'storage'}));},60000);custodyTimer.unref();
  const audit = await startupCheck(`audit file ${config.auditFile}`, () => FileSamplingAudit.open(config.auditFile));
  const secrets=new EnvironmentSecretStore(),scope=new PostgresSourceScope(secrets,config.limits);
  const execution=new StagedExecutor(new PostgresStagingSource(scope,new SidecarTokenizer(custody??secrets,new IanaZoneResolver())),r=>new DuckDBSessionEngine(undefined,undefined,config.postgresExtension,r.limits));
  const engineProbe=await startupCheck('query engine initialization', () => new DuckDBSessionEngine().open('privileged'));
  let queryEngineVersion:string;try{queryEngineVersion=await engineProbe.inspection!.build();}finally{engineProbe.close();}
  const host = createSidecarServer({config,tls,custody,execution,build:{...sidecarBuild,queryEngineVersion},demo: config.demo ? new SpreadsheetDemoProvisioner(config.landingZones ?? [],config.demo,new DemoWorkbookWriter()) : undefined,connector:createPostgresConnector({secrets,scope,audit,limits:config.limits})});
  const watchers: LandingWatcher[] = [];
  let stopping = false;
  let boundPort=config.port;
  const stop = () => {
    if (stopping) return;
    stopping = true;clearInterval(custodyTimer);
    // This deadline covers the entire process, including watcher I/O and audit
    // flushing. exitCode alone cannot terminate a process with live handles.
    const deadline = setTimeout(() => {
      console.error('Opintel Engine shutdown deadline exceeded. Unfinished register locks require operator recovery.');
      process.exit(1);
    }, config.shutdownTimeoutMs);
    void Promise.all([host.close(), ...watchers.map((watcher) => watcher.close())])
      .then(() => audit.close())
      .then(() => { clearTimeout(deadline); process.exit(0); })
      .catch(() => { console.error('Opintel Engine shutdown failed.'); process.exit(1); });
  };
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
  try {
    for (const zone of config.landingZones ?? []) {
      if (!zone.landing || !config.receiptUrl) throw new Error('Landing requires a source strategy and receipt URL.');
      const source = { ...zone.landing, sourceId: zone.sourceId, projectId: zone.projectId };
      const writer = new PostgresLanding(new EnvironmentSecretStore(), config.limits.statementTimeoutMs);
      const connected = await writer.connect(source);
      if (!connected.ok) throw new StartupCheckError(`landing database for project ${zone.projectId}, source ${zone.sourceId}`, connected.error.message);
      const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
      const receipts = new HttpsLandingReceipts(config.receiptUrl, { ca: tls.ca, cert: tls.cert, key: tls.key, pinnedCertificate: tls.clientPin });
      const lander = new FilingLander(zone.directory, source, writer, extractor, receipts);
      watchers.push(await startupCheck(`landing register for project ${zone.projectId}, source ${zone.sourceId}`, () => LandingWatcher.open(zone, undefined, extractor, lander, receipts)));
    }
    boundPort=await startupCheck(`HTTPS listener ${config.host}:${config.port}`, () => host.listen());
    for (const watcher of watchers) watcher.start();
  } catch (error) {
    await Promise.allSettled(watchers.map((watcher) => watcher.close()));
    await audit.close().catch(() => undefined);
    throw error;
  }
  console.info('Opintel Engine ready.',{host:config.host,port:boundPort,certificatePin:certificatePin(tls.cert)});
}
void startupCheck('startup initialization', main).catch((error:unknown)=>{console.error(error instanceof Error ? error.message : 'Opintel Engine startup failed.');process.exit(1);});
