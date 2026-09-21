import { z } from 'zod';
/** Only identifiers and fixed categories: never values, tokens or exceptions. */
export const tokenEventSchema = z.strictObject({
  event: z.enum(['tokenization.started', 'tokenization.complete', 'tokenization.refused']),
  projectId: z.uuid(),
  category: z.enum(['declaration', 'vault', 'execution']).optional(),
});
export type TokenEvent = z.infer<typeof tokenEventSchema>;
export interface TokenAudit { record(event: TokenEvent): void }
export const consoleTokenAudit: TokenAudit = {
  record(event) { console.info(tokenEventSchema.parse(event)); },
};
