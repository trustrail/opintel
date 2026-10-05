import type { ElementId, SourceId, Result } from '../../../shared/kernel/index.js';
import type { ElementDeclarations, SchemaDeclarations } from '../../../shared/api/declarations.js';
import type { z } from 'zod';
import type { TemporalContext } from './temporal.js';
export interface DeclarationCanonicalisers { canonicalisers(ctx: TemporalContext, element: ElementId): Promise<Result<readonly string[]>>; }
export interface DeclarationRepository {
  read(ctx: TemporalContext, element: ElementId): Promise<Result<ElementDeclarations>>;
  save(ctx: TemporalContext, element: ElementId, input: unknown): Promise<Result<ElementDeclarations>>;
  schema(ctx: TemporalContext, source: SourceId, schema: string): Promise<Result<z.infer<typeof SchemaDeclarations>>>;
}
export { effectiveDeclarations, tokenBehaviour } from '../../../shared/token-declarations.js';
