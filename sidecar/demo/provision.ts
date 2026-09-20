import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, link, lstat, unlink, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DomainError, err, ok, type Result } from '../../src/shared/kernel/index.js';
import { provisionDemoPayload, type ProvisionDemoResponse } from '../../src/shared/demo-contract.js';
import { envelope } from '../../src/shared/sidecar-contract.js';
import { VaultRef } from '../../src/platform/vault/types.js';
import { identificationRulesSchema } from '../../src/modules/ingest/index.js';
import { filingSchema, type LandingZone } from '../ingest/register.js';
import { z } from 'zod';
import type { DemoWorkbookPort } from './workbook-port.js';
import { generateRows } from './generate.js';

// Only operator-configured zones and references are accepted. Provisioning does
// not connect to Postgres, create a database, store a secret, or call a watcher.
export class SpreadsheetDemoProvisioner {
  constructor(private readonly zones: readonly LandingZone[], private readonly target: { database: string; credentialRef: VaultRef }, private readonly writer: DemoWorkbookPort) {}
  async provision(body: unknown, signal?: AbortSignal): Promise<Result<ProvisionDemoResponse>> {
    const request = envelope.extend({ payload: provisionDemoPayload }).safeParse(body);
    if (!request.success) return err(new DomainError('validation_failed','Invalid demo provisioning request.'));
    const { payload, projectId, sourceId, credentialRef } = request.data;
    const zone = this.zones.find((candidate) => candidate.projectId === projectId && candidate.sourceId === sourceId && resolve(candidate.directory) === resolve(payload.landingZone ?? ''));
    if (!zone?.landing || credentialRef !== this.target.credentialRef || credentialRef !== zone.landing.credentialRef || !payload.generatorSpec.files?.length)
      return err(new DomainError('validation_failed','Spreadsheet demos require an operator-configured landing zone and credential.'));
    const files = payload.generatorSpec.files;
    const objects = payload.schemaSpec.schemas.flatMap((schema) => schema.objects);
    for (const file of files) {
      const matches = objects.filter((object) => object.name === `${file.party}_${file.kind}`);
      if (matches.length !== 1 || !payload.generatorSpec.rows[matches[0]!.name] || matches[0]!.kind !== 'table')
        return err(new DomainError('validation_failed','Each filing must name one declared party_kind table and row count.'));
    }
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    const lockPath = zone.stateFile + '.provision-lock';
    try {
      // The watcher has already established durable zone identity. Never reset it.
      const state = z.object({ projectId: z.literal(projectId), sourceId: z.literal(sourceId), filings: z.array(filingSchema) });
      const records = async () => state.parse(JSON.parse(await readFile(zone.stateFile,'utf8')) as unknown).filings;
      await records();
      lock = await open(lockPath,'wx',0o600);
      const staging = zone.stateFile + '.demo';
      await mkdir(staging,{ recursive: true, mode: 0o700 });
      const manifest = join(staging,'template.sha256');
      const signature = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      try {
        const handle = await open(manifest,'wx',0o600);
        try { await handle.writeFile(signature); await handle.sync(); } finally { await handle.close(); }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        if (await readFile(manifest,'utf8') !== signature) return err(new DomainError('conflict','This zone already has a different demo template.'));
      }
      const rules = identificationRulesSchema.parse(JSON.parse(await readFile(zone.rulesFile,'utf8')) as unknown);
      for (const file of files) {
        const party = rules.filingParties.find((entry) => entry.code === file.party && entry.projectId === projectId && entry.active);
        // Rules are deployment metadata, not inferred by the generator. Refuse
        // an inconsistent fixture rather than editing a customer's rule snapshot.
        if (!party || party.decimalSeparator !== file.decimalSeparator || party.dateFormat !== file.dateFormat)
          return err(new DomainError('validation_failed','The demo filing party locale must match its provisioned rule snapshot.'));
      }
      for (const file of files) {
        if (signal?.aborted) throw new Error('Cancelled');
        if (file.dependsOn) {
          while (!(await records()).some((record) => record.path === `${file.dependsOn}_${files.find((entry) => entry.id === file.dependsOn)!.period}.xlsx`)) {
            await delay(25,undefined,{ signal });
          }
        }
        const path = join(zone.directory, `${file.id}_${file.period}.xlsx`);
        const object = objects.find((entry) => entry.name === `${file.party}_${file.kind}`)!;
        const prepared = join(staging, `${file.id}_${file.period}.xlsx`);
        const exists = async (path: string) => lstat(path).then((stat) => {
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe delivery path');
          return true;
        },(error: unknown) => {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
          throw error;
        });
        if (!await exists(prepared)) {
          const temporary = prepared + '.next';
          try {
            await this.writer.write(temporary,file,object,generateRows(payload.generatorSpec,file,object));
            const handle = await open(temporary, constants.O_RDONLY | constants.O_NOFOLLOW);
            try { await handle.sync(); } finally { await handle.close(); }
            await link(temporary,prepared);
          } finally { await unlink(temporary).catch(() => undefined); }
        }
        if (await exists(path)) {
          if (!(await readFile(path)).equals(await readFile(prepared))) return err(new DomainError('conflict','A delivery path already contains different bytes.'));
          continue;
        }
        // Atomic no-replace publication. Cached artifacts make retries byte-identical;
        // the ordinary register remains the only authority on arrivals.
        if (signal?.aborted) throw new Error('Cancelled');
        // Keep the cached artifact on a separate inode: an operator correcting
        // a quarantined workbook must not change the original retry bytes.
        const delivery = prepared + '.delivery';
        try {
          await copyFile(prepared,delivery);
          const handle = await open(delivery,constants.O_RDONLY | constants.O_NOFOLLOW);
          try { await handle.sync(); } finally { await handle.close(); }
          await link(delivery,path);
        } finally { await unlink(delivery).catch(() => undefined); }
        const directory = await open(zone.directory,'r'); try { await directory.sync(); } finally { await directory.close(); }
      }
      return ok({ credentialRef: VaultRef(credentialRef), database: this.target.database });
    } catch {
      return err(new DomainError('dependency_unavailable','Demo delivery failed or was cancelled; existing arrivals remain available for retry.'));
    } finally { if (lock) { await lock.close(); await unlink(lockPath); } }
  }
}
