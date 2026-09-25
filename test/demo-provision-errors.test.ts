import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as timers from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { SpreadsheetDemoProvisioner } from '../sidecar/demo/provision.js';
import { DemoWorkbookWriter } from '../sidecar/demo/infrastructure/workbook-writer.js';
import { provisionDemoPayload } from '../src/shared/demo-contract.js';
import { sourceMessages, safeSourceMessage } from '../src/shared/source-errors.js';
import { demoIdentification } from '../src/modules/sources/demo/metadata.js';
import { ProjectId, SourceId } from '../src/shared/kernel/index.js';
import { SecretRef } from '../src/platform/secrets/types.js';
import type { LandingZone } from '../sidecar/ingest/watch.js';

vi.mock('node:timers/promises', async importOriginal => {
 const actual = await importOriginal<typeof import('node:timers/promises')>();
 return {...actual,setTimeout:vi.fn(actual.setTimeout)};
});

it.each([
 ['rules', 'validation_failed', sourceMessages.demoRulesInvalid],
 ['dependency', 'dependency_unavailable', sourceMessages.demoDependencyPending],
 ['write', 'dependency_unavailable', sourceMessages.demoWriteFailed],
 ['unexpected', 'dependency_unavailable', sourceMessages.demoUnexpected],
 ['register', 'dependency_unavailable', sourceMessages.demoRegisterUnavailable],
] as const)('demo provisioning reports a safe specific %s failure', async (kind, code, message) => {
 const directory = await mkdtemp(join(tmpdir(),'opintel-demo-errors-'));
 const projectId = ProjectId(randomUUID()); const sourceId = SourceId(randomUUID());
 const credentialRef = SecretRef('secret://demo/postgres');
 const zone: LandingZone = { projectId,sourceId,directory:join(directory,'zone'),stateFile:join(directory,'register.json'),rulesFile:join(directory,'rules.json'),pollMs:10,
  landing:{name:'demo',credentialRef,strategy:'append_as_at'} };
 const controller = new AbortController();
 try {
  await mkdir(zone.directory);
  const raw = JSON.parse(await readFile('src/modules/sources/demo/reinsurance.json','utf8')) as Record<string,unknown>;
  const payload = provisionDemoPayload.parse({schemaSpec:raw.schemaSpec,generatorSpec:raw.generatorSpec,templateId:'31100000-0000-4000-8000-000000000001',landingZone:zone.directory});
  const dependent = payload.generatorSpec.files!.find(file=>file.dependsOn)!;
  payload.generatorSpec.files = payload.generatorSpec.files!.filter(file=>file.id===dependent.id || file.id===dependent.dependsOn);
  await writeFile(zone.rulesFile, kind==='rules' ? '{private cell value' : JSON.stringify(demoIdentification(projectId,sourceId,payload.generatorSpec)));
  await writeFile(zone.stateFile,kind==='register' ? '{private cell value' : JSON.stringify({version:2,projectId,sourceId,filings:[]}));
  const writer = new DemoWorkbookWriter();
  if(kind==='write') vi.spyOn(writer,'write').mockRejectedValue(Object.assign(new Error('private file contents and credentials'),{code:'ENOSPC'}));
  if(kind==='unexpected') vi.spyOn(writer,'write').mockRejectedValue(Object.assign(new Error('raw assertion: private cell value'),{name:'AssertionError'}));
  if(kind==='dependency') vi.mocked(timers.setTimeout).mockImplementation(async()=>{
   // Abort only once provisioning has entered its dependency wait, not while writing.
   controller.abort(); throw Object.assign(new Error('private abort reason'),{name:'AbortError'});
  });
  const provision = new SpreadsheetDemoProvisioner([zone],{database:'demo',credentialRef},writer);
  const result = await provision.provision({requestId:randomUUID(),projectId,sourceId,credentialRef,payload},controller.signal);
  expect(result).toMatchObject({ok:false,error:{code,message}});
  if(result.ok) throw new Error('Expected refusal');
  // Both HTTP sides apply this allowlist; the exact reviewed message survives.
  expect(safeSourceMessage(result.error.code,result.error.message)).toBe(message);
  expect(JSON.stringify(result)).not.toMatch(/private|AssertionError|at SpreadsheetDemoProvisioner/);
 } finally { vi.mocked(timers.setTimeout).mockReset(); vi.restoreAllMocks(); await rm(directory,{recursive:true,force:true}); }
});
