import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(directory, entry.name)) : /\.tsx?$/u.test(entry.name) ? [join(directory, entry.name)] : []);
}
function inspect(file: string, check: (node: ts.Node) => void) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => { check(node); ts.forEachChild(node, visit); };
  visit(source);
}
it('canonicalisation uses neither native date/number parsing nor implicit trim/folding', () => {
  const violations: string[] = [];
  for (const file of ['canonicalise.ts', 'calendar.ts', 'infrastructure/time-zone.ts']) {
    inspect('sidecar/tokenize/' + file, node => {
      if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
      const expression = node.expression;
      if (ts.isIdentifier(expression) && ['Date', 'Number', 'parseFloat'].includes(expression.text)) violations.push(file + ':' + expression.text);
      if (ts.isPropertyAccessExpression(expression) && ['trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toLocaleLowerCase', 'parseFloat'].includes(expression.name.text)) violations.push(file + ':' + expression.name.text);
    });
  }
  expect(violations).toEqual([]);
});
it('the application imports no sidecar implementation and never resolves binary keys', () => {
  const violations: string[] = [];
  for (const file of files('src')) inspect(file, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.includes('sidecar/')) violations.push(file);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'resolveBytes') violations.push(file);
  });
  expect(violations).toEqual([]);
}, 30_000);
