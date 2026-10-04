import process from 'node:process';
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
// Preserve module paths and runtime assets; typechecking is a separate gate.
async function compile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await compile(file); continue; }
    if (file.endsWith('.d.ts')) continue;
    const destination = path.join('compiled', file.replace(/\.tsx?$/u, '.js'));
    await mkdir(path.dirname(destination), { recursive: true });
    if (/\.tsx?$/u.test(file)) {
      const source = await readFile(file, 'utf8');
      const result = ts.transpileModule(source, { fileName: file, compilerOptions: {
        target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      } });
      await writeFile(destination, result.outputText);
    } else { await copyFile(file, destination); }
  }
}
for (const directory of process.argv.slice(2)) await compile(directory);
