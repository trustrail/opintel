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
 if(new Set(items.map(item=>item.certificateId)).size!==4||new Set(items.map(item=>item.deviceName)).size!==4)ctx.addIssue({code:'custom',message:'Supply four distinct team-issued certificate/device identities in cedant order; the installer never creates them.'});
});
export function certificateForAgent(poolIndex:number,index:number,mapping:readonly {certificateId:number;deviceName:string}[]=certificateSlots){const slots=mapping.slice(poolIndex*2,poolIndex*2+2);return slots[index%slots.length]!;}

