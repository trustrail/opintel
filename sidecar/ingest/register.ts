import { constants } from 'node:fs';
import { open, readdir, lstat, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { arrivalNoticeSchema, quarantineCategorySchema, landingReceiptSchema, landingStrategySchema, type ArrivalNotice, type ReconciliationReport } from '../../src/shared/landing-contract.js';
import type { RegisterDeliveryPort } from './landing-port.js';
import { ingestEvent, ingestErrorCategory } from './telemetry.js';
import { SecretRef } from '../../src/platform/secrets/types.js';
import type { FilingLander } from './land.js';
import { identifyFile, identificationRulesSchema, type PartyId, type FilingPartyRuleId, type FileExtractor, type FilingParty, type FilingPartyRule } from '../../src/modules/ingest/index.js';
import { ProjectId, SourceId, FilingId } from '../../src/shared/kernel/index.js';

export const landingZoneSchema = z.strictObject({
  projectId: z.uuid().transform(ProjectId), sourceId: z.uuid().transform(SourceId),
  directory: z.string().min(1), stateFile: z.string().min(1), rulesFile: z.string().min(1),
  landing: z.strictObject({ name: z.string().min(1), credentialRef: z.string().startsWith('secret://').min(10).transform(SecretRef), strategy: landingStrategySchema }).optional(),
  pollMs: z.number().int().min(10).max(60_000).default(1000),
});
export type LandingZone = z.infer<typeof landingZoneSchema>;
export const filingSchema = z.strictObject({
  id: z.uuid().transform(FilingId), sourceId: z.uuid().transform(SourceId), projectId: z.uuid().transform(ProjectId), path: z.string(), fingerprint: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), receivedAt: z.iso.datetime(),
  status: z.enum(['ready', 'quarantined', 'duplicate']), reason: z.string().nullable(), ruleIds: z.array(z.uuid().transform((id) => id as FilingPartyRuleId)),
  partyId: z.uuid().transform((id) => id as PartyId).nullable(), period: z.string().nullable(), kind: z.string().min(1).nullable(),
  extraction: z.strictObject({ sheet: z.string(), sheetIndex: z.number().int().positive(), headerRow: z.number().int().positive(), rowCount: z.number().int().nonnegative(),
    columns: z.array(z.strictObject({ name: z.string(), header: z.string().nullable(), type: z.enum(['TEXT', 'NUMERIC', 'BOOLEAN', 'DATE']) })) }).optional(),
  landing: z.strictObject({ receipt: landingReceiptSchema, registered: z.boolean(), error: z.string().nullable() }).optional(),
  revision: z.number().int().positive().optional(), deliveredRevision: z.number().int().nonnegative().optional(),
  partyCode: z.string().nullable().optional(), quarantineCategory: quarantineCategorySchema.nullable().optional(),
  strategy: landingStrategySchema.optional(),
  supersedes: z.uuid().transform(FilingId).nullable(), duplicateOf: z.uuid().transform(FilingId).nullable(),
});
export type WatchedFiling = z.infer<typeof filingSchema>;
const currentStateSchema = z.strictObject({ version: z.literal(2), sourceId: z.uuid(), projectId: z.uuid(), filings: z.array(filingSchema) });

// Read the historical on-disk format only at this migration boundary. Never
// reset arrival identity, hashes, duplicate links, or restatement history.
const legacyFilingSchema = filingSchema.omit({ partyId: true }).extend({
  cedantId: z.uuid().transform((id) => id as PartyId).nullable(),
}).transform(({ cedantId, ...filing }) => ({ ...filing, partyId: cedantId }));
const legacyStateSchema = currentStateSchema.extend({ version: z.literal(1), filings: z.array(legacyFilingSchema) });
const stateSchema = z.union([currentStateSchema, legacyStateSchema]);

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
export class FilingRegister {
  private reconciliationAttempts = 0;
  private reconciliationFailed = false;
  private reconciliationDelay = 30_000;
  private reconciliationTimer: ReturnType<typeof setTimeout> | undefined;
  private reconciliationWork: Promise<unknown> | undefined;
  private noticeAttempts = new Map<string, number>();
  private filings: WatchedFiling[] = [];
  private observed = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private tickWork: Promise<unknown> | undefined;
  private constructor(private readonly zone: LandingZone, private readonly warn: (error: unknown) => void, private readonly extractor?: FileExtractor, private readonly lander?: FilingLander, private readonly delivery?: RegisterDeliveryPort) {}

