import {createPublicKey} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {releaseProviderRedeemOutput,releaseClaims} from '../src/shared/release-contract.js';
import {unsealCell,xorShares,PostgresGrantSignatures,verifyGrant} from '../src/modules/release-custody/index.js';
import {queryFixture} from './fixtures/query/fixture.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
it('5.36: real engine lineage seals direct, aliased, CTE and aggregate deliveries; MCP redeems by credential',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
 expect(await f.query('SELECT field_1 AS field_4 FROM warehouse.public.records ORDER BY field_4')).toMatchObject({isError:true});
 const other=await f.issue('Other credential'),second=await f.connect(other.key);
 for(const sql of ['SELECT field_1 FROM warehouse.public.records','WITH q AS (SELECT field_1 AS secret FROM warehouse.public.records) SELECT secret AS answer FROM q','SELECT SUM(field_1) AS total FROM warehouse.public.records']){
  const response=await f.query(sql);expect(response.isError,JSON.stringify(response)).not.toBe(true);
  const output=QueryOutput.parse(response.structuredContent),bundle=output.custody?.[0];expect(bundle).toBeDefined();
  expect(output.rows[0]?.[0]).toMatch(/^opintelsealed:v1:/);
  const grant=bundle!.grant,claims=releaseClaims.parse(JSON.parse(Buffer.from(grant.split('.')[1]!,'base64url').toString('utf8')));
  expect(await second.client.callTool({name:'opintel.redeem',arguments:{grant}})).toMatchObject({isError:true});
  const k2=await f.client.callTool({name:'opintel.redeem',arguments:{grant}});expect(k2.isError,JSON.stringify(k2)).not.toBe(true);
  const denied=await fetch(claims.custody.provider_redeem_at,{method:'POST',headers:{authorization:`Bearer ${other.key}`,'content-type':'application/json','x-opintel-agent-id':'custody-recipient'},body:JSON.stringify({grant})});expect(denied.status).toBe(403);
  const firstResponse=await fetch(claims.custody.provider_redeem_at,{method:'POST',headers:{authorization:`Bearer ${f.issued.key}`,'content-type':'application/json','x-opintel-agent-id':'custody-recipient'},body:JSON.stringify({grant})});expect(firstResponse.status).toBe(200);const first=releaseProviderRedeemOutput.parse(await firstResponse.json());
  const share=(k2.structuredContent as {share:string}).share,key=xorShares(Buffer.from(first.share,'base64url'),Buffer.from(share,'base64url'));
  expect(unsealCell(String(output.rows[0]![0]),key,output.evidenceId,output.columns[0]!.name,0)).toEqual(sql.includes('SUM')?'28':1);key.fill(0);
  expect(await f.client.callTool({name:'opintel.redeem',arguments:{grant}})).toMatchObject({isError:true});
  const [stored]=await withTenant(f.ctx,tx=>tx.query<{share:Buffer|null;state:string}>('SELECT share,state FROM release_grant WHERE id=$1',[claims.jti]));expect(stored).toEqual({share:null,state:'redeemed'});
 }
 // Retired public keys keep historical grants verifiable; no retired private key
 // is needed to verify the result an agent already received.
 const signatures=new PostgresGrantSignatures({id:'local',tenant:'local'},'11'.repeat(32));
 const before=await signatures.describe(f.ctx),saved=(await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent;
 const savedOutput=QueryOutput.parse(saved),savedGrant=savedOutput.custody![0]!.grant;
 await signatures.rotate(f.ctx,600);const after=await signatures.describe(f.ctx);
 expect(after.keys.length).toBe(before.keys.length+1);
 expect(verifyGrant(savedGrant,kid=>{const key=after.keys.find(k=>k.kid===kid);return key?createPublicKey({key,format:'jwk'}):undefined;}).rcpt).toBe(savedOutput.evidenceId);
 // Cleanup cannot depend on a remaining project member or a live project.
 await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{custody,grant_ttl}','2') WHERE id=$1",[f.ctx.projectId]));
 const expiring=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent),expiringClaims=releaseClaims.parse(JSON.parse(Buffer.from(expiring.custody![0]!.grant.split('.')[1]!,'base64url').toString('utf8')));
 await withPlatform(async tx=>{await tx.query('UPDATE project SET archived_at=now() WHERE id=$1',[f.ctx.projectId]);await tx.query('DELETE FROM project_member WHERE project_id=$1',[f.ctx.projectId]);});
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiringClaims.exp*1000-Date.now()+20)));await f.release!.sweep();
 const [cleaned]=await withTenant(f.ctx,tx=>tx.query('SELECT share,state,escrow_revoked FROM release_grant WHERE id=$1',[expiringClaims.jti]));expect(cleaned).toEqual({share:null,state:'expired',escrow_revoked:true});
},60000);
