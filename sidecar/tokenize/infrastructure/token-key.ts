import { createHmac } from 'node:crypto';
import { inspect } from 'node:util';
import { DomainError, err, ok, type Result } from '../../../src/shared/kernel/index.js';
/** Nominal key capability. Raw bytes cannot be read or serialized through it. */
export class TokenKey {
 #bytes:Buffer;#closed=false;
 private constructor(bytes:Uint8Array){this.#bytes=Buffer.from(bytes);}
 static take(bytes:Uint8Array):Result<TokenKey>{try{return bytes.byteLength===32?ok(new TokenKey(bytes)):err(new DomainError('dependency_unavailable','The token key must contain exactly 32 raw bytes.'));}finally{bytes.fill(0);}}
 digest(payload:Uint8Array):Result<Buffer>{return this.#closed?err(new DomainError('dependency_unavailable','The tokenization run is closed.')):ok(createHmac('sha256',this.#bytes).update(payload).digest());}
 dispose(){this.#bytes.fill(0);this.#closed=true;}
 toString(){return '[REDACTED TOKEN KEY]';}
 toJSON(){return this.toString();}
 [inspect.custom](){return this.toString();}
}
