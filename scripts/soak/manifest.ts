import {z} from 'zod';
import {specification} from './specification.js';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
export const demoAgent=z.strictObject({poolIndex:z.number().int().min(0).max(1),pool:z.uuid(),credentialId:z.uuid(),key:z.string().min(1),association:CertificateAssociation.optional()});
export const demoManifest=z.strictObject({version:z.union([z.literal(1),z.literal(2)]),projectId:z.uuid(),definitionHash:z.string(),agents:z.array(demoAgent),objects:z.record(z.string(),z.string()),specification:specification.optional(),lifecycle:z.record(z.string(),demoAgent.extend({keyVersion:z.uuid(),graceUntil:z.string().nullable().optional(),replacementKey:z.string().optional(),done:z.boolean().optional()})).optional()});
export type DemoManifest=z.infer<typeof demoManifest>;
export const certificateSlots=[{certificateId:223,deviceName:'opintelprobe',poolIndex:0},{certificateId:224,deviceName:'opintelpoola',poolIndex:0},{certificateId:225,deviceName:'opintelpoolb2',poolIndex:1},{certificateId:226,deviceName:'opintelpoolb',poolIndex:1}] as const;
export const deviceMapping=CertificateAssociation.omit({recipientIdentifier:true}).extend({bundlePath:z.string().min(1)});
export type DeviceMapping=z.infer<typeof deviceMapping>;
export const certificateMapping=z.array(deviceMapping).length(4).superRefine((items,ctx)=>{
 for(const slot of certificateSlots){const matches=items.filter(item=>item.certificateId===slot.certificateId);if(matches.length!==1||matches[0]?.deviceName!==slot.deviceName)ctx.addIssue({code:'custom',message:'Mapping must contain each of 223/opintelprobe, 224/opintelpoola, 225/opintelpoolb2 and 226/opintelpoolb exactly once; names are fixed to avoid new licence seats.'});}
});
export function certificateForAgent(poolIndex:number,index:number){const slots=certificateSlots.filter(s=>s.poolIndex===poolIndex);return slots[index%slots.length]!;}

