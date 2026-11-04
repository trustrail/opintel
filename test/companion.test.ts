import {describe,it,expect} from 'vitest';
import {Config,Credential,createTools} from '../scripts/companion/core.js';
import type {McpCall} from '../scripts/steps/service.js';
const config={gateway:'https://opintel.trustrail.io',project:'8b0998f1-09c5-47ba-b060-1ee4920ba68b',agentId:'oap-analyst',caFile:null};
const answer=(id:string)=>({columns:[{name:'amount',type:'TEXT'}],rows:[['opintelsealed:v1:unchanged']],evidenceId:id,truncated:false});
describe('OAP companion',()=>{
 it('rejects incomplete credentials and non-public-TLS config',()=>{expect(Credential.safeParse({v:1}).success).toBe(false);expect(Config.safeParse({...config,gateway:'http://example.org'}).success).toBe(false);expect(Config.parse(config)).toEqual(config);});
 it('returns describe and keeps sealed query values intact',async()=>{const call:McpCall=async name=>name==='opintel.describe'?{structuredContent:{objects:[]}}:{structuredContent:answer('019498c0-bbde-7ee9-b3e3-af32c1ee22d1')};const tool=createTools(call,config,async()=>Buffer.alloc(32));expect(await tool('opintel_describe',{})).toEqual({objects:[]});expect(await tool('opintel_query',{sql:'select 1'})).toMatchObject({rows:[['opintelsealed:v1:unchanged']]});});
 it('passes a gateway refusal through',async()=>{const tool=createTools(async()=>({isError:true,_meta:{code:'element_withheld',cause:'element_withheld'},content:[{type:'text',text:'A column is withheld.'}]}),config,async()=>Buffer.alloc(32));expect(await tool('opintel_query',{sql:'select 1'})).toMatchObject({refused:true,code:'element_withheld',message:'A column is withheld.'});});
 it('evicts the oldest result at its bound',async()=>{let number=0;const ids=['019498c0-bbde-7ee9-b3e3-af32c1ee22d1','019498c0-bbde-7ee9-b3e3-af32c1ee22d2'];const tool=createTools(async()=>({structuredContent:answer(ids[number++]!)}),config,async()=>Buffer.alloc(32),1);await tool('opintel_query',{sql:'select 1'});await tool('opintel_query',{sql:'select 1'});expect(await tool('opintel_unseal',{evidenceId:ids[0]})).toMatchObject({refused:true,code:'result_not_found'});});
});

it('bundle boundaries exclude the companion from application and existing kits',async()=>{
 const {assertPackageInputs}=await import('../scripts/engine-package/package-boundaries.mjs');
 for(const target of ['api','engine','provisioning','agent-kit','demo-tools'])expect(()=>assertPackageInputs(target,['scripts/companion/main.ts'])).toThrow('Package boundary');
 expect(()=>assertPackageInputs('companion',['src/modules/mcp/infrastructure/http.ts'])).toThrow('Package boundary');
});
