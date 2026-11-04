import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CustodyIdentities} from '../src/shared/api/custody-identities.js';
import {publishPublicIdentity} from '../scripts/steps/identity-exchange.js';
const identity={certificateId:223,deviceName:'device-one',recipientIdentifier:'provider-issued-public-subject'};
it('agent-local exchange metadata contains only public fields and rejects key material',()=>{
 expect(CustodyIdentities.parse({items:[identity]})).toEqual({items:[identity]});
 for(const field of ['privateKey','transportKey','accessToken','bundlePath'])expect(CustodyIdentities.safeParse({items:[{...identity,[field]:'SECRET_SENTINEL'}]}).success).toBe(false);
});
it('agent-local publication is idempotent and refuses conflicting recipients',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agent-public-')),file=join(root,'associations.json');
 try{await publishPublicIdentity(file,identity);await publishPublicIdentity(file,identity);expect(JSON.parse(await readFile(file,'utf8'))).toEqual({items:[identity]});await expect(publishPublicIdentity(file,{...identity,recipientIdentifier:'different'})).rejects.toThrow('conflicts');}finally{await rm(root,{recursive:true,force:true});}
});
