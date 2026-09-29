import { DomainError, err, ok, type Result, type RunId, type ProjectId, type PoolId, type ElementId, type ExposedName, type Timestamp, type ErrorCode, type JsonObject } from '../../../shared/kernel/index.js';

export type VersionStamp = Readonly<{policy:number;vocabulary:number;catalog:number;tokenKeyVersionSelected:number|null}>;
export type RunStage = Readonly<{
 stage:'classify'|'recover'|'resolve_values'|'resolve_sources'|'compose'|'validate'|'qqc_l1'|'qqc_l2'|'qqc_l3'|'execute'|'record';
 result:'ok'|'clarify'|'refuse'|'warn';detail:JsonObject|null;ms:number;
}>;
export type ElementDelivery = Readonly<{elementId:ElementId|null;exposedName:ExposedName;withheldReason:string|null} & (
 {state:'withheld'|'undecided';treatment:null} |
 {state:'released'|'aggregated';treatment:'clear'|'tokenized'|'masked'|'aggregate_only'}
)>;
export type RunOutcome = Readonly<
 {kind:'answered';rowCount:number;truncated:boolean} |
 {kind:'reduced';rowCount:number;truncated:boolean;withheld:number} |
 {kind:'refused';code:ErrorCode;element:ExposedName|null;stage:RunStage['stage']} |
 {kind:'clarify';items:number;resumedAs:RunId|null} |
 {kind:'failed';code:ErrorCode;retryable:boolean}
>;
export type RunHeader = Readonly<{
 id:RunId;projectId:ProjectId;poolId:PoolId;agentId:string|null;keyPrefix:string;
 mode:'query'|'prompt';request:string|null;versions:VersionStamp;startedAt:Timestamp;
}>;
export type RunCompletion = Readonly<{
 tokenKeyVersionUsed:number|null;outcome:RunOutcome;cil:JsonObject|null;sourcePlan:JsonObject|null;generatedSql:string|null;
 latencyMs:number|null;freshness:JsonObject;synthetic:boolean;completedAt:Timestamp;
}>;
export type QueryRunState = Readonly<{header:RunHeader;stages:readonly RunStage[];elements:readonly ElementDelivery[];completion:RunCompletion|null}>;
const count=(value:number)=>Number.isSafeInteger(value)&&value>=0;
function freeze(value:unknown):void {
 if(value!==null&&typeof value==='object') {for(const child of Object.values(value))freeze(child);Object.freeze(value);}
}
/** A snapshot, not a lifecycle writer. No mutation methods, I/O or current-policy
 * lookup: the header's version stamp is the fact captured at request start. */
export class QueryRun {
 private constructor(readonly state:QueryRunState) {}
 get id():RunId{return this.state.header.id;}
 get versions():VersionStamp{return this.state.header.versions;}
 get outcome():RunOutcome|null{return this.state.completion?.outcome??null;}
 get status():'incomplete'|'complete'{return this.state.completion===null?'incomplete':'complete';}
 static create(input:QueryRunState):Result<QueryRun> {
  const invalid=(message:string)=>err(new DomainError('validation_failed',message));
  if(Object.values(input.header.versions).some(value=>value!==null&&!count(value)))return invalid('Evidence versions must be non-negative integers.');
  if(input.header.versions.tokenKeyVersionSelected!==null&&input.header.versions.tokenKeyVersionSelected<=0)return invalid('A selected key version must be positive.');
  const started=Date.parse(input.header.startedAt);
  if(!Number.isFinite(started))return invalid('Evidence requires a valid start time.');
  for(const stage of input.stages)if(!count(stage.ms))return invalid('Evidence stage duration must be a non-negative integer.');
  for(const element of input.elements) {
   if(element.treatment==='tokenized'&&input.header.versions.tokenKeyVersionSelected===null)return invalid('Tokenized elements require a selected key version.');
   if((element.treatment===null)!==(element.state==='withheld'||element.state==='undecided'))return invalid('Evidence treatment must be null exactly when the element is withheld or undecided.');
  }
  const completion=input.completion;
  if(completion!==null) {
   if(completion.tokenKeyVersionUsed!==null&&completion.tokenKeyVersionUsed!==input.header.versions.tokenKeyVersionSelected)return invalid('The used key must equal the selected version.');
   if(!Number.isFinite(Date.parse(completion.completedAt))||Date.parse(completion.completedAt)<started)return invalid('Evidence completion cannot precede its start.');
   if(completion.latencyMs!==null&&!count(completion.latencyMs))return invalid('Evidence latency must be a non-negative integer.');
   const outcome=completion.outcome;
   if((outcome.kind==='answered'||outcome.kind==='reduced')&&!count(outcome.rowCount))return invalid('Evidence row count must be a non-negative integer.');
   if(outcome.kind==='reduced'&&!count(outcome.withheld))return invalid('Evidence withheld count must be a non-negative integer.');
   if(outcome.kind==='clarify'&&!count(outcome.items))return invalid('Evidence clarification count must be a non-negative integer.');
   if(outcome.kind==='refused'&&!input.stages.some(stage=>stage.stage===outcome.stage&&stage.result==='refuse'))return invalid('A refused run must include the stage that refused it.');
  }
  const state=structuredClone(input);freeze(state);
  return ok(Object.freeze(new QueryRun(state)));
 }
}
