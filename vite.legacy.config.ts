import {defineConfig,mergeConfig} from 'vite';
import original from './vite.config.js';
export default defineConfig(async environment=>mergeConfig(typeof original==='function'?await original(environment):original,{base:'/legacy/',plugins:[{name:'legacy-entry',transformIndexHtml:{order:'pre',handler(html:string){return html.replace('/src/main.tsx','/src/legacy-entry.tsx');}}}],build:{outDir:'dist/legacy',emptyOutDir:false}}));
