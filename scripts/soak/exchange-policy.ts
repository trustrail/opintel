/** Fixed retry policy; independent of query rate and of other agents sharing a device. */
export const exchangeRetryMs=5*60*1000;
export function exchangeDue(state:{ok:boolean;nextAttempt:number}|undefined,expires:number|undefined,now:number):boolean{
 if(!state)return true;
 if(!state.ok)return now>=state.nextAttempt;
 return expires!==undefined&&Number.isFinite(expires)&&expires*1000<=now+30000;
}
