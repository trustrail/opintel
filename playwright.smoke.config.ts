import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,timeout:60_000,use:{...base.use,trace:'retain-on-failure',connectOptions:process.env.OPINTEL_SMOKE_BROWSER_WS?{wsEndpoint:process.env.OPINTEL_SMOKE_BROWSER_WS,exposeNetwork:'<loopback>'}:undefined},globalSetup:'./e2e/smoke-setup.ts',projects:[{name:'smoke',testMatch:'smoke.spec.ts',retries:0}],reporter:[['list']]});
