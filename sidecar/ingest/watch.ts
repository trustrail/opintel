import { constants } from 'node:fs';
import { open, readdir, lstat, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { identifyFile, identificationRulesSchema, type CedantId, type CedantFileRuleId, type FileExtractor, type Cedant, type CedantFileRule } from '../../src/modules/ingest/index.js';
import { ProjectId, SourceId, FilingId } from '../../src/shared/kernel/index.js';

export const landingZoneSchema = z.strictObject({
  projectId: z.uuid().transform(ProjectId), sourceId: z.uuid().transform(SourceId),
  directory: z.string().min(1), stateFile: z.string().min(1), rulesFile: z.string().min(1),
  pollMs: z.number().int().min(10).max(60_000).default(1000),
});
export type LandingZone = z.infer<typeof landingZoneSchema>;
const filingSchema = z.strictObject({
  id: z.uuid().transform(FilingId), sourceId: z.uuid().transform(SourceId), projectId: z.uuid().transform(ProjectId), path: z.string(), fingerprint: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), receivedAt: z.iso.datetime(),
  status: z.enum(['ready', 'quarantined', 'duplicate']), reason: z.string().nullable(), ruleIds: z.array(z.uuid().transform((id) => id as CedantFileRuleId)),
  cedantId: z.uuid().transform((id) => id as CedantId).nullable(), period: z.string().nullable(), kind: z.enum(['premium', 'claims', 'submission']).nullable(),
  extraction: z.strictObject({ sheet: z.string(), sheetIndex: z.number().int().positive(), headerRow: z.number().int().positive(), rowCount: z.number().int().nonnegative(),
    columns: z.array(z.strictObject({ name: z.string(), header: z.string().nullable(), type: z.enum(['TEXT', 'NUMERIC', 'BOOLEAN', 'DATE']) })) }).optional(),
  supersedes: z.uuid().transform(FilingId).nullable(), duplicateOf: z.uuid().transform(FilingId).nullable(),
});
export type WatchedFiling = z.infer<typeof filingSchema>;
const stateSchema = z.strictObject({ version: z.literal(1), sourceId: z.uuid(), projectId: z.uuid(), filings: z.array(filingSchema) });

export class MissingLandingStateError extends Error {
  constructor() {
    super('Landing state file is missing but the landing zone contains files. Startup refused: restore the history or have an operator confirm a genuine first run before initializing an empty zone.');
    this.name = 'MissingLandingStateError';
  }
}

async function containsFiles(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Do not follow symlinks or silently treat special entries as an empty zone.
    if (!entry.isDirectory() || await containsFiles(join(directory, entry.name))) return true;
  }
  return false;
}

// One serialized writer owns a zone. The durable ready records are the handoff
// to extraction (3.8). Quarantine is a terminal registration, never a handoff.
export class LandingWatcher {
  private filings: WatchedFiling[] = [];
  private observed = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private constructor(private readonly zone: LandingZone, private readonly warn: () => void, private readonly extractor?: FileExtractor) {}

  static async open(input: LandingZone, warn: () => void = () => console.warn('Landing zone scan failed; files remain unprocessed.'), extractor?: FileExtractor): Promise<LandingWatcher> {
    const zone = landingZoneSchema.parse(input);
    zone.directory = resolve(zone.directory); zone.stateFile = resolve(zone.stateFile); zone.rulesFile = resolve(zone.rulesFile);
    for (const file of [zone.stateFile, zone.rulesFile]) {
      if (file === zone.directory || file.startsWith(zone.directory + sep)) throw new Error('Landing metadata must be outside the watched directory.');
    }
    if (!(await lstat(zone.directory)).isDirectory()) throw new Error('Landing zone must be a directory.');
    await mkdir(dirname(zone.stateFile), { recursive: true, mode: 0o700 });
    // Exclusive ownership. After an unclean shutdown the operator removes the
    // stale lock only after confirming the previous process is no longer alive.
    const lock = zone.stateFile + '.lock';
    const owner = await open(lock, 'wx', 0o600);
    try { await owner.writeFile(String(process.pid)); await owner.sync(); } finally { await owner.close(); }
    const watcher = new LandingWatcher(zone, warn, extractor);
    try {
      await watcher.rules();
      try {
        const state = stateSchema.parse(JSON.parse(await readFile(zone.stateFile, 'utf8')) as unknown);
        if (state.sourceId !== zone.sourceId || state.projectId !== zone.projectId) throw new Error('Landing state belongs to a different source.');
        watcher.filings = state.filings;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        if (await containsFiles(zone.directory)) throw new MissingLandingStateError();
        // Establish the zone's project/source identity before accepting arrivals,
        // even when there is no filing to register yet.
        await watcher.persist([]);
      }
      return watcher;
    } catch (error) { await unlink(lock); throw error; }
  }

