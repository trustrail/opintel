import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/review/console-next-first-run.capture.ts'],testTimeout:180000,hookTimeout:30000,fileParallelism:false}});
