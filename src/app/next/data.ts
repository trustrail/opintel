import {useQuery} from '@tanstack/react-query';
import {activityKeys} from '../activity/data.js';
import {poolKeys} from '../pools/keys.js';
import {entitlementKeys} from '../entitlements/data.js';
import {activityList,type ActivityFilters} from '../../shared/api/activity.js';
import {readGroups,readMembers,type GroupFilter,type MemberFilter} from '../../shared/api/entitlement-groups.js';
import {PoolPage} from '../../shared/api/pools.js';
import {createApiClient} from '../../shared/api/client.js';
export function useNextActivity(project:string,filters:ActivityFilters,cursor?:string){return useQuery({queryKey:activityKeys.page(project,filters,cursor),queryFn:async()=>{const r=await activityList(project,filters,cursor??null);if(!r.ok)throw r.error;return r.value;},retry:false});}
export function useNextPools(project:string,cursor?:string){return useQuery({queryKey:poolKeys.page(project,cursor),queryFn:async()=>{const r=await createApiClient().request({path:`/api/v1/projects/${project}/pools${cursor?'?cursor='+encodeURIComponent(cursor):''}`,response:PoolPage});if(!r.ok)throw r.error;return r.value;},retry:false});}
export function useNextGroups(pool:string,filter:GroupFilter){return useQuery({queryKey:entitlementKeys.groupPage(filter.projectId,pool,filter),queryFn:async()=>{const r=await readGroups(pool,filter);if(!r.ok)throw r.error;return r.value;},retry:false});}
export function useNextMembers(pool:string,filter:MemberFilter){return useQuery({queryKey:entitlementKeys.memberPage(filter.projectId,pool,filter),queryFn:async()=>{const r=await readMembers(pool,filter);if(!r.ok)throw r.error;return r.value;},retry:false});}
