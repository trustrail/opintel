import {withTenant} from '../../../platform/db/scope.js';
import {UserId,type ProjectId,type SourceId} from '../../../shared/kernel/index.js';
/** Authenticate the certificate against the claimed project AND assigned source. */
export async function authorizeEngineReceipt(pin:string,project:ProjectId,source:SourceId):Promise<boolean>{return withTenant({projectId:project,userId:UserId('00000000-0000-4000-8000-000000000001')},async tx=>{const rows=await tx.query(`SELECT 1 FROM engine e JOIN data_source s ON s.engine_id=e.id AND s.project_id=e.project_id WHERE e.project_id=$1 AND s.id=$2 AND e.certificate_pin=$3 AND e.verified_at IS NOT NULL AND e.contract_version=2`,[project,source,pin.replaceAll(':','').toUpperCase()]);return rows.length===1;});}
