import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {XqReleaseProvider} from '../../src/modules/release-custody/index.js';
import {authorizeWithWorker} from '../xq-bootstrap.js';
import type {XqIntegrationConfig,XqIntegrationPort} from '../xq-integration.js';
/** Operator-only SDK adapters. Tokens and plaintext never leave the process. */
export async function connectXqIntegration(c:XqIntegrationConfig):Promise<XqIntegrationPort>{
 const client=new Client({name:'xq-integration-test',version:'1'});
 const transport=new StreamableHTTPClientTransport(new URL(`/mcp/v1/p/${c.OPINTEL_XQ_TEST_PROJECT_ID}`,c.OPINTEL_API_BASE_URL),{requestInit:{headers:{authorization:`Bearer ${c.OPINTEL_XQ_TEST_POOL_KEY}`,'x-opintel-agent-id':'xq-integration-test'}}});
 try{await client.connect(transport);}catch{await client.close().catch(()=>undefined);throw new Error('MCP connection failed');}
 const provider=new XqReleaseProvider({apiKey:c.OPINTEL_XQ_API_KEY,dashboardApiKey:'',senderAlias:c.OPINTEL_XQ_SENDER_ALIAS,senderAccessToken:c.OPINTEL_XQ_SENDER_ACCESS_TOKEN},'operator-test',c.OPINTEL_XQ_REDEEM_URL);
 return {
  call:(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:60000}),
  authorize:async alias=>{const result=z.object({token:z.string().min(1)}).parse(await authorizeWithWorker({apiKey:c.OPINTEL_XQ_API_KEY,alias}));return result.token;},
  fetchShare:(locator,alias,token)=>provider.fetch(locator,alias,token),revoke:locator=>provider.revoke(locator),close:()=>client.close(),
 };
}
