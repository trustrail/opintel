import {z} from 'zod';
/** §5.8. Both the form and write validation consume these definitions. */
export type SettingValue=string|number|boolean|string[];
export type SettingDefinition={path:string;label:string;kind:'integer'|'number'|'boolean'|'enum'|'fields';min?:number;max?:number;options?:readonly string[];default?:SettingValue;effect:string;unset:string};
const required='Not configured; queries refused until this limit is set.';
const discovery='Uses the safe discovery default when unset; project creation persists it explicitly.';
export const projectSettingDefinitions:readonly SettingDefinition[]=[
 {path:'discovery.newElements',default:'rules_only',label:'New elements',kind:'enum',options:['hold','rules_only'],effect:'Hold leaves new fields undecided. Rules only applies matching rules; unmatched fields stay undecided.',unset:discovery},
 {path:'discovery.typeFamilyChange',default:'revert',label:'Type-family changes',kind:'enum',options:['revert','carry'],effect:'Revert makes changed fields undecided; carry retains decisions. Both record the change.',unset:discovery},
 {path:'discovery.renameHandling',default:'carry',label:'Detected renames',kind:'enum',options:['carry','new'],effect:'Carry preserves identity and decisions. New makes the renamed field undecided. Detection requires a stable reference.',unset:discovery},
 {path:'discovery.adoptRenamedNames',default:false,label:'Adopt renamed exposed names',kind:'boolean',effect:'Breaking change when enabled: agents using the old exposed name will fail.',unset:discovery},
 {path:'discovery.valueSampling',default:false,label:'Value sampling',kind:'boolean',effect:'Allow sampling only with explicit source consent. Off refuses sampling even with consent.',unset:'Sampling is refused until explicitly enabled.'},
 {path:'discovery.sampleSize',label:'Sampling size',kind:'integer',min:1,max:10000,effect:'Maximum values requested per sampled element.',unset:'Not needed while sampling is off. Required before enabling sampling.'},
 {path:'query.timeoutSeconds',label:'Query timeout (seconds)',kind:'integer',min:1,max:2147483,effect:'Cancels execution at the deadline. A tighter pool or source timeout wins.',unset:required},
 {path:'query.rowLimit',label:'Returned row limit',kind:'integer',min:1,max:2147483646,effect:'A tighter pool limit wins. A cut response states truncated.',unset:required},
 {path:'query.cardinalityConfirmThreshold',label:'Cardinality confirmation threshold',kind:'integer',min:1000,max:1000000,default:50000,effect:'Prompt pipeline threshold for confirming an expensive query; not applied to direct SQL queries.',unset:'Uses the default of 50,000.'},
 {path:'query.aggregateMinGroupSize',label:'Minimum aggregate group size',kind:'integer',min:1,max:1000,default:5,effect:'Measured after filtering. 1 disables the minimum-group-size protection.',unset:'Uses the default of 5.'},
 {path:'query.memoryLimitMb',label:'Memory limit (MB)',kind:'integer',min:1,max:Number.MAX_SAFE_INTEGER,effect:'Hardware-dependent ceiling. A tighter pool limit wins. Exhaustion fails rather than spills.',unset:required},
 {path:'query.concurrencyPerPool',label:'Concurrent executions per pool',kind:'integer',min:1,max:256,effect:'A tighter pool limit wins. Further executions wait up to the queue bound.',unset:required},
 {path:'query.maxStagingRows',label:'Maximum staging rows per object',kind:'integer',min:10000,max:100000000,default:5000000,effect:'Unknown or excessive post-pushdown estimates refuse; observed excess refuses too.',unset:'Uses the default of 5,000,000.'},
 {path:'query.maxQueuedExecutions',label:'Maximum queued executions per pool',kind:'integer',min:1,max:64,default:8,effect:'A full queue refuses with retryability and current depth.',unset:'Uses the default of 8.'},
 {path:'evidence.fullRetentionDays',label:'Full-record retention (days)',kind:'integer',min:1,max:36500,effect:'Completed full records age into visibly marked rollups. Incomplete runs remain.',unset:'Retain full records; destructive retention is not configured.'},
 {path:'evidence.rollupRetentionDays',label:'Rollup retention (days)',kind:'integer',min:1,max:36500,effect:'Measured from rollup creation; at least the full-record retention window.',unset:'Retain rollups; expiry is not configured.'},
 {path:'evidence.redaction',label:'Argument redaction',kind:'enum',options:['aggressive','allowlist','none'],default:'aggressive',effect:'Applied before persistence and to existing stored arguments. Redaction time and policy are recorded; removing redaction cannot restore erased arguments. Without view_unredacted permission no arguments are returned.',unset:'Uses aggressive: no arguments exposed.'},
 {path:'evidence.allowlistedFields',label:'Allowlisted argument fields',kind:'fields',default:[],effect:'Argument names, not source columns. SQL exposes structure with literals stripped. Unsupported text is hidden; raw text requires none.',unset:'No arguments exposed in allowlist mode.'},
 {path:'evidence.captureSamplingPercent',label:'Capture sampling (%)',kind:'number',min:0,max:100,effect:'Greater than 0. Pinned at run open. Only successful runs may omit detailed stages and source plans; headers, completions and element deliveries remain. Refusals and failures retain full detail.',unset:'Capture 100% of detail when unset.'},
 {path:'poolKeyGraceSeconds',label:'Pool key rotation grace (seconds)',kind:'integer',min:3600,max:604800,default:86400,effect:'Applies to future rotations. Existing grace deadlines do not change.',unset:'Uses 86,400 seconds (24 hours).'},
 {path:'agentHeartbeatSeconds',label:'Agent heartbeat interval (seconds)',kind:'integer',min:5,max:60,default:20,effect:'Stale after three missed intervals. Idle remains 60 seconds without a request.',unset:'Uses 20 seconds.'},
 {path:'agentDisconnectGraceSeconds',label:'Agent disconnect grace (seconds)',kind:'integer',min:60,max:3600,default:300,effect:'Measured from entering stale. Disconnected twins remain visible.',unset:'Uses 300 seconds (5 minutes).'},
];
export function settingSchema(d:SettingDefinition):z.ZodType<SettingValue>{
 if(d.kind==='boolean')return z.boolean();
 if(d.kind==='enum')return z.enum(d.options as [string,...string[]]);
 if(d.kind==='fields')return z.array(z.string().trim().min(1)).refine(a=>new Set(a).size===a.length,'Field names must be unique.');
 let schema=d.kind==='integer'?z.number().int().safe():z.number();
 if(d.min!==undefined)schema=d.min===0?schema.gt(0):schema.min(d.min);
 if(d.max!==undefined)schema=schema.max(d.max);
 return schema;
}
export function settingDescription(d:SettingDefinition):string{
 const bounds=d.options?.join(', ')??(d.kind==='boolean'?'true or false':d.kind==='fields'?'Unique non-empty argument names':`${d.min===0?'greater than 0':d.min} to ${d.max}`);
 return `Default: ${d.default===undefined?'none':JSON.stringify(d.default)}. Bounds: ${bounds}. ${d.effect} ${d.unset}`;
}
export function readSetting(settings:unknown,path:string):unknown{let value=settings;for(const key of path.split('.')){if(!value||typeof value!=='object'||Array.isArray(value))return undefined;value=(value as Record<string,unknown>)[key];}return value;}
export function effectiveSetting(settings:unknown,path:string):SettingValue|undefined{const d=projectSettingDefinitions.find(v=>v.path===path);if(!d)throw new Error('Unknown setting');const value=readSetting(settings,path);return value===undefined?d.default:settingSchema(d).parse(value);}
const groups:Record<string,z.ZodType>={};
for(const section of ['discovery','query','evidence']){const shape:Record<string,z.ZodType>={};for(const d of projectSettingDefinitions.filter(v=>v.path.startsWith(section+'.')))shape[d.path.split('.')[1]!]=settingSchema(d).optional();groups[section]=z.strictObject(shape).optional();}
for(const d of projectSettingDefinitions.filter(v=>!v.path.includes('.')))groups[d.path]=settingSchema(d).optional();
export const ProjectSettings=z.strictObject(groups).superRefine((v,ctx)=>{
 if(readSetting(v,'discovery.valueSampling')===true&&readSetting(v,'discovery.sampleSize')===undefined)ctx.addIssue({code:'custom',path:['discovery','sampleSize'],message:'Configure sample size before enabling sampling.'});
 const full=readSetting(v,'evidence.fullRetentionDays'),rollup=readSetting(v,'evidence.rollupRetentionDays');
 if(typeof full==='number'&&typeof rollup==='number'&&rollup<full)ctx.addIssue({code:'custom',path:['evidence','rollupRetentionDays'],message:'Rollup retention must be at least full-record retention.'});
});

export function projectSettingSchema(path:string){const d=projectSettingDefinitions.find(v=>v.path===path);if(!d)throw new Error('Unknown project setting');const schema=settingSchema(d);return d.default===undefined?schema:schema.default(d.default);}

export function numericProjectSetting(path:string):z.ZodType<number>{const d=projectSettingDefinitions.find(v=>v.path===path);if(!d||(d.kind!=='integer'&&d.kind!=='number'))throw new Error('Not a numeric project setting');return projectSettingSchema(path) as z.ZodType<number>;}
