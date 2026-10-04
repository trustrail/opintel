import { writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { migrateUp } from '../../../src/platform/db/migrate.js';
import { prepareSidecarDevelopment } from '../../sidecar-dev.js';
import { execFileSync } from 'node:child_process';

// Provisioning is outside the processes whose memory and writes are inspected.
const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
try { await db.connect(); await migrateUp(db); } finally { await db.end(); }
await prepareSidecarDevelopment('/ingest/control/tls-config');
// Add the synthetic receipt host before publishing fixture readiness.
const tlsDirectory='/ingest/control/tls-config/tls';
await writeFile(tlsDirectory+'/client.ext', 'subjectAltName=DNS:localhost,DNS:receipt.opintel.test,IP:127.0.0.1\nextendedKeyUsage=serverAuth,clientAuth\n');
execFileSync('openssl', ['x509','-req','-in','client.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','client.pem','-days','30','-extfile','client.ext'], {cwd:tlsDirectory});
// Synthetic test certificates only; the inspected target runs as nobody.
execFileSync('chmod', ['-R', 'a+rX', '/ingest/control/tls-config']);

await writeFile('/ingest/control/provisioned', 'ready');
