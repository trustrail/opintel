import {sign,verify,createPublicKey,type KeyObject} from 'node:crypto';
import {releaseClaims,releaseHeader,type ReleaseClaims} from '../../../shared/release-contract.js';
export {sealCell,unsealCell} from '../../../shared/infrastructure/sealed-cell.js';
export {sealResult,xorShares} from '../../../shared/infrastructure/sealed-result.js';
export function signGrant(claims:ReleaseClaims,kid:string,key:KeyObject):string {const header=Buffer.from(JSON.stringify(releaseHeader.parse({alg:'EdDSA',kid,typ:'JWT'}))).toString('base64url'),payload=Buffer.from(JSON.stringify(releaseClaims.parse(claims))).toString('base64url');const input=header+'.'+payload;return input+'.'+sign(null,Buffer.from(input),key).toString('base64url');}
export function verifyGrant(grant:string,key:(kid:string)=>KeyObject|undefined):ReleaseClaims {
 const parts=grant.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/u.test(p)))throw new Error('Invalid release grant.');
 const [header,payload,signature]=parts as [string,string,string];const h=releaseHeader.parse(JSON.parse(Buffer.from(header,'base64url').toString('utf8')) as unknown),publicKey=key(h.kid);
 if(!publicKey||!verify(null,Buffer.from(header+'.'+payload),createPublicKey(publicKey.type==='private'?publicKey:publicKey.export({format:'pem',type:'spki'})),Buffer.from(signature,'base64url')))throw new Error('Invalid release grant signature.');
 return releaseClaims.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as unknown);
}
