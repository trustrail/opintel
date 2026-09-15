import { describe, expect, it } from 'vitest';
import * as scope from '../src/platform/db/scope.js';

describe('database scope export surface', () => {
  it('exports only the three database scopes', () => {
    expect(Object.keys(scope).sort()).toEqual([
      'withPlatform',
      'withPlatformAdmin',
      'withTenant',
    ]);
  });

  it('does not expose a pool or client outside the scope module', () => {
    expect(scope).not.toHaveProperty('pool');
    expect(scope).not.toHaveProperty('client');
  });
});
