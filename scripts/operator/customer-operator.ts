import {operatorDiagnostic} from './diagnostics.js';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {z} from 'zod';
import {withPlatform} from '../../src/platform/db/scope.js';
import {CompanyId,UserId,SystemClock} from '../../src/shared/kernel/index.js';
import {PostgresInstallationClaimWriter,inviteCompanyMember} from '../../src/modules/tenancy/index.js';
import {configuredMail} from '../../src/platform/mail/index.js';
import {XqReleaseProvider} from '../../src/modules/release-custody/index.js';
class CommandError extends Error {}
async function owner(){
 const email=z.email().parse(process.env.OWNER_EMAIL);
 const rows=await withPlatform(tx=>tx.query<{id:string;company_id:string}>("SELECT u.id,m.company_id FROM user_account u JOIN company_member m ON m.user_id=u.id WHERE u.email=$1 AND m.role='admin' AND u.last_login_at IS NOT NULL",[email]));
 if(rows.length!==1)throw new CommandError('Complete the installation owner email login first; exactly one installation company is required.');
 return {id:UserId(rows[0]!.id),companyId:CompanyId(rows[0]!.company_id)};
}
async function main(){
 if(process.env.OPINTEL_DEPLOYMENT_PACKAGE!=='gateway')throw new CommandError('Use the command on the gateway host.');
 const command=process.argv[2];
 if(command==='owner-claim'||command==='initial-owner'){
  const email=z.email().parse(command==='initial-owner'?process.env.OWNER_EMAIL:process.argv[3]);
  if(command==='initial-owner'){
   const existing=await withPlatform(tx=>tx.query("SELECT 1 FROM installation_owner_claim WHERE claimant->>'email'=$1 AND (redeemed_at IS NOT NULL OR expires_at>now())",[email]));
   if(existing.length){console.info('Existing owner claim retained.');return;}
  }
  const result=await new PostgresInstallationClaimWriter().create({claimant:{kind:'email',email},company:{name:'Customer',defaultRegion:'us-east-1',defaultIndustryId:null}});if(!result.ok)throw result.error;
  console.info('Owner claim expires at '+result.value.expiresAt+'. Complete normal email login at '+new URL('/sign-in',z.url().parse(process.env.APP_BASE_URL)).href);return;
 }
 if(command==='users'){
  const actor=await owner();
  const rows=await withPlatform(tx=>tx.query<{email:string;role:string}>('SELECT u.email,m.role FROM company_member m JOIN user_account u ON u.id=m.user_id WHERE m.company_id=$1 ORDER BY u.email',[actor.companyId]));
  for(const row of rows)console.info(row.role+'\t'+row.email);return;
 }
 if(command==='invite'){
  const actor=await owner();
  const args=parseArgs({args:process.argv.slice(3),allowPositionals:true,options:{role:{type:'string'}},strict:true});if(args.positionals.length!==1)throw new CommandError('Usage: ./invite EMAIL --role admin|member');
  const result=await inviteCompanyMember({email:z.email().parse(args.positionals[0]),role:z.enum(['admin','member']).parse(args.values.role),companyId:actor.companyId,actorId:actor.id},configuredMail(new SystemClock()));if(!result.ok)throw result.error;console.info('Invitation sent; membership requires normal email or company SSO login.');return;
 }
 if(command==='mail-test'){
  if(!process.env.SMTP_HOST)throw new CommandError('Configure SMTP before mail-test.');
  const result=await configuredMail(new SystemClock()).send({to:z.email().parse(process.argv[3]),template:'alert',vars:{message:'Opintel SMTP delivery test'},idempotencyKey:'operator-mail-test:'+randomUUID()});if(!result.ok)throw result.error;console.info('SMTP accepted test message; response code '+(result.value.smtpResponse??'unavailable'));return;
 }
 if(command==='xq-check'){
  const required=(name:string)=>z.string().min(1).parse(process.env[name]);
  const result=await new XqReleaseProvider({apiKey:required('OPINTEL_XQ_API_KEY'),dashboardApiKey:required('OPINTEL_XQ_DASHBOARD_API_KEY'),senderAlias:required('OPINTEL_XQ_SENDER_ALIAS'),senderAccessToken:required('OPINTEL_XQ_SENDER_ACCESS_TOKEN')},required('OPINTEL_XQ_TEAM_ID'),required('OPINTEL_XQ_REDEEM_URL')).health();
  console.info({event:'operator.xq_check',timestamp:new Date().toISOString(),reachable:result.reachable,authenticated:result.authenticated,failure:result.failure});if(!result.reachable||!result.authenticated||result.failure)throw new CommandError('XQ connection check failed.');return;
 }
 throw new CommandError('Unknown operator command.');
}
void main().then(()=>process.exit(0)).catch((error:unknown)=>{operatorDiagnostic(error);process.exit(1);});
