import type { DeclarationValues } from './api/declarations.js';
export function standardCanonicaliser(type: string | null, epochUnit: string | null): string {
 if(epochUnit!==null||type==='TIMESTAMP'||type==='TIMESTAMPTZ')return 'stdtime1';
 if(type==='DATE')return 'stddate1';
 if(type&&(['TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT','FLOAT','DOUBLE'].includes(type)||type.startsWith('DECIMAL(')))return 'stdnum1';
 return 'stdtext1';
}
export function effectiveDeclarations(type: string | null, stored: DeclarationValues, schemaTimezone: string | null) {
 const mode=stored.epochUnit!==null||type==='TIMESTAMP'||type==='TIMESTAMPTZ'?'timestamp' as const:type==='DATE'?'date' as const:type==='VARCHAR'||type==='UUID'?'text' as const:'number' as const;
 return {tokenDomain:stored.tokenDomain,canonId:stored.canonId??standardCanonicaliser(type,stored.epochUnit),mode,caseInsensitive:mode==='text'?(stored.caseInsensitive??true):false,sourceTimezone:stored.sourceTimezone??schemaTimezone,epochUnit:stored.epochUnit};
}
export function tokenBehaviour(type:string|null,stored:DeclarationValues,schemaTimezone:string|null){
 const effective=effectiveDeclarations(type,stored,schemaTimezone);
 return JSON.stringify({...effective,sourceTimezone:type==='TIMESTAMP'?effective.sourceTimezone:null});
}
