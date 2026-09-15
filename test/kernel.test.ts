import { describe, expect, it } from 'vitest';
import {
  CompanyId,
  DemoSourceId,
  DomainError,
  DuckDbName,
  ElementId,
  err,
  FilingId,
  IndustryId,
  IndustrySlug,
  InvariantViolation,
  InviteId,
  ObjectId,
  ok,
  PoolId,
  PoolKey,
  PoolName,
  ProjectId,
  ProjectName,
  RunId,
  RuleId,
  SessionId,
  SourceId,
  SourceName,
  TermId,
  TermName,
  TestClock,
  TestIdFactory,
  Timestamp,
  UserId,
  UuidV7IdFactory,
} from '../src/shared/kernel/index.js';

const validUuid = '018f8f9d-7f83-7abc-8def-0123456789ab';

describe('shared kernel value objects', () => {
  it('rejects malformed input through every branded factory', () => {
    const factories = [
      CompanyId, ProjectId, UserId, SourceId, ObjectId, ElementId, PoolId,
      RunId, IndustryId, TermId, RuleId, DemoSourceId, FilingId, SessionId, InviteId,
    ];
    for (const factory of factories) {
      expect(() => factory('not-a-uuid')).toThrow(InvariantViolation);
    }

    for (const [factory, malformed] of [
      [DuckDbName, 'select'],
      [IndustrySlug, 'Reinsurance Treaty'],
      [PoolKey, 'opk_live_short'],
      [ProjectName, ''],
      [PoolName, ''],
      [SourceName, ''],
      [TermName, 'Not_lowercase'],
    ] as const) {
      expect(() => factory(malformed)).toThrow(InvariantViolation);
    }
  });

  it('does not expose an offending value in an invariant message', () => {
    const secret = 'customer-value-that-must-not-render';
    let violation: InvariantViolation | undefined;
    try {
      ProjectId(secret);
    } catch (error) {
      if (error instanceof InvariantViolation) violation = error;
    }

    expect(violation).toBeInstanceOf(InvariantViolation);
    expect(violation?.message).not.toContain(secret);
  });

  it('exercises both Result branches', () => {
    const success = ok(42);
    const failure = err(new DomainError('forbidden', 'Denied.'));

    if (success.ok) expect(success.value).toBe(42);
    if (!failure.ok) expect(failure.error.code).toBe('forbidden');
  });
});

describe('shared kernel ports and adapters', () => {
  it('has a deterministic test clock', () => {
    const clock = new TestClock(new Date('2026-02-03T04:05:06.000Z'));
    expect(clock.now()).toBe(Timestamp(new Date('2026-02-03T04:05:06.000Z')));
    clock.advance(1_000);
    expect(clock.now()).toBe(Timestamp(new Date('2026-02-03T04:05:07.000Z')));
  });

  it('has a monotonic test id factory and a UUID v7 production adapter', () => {
    const testFactory = new TestIdFactory();
    const first = testFactory.create<string>();
    const second = testFactory.create<string>();
    expect(first < second).toBe(true);
    expect(ProjectId(first)).toBe(first);
    expect(ProjectId(new UuidV7IdFactory().create<string>())).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
