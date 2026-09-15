import { randomBytes } from 'node:crypto';

export interface IdFactory {
  create<T extends string>(): T;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class UuidV7IdFactory implements IdFactory {
  create<T extends string>(): T {
    const timestamp = BigInt(Date.now());
    const random = randomBytes(10);
    const bytes = new Uint8Array(16);

    for (let index = 0; index < 6; index += 1) {
      bytes[index] = Number((timestamp >> BigInt((5 - index) * 8)) & 0xffn);
    }
    bytes[6] = 0x70 | (random[0]! & 0x0f);
    bytes[7] = random[1]!;
    bytes[8] = 0x80 | (random[2]! & 0x3f);
    for (let index = 9; index < 16; index += 1) bytes[index] = random[index - 6]!;

    return formatUuid(bytes) as T;
  }
}

export class TestIdFactory implements IdFactory {
  private nextTimestamp: bigint;

  constructor(startAt = 1_700_000_000_000n) {
    this.nextTimestamp = startAt;
  }

  create<T extends string>(): T {
    const timestamp = this.nextTimestamp;
    this.nextTimestamp += 1n;
    const bytes = new Uint8Array(16);
    for (let index = 0; index < 6; index += 1) {
      bytes[index] = Number((timestamp >> BigInt((5 - index) * 8)) & 0xffn);
    }
    bytes[6] = 0x70;
    bytes[7] = 0;
    bytes[8] = 0x80;
    return formatUuid(bytes) as T;
  }
}