  static async open(input: LandingZone, warn?: (error: unknown) => void, extractor?: FileExtractor, lander?: FilingLander, delivery?: RegisterDeliveryPort): Promise<FilingRegister> {
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
    let scanAttempts = 0;
    const watcher = new FilingRegister(zone, warn ?? ((error: unknown) => ingestEvent({ event: 'ingest.scan_failed', sourceId: zone.sourceId, projectId: zone.projectId, errorCategory: ingestErrorCategory(error), attemptCount: ++scanAttempts })), extractor, lander, delivery);
    try {
      await watcher.rules();
      try {
        const state = stateSchema.parse(JSON.parse(await readFile(zone.stateFile, 'utf8')) as unknown);
        if (state.sourceId !== zone.sourceId || state.projectId !== zone.projectId) throw new Error('Landing state belongs to a different source.');
        watcher.filings = state.filings;
        if (state.version === 1) await watcher.persist(state.filings);
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
    const tick = () => { this.tickWork = this.scan().catch(this.warn).finally(() => { if (!this.stopped) this.timer = setTimeout(tick, this.zone.pollMs); }); };
    const reconcile = () => {
      this.reconciliationWork = this.reconcile().catch(() => undefined).finally(() => {
        if (this.stopped) return;
        const delay = this.reconciliationFailed ? this.reconciliationDelay : 30_000;
        this.reconciliationDelay = this.reconciliationFailed ? Math.min(delay * 2, 300_000) : 30_000;
        this.reconciliationTimer = setTimeout(reconcile, delay);
      });
    };
    // Recovery precedes scanning after restart, before new arrivals are processed.
    this.reconciliationTimer = setTimeout(reconcile, 0);
    this.timer = setTimeout(tick, 0);
  }
  scan(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const task = this.queue.then(() => this.scanOnce());
    this.queue = task.catch(() => undefined);
    return task;
  }
  async close(): Promise<void> {
    this.stopped = true; clearTimeout(this.timer); clearTimeout(this.reconciliationTimer);
    await Promise.all([this.tickWork, this.reconciliationWork]); await this.queue;
    await unlink(this.zone.stateFile + '.lock');
  }
  private async persist(filings: readonly WatchedFiling[]): Promise<void> {
    const state = { version: 2, sourceId: this.zone.sourceId, projectId: this.zone.projectId, filings };
    const temporary = this.zone.stateFile + '.next';
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, this.zone.stateFile);
    const directory = await open(dirname(this.zone.stateFile), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  private async save(filing: WatchedFiling): Promise<void> {
    filing.revision = 1;
    if (this.zone.landing) filing.strategy = this.zone.landing.strategy;
    await this.persist([...this.filings, filing]);
    this.filings.push(filing);
  }
  private async extract(filing: WatchedFiling, filingParties: FilingParty[], rules: FilingPartyRule[]): Promise<WatchedFiling> {
    if (!this.extractor || filing.status !== 'ready' || filing.extraction) return filing;
    const filingParty = filingParties.find((entry) => entry.id === filing.partyId && entry.projectId === filing.projectId);
    const rule = rules.find((entry) => entry.id === filing.ruleIds[0] && entry.projectId === filing.projectId);
    if (!filingParty || !rule) return { ...filing, status: 'quarantined', reason: 'The original attribution is no longer available for extraction.' };
    try {
      const result = await this.extractor.inspect(join(this.zone.directory, filing.path), filing.sha256, filingParty, rule);
      return result.ok ? { ...filing, extraction: result.value } : { ...filing, status: 'quarantined', reason: result.error.message };
    } catch { return { ...filing, status: 'quarantined', reason: 'Extraction failed for this file.' }; }
  }
  private async process(filing: WatchedFiling, filingParties: FilingParty[], rules: FilingPartyRule[]): Promise<WatchedFiling> {
    const extracted = filing.landing ? filing : await this.extract(filing, filingParties, rules);
    if (this.stopped) return extracted;
    return this.lander ? this.lander.process(extracted,
      filingParties.find((entry) => entry.id === filing.partyId && entry.projectId === filing.projectId),
      rules.find((entry) => entry.id === filing.ruleIds[0] && entry.projectId === filing.projectId)) : extracted;
  }
  private notice(filing: WatchedFiling): ArrivalNotice {
    return arrivalNoticeSchema.parse({ filingId: filing.id, sourceId: filing.sourceId, projectId: filing.projectId,
      fileSha256: filing.sha256, receivedAt: filing.receivedAt, revision: filing.revision ?? 1,
      outcome: filing.landing ? 'landed' : filing.status === 'ready' ? 'pending' : filing.status,
      partyCode: filing.landing?.receipt.partyCode ?? filing.partyCode ?? null, kind: filing.kind, period: filing.period,
      quarantineCategory: filing.status === 'quarantined' ? filing.quarantineCategory ?? category(filing.reason) : null });
  }
  private async publish(initialOnly = false): Promise<void> {
    if (!this.delivery) return;
    for (let index = 0; index < this.filings.length; index += 1) {
      if (this.stopped) return;
      const filing = this.filings[index]!;
      const notice = this.notice(filing);
      if (filing.deliveredRevision === notice.revision || (initialOnly && this.noticeAttempts.has(filing.id))) continue;
      const attemptCount = (this.noticeAttempts.get(filing.id) ?? 0) + 1;
      this.noticeAttempts.set(filing.id, attemptCount);
      const result = await this.delivery.notice(notice);
      if (result.ok) {
        this.noticeAttempts.delete(filing.id);
        const updated = [...this.filings]; updated[index] = { ...filing, deliveredRevision: notice.revision };
        await this.persist(updated); this.filings = updated;
      } else {
        this.reconciliationFailed = true;
        ingestEvent({ event: 'ingest.notice_failed', filingId: filing.id, sourceId: this.zone.sourceId, projectId: this.zone.projectId, errorCategory: ingestErrorCategory(result.error), attemptCount });
      }
    }
  }
  reconcile(): Promise<ReconciliationReport> {
    const task = this.queue.then(async () => {
      if (this.stopped) return { sourceId: this.zone.sourceId, zoneFileCount: 0, registeredCount: 0, unregisteredCount: 0, checkedAt: new Date().toISOString() };
      this.reconciliationFailed = false;
      this.reconciliationAttempts += 1;
      try {
        const report = await this.reconcileOnce();
        if (!this.reconciliationFailed) this.reconciliationAttempts = 0;
        return report;
      } catch (error) {
        this.reconciliationFailed = true;
        ingestEvent({ event: 'ingest.reconciliation_failed', sourceId: this.zone.sourceId, projectId: this.zone.projectId, errorCategory: ingestErrorCategory(error), attemptCount: this.reconciliationAttempts });
        throw error;
      }
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }
  private async reconcileOnce(): Promise<ReconciliationReport> {
    await this.recoverCommits();
    const { filingParties, rules } = await this.rules();
    // Resume the same durable arrivals after restart; never create a second register.
    for (let index = 0; index < this.filings.length; index += 1) {
      if (this.stopped) break;
      const current = this.filings[index]!;
      const extracted = current.landing ? current : await this.process(current, filingParties, rules);
      if (extracted.status === 'ready' && (extracted.reason || extracted.landing?.registered === false)) this.reconciliationFailed = true;
      if (JSON.stringify(extracted) !== JSON.stringify(current)) extracted.revision = (current.revision ?? 1) + 1;
      if (JSON.stringify(extracted) !== JSON.stringify(current)) {
        const updated = [...this.filings]; updated[index] = extracted;
        await this.persist(updated); this.filings = updated;
        if (extracted.status === 'quarantined') ingestEvent({ event: 'ingest.quarantined', sourceId: this.zone.sourceId, projectId: this.zone.projectId, filingId: extracted.id });
      }
    }
    if (this.lander) {
      for (let index = 0; index < this.filings.length; index += 1) {
        if (this.stopped) break;
        const current = this.filings[index]!;
        const reconciled = await this.lander.reconcile(current);
        if (reconciled.landing?.registered === false) this.reconciliationFailed = true;
        if (JSON.stringify(current) !== JSON.stringify(reconciled)) {
          const updated = [...this.filings]; updated[index] = { ...reconciled, revision: (current.revision ?? 1) + 1 };
          await this.persist(updated); this.filings = updated;
        }
      }
    }
    await this.publish();
    let zoneFileCount = 0; let registeredCount = 0;
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { await visit(path); continue; }
        zoneFileCount += 1;
        const stat = await lstat(path, { bigint: true });
        const fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
        const name = relative(this.zone.directory, path).split(sep).join('/');
        if (entry.isFile() && this.filings.some((filing) => filing.path === name && filing.fingerprint === fingerprint)) registeredCount += 1;
      }
    };
    await visit(this.zone.directory);
    const report = { sourceId: this.zone.sourceId, zoneFileCount, registeredCount, unregisteredCount: zoneFileCount - registeredCount, checkedAt: new Date().toISOString() };
    if (this.delivery && !this.stopped) {
      const result = await this.delivery.reconcile(report, this.zone.projectId);
      if (!result.ok) {
        this.reconciliationFailed = true;
        ingestEvent({ event: 'ingest.reconciliation_failed', sourceId: this.zone.sourceId, projectId: this.zone.projectId, errorCategory: ingestErrorCategory(result.error), attemptCount: this.reconciliationAttempts });
      }
    }
    return report;
  }
  retry(id: FilingId): Promise<void> {
    const task = this.queue.then(async () => {
      const index = this.filings.findIndex((entry) => entry.id === id);
      const current = this.filings[index];
      if (!current || current.status !== 'quarantined' || current.landing) throw new Error('Only a quarantined, unlanded filing can be retried.');
      const handle = await open(join(this.zone.directory, current.path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const hash = createHash('sha256');
        for await (const bytes of handle.createReadStream({ autoClose: false })) hash.update(bytes as Buffer);
        if (hash.digest('hex') !== current.sha256) throw new Error('The file has changed. Deliver it as a new arrival; retry cannot replace its bytes.');
      } finally { await handle.close(); }
      const { filingParties, rules } = await this.rules();
      const identified = identifyFile(current.projectId, basename(current.path), dirname(current.path) === '.' ? '' : dirname(current.path), filingParties, rules);
      const updated: WatchedFiling = { ...current, revision: (current.revision ?? 1) + 1, reason: null, quarantineCategory: null };
      delete updated.extraction;
      if (!identified.ok) { updated.reason = identified.error.message; updated.ruleIds = (identified.error.details?.ruleIds ?? []) as FilingPartyRuleId[]; }
      else {
        const value = identified.value;
        Object.assign(updated, { status: 'ready', partyId: value.partyId, partyCode: filingParties.find((party) => party.id === value.partyId)?.code ?? null,
          ruleIds: [value.ruleId], period: value.period, kind: value.kind });
        const duplicate = this.filings.find((entry) => entry.id !== id && entry.status !== 'quarantined' && entry.sha256 === current.sha256);
        if (duplicate) { updated.status = 'duplicate'; updated.duplicateOf = duplicate.duplicateOf ?? duplicate.id; }
        else updated.supersedes = this.filings.findLast((entry) => entry.id !== id && entry.status === 'ready' && entry.partyId === value.partyId && entry.period === value.period && entry.kind === value.kind)?.id ?? null;
      }
      const records = [...this.filings]; records[index] = updated;
      await this.persist(records); this.filings = records;
      await this.reconcileOnce();
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  private async recoverCommits(): Promise<void> {
    if (this.lander) {
      const committed = await this.lander.committed();
      if (!committed.ok) throw committed.error;
      if (committed.ok) {
        for (const receipt of committed.value) {
          const index = this.filings.findIndex((entry) => entry.id === receipt.filingId);
          const current = this.filings[index];
          if (current && !current.landing) {
            const updated = [...this.filings];
            updated[index] = { ...current, revision: (current.revision ?? 1) + 1, landing: { receipt, registered: false, error: null } };
            await this.persist(updated); this.filings = updated;
          }
        }
      }
    }
  }
  private async scanOnce(): Promise<void> {
    if (this.stopped) return;
    const { filingParties, rules } = await this.rules();
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (this.stopped) return;
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
        if (this.stopped) return;
        const identified = identifyFile(this.zone.projectId, basename(path), dirname(name) === '.' ? '' : dirname(name), filingParties, rules);
        const base: WatchedFiling = { id: FilingId(randomUUID()), sourceId: this.zone.sourceId, projectId: this.zone.projectId, path: name, fingerprint, sha256: digest,
          receivedAt: new Date().toISOString(), status: 'quarantined', reason: null, ruleIds: [], partyId: null, period: null, kind: null, supersedes: null, duplicateOf: null };
        if (!identified.ok) {
          base.reason = identified.error.message;
          base.ruleIds = (identified.error.details?.ruleIds ?? []) as FilingPartyRuleId[];
        } else {
          const value = identified.value;
          Object.assign(base, { partyId: value.partyId, period: value.period, kind: value.kind, ruleIds: [value.ruleId], partyCode: filingParties.find((party) => party.id === value.partyId)?.code ?? null, status: 'ready' });
          const duplicate = this.filings.find((filing) => filing.status !== 'quarantined' && filing.sha256 === digest);
          if (duplicate) { base.status = 'duplicate'; base.duplicateOf = duplicate.duplicateOf ?? duplicate.id; }
          else {
            base.supersedes = this.filings.findLast((filing) => filing.status === 'ready' && filing.partyId === value.partyId && filing.period === value.period && filing.kind === value.kind)?.id ?? null;
          }
        }
        // Register the arrival before opening the workbook. A crash during
        // extraction resumes this filing ID rather than registering it again.
        await this.save(base);
        if (this.stopped) return;
        const extracted = await this.process(base, filingParties, rules);
        if (extracted !== base) extracted.revision = (base.revision ?? 1) + 1;
        if (extracted !== base) {
          const updated = [...this.filings]; updated[updated.length - 1] = extracted;
          await this.persist(updated); this.filings = updated;
        }
        if (extracted.status === 'quarantined') ingestEvent({ event: 'ingest.quarantined', sourceId: this.zone.sourceId, projectId: this.zone.projectId, filingId: base.id });
      }
    };
    await visit(this.zone.directory);
    await this.publish(true);
  }
}

// Reasons stay in customer-local storage. Only these fixed categories cross
// either the HTTP or telemetry boundary; never forward a reason as a fallback.
function category(reason: string | null): ArrivalNotice['quarantineCategory'] {
  const value = reason ?? '';
  const categories: Array<[string, NonNullable<ArrivalNotice['quarantineCategory']>]> = [
    ['No filing party rule matched.', 'no_rule_matched'], ['Multiple filing party rules matched.', 'multiple_rules_matched'],
    ['Content disagrees with filename attribution ', 'verification_mismatch'], ['The verification column ', 'verification_mismatch'],
    ['No data rows are available to verify', 'verification_mismatch'],
    ['The original ', 'attribution_missing'], ['Extraction requires the existing active attribution.', 'attribution_missing'],
    ['The filing party must declare', 'locale_undeclared'], ['The declared header row contains a merged cell.', 'merged_header'],
    ['A formula has no cached value.', 'formula_uncached'], ['Period ', 'period_unparseable'],
    ['The declared sheet is absent.', 'sheet_absent'], ['The declared header row ', 'header_invalid'],
    ['Invalid identification rule.', 'rule_invalid'], ['The matching rule did not supply', 'rule_invalid'],
    ['Declare exactly one sheet', 'rule_invalid'], ['The header row must be declared', 'rule_invalid'],
    ['Content verification needs', 'rule_invalid'], ['CSV requires sheet_index', 'rule_invalid'],
  ];
  return categories.find(([prefix]) => value.startsWith(prefix))?.[1] ?? 'unreadable_format';
}
