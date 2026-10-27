import {Buffer} from 'node:buffer';

export const xqShareEncoding='sdk-base64-hex-256';
/** The pinned SDK's 256-bit entropy representation, without replacing K1.
 * @param {Uint8Array} share
 * @param {(bytes:Uint8Array)=>string} sdkBase64Encode
 */
export function encodeXqShare(share,sdkBase64Encode){
 if(!(share instanceof Uint8Array)||share.length!==32)throw new Error('Invalid XQ share length.');
 const hex=Buffer.from(Buffer.from(share.buffer,share.byteOffset,share.byteLength).toString('hex'),'ascii');
 try{
  const encoded=sdkBase64Encode(hex);
  if(!/^[A-Za-z0-9+/]{86}==$/u.test(encoded)||Buffer.from(encoded,'base64').toString('utf8')!==hex.toString('utf8'))throw new Error('Invalid SDK share encoding.');
  return encoded;
 }finally{hex.fill(0);}
}

/** Old accepted grants retain their original 43-character base64url decoding.
 * New grants use the SDK's distinct 88-character Base64-of-lowercase-hex form.
 * No rewriting, re-escrow, permissive decoding or guessed format fallback.
 * @param {unknown} value
 * @returns {Buffer}
 */
export function decodeXqShare(value){
 if(typeof value!=='string')throw new Error('Invalid XQ share encoding.');
 if(/^[A-Za-z0-9_-]{43}$/u.test(value)){
  const share=Buffer.from(value,'base64url');
  if(share.length===32&&share.toString('base64url')===value)return share;
  share.fill(0);throw new Error('Invalid legacy XQ share encoding.');
 }
 if(/^[A-Za-z0-9+/]{86}==$/u.test(value)){
  const hex=Buffer.from(value,'base64');
  try{if(hex.toString('base64')===value&&/^[0-9a-f]{64}$/u.test(hex.toString('utf8')))return Buffer.from(hex.toString('utf8'),'hex');}
  finally{hex.fill(0);}
 }
 throw new Error('Invalid XQ share encoding.');
}
