import globals from 'globals';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const rawHex = /#[0-9a-fA-F]{3,8}\b/u;
const arbitraryTailwindValue = /\b[A-Za-z][\w-]*-\[[^\]]+\]/u;
const moduleLayers = new Set(['domain', 'application', 'infrastructure', 'api']);

function moduleLocation(filePath) {
  const parts = path.resolve(filePath).split(path.sep);
  const modulesIndex = parts.lastIndexOf('modules');
  if (modulesIndex < 1 || parts[modulesIndex - 1] !== 'src') return null;

  const context = parts[modulesIndex + 1];
  if (context === undefined) return null;

  const candidateLayer = parts[modulesIndex + 2];
  return {
    context,
    layer: candidateLayer !== undefined && moduleLayers.has(candidateLayer) ? candidateLayer : null,
    root: parts.slice(0, modulesIndex + 2).join(path.sep)
  };
}

const localRules = {
  rules: {
    'canonicaliser-purity': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Canonicalisers use only local helpers and deterministic operations; {{name}} is forbidden.' } },
      create(context) {
        const forbidden = new Set(['Date', 'process', 'globalThis', 'fetch', 'eval', 'Function', 'require']);
        const report = (node, name) => context.report({node, messageId: 'forbidden', data: {name}});
        const imported = node => { if (node.source && !/^\.{1,2}\//u.test(node.source.value)) report(node, 'non-local import'); };
        return {
          ImportDeclaration: imported, ExportNamedDeclaration: imported, ExportAllDeclaration: imported,
          ImportExpression(node) { report(node, 'dynamic import'); },
          TSImportEqualsDeclaration(node) { report(node, 'require import'); },
          Identifier(node) { if (forbidden.has(node.name)) report(node, node.name); },
          MemberExpression(node) {
            if (node.object.type === 'Identifier' && node.object.name === 'Math' &&
              (!node.computed && node.property.name === 'random' || node.computed && node.property.value === 'random')) report(node, 'Math.random');
          },
          VariableDeclarator(node) { if (node.id.type === 'ObjectPattern' && node.init?.type === 'Identifier' && node.init.name === 'Math' && node.id.properties.some(p => p.key?.name === 'random' || p.key?.value === 'random')) report(node, 'Math.random'); }
        };
      }
    },
    'module-boundary': {
      meta: {
        type: 'problem',
        docs: { description: 'Contexts may import another context only through its public index.' },
        schema: [],
        messages: {
          crossContextDeepImport: 'Cross-context imports must target the other context public index.ts.',
          layerImport: 'This layer cannot import the target layer within the same module.'
        }
      },
      create(context) {
        const source = moduleLocation(context.filename);

        function checkImport(node, value) {
          if (source === null || typeof value !== 'string') return;

          const targetPath = value.startsWith('@/')
            ? path.join(rootDirectory, 'src', value.slice(2))
            : value.startsWith('.')
              ? path.resolve(path.dirname(context.filename), value)
              : null;
          if (targetPath === null) return;

          const target = moduleLocation(targetPath);
          if (target === null) return;

          if (target.context === source.context) {
            const forbiddenTargets = {
              domain: new Set(['application', 'infrastructure', 'api']),
              application: new Set(['infrastructure', 'api']),
              infrastructure: new Set(['api']),
              api: new Set(['infrastructure'])
            };
            if (source.layer !== null && target.layer !== null && forbiddenTargets[source.layer].has(target.layer)) {
              context.report({ node, messageId: 'layerImport' });
            }
            return;
          }

          const publicEntry = target.root;
          if (targetPath !== publicEntry &&
              targetPath !== `${publicEntry}${path.sep}index` &&
              targetPath !== `${publicEntry}${path.sep}index.js`) {
            context.report({ node, messageId: 'crossContextDeepImport' });
          }
        }

        return {
          ImportDeclaration(node) {
            checkImport(node, node.source.value);
          },
          ExportNamedDeclaration(node) {
            if (node.source !== null) checkImport(node, node.source.value);
          },
          ExportAllDeclaration(node) {
            checkImport(node, node.source.value);
          }
        };
      }
    },
    'no-raw-style-values': {
      meta: {
        type: 'problem',
        docs: { description: 'Forbid raw hexadecimal colours and arbitrary Tailwind values.' },
        schema: [],
        messages: {
          rawHex: 'Use a design token instead of a raw hexadecimal colour.',
          arbitraryTailwind: 'Use a design token instead of an arbitrary Tailwind value.'
        }
      },
      create(context) {
        function checkValue(node, value) {
          if (rawHex.test(value)) context.report({ node, messageId: 'rawHex' });
          if (arbitraryTailwindValue.test(value)) context.report({ node, messageId: 'arbitraryTailwind' });
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') checkValue(node, node.value);
          },
          TemplateElement(node) {
            checkValue(node, node.value.raw);
          }
        };
      }
    }
  }
};

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'sidecar/**/*.ts', 'test/fixtures/module-boundary/**/src/**/*.{ts,tsx}', 'test/fixtures/canonicalisers/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      opintel: localRules
    },
    rules: {
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'opintel/module-boundary': 'error',
      'opintel/no-raw-style-values': 'error'
    }
  },
  { files: ['sidecar/tokenize/canonicalisers/**/*.ts', 'test/fixtures/canonicalisers/**/*.ts'], rules: { 'opintel/canonicaliser-purity': 'error' } }
];
