import {z} from 'zod';
import {engineHealthPolicySchema} from '../application/health-policy.js';

export function engineHealthPolicy(environment:Readonly<Record<string,string|undefined>>){
 const milliseconds=z.coerce.number().int().min(1).max(2147483647).optional();
 const values=z.object({ENGINE_HEALTH_MAX_AGE_MS:milliseconds,ENGINE_HEALTH_REFRESH_MS:milliseconds,ENGINE_HEARTBEAT_MAX_AGE_MS:milliseconds}).parse(environment);
 return engineHealthPolicySchema.parse({maxAgeMs:values.ENGINE_HEALTH_MAX_AGE_MS,refreshMs:values.ENGINE_HEALTH_REFRESH_MS,heartbeatMaxAgeMs:values.ENGINE_HEARTBEAT_MAX_AGE_MS,reuseEnabled:!!environment.ENGINE_HEARTBEAT_URL});
}
