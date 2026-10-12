import {XqReleaseProvider} from '../src/modules/release-custody/index.js';
import {z} from 'zod';
let text='';for await(const chunk of process.stdin)text+=chunk;
const v=z.strictObject({locator:z.string(),alias:z.string(),accessToken:z.string(),apiKey:z.string(),tenant:z.string(),redeemAt:z.url()}).parse(JSON.parse(text) as unknown);
const provider=new XqReleaseProvider({apiKey:v.apiKey,dashboardApiKey:'',senderAlias:'',senderAccessToken:''},v.tenant,v.redeemAt);
try{const key=await provider.fetch(v.locator,v.alias,v.accessToken);try{process.stdout.write(JSON.stringify({share:key.toString('base64url')}));}finally{key.fill(0);}}catch{process.stderr.write('XQ K1 redemption refused.\n');process.exitCode=1;}
