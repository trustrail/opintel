import { Client } from 'pg';
import { migrateUp } from '../../../src/platform/db/migrate.js';
import { prepareSidecarDevelopment } from '../../sidecar-dev.js';
import { execFileSync } from 'node:child_process';

// Provisioning is outside the processes whose memory and writes are inspected.
const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
try { await db.connect(); await migrateUp(db); } finally { await db.end(); }
await prepareSidecarDevelopment('/control/tls-config');
// Synthetic test certificates only; the inspected target runs as nobody.
execFileSync('chmod', ['-R', 'a+rX', '/control/tls-config']);
