import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {consoleDestination} from '../shared/console-destinations.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig(({mode})=>{
 const environment=loadEnv(mode,fileURLToPath(new URL('../../',import.meta.url)),'');
 const target=`http://localhost:${environment.API_PORT??'3000'}`;
 return {base:'/',root,plugins:[react(),{name:'console-destinations',configureServer(server){server.middlewares.use((request,response,next)=>{const url=new URL(request.url??'/',target),destination=consoleDestination(url.pathname+url.search+url.hash);if(destination){response.writeHead(302,{location:destination});response.end();}else next();});}}],server:{host:'127.0.0.1',port:5174,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../',import.meta.url))]},proxy:{'^/api/':{target,changeOrigin:true},'/auth/oidc':{target,changeOrigin:true},'/deployment.json':{target:environment.APP_BASE_URL??target,changeOrigin:true}}},build:{outDir:'../../dist',emptyOutDir:false}};
});
