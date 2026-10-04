import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { z } from 'zod';
import { loadSidecarConfig } from '../config.js';
import { EnvironmentSecretStore } from '../../src/platform/secrets/index.js';
import { FilingId } from '../../src/shared/kernel/index.js';
import { FilingRegister } from './register.js';
import { PostgresLanding } from './infrastructure/postgres-landing.js';
import { HttpsLandingReceipts } from './infrastructure/receipt-client.js';
import { SpreadsheetExtractor } from './extract.js';
import { LocalWorkbookReader } from './infrastructure/workbook-reader.js';
import { FilingLander } from './land.js';

const help = `Opintel Engine local filing register

Stop Opintel Engine before using a local register command.
Use the same source ID and configuration that identify the landing zone.

  npm run sidecar:register -- list SOURCE_ID - [CONFIG]
  npm run sidecar:register -- show SOURCE_ID FILING_ID [CONFIG]
  npm run sidecar:register -- reconcile SOURCE_ID - [CONFIG]
  npm run sidecar:register -- retry SOURCE_ID FILING_ID [CONFIG]

Use show to inspect local filing detail. Correct the rule and re-export its
snapshot before retrying. Retry preserves the filing ID and re-runs validation.
Changed file contents require a new arrival. Restart Opintel Engine afterwards.
See sidecar/README.md, Filing register (3.10), for the operator procedure.
`;

async function main(): Promise<void> {
  loadEnvironment({ path: resolve('.env.sidecar.local'), quiet: true });
  const [command, source, filing, configFile] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(help);
    return;
  }
  if (!['list', 'show', 'retry', 'reconcile'].includes(command ?? '') || !z.uuid().safeParse(source).success)
    throw new Error('Usage: npm run sidecar:register -- list|show|retry|reconcile SOURCE_ID FILING_ID_OR_DASH [CONFIG]');
  const { config, tls } = await loadSidecarConfig(configFile ?? process.env.SIDECAR_CONFIG_FILE ?? resolve('tmp/sidecar/service.json'));
  const zone = config.landingZones?.find((entry) => entry.sourceId === source);
  if (!zone?.landing || !config.receiptUrl) throw new Error('The configured landing source does not exist.');
  const writer = new PostgresLanding(new EnvironmentSecretStore(), config.limits.statementTimeoutMs);
  const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
  const delivery = new HttpsLandingReceipts(config.receiptUrl, { ca: tls.ca, cert: tls.cert, key: tls.key, pinnedCertificate: tls.clientPin });
  const lander = new FilingLander(zone.directory, { ...zone.landing, projectId: zone.projectId, sourceId: zone.sourceId }, writer, extractor, delivery);
  const register = await FilingRegister.open(zone, undefined, extractor, lander, delivery);
  try {
    if (command === 'retry') await register.retry(FilingId(z.uuid().parse(filing)));
    const result = command === 'reconcile' ? await register.reconcile()
      : command === 'show' ? register.records().find((record) => record.id === FilingId(z.uuid().parse(filing)))
      : register.records();
    // Explicit local operator output, never a logger or trace exporter.
    process.stdout.write(JSON.stringify(result ?? null, null, 2) + '\n');
  } finally { await register.close(); }
}
void main().catch(() => {
  process.stderr.write('Register command failed. Check arguments, configuration, file availability and exclusive state ownership. Stop the watcher before using this command.\n');
  process.exitCode = 1;
});
