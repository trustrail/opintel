import base from '../../vitest.config.js';
import {defineConfig} from 'vitest/config';
export default defineConfig({...base,test:{...base.test,include:['test/review/console-next-pools.capture.ts'],testTimeout:180000}});
