import { DomainError, err, ok, type Result, type ProjectId } from '../../src/shared/kernel/index.js';
import { VaultRef, type VaultPort } from '../../src/platform/vault/types.js';
import { canonicalise } from './canonicalise.js';
import { validateTokenConfig, type Canonicaliser, type ZoneResolver } from './config.js';
import { TokenKey } from './infrastructure/token-key.js';
import { consoleTokenAudit, type TokenAudit } from './telemetry.js';
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function crockford(bytes: Uint8Array): string {
    let bits = 0, buffer = 0, output = '';
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            output += alphabet[(buffer >>> bits) & 31];
        }
        buffer &= (1 << bits) - 1;
    }
    if (bits)
        output += alphabet[(buffer << (5 - bits)) & 31];
    return output;
}
export class TokenizationRun {
    constructor(private readonly key: TokenKey, private readonly zones: ZoneResolver) { }
    private prepareInternal(input: unknown, extension?: Canonicaliser): Result<(value: unknown) => Result<string | null>> {
        const parsed = validateTokenConfig(input);
        if (!parsed.ok)
            return parsed;
        const config = parsed.value;
        if (extension && (config.mode !== 'text' || extension.canonId !== config.canonId))
            return err(new DomainError('validation_failed', 'The canonicaliser must match the text element declaration.'));
        return ok(value => {
            const canonical = canonicalise(value, config, this.zones, extension);
            if (!canonical.ok || canonical.value === null)
                return canonical;
            const payload = Buffer.from(`v1\0${config.canonId}\0${config.domain}\0${canonical.value}`, 'utf8');
            try {
                const digest = this.key.digest(payload);
                if (!digest.ok)
                    return digest;
                try {
                    return ok(`v1_${config.domain}_${crockford(digest.value.subarray(0, 16))}`);
                }
                finally {
                    digest.value.fill(0);
                }
            }
            finally {
                payload.fill(0);
            }
        });
    }
    prepare(input: unknown, extension?: Canonicaliser) {
        if (typeof input === 'object' && input !== null && 'domain' in input && input.domain === 'sentinel') return err(new DomainError('validation_failed', 'The sentinel token domain is reserved for key custody.'));
        return this.prepareInternal(input, extension);
    }
    sentinel() {
        const prepared = this.prepareInternal({domain:'sentinel',canonId:'stdtext1',mode:'text',caseInsensitive:false});
        return prepared.ok ? prepared.value('opintel-sentinel') : prepared;
    }
    tokenize(value: unknown, config: unknown, extension?: Canonicaliser): Result<string | null> { const prepared = this.prepare(config, extension); return prepared.ok ? prepared.value(value) : prepared; }
}
export class SidecarTokenizer {
    constructor(private readonly vault: Pick<VaultPort, 'resolveBytes'>, private readonly zones: ZoneResolver, private readonly audit: TokenAudit = consoleTokenAudit) { }
    async run<T>(projectId: ProjectId, work: (run: TokenizationRun) => Promise<Result<T>> | Result<T>): Promise<Result<T>> {
        const ref = VaultRef(`vault://opintel/token-key/${projectId}`);
        let key: TokenKey | undefined;
        try {
            this.audit.record({ event: 'tokenization.started', projectId });
            const resolved = TokenKey.take(await this.vault.resolveBytes(ref));
            if (!resolved.ok) {
                this.audit.record({ event: 'tokenization.refused', projectId, category: 'vault' });
                return err(new DomainError('dependency_unavailable', `Token key ${ref} must contain exactly 32 raw bytes.`));
            }
            key = resolved.value;
            const result = await work(new TokenizationRun(key, this.zones));
            this.audit.record(result.ok ? { event: 'tokenization.complete', projectId } : { event: 'tokenization.refused', projectId, category: 'declaration' });
            return result;
        }
        catch {
            this.audit.record({ event: 'tokenization.refused', projectId, category: key ? 'execution' : 'vault' });
            return err(new DomainError('dependency_unavailable', `Tokenization could not complete using ${ref}. Check the source and Vault configuration.`));
        }
        finally {
            key?.dispose();
        }
    }
}
