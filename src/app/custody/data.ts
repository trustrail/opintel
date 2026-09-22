import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient, type AppError } from '../../shared/api/index.js';
import { TokenKeyView } from '../../shared/custody-contract.js';
import { projectKeys } from '../tenancy/data.js';
const api = createApiClient();
export const custodyKeys = { status: (projectId: string) => [...projectKeys.scope(projectId), 'token-key'] as const };
export function useTokenKey(projectId: string) {
  return useQuery<TokenKeyView, AppError>({ queryKey: custodyKeys.status(projectId), queryFn: async () => {
    const result = await api.request({path:`/api/v1/projects/${projectId}/token-key`,response:TokenKeyView});
    if (!result.ok) throw result.error;
    return result.value;
  }, retry:false, refetchInterval:30000 });
}
export type CustodyAction = {action:'rotate';confirmation:string;reason:string;idempotencyKey:string}
  | {action:'restore';confirmation:string;keyVersion:number} | {action:'rehearse'};
export function useCustodyAction(projectId: string) {
  const cache = useQueryClient();
  return useMutation<TokenKeyView, AppError, CustodyAction>({mutationFn:async input => {
    const body: Record<string,string|number> = input.action === 'rotate' ? {confirmation:input.confirmation,reason:input.reason}
      : input.action === 'restore' ? {confirmation:input.confirmation,keyVersion:input.keyVersion} : {};
    const result = await api.request({path:`/api/v1/projects/${projectId}/token-key/${input.action}`,method:'POST',body,response:TokenKeyView,
      ...(input.action==='rotate'?{headers:{'Idempotency-Key':input.idempotencyKey}}:{})});
    if (!result.ok) throw result.error;
    return result.value;
  }, onSuccess: value => {cache.setQueryData(custodyKeys.status(projectId),value);},
  // A refused restore/rehearsal can still record a failed verification.
  onSettled: () => cache.invalidateQueries({queryKey:custodyKeys.status(projectId)})});
}
