import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
export const deploymentKeys={status:()=>['deployment','tls'] as const};
export function DeploymentWarning(){
 const status=useQuery({enabled:import.meta.env.MODE==='production',queryKey:deploymentKeys.status(),queryFn:async()=>{const response=await fetch('/deployment.json');if(!response.ok)throw new Error('Deployment status unavailable');return z.object({selfSignedTls:z.boolean()}).parse(await response.json());},retry:false,staleTime:60000});
 // Development servers have no package deployment endpoint.
 if(status.isPending||status.isError||!status.data.selfSignedTls)return null;
 return <p className="note" role="alert">This gateway uses a generated self-signed TLS certificate. Configure a trusted certificate before production use.</p>;
}
