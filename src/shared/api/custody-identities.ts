import {z} from 'zod';
import {CertificateAssociation} from './certificate-association.js';
/** Agent-local public exchange metadata. There is no gateway import/list route. */
export const CustodyIdentities=z.strictObject({items:z.array(CertificateAssociation)});
export type CustodyIdentities=z.infer<typeof CustodyIdentities>;
