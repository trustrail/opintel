import type {Treatment} from '../src/modules/entitlements/index.js';
import type {ProjectId,SourceId} from '../src/shared/kernel/index.js';
/** Preserve other existing projects, including their prepared, unconnected zones. */
export function retainDemoLandingZone(zone:{projectId:ProjectId;sourceId:SourceId},projects:ReadonlySet<ProjectId>,demo:ProjectId,reserved:SourceId|null):boolean {
 return projects.has(zone.projectId)&&(zone.projectId!==demo||zone.sourceId===reserved);
}
/** A deterministic spread based on the demo's column names and text order. Numeric totals
 * are aggregate-only; text identifiers tokenize; other text alternates masks
 * and withholding. Inception dates support aggregate-only COUNT/MIN; landing metadata remains clear. Unsupported unbounded numerics are withheld. */
export function demoTreatment(column:{sourceIdentifier:string;exposedType:string|null;ordinal:number|null},index:number):Treatment {
 if(column.exposedType===null)return 'withheld';
 if(column.sourceIdentifier.startsWith('_'))return 'clear';
 if(column.sourceIdentifier==='Inception Date')return 'aggregate_only';
 if(column.exposedType!==null&&/^(DECIMAL\(|HUGEINT|BIGINT|INTEGER|SMALLINT|TINYINT)/u.test(column.exposedType))return 'aggregate_only';
 if(column.exposedType==='VARCHAR')return /treaty[ _]ref/iu.test(column.sourceIdentifier)?'tokenized':Math.floor(index/2)%2===0?'masked':'withheld';
 return 'clear';
}
export function assertDevelopmentDemo(environment:Record<string,string|undefined>):void {
 if(environment.NODE_ENV && environment.NODE_ENV!=='development')throw new Error('dev:demo is development only (NODE_ENV must be development or unset).');
 for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL','TEST_DATABASE_URL','REDIS_URL','APP_BASE_URL']){
  const value=environment[key];if(!value)continue;
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname))throw new Error(`dev:demo requires a loopback ${key}.`);
 }
 const spice=environment.SPICEDB_ENDPOINT;
 if(spice&&!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/u.test(spice))throw new Error('dev:demo requires loopback SpiceDB.');
 if(environment.SIDECAR_CONFIG_FILE||environment.SIDECAR_CLIENT_CONFIG)throw new Error('dev:demo uses tmp/sidecar; remove custom sidecar configuration overrides.');
}
