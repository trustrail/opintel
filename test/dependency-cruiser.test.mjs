import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
it('dependency-cruiser allows own-domain exports and rejects another module domain', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'opintel-boundaries-'));
  try {
    await mkdir(path.join(directory, 'src/modules/catalog/domain'), { recursive: true });
    await mkdir(path.join(directory, 'src/modules/other/domain'), { recursive: true });
    await writeFile(path.join(directory, 'src/modules/catalog/domain/catalog.js'), 'export const Catalog = 1;\n');
    await writeFile(path.join(directory, 'src/modules/other/domain/other.js'), 'export const Other = 2;\n');
    const entry = path.join(directory, 'src/modules/catalog/index.js');
    const args = [path.join(root, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
      '--config', path.join(root, '.dependency-cruiser.cjs'), 'src', '--output-type', 'err'];
    await writeFile(entry, "export { Catalog } from './domain/catalog.js';\n");
    await expect(exec(process.execPath, args, { cwd: directory })).resolves.toMatchObject({ stderr: '' });
    await writeFile(entry, "export { Other } from '../other/domain/other.js';\n");
    await expect(exec(process.execPath, args, { cwd: directory })).rejects.toMatchObject({ code: 1 });
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 15_000);