  private async rules() { return identificationRulesSchema.parse(JSON.parse(await readFile(this.zone.rulesFile, 'utf8')) as unknown); }
  records(): readonly WatchedFiling[] { return structuredClone(this.filings); }
  start(): void {
    if (this.timer !== undefined || this.stopped) return;
    const tick = () => { void this.scan().catch(this.warn).finally(() => { if (!this.stopped) this.timer = setTimeout(tick, this.zone.pollMs); }); };
    this.timer = setTimeout(tick, 0);
  }
  scan(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const task = this.queue.then(() => this.scanOnce());
    this.queue = task.catch(() => undefined);
    return task;
  }
  async close(): Promise<void> {
    this.stopped = true; clearTimeout(this.timer); await this.queue;
    await unlink(this.zone.stateFile + '.lock');
  }
  private async persist(filings: readonly WatchedFiling[]): Promise<void> {
    const state = { version: 1, sourceId: this.zone.sourceId, projectId: this.zone.projectId, filings };
    const temporary = this.zone.stateFile + '.next';
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, this.zone.stateFile);
    const directory = await open(dirname(this.zone.stateFile), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  private async save(filing: WatchedFiling): Promise<void> {
    await this.persist([...this.filings, filing]);
    this.filings.push(filing);
  }
  private async extract(filing: WatchedFiling, cedants: Cedant[], rules: CedantFileRule[]): Promise<WatchedFiling> {
    if (!this.extractor || filing.status !== 'ready' || filing.extraction) return filing;
    const cedant = cedants.find((entry) => entry.id === filing.cedantId && entry.projectId === filing.projectId);
    const rule = rules.find((entry) => entry.id === filing.ruleIds[0] && entry.projectId === filing.projectId);
    if (!cedant || !rule) return { ...filing, status: 'quarantined', reason: 'The original attribution is no longer available for extraction.' };
    try {
      const result = await this.extractor.inspect(join(this.zone.directory, filing.path), filing.sha256, cedant, rule);
      return result.ok ? { ...filing, extraction: result.value } : { ...filing, status: 'quarantined', reason: result.error.message };
    } catch { return { ...filing, status: 'quarantined', reason: 'Extraction failed for this file.' }; }
  }
  private async scanOnce(): Promise<void> {
    const { cedants, rules } = await this.rules();
    // Resume the same durable arrivals after restart; never create a second register.
    for (let index = 0; index < this.filings.length; index += 1) {
      const current = this.filings[index]!;
      const extracted = await this.extract(current, cedants, rules);
      if (extracted !== current) {
        const updated = [...this.filings]; updated[index] = extracted;
        await this.persist(updated); this.filings = updated;
        if (extracted.status === 'quarantined') console.info({ event: 'ingest.quarantined', filingId: extracted.id });
      }
    }
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) { await visit(path); continue; }
        if (!entry.isFile()) continue;
        const stat = await lstat(path, { bigint: true });
        const fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
        const name = relative(this.zone.directory, path).split(sep).join('/');
        if (this.filings.some((filing) => filing.path === name && filing.fingerprint === fingerprint)) continue;
        const previous = this.observed.get(name); this.observed.set(name, fingerprint);
        if (previous !== fingerprint) continue; // Two observations; never hash a changing delivery.
        const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        let digest: string;
        try {
          const before = await handle.stat({ bigint: true });
          if (!before.isFile() || before.ino !== stat.ino || before.dev !== stat.dev) continue;
          const hash = createHash('sha256');
          for await (const bytes of handle.createReadStream({ autoClose: false })) hash.update(bytes as Buffer);
          const after = await handle.stat({ bigint: true });
          if (after.size !== stat.size || after.mtimeNs !== stat.mtimeNs || after.ctimeNs !== stat.ctimeNs) continue;
          digest = hash.digest('hex');
        } finally { await handle.close(); }
        const identified = identifyFile(this.zone.projectId, basename(path), dirname(name) === '.' ? '' : dirname(name), cedants, rules);
        const base: WatchedFiling = { id: FilingId(randomUUID()), sourceId: this.zone.sourceId, projectId: this.zone.projectId, path: name, fingerprint, sha256: digest,
          receivedAt: new Date().toISOString(), status: 'quarantined', reason: null, ruleIds: [], cedantId: null, period: null, kind: null, supersedes: null, duplicateOf: null };
        if (!identified.ok) {
          base.reason = identified.error.message;
          base.ruleIds = (identified.error.details?.ruleIds ?? []) as CedantFileRuleId[];
        } else {
          const value = identified.value;
          Object.assign(base, { cedantId: value.cedantId, period: value.period, kind: value.kind, ruleIds: [value.ruleId], status: 'ready' });
          const duplicate = this.filings.find((filing) => filing.status !== 'quarantined' && filing.sha256 === digest);
          if (duplicate) { base.status = 'duplicate'; base.duplicateOf = duplicate.duplicateOf ?? duplicate.id; }
          else {
            base.supersedes = this.filings.findLast((filing) => filing.status === 'ready' && filing.cedantId === value.cedantId && filing.period === value.period && filing.kind === value.kind)?.id ?? null;
          }
        }
        // Register the arrival before opening the workbook. A crash during
        // extraction resumes this filing ID rather than registering it again.
        await this.save(base);
        const extracted = await this.extract(base, cedants, rules);
        if (extracted !== base) {
          const updated = [...this.filings]; updated[updated.length - 1] = extracted;
          await this.persist(updated); this.filings = updated;
        }
        if (extracted.status === 'quarantined') console.info({ event: 'ingest.quarantined', filingId: base.id, reasonCode: 'identification_or_extraction_refused', ruleIds: base.ruleIds });
      }
    };
    await visit(this.zone.directory);
  }
}
