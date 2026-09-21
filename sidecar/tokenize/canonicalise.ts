import { DomainError, err, ok, type Result } from '../../src/shared/kernel/index.js';
import { caseFolding } from './unicode/folding.js';
import { digits, validCivil, seconds, formatSeconds, type Civil } from './calendar.js';
import type { TokenConfig, Canonicaliser, ZoneResolver } from './config.js';
const trimSet = new Set(Array.from('\u0009\u000a\u000b\u000c\u000d\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'));
const refused = () => err(new DomainError('validation_failed', 'The source value does not match its declared tokenization mode. Read it as source text and check its declaration.'));
function civil(match: RegExpExecArray): Civil { return { year: digits(match[1]!), month: digits(match[2]!), day: digits(match[3]!), hour: digits(match[4] ?? '0'), minute: digits(match[5] ?? '0'), second: digits(match[6] ?? '0') }; }
export function canonicalise(value: unknown, config: TokenConfig, zones: ZoneResolver, extension?: Canonicaliser): Result<string | null> {
    if (value === null)
        return ok(null);
    if (typeof value !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
        return refused();
    switch (config.mode) {
        case 'text': {
            let text = value;
            if (extension) {
                try {
                    text = extension.canonicalise(text);
                }
                catch {
                    return refused();
                }
                if (typeof text !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))
                    return refused();
            }
            text = text.normalize('NFKC');
            let start = 0, end = text.length;
            while (start < end && trimSet.has(text[start]!))
                start++;
            while (end > start && trimSet.has(text[end - 1]!))
                end--;
            text = text.slice(start, end);
            if (config.caseInsensitive)
                text = Array.from(text, c => caseFolding.get(c) ?? c).join('').normalize('NFKC');
            return ok(text);
        }
        case 'number': {
            if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$(?![\s\S])/u.test(value))
                return refused();
            const negative = value.startsWith('-'), body = negative ? value.slice(1) : value;
            const [integer, fraction = ''] = body.split('.');
            const significant = fraction.replace(/0+$(?![\s\S])/u, '');
            const result = integer! + (significant ? '.' + significant : '');
            return ok(result === '0' ? '0' : (negative ? '-' : '') + result);
        }
        case 'date': {
            const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$(?![\s\S])/u.exec(value);
            return match && validCivil(civil(match)) ? ok(value) : refused();
        }
        case 'timestamp': {
            if (config.epochUnit) {
                if (!/^-?(0|[1-9][0-9]*)$(?![\s\S])/u.test(value))
                    return refused();
                const micros = BigInt(value) * (config.epochUnit === 'seconds' ? 1000000n : 1000n);
                let whole = micros / 1000000n, remainder = micros % 1000000n;
                if (remainder < 0n) {
                    whole--;
                    remainder += 1000000n;
                }
                if (whole < -62135596800n || whole > 253402300799n)
                    return refused();
                // The checked range fits exactly in the bounded calendar arithmetic.
                const negative = whole < 0n;
                const magnitude = digits((negative ? -whole : whole).toString());
                const result = formatSeconds(negative ? -magnitude : magnitude, remainder.toString().padStart(6, '0'));
                return result ? ok(result) : refused();
            }
            const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[T ]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?(Z|[+-][0-9]{2}(?::?[0-9]{2})?)?$(?![\s\S])/u.exec(value);
            if (!match || !validCivil(civil(match)))
                return refused();
            let utc = seconds(civil(match));
            const offset = match[8];
            if (offset === undefined) {
                if (!config.declaredZone)
                    return err(new DomainError('validation_failed', 'A timestamp without an offset requires a declared source timezone.'));
                const resolved = zones.toUtc(utc, config.declaredZone);
                if (!resolved.ok)
                    return resolved;
                utc = resolved.value;
            }
            else if (offset !== 'Z') {
                const raw = offset.slice(1).replace(':', '');
                const hours = digits(raw.slice(0, 2)), minutes = digits(raw.slice(2) || '0');
                if (hours >= 24 || minutes >= 60)
                    return refused();
                utc -= (offset[0] === '-' ? -1 : 1) * (hours * 3600 + minutes * 60);
            }
            const result = formatSeconds(utc, (match[7] ?? '').padEnd(6, '0'));
            return result ? ok(result) : refused();
        }
    }
}
