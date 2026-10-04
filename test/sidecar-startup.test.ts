import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { startupCheck } from '../sidecar/startup-check.js';
import { LandingWatcher, type LandingZone } from '../sidecar/ingest/watch.js';
import { ProjectId, SourceId } from '../src/shared/kernel/index.js';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.map(path => rm(path, { recursive: true, force: true }))); directories.length = 0; });
async function fixture(): Promise<LandingZone> {
  const root = await mkdtemp(join(tmpdir(), 'startup-diagnostics-')); directories.push(root);
  const directory = join(root, 'inbox'); await mkdir(directory);
  const rulesFile = join(root, 'rules.json'); await writeFile(rulesFile, JSON.stringify({ filingParties: [], rules: [] }));
  return { directory, rulesFile, stateFile: join(root, 'state.json'), pollMs: 1000,
    projectId: ProjectId('10000000-0000-4000-8000-000000000001'), sourceId: SourceId('20000000-0000-4000-8000-000000000001') };
}
it('identifies the rule snapshot and invalid JSON without exposing its contents; releases the lock', async () => {
  const zone = await fixture(); await writeFile(zone.rulesFile, '{"private":"secret-marker",');
  await expect(LandingWatcher.open(zone)).rejects.toThrow(`landing rule snapshot ${zone.rulesFile}: the file is not valid JSON.`);
  await expect(readFile(zone.stateFile + '.lock')).rejects.toMatchObject({ code: 'ENOENT' });
});
it('identifies a state lock and preserves another process ownership', async () => {
  const zone = await fixture(); await writeFile(zone.stateFile + '.lock', '1234');
  await expect(LandingWatcher.open(zone)).rejects.toThrow(`landing state lock ${zone.stateFile}.lock: the state lock already exists.`);
  expect(await readFile(zone.stateFile + '.lock', 'utf8')).toBe('1234');
});
it('preserves missing-history recovery instructions', async () => {
  const zone = await fixture(); await writeFile(join(zone.directory, 'filing.xlsx'), 'data');
  await expect(startupCheck('register', () => LandingWatcher.open(zone))).rejects.toThrow('restore the history');
});
it('names the missing landing directory', async () => {
  const zone = await fixture(); await rm(zone.directory, { recursive: true });
  await expect(LandingWatcher.open(zone)).rejects.toThrow(`landing directory ${zone.directory}: the configured file or directory does not exist.`);
});
it('retains native exception type and message, while configuration diagnostics redact schema values', async () => {
  await expect(startupCheck('listener', () => { throw Object.assign(new Error('secret-marker'), { code: 'EADDRINUSE' }); })).rejects.toThrow('listener: the address and port are already in use.');
  await expect(startupCheck('rules', () => z.object({ mode: z.literal('valid') }).parse({ mode: 'secret-marker' }))).rejects.toThrow('rules: invalid configuration fields: mode.');
  const native=Object.assign(new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string'),{code:'AUTH_FAILURE'});
  const failed=await startupCheck('engine',()=>{throw native;}).catch((error:unknown)=>error);
  expect(failed).toMatchObject({name:'StartupCheckError',code:'AUTH_FAILURE',cause:native});
  expect((failed as Error).message).toContain('Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string');
  const schema=await startupCheck('rules',()=>z.object({mode:z.literal('valid')}).parse({mode:'secret-marker'})).catch((error:unknown)=>error);
  expect((schema as Error).message).not.toContain('secret-marker');
});
it('names the missing TLS file and mismatched private key separately', async () => {
  const zone = await fixture(); const root = join(zone.directory, 'tls-test');
  await prepareSidecarDevelopment(root);
  const file = join(root, 'service.json'); const config = JSON.parse(await readFile(file, 'utf8')) as { tls: { keyFile: string } };
  config.tls.keyFile = 'missing.key'; await writeFile(file, JSON.stringify(config));
  await expect(loadSidecarConfig(file)).rejects.toThrow('TLS keyFile: the configured file or directory does not exist.');
  config.tls.keyFile = 'tls/client.key'; await writeFile(file, JSON.stringify(config));
  await expect(loadSidecarConfig(file)).rejects.toThrow('TLS server key: the private key does not match the server certificate.');
}, 15000);
