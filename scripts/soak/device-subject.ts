import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
/** The subject is supplied by XQ after exchange; never infer it from device names. */
export function deviceAssociation(payload:unknown,certificateId:number,deviceName:string){
 const sub=payload&&typeof payload==='object'&&'sub' in payload?payload.sub:undefined;
 const result=CertificateAssociation.safeParse({certificateId,deviceName,recipientIdentifier:sub});
 if(!result.success)throw new Error('Device token has no usable sub claim');
 return result.data;
}
