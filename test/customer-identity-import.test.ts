import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {importIdentity} from '../scripts/operator/identity-import.js';

it('customer import preserves team-issued bytes, enforces private modes and never overwrites a conflict',async()=>{
 const root=await mkdtemp(join(tmpdir(),'identity-import-'));
 try{
  await writeFile(join(root,'identities'),'synthetic command dispatcher',{mode:0o755});
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','client.key','-out','client.crt','-days','1','-subj','/CN=Synthetic test only'],{cwd:root,stdio:'ignore'});
  await writeFile(join(root,'transport.key'),'synthetic-test-transport');
  execFileSync('zip',['-q','Export-123.zip','client.crt','client.key','transport.key'],{cwd:root,stdio:'ignore'});
  await importIdentity(root,join(root,'Export-123.zip'),'Export-123.zip','synthetic-device');
  expect(await readFile(join(root,'identities'),'utf8')).toBe('synthetic command dispatcher');
  const manifest=await readFile(join(root,'identity-bundles/certificates.json'),'utf8');
  expect(JSON.parse(manifest)).toEqual([{certificateId:123,deviceName:'synthetic-device',bundlePath:'device-123'}]);
  expect((await stat(join(root,'identity-bundles'))).mode&0o777).toBe(0o700);
  expect((await stat(join(root,'identity-bundles/device-123'))).mode&0o777).toBe(0o700);
  for(const name of ['client.crt','client.key','transport.key']){
   expect((await stat(join(root,'identity-bundles/device-123',name))).mode&0o777).toBe(0o600);
   expect(await readFile(join(root,'identity-bundles/device-123',name))).toEqual(await readFile(join(root,name)));
  }
  await importIdentity(root,join(root,'Export-123.zip'),'Export-123.zip','synthetic-device');
  await expect(importIdentity(root,join(root,'Export-123.zip'),'Export-123.zip','another-device')).rejects.toThrow('conflicts');
  expect(await readFile(join(root,'identity-bundles/certificates.json'),'utf8')).toBe(manifest);
  await expect(importIdentity(root,join(root,'Export-123.zip'),'renamed.zip')).rejects.toThrow('original XQ export filename');
  await writeFile(join(root,'unexpected'),'synthetic');execFileSync('zip',['-q','Export-123.zip','unexpected'],{cwd:root,stdio:'ignore'});
  await expect(importIdentity(root,join(root,'Export-123.zip'),'Export-123.zip')).rejects.toThrow('exactly');
 }finally{await rm(root,{recursive:true,force:true});}
});
