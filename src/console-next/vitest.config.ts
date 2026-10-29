import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({test:{root:fileURLToPath(new URL('../../',import.meta.url)),include:['src/console-next/**/*.test.{ts,tsx}'],environment:'happy-dom',globals:false,fileParallelism:false,setupFiles:['src/console-next/test-setup.ts']}});
