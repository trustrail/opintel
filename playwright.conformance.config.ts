import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
 ...base,
 // Run every existing browser scenario, including visual scenarios, without
 // comparing or rewriting screenshots. Normal visual CI remains unchanged.
 ignoreSnapshots:true,
 projects:[{name:'conformance',retries:0,metadata:{controlConformance:true}}],
 workers:1,
 reporter:[['list'],['./e2e/conformance/reporter.ts']],
});
