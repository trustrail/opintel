import {randomUUID} from 'node:crypto';
import {expect, it} from 'vitest';
import {withPlatform, withTenant} from '../src/platform/db/scope.js';
import {ProjectId, UserId} from '../src/shared/kernel/index.js';

const context = {userId: UserId(randomUUID()), projectId: ProjectId(randomUUID())};
const settings = "SELECT current_setting('jit') AS jit, current_setting('work_mem') AS work_mem, current_setting('app.project_id', true) AS project";
type Settings = {jit: string; work_mem: string; project: string | null};

it('applies bounded statement settings without changing tenant identity or subsequent statements', async () => {
  await withTenant(context, async tx => {
    const before = await tx.query<Settings>(settings);
    expect(await tx.query<Settings>(settings, [], {jit: 'off', work_mem: 7000})).toEqual([
      {jit: 'off', work_mem: '7000kB', project: context.projectId},
    ]);
    expect(await tx.query<Settings>(settings)).toEqual(before);
    const [tuned, plain] = await Promise.all([
      tx.query<Settings>(settings, [], {jit: 'off', work_mem: 7000}),
      tx.query<Settings>(settings),
    ]);
    expect(tuned).toEqual([{jit: 'off', work_mem: '7000kB', project: context.projectId}]);
    expect(plain).toEqual(before);
  });
});

it('RLS-03/RLS-04: restores statement settings after commit and after a PostgreSQL error', async () => {
  const tuning = "SELECT current_setting('jit') AS jit, current_setting('work_mem') AS work_mem";
  const baseline = await withPlatform(tx => tx.query(tuning));
  await withTenant(context, tx => tx.query(settings, [], {jit: 'off', work_mem: 7000}));
  expect(await withPlatform(tx => tx.query(tuning))).toEqual(baseline);
  await expect(withTenant(context, tx => tx.query('SELECT 1/0', [], {jit: 'off', work_mem: 7000}))).rejects.toThrow('division by zero');
  expect(await withPlatform(tx => tx.query(tuning))).toEqual(baseline);
  await expect(withTenant(context, tx => Promise.all([
    tx.query('SELECT 1/0', [], {jit: 'off'}), tx.query(settings, [], {work_mem: 7000}),
  ]))).rejects.toThrow('division by zero');
  expect(await withPlatform(tx => tx.query(tuning))).toEqual(baseline);
});
