/** Actionable authoring/compilation failure; contains catalogue names, never values. */
export function missingContributorKey(column:string,source:string):string {
 return `Aggregate-only column ${column} requires a declared source contributor key identifying the protected entity. In Data sources → ${source} → Explore schema → Token declarations, select the entity-identifying column on this object and enable Contributor entity key (contributorKey=true).`;
}
