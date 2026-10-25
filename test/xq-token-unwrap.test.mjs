import {it,expect} from 'vitest';
import {generateKeyPairSync,publicEncrypt,constants} from 'node:crypto';
import {statfsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {unwrapDeviceToken} from '../scripts/infrastructure/xq-token-unwrap.mjs';
it('DEP-011: agent token unwrap uses private memory-backed storage on Linux and never crashes on a failed pipe',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const bytes=privateKey.export({type:'pkcs8',format:'der'}),expected=Buffer.from('synthetic device token');
 const cipher=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},expected);
 const before=readdirSync(tmpdir()).filter(n=>n.startsWith('opintel-device-'));
 if(process.platform==='linux'&&statfsSync(tmpdir()).type!==0x01021994)await expect(unwrapDeviceToken(bytes,cipher)).rejects.toThrow('tmpfs');
 else expect(await unwrapDeviceToken(bytes,cipher)).toEqual(expected);
 expect(bytes.every(v=>v===0)).toBe(true);expect(readdirSync(tmpdir()).filter(n=>n.startsWith('opintel-device-'))).toEqual(before);
 const bad=Buffer.from('not a private key');await expect(unwrapDeviceToken(bad,cipher)).rejects.toThrow();expect(bad.every(v=>v===0)).toBe(true);
});
