import {z} from 'zod';
import {CreateCompanyBody} from './tenancy-schemas.js';

export const InstallationClaimantSchema=z.strictObject({kind:z.literal('email'),email:z.string().trim().toLowerCase().pipe(z.email())});
export const InstallationClaimBody=z.strictObject({claimant:InstallationClaimantSchema,company:CreateCompanyBody.strict()});
