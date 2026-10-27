import {it,expect} from 'vitest';
import {Buffer} from 'node:buffer';
import {redactedXqBody,xqKeySignature} from '../src/modules/release-custody/infrastructure/xq-diagnostics.mjs';

it('preserves a provider reason while masking token fields, nested echoes and known secrets',()=>{
 const body=JSON.stringify({message:'Alias is not active',error:{reason:'Invalid recipient',access_token:'short-secret',details:{key:'key-material'}},authorization:'Bearer credential',messageEcho:'hidden',detail:'Rejected known-secret at https://example.invalid/?token=hidden'});
 const result=redactedXqBody(body,['known-secret']);
 expect(result.text).toContain('Alias is not active');expect(result.text).toContain('Invalid recipient');
 for(const secret of ['short-secret','key-material','credential','known-secret','example.invalid','hidden'])expect(result.text).not.toContain(secret);
 expect(result.truncated).toBe(false);
});
it('masks plain-text bearer credentials, opaque strings, known escaped secrets and email addresses',()=>{
 const result=redactedXqBody('Rejected Bearer abc.def.ghi; token=short; '+ 'a'.repeat(43)+' person@example.test '+encodeURIComponent('private/value'),['private/value']);
 expect(result.text).toContain('Rejected');
 for(const secret of ['abc.def.ghi','short','a'.repeat(43),'person@example.test','private%2Fvalue'])expect(result.text).not.toContain(secret);
});
it('bounds wide, deep and multibyte responses and marks truncation',()=>{
 for(const body of [JSON.stringify(Array.from({length:50},()=>({message:'é '.repeat(500)}))),JSON.stringify({error:{error:{error:{error:{error:{message:'deep'}}}}}}),'é '.repeat(5000)]){
  const result=redactedXqBody(body);expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(2048);expect(result.truncated).toBe(true);
 }
});

it('retains only bounded key character classes and punctuation sets, never key fragments',()=>{
 expect(xqKeySignature('aZ9--b__c')).toEqual({nonAlphanumeric:['-','_'],firstClass:'lower',doubledPunctuation:['-','_']});
 expect(xqKeySignature('7a+/==')).toEqual({nonAlphanumeric:['+','/','='],firstClass:'digit',doubledPunctuation:['=']});
 expect(xqKeySignature('Zabcdef')).toEqual({nonAlphanumeric:[],firstClass:'upper',doubledPunctuation:[]});
 expect(xqKeySignature('éé')).toEqual({nonAlphanumeric:['other'],firstClass:'other',doubledPunctuation:[]});
 expect(xqKeySignature('🙂-')).toEqual({nonAlphanumeric:['-','other'],firstClass:'other',doubledPunctuation:[]});
 expect(xqKeySignature('')).toEqual({nonAlphanumeric:[],firstClass:'empty',doubledPunctuation:[]});
 const secret='aSecretValue123--__';expect(JSON.stringify(xqKeySignature(secret))).not.toContain('SecretValue');
});
