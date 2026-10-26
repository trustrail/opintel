import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

describe('image build boundary',()=>{
 it('rejects credential files and private material, while allowing key-handling code',()=>{
  expect(execFileSync('python3',['scripts/images/check-secrets.py','--self-test'],{encoding:'utf8'})).toContain('positive and negative controls passed');
 });
 it('rejects source, fixture and deleted-layer payloads outside the runtime allowlist',()=>{
  expect(execFileSync('python3',['scripts/images/check-runtime.py','--self-test'],{encoding:'utf8'})).toContain('forbidden, deleted-layer and trusted-base controls passed');
 });
 it('locks upstream dependencies to digests in one Compose-compatible file',()=>{
  const lock:unknown=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
  expect(lock).toMatchObject({services:{postgres:{image:expect.stringMatching(/@sha256:[a-f0-9]{64}$/u)},redis:{image:expect.stringMatching(/@sha256:[a-f0-9]{64}$/u)},spicedb:{image:expect.stringMatching(/@sha256:[a-f0-9]{64}$/u)}}});
 });
});

it('DEP-014: every Docker COPY explicitly declares modes, including build stages',()=>{
 const copies=readFileSync('deploy/engine/Dockerfile','utf8').split('\n').filter(line=>line.startsWith('COPY '));
 expect(copies.length).toBeGreaterThan(0);for(const line of copies)expect(line).toContain('--chmod=');
});
