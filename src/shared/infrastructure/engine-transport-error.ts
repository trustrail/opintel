export type EngineTransportPhase='connect'|'tls'|'queue'|'response';
export class EngineTransportError extends Error {
 constructor(readonly phase:EngineTransportPhase,readonly connectExpired:boolean,readonly written:boolean,readonly reason='transport_error'){super('Engine '+phase+' transport failed: '+reason+'.');}
}
