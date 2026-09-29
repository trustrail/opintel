import {z} from 'zod';
import {createApiClient} from './client.js';
import {quarantineCategorySchema} from '../landing-contract.js';
const count=z.number().int().nonnegative();
export const Spectrum=z.object({clear:count,tokenized:count,masked:count,aggregate_only:count,withheld:count,undecided:count});
export type Spectrum=z.infer<typeof Spectrum>;
export const DashboardStats=z.object({asOf:z.iso.datetime(),utcDay:z.iso.date(),pools:count,sources:count,spectrum:Spectrum,requests:count,queries:count,prompts:count,refused:count,incomplete:count,connectedAgents:count,staleAgents:count});
export type DashboardStats=z.infer<typeof DashboardStats>;
export const DashboardFinding=z.discriminatedUnion('kind',[
 z.object({id:z.string(),kind:z.literal('undecided'),poolId:z.uuid(),poolName:z.string(),sourceId:z.uuid(),sourceName:z.string(),count}),
 z.object({id:z.string(),kind:z.literal('source_failure'),sourceId:z.uuid(),sourceName:z.string(),runId:z.uuid().nullable(),message:z.string().nullable()}),
 z.object({id:z.string(),kind:z.literal('quarantine'),filingId:z.uuid(),zoneId:z.uuid(),category:quarantineCategorySchema,receivedAt:z.iso.datetime({offset:true})}),
]);
export type DashboardFinding=z.infer<typeof DashboardFinding>;
export const DashboardFeed=z.object({items:z.array(DashboardFinding),nextCursor:z.string().nullable()});
export const PoolShield=z.object({id:z.uuid(),name:z.string(),agents:count,spectrum:Spectrum,sources:z.array(z.object({id:z.uuid(),name:z.string(),spectrum:Spectrum}))});
export type PoolShield=z.infer<typeof PoolShield>;
export const PoolShields=z.object({items:z.array(PoolShield),nextCursor:z.string().nullable()});
export const DashboardPageQuery=z.object({cursor:z.string().max(2048).optional(),limit:z.coerce.number().int().positive().default(20)});
export function dashboardStats(p:string){return createApiClient().request({path:`/api/v1/projects/${p}/stats`,response:DashboardStats});}
export function dashboardFeed(p:string,cursor:string|null){return createApiClient().request({path:`/api/v1/projects/${p}/dashboard/feed${cursor?'?cursor='+encodeURIComponent(cursor):''}`,response:DashboardFeed});}
export function dashboardPools(p:string,cursor:string|null){return createApiClient().request({path:`/api/v1/projects/${p}/dashboard/pools${cursor?'?cursor='+encodeURIComponent(cursor):''}`,response:PoolShields});}
export function dashboardOpenApiDocument(){const routes=[['/api/v1/projects/{id}/stats',DashboardStats],['/api/v1/projects/{id}/dashboard/feed',DashboardFeed],['/api/v1/projects/{id}/dashboard/pools',PoolShields]] as const;return {openapi:'3.1.0',info:{title:'Project dashboard',version:'1'},paths:Object.fromEntries(routes.map(([path,schema])=>[path,{get:{'x-permission':'project#view',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},...(path.endsWith('/stats')?[]:[{name:'cursor',in:'query',schema:{type:'string'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1}}])],responses:{200:{description:'Current project facts, without request arguments or filenames',content:{'application/json':{schema:z.toJSONSchema(schema)}}},default:{description:'Standard error envelope'}}}}]))};}
