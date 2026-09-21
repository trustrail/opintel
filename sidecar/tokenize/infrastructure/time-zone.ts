import { DomainError, err, ok } from '../../../src/shared/kernel/index.js';
import type { ZoneResolver } from '../config.js';
import { digits, seconds } from '../calendar.js';
/** ICU supplies IANA offsets only. Grammar, calendar validation and microseconds
 * are handled explicitly by the canonicaliser. The host timezone is never used. */
export class IanaZoneResolver implements ZoneResolver {
    toUtc(local: number, zone: string) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', era: 'short' });
            const wall = (instant: number) => {
                const parts = new Map(formatter.formatToParts(instant * 1000).map(p => [p.type, p.value]));
                if (parts.get('era') !== 'AD')
                    throw new Error('Outside supported calendar.');
                return seconds({ year: digits(parts.get('year')!), month: digits(parts.get('month')!), day: digits(parts.get('day')!), hour: digits(parts.get('hour')!), minute: digits(parts.get('minute')!), second: digits(parts.get('second')!) });
            };
            // Probe either side of local time, then round-trip every candidate. A gap has
            // zero candidates; an overlap has two. Neither may be guessed through.
            const offsets = new Set<number>();
            for (const delta of [-172800, -86400, 0, 86400, 172800])
                offsets.add(wall(local + delta) - (local + delta));
            const candidates = [...offsets].map(offset => local - offset).filter(instant => wall(instant) === local);
            return candidates.length === 1 ? ok(candidates[0]!) : err(new DomainError('validation_failed', 'The local timestamp is ambiguous or nonexistent in its declared timezone.'));
        }
        catch {
            return err(new DomainError('validation_failed', 'The declared timezone or timestamp cannot be resolved.'));
        }
    }
}
