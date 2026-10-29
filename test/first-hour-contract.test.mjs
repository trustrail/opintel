import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {firstHour,firstHourRefusal} from '../scripts/images/first-hour.mjs';
it('FH-001: first-hour workflow imports only public transport tooling and cannot access Opintel stores',()=>{
 const text=readFileSync('scripts/images/first-hour.mjs','utf8');
 const imports=[...text.matchAll(/from '([^']+)'/gu)].map(m=>m[1]);
 expect(imports).toEqual(['node:assert/strict','node:crypto','node:timers/promises','node:url','@modelcontextprotocol/sdk/client/index.js','@modelcontextprotocol/sdk/client/streamableHttp.js']);
 expect(text).not.toMatch(/\b(?:withTenant|withPlatform|psql|provision|seed|child_process)\b/u);
 const driver=readFileSync('scripts/images/stage5-smoke.mjs','utf8');expect(driver).toContain("command('engine','sources','add'");expect(driver).toContain("if(firstHourActive)assert.equal(command,join(engine,'sources')");expect(driver).not.toContain("credentialRef:'secret://install/readiness'");
});
it('FH-002: rejects the old readiness reference and names an absent package source command',async()=>{
 await expect(firstHour({source:{credentialRef:'secret://install/readiness'}})).rejects.toThrow('Engine-host imported reference');
 const result=await firstHour({source:{credentialRef:'secret://sources/customer'}});expect(result.status).toBe('failed');expect(result.failure.message).toContain('Engine package sources add');
});

it('FH-007: refusal diagnostics retain only bounded classification and evidence identifiers, never free-form content',()=>{
 const evidenceId='01a18613-ebde-7372-8fb0-c8456b2a38c4';
 expect(firstHourRefusal({code:'unsupported_pushdown',cause:'scan_size_unknown',evidenceId,message:'private value',token:'synthetic-secret'})).toEqual({code:'unsupported_pushdown',cause:'scan_size_unknown',evidenceId});
 expect(firstHourRefusal({code:'x'.repeat(65),cause:'private payload!',evidenceId:'not a receipt'})).toEqual({code:'unknown',cause:'unknown'});
});
