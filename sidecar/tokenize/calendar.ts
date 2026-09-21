// Bounded Gregorian fields only. Numeric source values never enter this code.
export type Civil = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};
export function digits(text: string): number {
    let value = 0;
    for (const c of text)
        value = value * 10 + c.charCodeAt(0) - 48;
    return value;
}
const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const lengths = (y: number) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const beforeYear = (y: number) => 365 * (y - 1) + Math.floor((y - 1) / 4) - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400);
export function validCivil(c: Civil): boolean { return c.year >= 1 && c.year <= 9999 && c.month >= 1 && c.month <= 12 && c.day >= 1 && c.day <= lengths(c.year)[c.month - 1]! && c.hour < 24 && c.minute < 60 && c.second < 60; }
export function seconds(c: Civil): number { return (beforeYear(c.year) + lengths(c.year).slice(0, c.month - 1).reduce((a, b) => a + b, 0) + c.day - 1 - 719162) * 86400 + c.hour * 3600 + c.minute * 60 + c.second; }
const pad = (value: number, width = 2) => String(value).padStart(width, '0');
export function formatSeconds(value: number, fraction: string): string | null {
    const day = Math.floor(value / 86400) + 719162;
    if (day < 0 || day >= beforeYear(10000))
        return null;
    let low = 1, high = 10000;
    while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2);
        if (beforeYear(mid) <= day)
            low = mid;
        else
            high = mid;
    }
    let remainder = day - beforeYear(low), month = 1;
    for (const length of lengths(low)) {
        if (remainder < length)
            break;
        remainder -= length;
        month++;
    }
    const time = ((value % 86400) + 86400) % 86400;
    return `${pad(low, 4)}-${pad(month)}-${pad(remainder + 1)}T${pad(Math.floor(time / 3600))}:${pad(Math.floor(time % 3600 / 60))}:${pad(time % 60)}.${fraction}Z`;
}
