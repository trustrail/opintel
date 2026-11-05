/** Actionable authoring/compilation failure; contains catalogue names, never values. */
export function missingContributorKey(column:string,source:string):string {
 return `Aggregate-only column ${column} requires a declared source contributor key identifying the protected entity. In Data → ${source} → the table’s column list, open the column name’s menu → "Use as contributor key" on the entity-identifying column.`;
}
