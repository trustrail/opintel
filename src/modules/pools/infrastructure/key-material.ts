import { createHash, randomInt } from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** randomInt uses rejection sampling: all 62 symbols have equal probability. */
export function generatePoolKey():string {
 return 'opk_live_'+Array.from({length:22},()=>alphabet[randomInt(62)]).join('');
}
export function hashPoolKey(key:string):Buffer {return createHash('sha256').update(key).digest();}
