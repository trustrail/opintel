import {withPlatform} from '../../../platform/db/scope.js';
import type {UserId} from '../../../shared/kernel/index.js';
/** One console session can reach several companies: the shortest idle policy applies. */
export async function sessionIdlePolicy(user:UserId):Promise<number>{
 const [row]=await withPlatform(tx=>tx.query<{minutes:number|null}>(`SELECT min(c.idle_timeout_mins)::int AS minutes FROM company c WHERE EXISTS(SELECT 1 FROM company_member m WHERE m.company_id=c.id AND m.user_id=$1) OR EXISTS(SELECT 1 FROM project_member m JOIN project p ON p.id=m.project_id WHERE p.company_id=c.id AND m.user_id=$1)`,[user]));
 return (row?.minutes??480)*60000;
}
