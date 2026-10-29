export class GatePrerequisiteError extends Error {}
export function testContainerImage(service:'postgres'|'redis'|'spicedb'):Promise<string>;
export function bootstrapFailure(error:unknown,stage:string):string;
export function postgresFailure(error:unknown):string;
