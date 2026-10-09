import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';

// Observe functional and screenshot scenarios as they run, without replaying
// either suite. Snapshot comparisons and every per-state assertion stay active.
export default defineConfig({
 ...base,
 projects:base.projects?.map(project=>({...project,metadata:{...project.metadata,controlConformance:true}})),
 workers:1,
 reporter:[['list'],['./e2e/recorded-performance-reporter.ts'],['./e2e/conformance/reporter.ts']],
});
