import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({ ...base, testIgnore: [], testMatch: '**/*.performance.spec.ts', workers: 1, retries: 0, reporter: [['list'], ['json', {outputFile: 'test-results/catalog-performance.json'}]] });
