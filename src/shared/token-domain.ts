import { z } from 'zod';
import type { ProjectId, ElementId } from './kernel/value-objects.js';
// Fixed-width UUID components keep the mapping injective without a hash or names.
// Reserve the namespace in commands and storage so declared domains cannot join it.
export const isolatedDomainPrefix = 'opintelisolated';
export const declaredTokenDomain = z.string().regex(/^[a-z0-9]+$(?![\s\S])/u, 'Use lowercase letters and digits for the token domain.').refine(value => value !== 'sentinel' && !value.startsWith(isolatedDomainPrefix), 'sentinel and opintelisolated domains are reserved.');
export type TokenIdentity = Readonly<{ projectId: ProjectId; elementId: ElementId }>;
export function derivedTokenDomain(identity: TokenIdentity): string {
 return isolatedDomainPrefix + identity.projectId.replaceAll('-', '').toLowerCase() + identity.elementId.replaceAll('-', '').toLowerCase();
}
export function effectiveTokenDomain(declared: string | null | undefined, identity: TokenIdentity): string {
 return declared ?? derivedTokenDomain(identity);
}
