import { loadavg } from 'node:os';

export function measurementContext() {
  return { processId: process.pid, processAgeMs: process.uptime() * 1000, loadAverage: loadavg() };
}

export function startMeasurement(test: string): () => number {
  const context = measurementContext();
  const start = performance.now();
  return () => {
    const milliseconds = performance.now() - start;
    console.info(JSON.stringify({ measurement: test, milliseconds, start: context, end: measurementContext() }));
    return milliseconds;
  };
}
