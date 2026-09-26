import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDirectory = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const fixture = (name) => path.join(rootDirectory, 'test', 'fixtures', 'module-boundary', name, 'src', 'modules', 'identity');

const cases = [
  ['domain rejects infrastructure', fixture('domain-to-infrastructure'), 'domain/probe.ts'],
  ['application rejects infrastructure', fixture('application-to-infrastructure'), 'application/probe.ts'],
  ['infrastructure rejects api', fixture('infrastructure-to-api'), 'infrastructure/probe.ts'],
  ['api rejects infrastructure', fixture('api-to-infrastructure'), 'api/probe.ts']
];

describe('module boundary rule', () => {
  it.each(cases)('%s', async (_name, directory, file) => {
    const eslint = new ESLint({ cwd: rootDirectory });
    const [result] = await eslint.lintFiles([path.join(directory, file)]);

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe('opintel/module-boundary');
    expect(result.messages[0]?.messageId).toBe('layerImport');
  }, 30_000);

  it('rejects a cross-module non-index .js import', async () => {
    const eslint = new ESLint({ cwd: rootDirectory });
    const [result] = await eslint.lintFiles([
      path.join(fixture('cross-module-deep-import'), 'application/probe.ts')
    ]);

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe('opintel/module-boundary');
    expect(result.messages[0]?.messageId).toBe('crossContextDeepImport');
  }, 30_000);

  it('accepts a cross-module index.js import', async () => {
    const eslint = new ESLint({ cwd: rootDirectory });
    const [result] = await eslint.lintFiles([
      path.join(fixture('cross-module-public-import'), 'application/probe.ts')
    ]);

    expect(result.messages).toEqual([]);
  }, 30_000);

  it('still accepts a cross-module extensionless index import', async () => {
    const eslint = new ESLint({ cwd: rootDirectory });
    const [result] = await eslint.lintText("import '../../authz/index';\n", {
      filePath: path.join(fixture('cross-module-public-import'), 'application/probe.ts')
    });

    expect(result.messages).toEqual([]);
  }, 30_000);
});
