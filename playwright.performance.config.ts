import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({ ...base, projects: [{name: 'performance', retries: 0}], testIgnore: [], testMatch: '**/*.performance.spec.ts', workers: 1, retries: 0, reporter: [['list'], ['json', {outputFile: 'test-results/catalog-performance.json'}]] });
