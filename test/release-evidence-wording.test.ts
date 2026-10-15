import {readFile} from 'node:fs/promises';
import {it,expect} from 'vitest';
import {releaseNonClaim,releaseEvidenceMeaning,releaseEvent,releaseRedeemOutput} from '../src/shared/release-contract.js';
import {CustodySummary} from '../src/shared/api/activity.js';

const id='018f8f9d-7f83-7abc-8def-000000000001';
it('the receipt evidence boundary repeats the canonical human statement and non-claim byte for byte',async()=>{
 const note=await readFile(new URL('../docs/review/custody-revocation-and-redemption-position.md',import.meta.url),'utf8');
 expect(releaseNonClaim).toBe("This does not evidence that the agent obtained the provider's share or decrypted the value.");
 expect(releaseEvidenceMeaning).toBe('Opintel released its share of the key. '+releaseNonClaim);
 expect(releaseEvidenceMeaning).not.toContain('redeemed');
 expect(note).toContain('> '+releaseEvidenceMeaning);
});
it.each(['granted','redeemed','expired','revoked','provider_redeemed'] as const)('%s event claims Opintel share release only when that event proves it',kind=>{
 const event={grantId:id,receipt:id,kind,at:'2026-10-15T00:00:00Z',alias:'agent:test',actor:null,jurObserved:null};
 const parsed=releaseEvent.parse(event);
 if(kind==='redeemed')expect(parsed).toHaveProperty('evidenceMeaning',releaseEvidenceMeaning);
 else{
  expect(parsed).not.toHaveProperty('evidenceMeaning');
  expect(releaseEvent.safeParse({...event,evidenceMeaning:releaseEvidenceMeaning}).success).toBe(false);
 }
});
it.each(['granted','redeemed','expired','revoked'] as const)('%s summary uses the release statement only for released shares',state=>{
 const [summary]=CustodySummary.parse([{day:'2026-10-15',state,origin:null,count:1}]);
 if(state==='redeemed')expect(summary).toHaveProperty('evidenceMeaning',releaseEvidenceMeaning);
 else expect(summary).not.toHaveProperty('evidenceMeaning');
});
it('successful K2 output states only the human-readable release fact and unchanged non-claim',()=>{
 expect(releaseRedeemOutput.parse({share:'A'.repeat(43),receipt:id,grantId:id})).toHaveProperty('evidenceMeaning',releaseEvidenceMeaning);
});
