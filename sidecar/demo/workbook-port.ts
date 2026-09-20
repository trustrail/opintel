import type { GeneratorSpec, SchemaSpec } from '../../src/shared/demo-contract.js';
export type DemoFile = NonNullable<GeneratorSpec['files']>[number];
export type DemoObject = SchemaSpec['schemas'][number]['objects'][number];
export interface DemoWorkbookPort {
  write(path: string, file: DemoFile, object: DemoObject, rows: Array<Array<string | null>>): Promise<void>;
}
