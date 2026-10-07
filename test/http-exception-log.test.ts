import { describe, expect, it } from 'vitest';
import { apiStartupExceptionLine, cliExceptionLine, sanitiseException } from '../src/platform/telemetry/exception-log.js';

describe('S4a exception allowlist', () => {
  it('withholds startup messages, stack headers and causes containing credentials', () => {
    const message = 'postgres://user:CUSTOMER_VALUE@host/database';
    const line = apiStartupExceptionLine(new Error(message, { cause: new Error(message) }));
    expect(line).not.toContain('CUSTOMER_VALUE');
    expect(line).not.toContain(message);
    expect(JSON.parse(line)).toMatchObject({ event: 'api.startup_failed', type: 'Error', message: '[exception message withheld]' });
  });

  it('reports address conflicts by structured code without native contents', () => {
    const error = Object.assign(new Error('CUSTOMER_VALUE'), { code: 'EADDRINUSE' });
    const line = apiStartupExceptionLine(error);
    expect(line).not.toContain('CUSTOMER_VALUE');
    expect(JSON.parse(line).message).toBe('A configured listener address is already in use. Check for another running application instance.');
  });
  it.each(['migration', 'schema_load'] as const)('withholds native diagnostics from the %s CLI line', operation => {
    const error = new Error('invalid input syntax for type integer: "CUSTOMER_VALUE"', { cause: new Error('CUSTOMER_VALUE') });
    const line = cliExceptionLine(operation, error);
    expect(line).not.toContain('CUSTOMER_VALUE');
    expect(line).not.toContain('invalid input syntax');
    expect(JSON.parse(line)).toMatchObject({ event: `${operation}.failed`, message: '[exception message withheld]' });
    expect(JSON.parse(line).diagnosis).toContain(operation === 'migration' ? 'database log' : 'SpiceDB server log');
    expect(line.endsWith('\n')).toBe(true);
  });

  it('retains the fixed schema-loader configuration diagnostic', () => {
    const message = 'SPICEDB_ENDPOINT and SPICEDB_TOKEN are required.';
    expect(JSON.parse(cliExceptionLine('schema_load', new Error(message))).message).toBe(message);
  });

  it('retains only reviewed messages and shipped code locations', () => {
    const error = new TypeError('HTTP response did not pass its boundary schema.');
    const location = new URL('../src/platform/http/server.ts', import.meta.url).href;
    error.stack = `TypeError: unsafe header\n    at CUSTOMER_VALUE (${location}:367:42)\n    at CUSTOMER_VALUE (node:internal/process/task_queues:95:5)`;
    expect(sanitiseException(error)).toEqual({
      type: 'TypeError', message: error.message,
      stack: ['at src/platform/http/server.ts:367:42', 'at [stack frame location withheld]:95:5'],
    });
  });

  it.each(['', 'Out of Memory Error: CUSTOMER_VALUE', "Parser Error: SELECT 'CUSTOMER_VALUE'", 'HTTP response did not pass its boundary schema. CUSTOMER_VALUE'])('withholds unreviewed message %j', message => {
    const error = new Error(message);
    expect(sanitiseException(error).message).toBe('[exception message withheld]');
    expect(JSON.stringify(sanitiseException(error))).not.toContain('CUSTOMER_VALUE');
  });

  it('does not traverse causes, custom properties or hostile getters', () => {
    const error = new Error('CUSTOMER_VALUE');
    Object.defineProperty(error, 'cause', { get: () => { throw new Error('Cause must not be read'); } });
    Object.defineProperty(error, 'details', { get: () => { throw new Error('Details must not be read'); } });
    expect(sanitiseException(error).message).toBe('[exception message withheld]');
    Object.defineProperty(error, 'stack', { get: () => { throw new Error('CUSTOMER_VALUE'); } });
    expect(sanitiseException(error)).toEqual({ type: '[exception type withheld]', message: '[exception message withheld]', stack: ['[stack content withheld]'] });
  });

  it('withholds thrown objects and dynamic custom exception types', () => {
    class CustomError extends Error {}
    const error = new CustomError('CUSTOMER_VALUE');
    error.name = 'CUSTOMER_VALUE';
    expect(sanitiseException(error).type).toBe('[exception type withheld]');
    expect(JSON.stringify(sanitiseException({ message: 'CUSTOMER_VALUE', stack: 'CUSTOMER_VALUE' }))).not.toContain('CUSTOMER_VALUE');
  });
});
