import {expect,it} from 'vitest';
import {Buffer} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {encodeXqShare,decodeXqShare} from '../src/shared/xq-share-codec.mjs';

const previous=globalThis.window;
globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
const {XQWebCrypto}=await import('@xqmsg/jssdk-core/dist/cjs/src/com/xqmsg/web-crypto/webcrypto.js');
if(previous===undefined)delete globalThis.window;else globalThis.window=previous;

it('uses the actual SDK encoder and its verified 256-bit entropy format without replacing any share bits',()=>{
 for(let byte=0;byte<256;byte++){
  const share=Buffer.alloc(32,byte),wire=encodeXqShare(share,XQWebCrypto.base64Encode);
  expect(wire).toBe(Buffer.from(share.toString('hex'),'ascii').toString('base64'));
  expect(wire).toHaveLength(88);expect(wire.endsWith('==')).toBe(true);
  expect(Buffer.from(wire,'base64').toString()).toMatch(/^[0-9a-f]{64}$/u);
  expect(decodeXqShare(wire)).toEqual(share);
 }
});
it('keeps legacy accepted base64url shares byte-for-byte, including both URL-safe punctuation characters',()=>{
 for(let byte=0;byte<256;byte++){
  const share=Buffer.alloc(32,byte);expect(decodeXqShare(share.toString('base64url'))).toEqual(share);
 }
 expect(Buffer.alloc(32,255).toString('base64url')).toContain('_');
 expect(Buffer.alloc(32,251).toString('base64url')).toContain('-');
});
it('rejects ambiguous, malformed, noncanonical and non-ASCII encodings without a permissive fallback',()=>{
 const canonical=Buffer.alloc(32).toString('base64url');
 for(const value of [null,canonical+'=',canonical.slice(0,-1)+'B',canonical+'\n',Buffer.from('z'.repeat(64)).toString('base64'),Buffer.alloc(64,0xe1).toString('base64'),Buffer.from('A'.repeat(64)).toString('base64')])expect(()=>decodeXqShare(value)).toThrow(/Invalid/u);
 expect(()=>encodeXqShare(Buffer.alloc(31),XQWebCrypto.base64Encode)).toThrow(/length/u);
 expect(()=>encodeXqShare(Buffer.alloc(32),()=> 'incorrect')).toThrow(/encoding/u);
});
