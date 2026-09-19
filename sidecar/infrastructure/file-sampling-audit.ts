import { constants } from 'node:fs';
import { mkdir, open, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { SamplingAudit, SamplingAuditPort } from '../application/source-connector.js';

const eventSchema = z.strictObject({
  requestId: z.string(), projectId: z.uuid(), sourceId: z.uuid(), elementIds: z.array(z.uuid()),
  consentGiven: z.boolean(), outcome: z.enum(['started','completed','refused','failed']),
});
/** Durable, local metadata only. Append and fsync before acknowledging a record. */
export class FileSamplingAudit implements SamplingAuditPort {
  private pending: Promise<void> = Promise.resolve();
  private constructor(private readonly file: FileHandle) {}
  static async open(path: string): Promise<FileSamplingAudit> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const file = await open(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    return new FileSamplingAudit(file);
  }
  record(event: SamplingAudit): Promise<void> {
    const validated = eventSchema.parse(event);
    const line = JSON.stringify({ at: new Date().toISOString(), ...validated }) + '\n';
    const writing = this.pending.then(async () => { await this.file.writeFile(line); await this.file.sync(); });
    this.pending = writing.catch(() => {});
    return writing;
  }
  async close(): Promise<void> { await this.pending; await this.file.close(); }
}
