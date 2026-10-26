// @vitest-environment happy-dom
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {DeploymentWarning} from '../src/app/deployment-warning.js';
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('DEP-016: fallback TLS produces a visible warning using the deployment response',async()=>{
 vi.stubEnv('MODE','production');vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({selfSignedTls:true}),{headers:{'content-type':'application/json'}})));
 render(<QueryClientProvider client={new QueryClient()}><DeploymentWarning/></QueryClientProvider>);
 expect((await screen.findByRole('alert')).textContent).toContain('self-signed TLS certificate');
});
it('DEP-016: supplied TLS does not display a fallback warning',async()=>{
 vi.stubEnv('MODE','production');const fetcher=vi.fn(async()=>new Response(JSON.stringify({selfSignedTls:false}),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
 const client=new QueryClient();render(<QueryClientProvider client={client}><DeploymentWarning/></QueryClientProvider>);
 await vi.waitFor(()=>expect(client.getQueryState(['deployment','tls'])?.status).toBe('success'));
 expect(screen.queryByRole('alert')).toBeNull();
});
