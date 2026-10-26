import {ReleaseRuntime} from '../../src/modules/release-custody/index.js';
import {context,operatorApiTarget} from './common.js';
import {ProjectId} from '../../src/shared/kernel/index.js';
import {lifecycleReady} from './preconditions.js';
import {OperatorConflict} from './common.js';
import {createHash} from 'node:crypto';
import {demoManifest} from '../soak/manifest.js';
import {demoTables,generateSpecification} from '../demo-soak-definition.js';
import {externalTarget} from '../soak/external.js';
import {custodyAgents} from '../soak/custody.js';
import {createObserver} from '../soak/observer.js';
import {QueryOutput,DescribeOutput} from '../../src/shared/api/mcp.js';
import {discoveryMismatches} from '../soak/scenarios.js';
import {CustodyProviderStatus} from '../../src/shared/api/release-custody.js';
import {required,privateRead,privateWrite,api} from './common.js';
import {syntheticSource} from './infrastructure/synthetic-source.js';
export async function prepare(){
 const record:{at:string;status:string;checks:string[];reason?:string;certificates?:Array<{certificateId:number;ok:boolean;status:number|null;reason:string|null}>;verifiedValues?:number;receiptIds?:string[]}={at:new Date().toISOString(),status:'incomplete',checks:[]};
 const report=required('OPINTEL_OUTPUT_DIRECTORY')+'/prepare-'+Date.now()+'.json';
 let observer:ReturnType<typeof createObserver>|undefined,external:Awaited<ReturnType<typeof externalTarget>>|undefined,devices:ReturnType<typeof custodyAgents>|undefined;
 try{
 const m=demoManifest.parse(JSON.parse(await privateRead(required('OPINTEL_SOAK_MANIFEST'))));
 const duration=Number(required('OPINTEL_SOAK_DURATION'));if(!Number.isSafeInteger(duration)||duration<1)throw new OperatorConflict('Declare positive soak duration in seconds');
 if(m.version!==2||!m.specification||m.agents.length!==10||m.definitionHash!==createHash('sha256').update(JSON.stringify(demoTables)).digest('hex'))throw new OperatorConflict('Scenario manifest is incomplete or incompatible');
 if(JSON.stringify(m.specification)!==JSON.stringify(generateSpecification(Object.fromEntries(Object.entries(m.objects).map(([full,name])=>[name,full])),m.agents)))throw new OperatorConflict('Scenario declaration differs from the versioned generator');
 lifecycleReady(m,duration);
 record.checks.push('scenario-and-lifecycle');await syntheticSource(false);record.checks.push('source-counts-and-estimates');
 const provider=CustodyProviderStatus.parse(await (async()=>{if(process.env.OPINTEL_CUSTOMER_JOB!=='1')return api(`/api/v1/projects/${m.projectId}/custody-provider`);const c=await context(),runtime=new ReleaseRuntime();try{return await runtime.status({projectId:ProjectId(m.projectId),userId:c.userId});}finally{runtime.close();c.auth.close();}})());if(provider.provider!=='xq'||!provider.available)throw new OperatorConflict('XQ provider unavailable; run the explicit packaged API connection check');record.checks.push('packaged-api-provider');
 external=await externalTarget(operatorApiTarget(),required('OPINTEL_SOAK_MANIFEST'));
 observer=createObserver(external.base,m.projectId,required('OPINTEL_OBSERVER_COOKIE'),()=>{});await observer.ready();record.checks.push('receipt-list');
 devices=custodyAgents(required('OPINTEL_CERTIFICATES'),required('OPINTEL_XQ_API_KEY'),()=>{},s=>{record.certificates??=[];record.certificates.push({certificateId:s.certificateId,ok:s.ok,status:s.status,reason:s.reason});});
 const associations=await devices.associations();if(associations.length!==4)throw new OperatorConflict('Certificate exchange incomplete or denied by provider location policy');
 for(const a of m.agents)if(!a.association||!associations.some(s=>JSON.stringify(s)===JSON.stringify(a.association)))throw new OperatorConflict('Credential certificate association conflict');record.checks.push('certificate-exchanges');
 for(const poolIndex of [0,1]){const agent=m.agents.find(a=>a.poolIndex===poolIndex)!;const agentId='prepare-'+Date.now()+'-'+poolIndex;
 const connection=await external.connect(agent.key,agentId);const discovery=DescribeOutput.parse((await connection.client.callTool({name:'opintel.describe',arguments:{}})).structuredContent);if(discoveryMismatches(m.specification,poolIndex,discovery.objects).length)throw new OperatorConflict('Discovery differs from scenario declaration');
 const scenario=m.specification.scenarios.find(s=>s.poolIndex===poolIndex&&s.requiresCustody&&s.credential==='normal'&&s.credentialId===agent.credentialId);if(!scenario)throw new OperatorConflict('Missing custody scenario');
 const response=await connection.query(scenario.sql);if(response.isError)throw new OperatorConflict('Escrow query refused');const output=QueryOutput.parse(response.structuredContent);if(!output.custody?.length||!output.rows.length)throw new OperatorConflict('Escrow query returned no custody values');
 const expected:Record<string,unknown[]>={};for(const column of scenario.columns){const declaration=m.specification.objects.find(o=>o.name===column.object&&o.poolIndex===poolIndex);if(declaration?.columns.find(c=>c.name===column.name)?.treatment!=='custody')continue;const anchor=scenario.columns.find(c=>c.name!==column.name);if(!anchor)throw new OperatorConflict('Custody oracle missing anchor');const index=output.columns.findIndex(c=>c.name===anchor.alias);expected[column.alias]=output.rows.map(row=>{const values=[...new Set(scenario.expected.rows!.filter(r=>r[anchor.name]===row[index]).map(r=>r[column.name]))];if(values.length!==1)throw new OperatorConflict('Ambiguous custody oracle');return values[0];});}
 await devices.connect(poolIndex,new URL(`/mcp/v1/p/${m.projectId}`,external.base).href,agent.key,agentId,agent.association!,agent.association);
 const result=await devices.complete(poolIndex,output,expected);if(!result.ok||!result.verified)throw new OperatorConflict('Escrow/redeem round trip failed');
 const receipt=await observer.read(output.evidenceId,agentId);if(!receipt||receipt.poolId!==agent.pool||receipt.credentialId!==agent.credentialId)throw new OperatorConflict('Receipt ownership mismatch');record.verifiedValues=(record.verifiedValues??0)+result.verified;record.receiptIds??=[];record.receiptIds.push(output.evidenceId);record.checks.push('escrow-redeem-and-receipt-pool-'+poolIndex);
 }
 record.status='passed';console.info('Soak preparation passed; source, receipt, certificate, custody and lifecycle prerequisites verified');
 }catch(e){record.status='failed';record.reason=e instanceof OperatorConflict?e.message:'Preparation infrastructure failure';throw e;}finally{await devices?.close();await external?.close();await observer?.close();await privateWrite(report,record);}
}
