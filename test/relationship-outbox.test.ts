import { resetDatabaseBeforeEach } from './database-fixture.js';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationPort, RelationshipUpdate, ZedToken } from '../src/modules/authz/index.js';
import { RelationshipOutbox } from '../src/modules/tenancy/index.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { UserId } from '../src/shared/kernel/index.js';

const databaseDescribe = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1'
  ? describe.skip
  : describe;

const token = 'relationship-outbox-test-token' as ZedToken;

function authorizationStub() {
  const write = vi.fn<AuthorizationPort['write']>().mockResolvedValue(token);
  const unexpectedCall = async (): Promise<never> => {
    throw new Error('Only AuthorizationPort.write should be called.');
  };
  const authorization: AuthorizationPort = {
    write,
    check: unexpectedCall,
    checkMany: unexpectedCall,
    explain: unexpectedCall,
  };
  return { authorization, write };
}

function relationship(): RelationshipUpdate {
  return {
    operation: 'touch',
    resource: { type: 'company', id: randomUUID() },
    relation: 'admin',
    subject: { type: 'user', id: UserId(randomUUID()) },
  };
}

function storedEntries(id: bigint) {
  return withPlatform((tx) => tx.query<{
    written_at: Date | null;
    zed_token: string | null;
    attempts: number;
    last_error: string | null;
  }>(
    'SELECT written_at, zed_token, attempts, last_error FROM relationship_outbox WHERE id = $1',
    [id.toString()],
  ));
}

databaseDescribe('relationship outbox with Postgres', () => {
  resetDatabaseBeforeEach('relationship_outbox');
  beforeEach(() => {
    if (process.env.DATABASE_URL === undefined) {
      throw new Error('DATABASE_URL is required when REQUIRE_DB_TESTS=1.');
    }
  });

  it('never writes an entry from a rolled-back transaction to SpiceDB', async () => {
    const outbox = new RelationshipOutbox();
    const { authorization, write } = authorizationStub();
    let id: bigint | undefined;

    await expect(withPlatform(async (tx) => {
      id = await outbox.enqueue(tx, relationship());
      throw new Error('rollback');
    })).rejects.toThrow('rollback');

    if (id === undefined) throw new Error('Expected an outbox id before rollback.');
    expect(await outbox.dispatchOne(authorization, id)).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(await storedEntries(id)).toEqual([]);
  });

  it('writes a committed entry to SpiceDB and retains its returned ZedToken', async () => {
    const outbox = new RelationshipOutbox();
    const { authorization, write } = authorizationStub();
    const update = relationship();
    const id = await withPlatform((tx) => outbox.enqueue(tx, update));

    expect(write).not.toHaveBeenCalled();
    expect(await outbox.dispatchOne(authorization, id)).toBe(token);
    expect(write).toHaveBeenCalledExactlyOnceWith([update]);
    expect(await storedEntries(id)).toEqual([{
      written_at: expect.any(Date),
      zed_token: token,
      attempts: 1,
      last_error: null,
    }]);
  });

  it('retains a failed entry unwritten and successfully retries it', async () => {
    const outbox = new RelationshipOutbox();
    const { authorization, write } = authorizationStub();
    const update = relationship();
    const failure = new Error('SpiceDB unavailable');
    write.mockRejectedValueOnce(failure);
    const id = await withPlatform((tx) => outbox.enqueue(tx, update));

    await expect(outbox.dispatchOne(authorization, id)).rejects.toBe(failure);
    expect(write).toHaveBeenCalledExactlyOnceWith([update]);
    expect(await storedEntries(id)).toEqual([{
      written_at: null,
      zed_token: null,
      attempts: 1,
      last_error: 'SpiceDB write failed.',
    }]);

    expect(await outbox.dispatchOne(authorization, id)).toBe(token);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith([update]);
    expect(await storedEntries(id)).toEqual([{
      written_at: expect.any(Date),
      zed_token: token,
      attempts: 2,
      last_error: null,
    }]);
  });
});
