import {defineConfig} from 'vitest/config';
import normal from './vitest.config.js';
// Explicit opt-in only: the normal gate must never contact XQ.
export default defineConfig({...normal,test:{...normal.test,include:['scripts/conformance/v02.live.test.ts'],testTimeout:240000}});
