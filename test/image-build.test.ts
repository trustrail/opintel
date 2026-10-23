import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

describe('image build boundary',()=>{
 it('rejects credential files and private material, while allowing key-handling code',()=>{
  expect(execFileSync('python3',['scripts/images/check-secrets.py','--self-test'],{encoding:'utf8'})).toContain('positive and negative controls passed');
 });
 it('locks upstream dependencies to digests in one Compose-compatible file',()=>{
  const lock:unknown=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
  expect(lock).toMatchObject({services:{postgres:{image:expect.stringMatching(/@sha256:[a-f0-9]{64}$/u)},redis:{image:expect.stringMatching(/@sha256:[a-f0-9]{64}$/u)},spicedb:{image:expect.stringMatching(/@sha256:[a-f0-9]{64}$/u)}}});
 });
});
