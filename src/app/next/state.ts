import {z} from 'zod';
import {defaultParseSearch,defaultStringifySearch} from '@tanstack/react-router';
export const destinations=['home','sources','pools','decisions','activity','settings'] as const;
export type Destination=typeof destinations[number];
export const nextSearchSchema=z.object({source:z.uuid().optional(),pool:z.uuid().optional(),object:z.uuid().optional(),column:z.uuid().optional(),level:z.enum(['object_default','pool_override']).optional(),group:z.string().max(512).optional(),keyHistory:z.literal('open').optional(),schema:z.string().max(512).optional(),view:z.string().max(40).optional(),panel:z.string().max(40).optional(),groupBy:z.enum(['name','table']).optional(),decision:z.enum(['all','decided','undecided']).optional(),rowState:z.enum(['overridden','inherited','missing','unscoped']).optional(),poolCursor:z.string().max(2048).optional(),memberCursor:z.string().max(2048).optional(),cursor:z.string().max(4096).optional(),prefix:z.string().max(200).optional(),run:z.uuid().optional(),startedAt:z.iso.datetime({offset:true}).optional(),agent:z.string().max(200).optional(),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),decisionId:z.uuid().optional(),scroll:z.coerce.number().min(0).max(10000000).optional()});
export type NextSearch=z.infer<typeof nextSearchSchema>;
export function nextHref(project:string,destination:Destination,search:NextSearch={}){return `/next/projects/${encodeURIComponent(project)}/${destination}${defaultStringifySearch(search)}`;}
export const readNextSearch=(query:string)=>nextSearchSchema.parse(defaultParseSearch(query));
export const nextEnabled=(flag:unknown)=>flag==='true';
export function naturalParent(destination:Destination,search:NextSearch):NextSearch{
 if(destination==='pools')return search.agent||search.object?{pool:search.pool,poolCursor:search.poolCursor,panel:'pool'}:{poolCursor:search.poolCursor};
 if(destination==='decisions'&&search.decisionId)return {...search,decisionId:undefined};
 if(destination==='sources'&&search.column)return {...search,column:undefined,schema:undefined,panel:undefined};
 if(destination==='sources'&&search.object)return {...search,object:undefined,column:undefined,prefix:undefined,cursor:undefined};
 return {...search,panel:undefined,object:undefined,run:undefined,startedAt:undefined,scroll:undefined};
}

export function isDraftSaveResult(value:unknown){return !!value&&typeof value==='object'&&(('hash' in value&&'expression' in value)||'settings' in value||'decisionId' in value||'stored' in value||'tags' in value||('sourceTimezone' in value&&'schemaName' in value));}
