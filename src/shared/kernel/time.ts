import { InvariantViolation } from './errors.js';

export type Timestamp = string & { readonly __brand: 'Timestamp' };

export const Timestamp = (date: Date): Timestamp => {
  if (Number.isNaN(date.getTime())) throw new InvariantViolation('Timestamp', date);
  return date.toISOString() as Timestamp;
};

export interface Clock {
  now(): Timestamp;
}

export class SystemClock implements Clock {
  now(): Timestamp {
    return Timestamp(new Date());
  }
}

export class TestClock implements Clock {
  constructor(private current: Date = new Date('2026-01-01T00:00:00.000Z')) {}

  now(): Timestamp {
    return Timestamp(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  set(date: Date): void {
    this.current = date;
  }
}
