import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DomainError,
  err,
  ok,
  TestClock,
  Timestamp,
  type JsonObject,
} from '../src/shared/kernel/index.js';
import { type Tx } from '../src/platform/db/scope.js';
import {
  LocalFileMailAdapter,
  MailOutbox,
  type MailPort,
  type OutboundMail,
} from '../src/platform/mail/index.js';

type StoredMail = OutboundMail & {
  dispatchedAt?: string;
  providerId?: string;
};

function asJsonObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('mail vars must be an object');
  }
  return value as JsonObject;
}

class TransactionalMailDatabase {
  private readonly rows: StoredMail[] = [];

  async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const inserted: StoredMail[] = [];
    const dispatched = new Map<string, Pick<StoredMail, 'dispatchedAt' | 'providerId'>>();
    const tx: Tx = {
      query: async <Row>(statement: string, params?: readonly unknown[]): Promise<Row[]> => {
        if (statement.includes('INSERT INTO mail_outbox')) {
          const [to, template, vars, idempotencyKey] = params ?? [];
          if (
            typeof to !== 'string'
            || typeof template !== 'string'
            || typeof vars !== 'string'
            || typeof idempotencyKey !== 'string'
          ) {
            throw new Error('invalid outbox insert');
          }
          if (!this.rows.some((row) => row.idempotencyKey === idempotencyKey)
            && !inserted.some((row) => row.idempotencyKey === idempotencyKey)) {
            inserted.push({
              to,
              template: template as OutboundMail['template'],
              vars: asJsonObject(JSON.parse(vars) as unknown),
              idempotencyKey,
            });
          }
          return [];
        }
        if (statement.includes('FROM mail_outbox')) {
          const limit = params?.[0];
          if (typeof limit !== 'number') throw new Error('invalid outbox limit');
          return this.rows
            .filter((row) => row.dispatchedAt === undefined)
            .slice(0, limit) as unknown as Row[];
        }
        if (statement.includes('UPDATE mail_outbox')) {
          const [idempotencyKey, dispatchedAt, providerId] = params ?? [];
          if (
            typeof idempotencyKey !== 'string'
            || typeof dispatchedAt !== 'string'
            || typeof providerId !== 'string'
          ) {
            throw new Error('invalid outbox dispatch update');
          }
          dispatched.set(idempotencyKey, { dispatchedAt, providerId });
          return [];
        }
        throw new Error(`unexpected SQL: ${statement}`);
      },
    };

    const result = await work(tx);
    this.rows.push(...inserted);
    for (const row of this.rows) {
      const update = dispatched.get(row.idempotencyKey);
      if (update !== undefined) Object.assign(row, update);
    }
    return result;
  }

  pendingCount(): number {
    return this.rows.filter((row) => row.dispatchedAt === undefined).length;
  }
}

const mail: OutboundMail = {
  to: 'person@example.com',
  template: 'magic_link',
  vars: { link: 'https://example.com/magic-link' },
  idempotencyKey: 'magic-link:person@example.com:nonce',
};

function successfulMailPort(delivered: OutboundMail[]): MailPort {
  return {
    send: async (message) => {
      delivered.push({ ...message, vars: { ...message.vars } });
      return ok({
        providerId: 'local-test',
        acceptedAt: Timestamp(new Date('2026-09-15T00:00:00.000Z')),
      });
    },
  };
}

describe('mail outbox', () => {
  it('does not send mail enqueued in a rolled-back transaction', async () => {
    const database = new TransactionalMailDatabase();
    const outbox = new MailOutbox(database.transaction.bind(database));
    const delivered: OutboundMail[] = [];

    await expect(database.transaction(async (tx) => {
      await outbox.enqueue(tx, mail);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');

    expect(await outbox.dispatchPending(successfulMailPort(delivered))).toEqual({ sent: 0, retained: 0 });
    expect(delivered).toEqual([]);
  });

  it('sends mail only after its transaction commits', async () => {
    const database = new TransactionalMailDatabase();
    const outbox = new MailOutbox(database.transaction.bind(database));
    const delivered: OutboundMail[] = [];

    await database.transaction((tx) => outbox.enqueue(tx, mail));

    expect(await outbox.dispatchPending(successfulMailPort(delivered))).toEqual({ sent: 1, retained: 0 });
    expect(delivered).toEqual([mail]);
    expect(database.pendingCount()).toBe(0);
  });

  it('retains an outbox row when mail dispatch fails', async () => {
    const database = new TransactionalMailDatabase();
    const outbox = new MailOutbox(database.transaction.bind(database));
    await database.transaction((tx) => outbox.enqueue(tx, mail));
    const failingMailPort: MailPort = {
      send: async () => err(new DomainError(
        'dependency_unavailable',
        'Mail provider is unavailable.',
        undefined,
        true,
      )),
    };

    expect(await outbox.dispatchPending(failingMailPort)).toEqual({ sent: 0, retained: 1 });
    expect(database.pendingCount()).toBe(1);
  });
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('local file mail adapter', () => {
  it('writes a message and logs its file URL', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'opintel-mail-'));
    temporaryDirectories.push(directory);
    const urls: URL[] = [];
    const adapter = new LocalFileMailAdapter(
      directory,
      new TestClock(new Date('2026-09-15T00:00:00.000Z')),
      (url) => urls.push(url),
    );

    const result = await adapter.send(mail);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(urls.map((url) => url.toString())).toEqual([result.value.providerId]);
    expect(await readFile(fileURLToPath(result.value.providerId), 'utf8')).toContain(mail.to);
  });
});
