import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import type {z} from 'zod';
import type {AppError} from '../../shared/api/client.js';
import {CustodyProviderStatus,CustodyCheckResult,CustodyRotationResult} from '../../shared/api/release-custody.js';
import {projectKeys} from '../tenancy/data.js';
import {settingsRequest} from './data.js';
import {custodyProviderKeys} from './custody-keys.js';
export function useCustodyProvider(project:string){return useQuery({queryKey:custodyProviderKeys.status(project),queryFn:()=>settingsRequest({path:`/api/v1/projects/${project}/custody-provider`,response:CustodyProviderStatus}),retry:false});}
export function useCustodyAction(project:string,action:'check'|'rotate'){
 const cache=useQueryClient();return useMutation<z.infer<typeof CustodyCheckResult>|z.infer<typeof CustodyRotationResult>,AppError,void>({mutationFn:async()=>action==='check'?settingsRequest({path:`/api/v1/projects/${project}/custody-provider/check`,method:'POST',body:{},response:CustodyCheckResult}):settingsRequest({path:`/api/v1/projects/${project}/custody-provider/rotate`,method:'POST',body:{},response:CustodyRotationResult}),onSuccess:async()=>{await cache.invalidateQueries({queryKey:custodyProviderKeys.status(project)});await cache.invalidateQueries({queryKey:projectKeys.stats(project)});}});
}
