import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DomainError,
  err,
  ok,
  TestClock,
  Timestamp,
} from '../src/shared/kernel/index.js';
import { withPlatform } from '../src/platform/db/scope.js';
import {
  LocalFileMailAdapter,
  MailOutbox,
  type MailPort,
  type OutboundMail,
} from '../src/platform/mail/index.js';

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

const databaseUrl = process.env.DATABASE_URL;
const databaseTestsRequired = process.env.REQUIRE_DB_TESTS === '1';
const databaseDescribe = databaseUrl === undefined && !databaseTestsRequired
  ? describe.skip
  : describe;

databaseDescribe('mail outbox with Postgres', () => {
  beforeEach(async () => {
    if (databaseUrl === undefined) {
      throw new Error('DATABASE_URL is required when REQUIRE_DB_TESTS=1.');
    }
    await withPlatform((tx) => tx.query('TRUNCATE TABLE mail_outbox'));
  });

  it('does not send mail enqueued in a rolled-back transaction', async () => {
    const outbox = new MailOutbox();
    const delivered: OutboundMail[] = [];

    await expect(withPlatform(async (tx) => {
      await outbox.enqueue(tx, mail);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');

    expect(await outbox.dispatchPending(successfulMailPort(delivered))).toEqual({ sent: 0, retained: 0 });
    expect(delivered).toEqual([]);
  });

  it('sends mail only after its transaction commits', async () => {
    const outbox = new MailOutbox();
    const delivered: OutboundMail[] = [];
    await withPlatform((tx) => outbox.enqueue(tx, mail));

    expect(await outbox.dispatchPending(successfulMailPort(delivered))).toEqual({ sent: 1, retained: 0 });
    expect(delivered).toEqual([mail]);
    const rows = await withPlatform((tx) => tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM mail_outbox WHERE dispatched_at IS NULL',
    ));
    expect(rows[0]?.count).toBe('0');
  });

  it('retains an outbox row when mail dispatch fails', async () => {
    const outbox = new MailOutbox();
    await withPlatform((tx) => outbox.enqueue(tx, mail));
    const failingMailPort: MailPort = {
      send: async () => err(new DomainError(
        'dependency_unavailable',
        'Mail provider is unavailable.',
        undefined,
        true,
      )),
    };

    expect(await outbox.dispatchPending(failingMailPort)).toEqual({ sent: 0, retained: 1 });
    const rows = await withPlatform((tx) => tx.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM mail_outbox WHERE dispatched_at IS NULL',
    ));
    expect(rows[0]?.count).toBe('1');
  });

  it('does not allow concurrent dispatchers to claim the same row', async () => {
    const outbox = new MailOutbox();
    await withPlatform((tx) => outbox.enqueue(tx, mail));
    const delivered: OutboundMail[] = [];
    let notifyFirstSend: (() => void) | undefined;
    const firstSendStarted = new Promise<void>((resolve) => {
      notifyFirstSend = resolve;
    });
    let releaseFirstSend: (() => void) | undefined;
    const allowFirstSend = new Promise<void>((resolve) => {
      releaseFirstSend = resolve;
    });
    const blockingMailPort: MailPort = {
      send: async (message) => {
        delivered.push({ ...message, vars: { ...message.vars } });
        notifyFirstSend?.();
        await allowFirstSend;
        return ok({
          providerId: 'local-test',
          acceptedAt: Timestamp(new Date('2026-09-15T00:00:00.000Z')),
        });
      },
    };

    const firstDispatch = outbox.dispatchPending(blockingMailPort);
    await firstSendStarted;
    const secondDispatch = await outbox.dispatchPending(successfulMailPort(delivered));
    releaseFirstSend?.();

    expect(await firstDispatch).toEqual({ sent: 1, retained: 0 });
    expect(secondDispatch).toEqual({ sent: 0, retained: 0 });
    expect(delivered).toHaveLength(1);
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
