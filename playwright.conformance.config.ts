import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,reporter:[['list'],['./e2e/conformance/reporter.ts']]});
