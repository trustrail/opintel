import type {Buffer} from 'node:buffer';
export const xqShareEncoding:'sdk-base64-hex-256';
export function encodeXqShare(share:Uint8Array,sdkBase64Encode:(bytes:Uint8Array)=>string):string;
export function decodeXqShare(value:unknown):Buffer;
