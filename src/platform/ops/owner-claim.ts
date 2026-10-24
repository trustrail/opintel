import process from 'node:process';
import {parseArgs} from 'node:util';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {InstallationClaimBody} from '../../shared/api/installation-claim.js';
import {IndustryId} from '../../shared/kernel/index.js';
import {PostgresInstallationClaimWriter} from '../../modules/tenancy/infrastructure/installation-claim-writer.js';
import {cliExceptionLine} from '../telemetry/exception-log.js';

async function output(message:string){await new Promise<void>(done=>process.stdout.write(message+'\n',()=>done()));}
async function main():Promise<number>{
 const {values}=parseArgs({options:{'owner-email':{type:'string'},company:{type:'string'},region:{type:'string'},'industry-id':{type:'string'},help:{type:'boolean'}},strict:true});
 if(values.help){await output('owner-claim --owner-email EMAIL --company NAME --region REGION [--industry-id UUID]\nRun once on the gateway host. The claim expires after 24 hours and is redeemed through normal login.');return 0;}
 if(process.env.OPINTEL_DEPLOYMENT_PACKAGE!=='gateway'||!process.env.DATABASE_URL){
  await output('Run owner-claim through the gateway package with its operator database environment.');return 1;
 }
 const parsed=InstallationClaimBody.safeParse({claimant:{kind:'email',email:values['owner-email']},company:{name:values.company,defaultRegion:values.region,defaultIndustryId:values['industry-id']??null}});
 if(!parsed.success){await output('Supply a valid owner email, company name, region and optional industry id.');return 1;}
 const {claimant,company}=parsed.data;
 const result=await new PostgresInstallationClaimWriter().create({claimant,company:{...company,defaultIndustryId:company.defaultIndustryId===null?null:IndustryId(company.defaultIndustryId)}});
 if(!result.ok){await output(result.error.message);return 1;}
 await output(`Owner claim ${result.value.id} expires at ${result.value.expiresAt}. Complete normal sign-in using the claimed email within that window.`);
 return 0;
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 void main().then(code=>process.exit(code)).catch(async(error:unknown)=>{
  await new Promise<void>(done=>process.stderr.write(cliExceptionLine('owner_claim',error),()=>done()));process.exit(1);
 });
}
