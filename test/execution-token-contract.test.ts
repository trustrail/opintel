import {expect,it} from 'vitest';
import {engineTokenDeclaration,stagingObject} from '../src/shared/execution-contract.js';
import {tokenConfigSchema} from '../sidecar/tokenize/config.js';
const token={domain:'clock',canonId:'stdtime1',mode:'timestamp' as const,caseInsensitive:false,sourceTimezone:'America/New_York'};
const object=(config:unknown)=>({catalog:'warehouse',schema:'public',name:'records',sourceId:'00000000-0000-4000-8000-000000000001',readPlan:{catalog:'warehouse',schema:'public',object:'records',columns:[{elementId:'00000000-0000-4000-8000-000000000002',sourceIdentifier:'at',exposedName:'at',exposedType:'VARCHAR',treatment:'tokenized',readAs:'text',token:config}]}});
it('engine token wire shape uses declaredZone and excludes application sourceTimezone',()=>{
 const wire=JSON.parse(JSON.stringify(engineTokenDeclaration(token))) as unknown;
 expect(wire).toEqual({domain:'clock',canonId:'stdtime1',mode:'timestamp',caseInsensitive:false,declaredZone:'America/New_York'});
 expect(stagingObject.safeParse(object(wire)).success).toBe(true);
 expect(tokenConfigSchema.safeParse(wire).success).toBe(true);
 expect(stagingObject.safeParse(object(token)).success).toBe(false);
 expect(tokenConfigSchema.safeParse(token).success).toBe(false);
 expect(stagingObject.safeParse(object({...engineTokenDeclaration(token),unexpected:true})).success).toBe(false);
});
it('absent zones remain absent and epoch units survive the boundary',()=>{
 expect(engineTokenDeclaration({domain:'clock',epochUnit:'milliseconds' as const})).toEqual({domain:'clock',epochUnit:'milliseconds'});
});
