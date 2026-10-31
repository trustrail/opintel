import {z} from 'zod';
import {useQuery} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {CompanyListResponse,CompanyListItem,IndustryListResponse,PairedEngineCandidates} from '../../shared/api/tenancy-schemas.js';
import {CompanySettingsView} from '../../shared/api/settings.js';
import {EnginePage} from '../../shared/api/engines.js';
import {SourceListResponse} from '../../shared/api/source-schemas.js';
import {homeKeys,pages,read} from '../home/data.js';
import {readPools} from '../pools/data.js';
export const firstRunKeys={welcome:()=>['console-next','welcome'] as const,candidates:(id:string)=>['console-next','company',id,'paired-engines'] as const,company:(id:string)=>['console-next','company',id,'settings'] as const,facts:(p:string)=>[...homeKeys.scope(p),'first-run'] as const};
const User=z.object({email:z.email()});
export function useWelcome(){return useQuery({queryKey:firstRunKeys.welcome(),retry:false,queryFn:async({signal})=>{const c=createApiClient(undefined,{signal});const [companies,user,industries]=await Promise.all([pages(c,'/api/v1/companies?limit=100',CompanyListResponse,Infinity),read(c,'/api/v1/auth/me',User),read(c,'/api/v1/industries',IndustryListResponse)]);return {companies:companies.items,user,industries};}});}
export type Company=z.infer<typeof CompanyListItem>;
export function useCandidates(company:string|null){return useQuery({queryKey:firstRunKeys.candidates(company??''),enabled:Boolean(company),queryFn:()=>read(createApiClient(),`/api/v1/companies/${company}/paired-engines`,PairedEngineCandidates)});}
export function useCompanyDefaults(company:string|null){return useQuery({queryKey:firstRunKeys.company(company??''),enabled:Boolean(company),queryFn:()=>read(createApiClient(),`/api/v1/companies/${company}/settings`,CompanySettingsView)});}
export function useFirstRun(project:string,enabled:boolean){return useQuery({queryKey:firstRunKeys.facts(project),enabled,refetchInterval:15000,queryFn:async()=>{const c=createApiClient(),base=`/api/v1/projects/${project}`,[engines,sources,pools]=await Promise.all([pages(c,base+'/engines?limit=100',EnginePage,Infinity),pages(c,base+'/sources?limit=100',SourceListResponse,Infinity),readPools(project,c)]);return {engines:engines.items,sources:sources.items,...pools};}});}
export type FirstRunFacts=NonNullable<ReturnType<typeof useFirstRun>['data']>;
export function firstRunSteps(data:FirstRunFacts){return [true,data.engines.some(e=>e.verifiedAt&&e.health==='healthy'),data.sources.some(s=>s.status==='connected'),data.pools.length>0,data.pools.some(p=>p.detail.credentials?.some(c=>c.state==='active')),false];}
