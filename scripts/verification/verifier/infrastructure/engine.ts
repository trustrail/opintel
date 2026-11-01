import {EnginePage,enginePin} from '../../../../src/shared/api/engines.js';
import type {PublicApi} from '../../../soak/public-setup.js';
import {MissingPrerequisite} from '../scheduler.js';
/** Both auto-attached and explicitly registered engines use public admin routes. */
export async function verificationEngine(call:PublicApi,project:string,trust:{address:string;pin:string},override?:string){
 const base=`/api/v1/projects/${project}/engines`,address=new URL(override??trust.address).origin,pin=enginePin.parse(trust.pin);
 let engines=EnginePage.parse(await call(base+'?limit=100')).items;
 if(!engines.length){await call(base,'POST',{name:'V-01 engine',address,certificatePin:trust.pin});engines=EnginePage.parse(await call(base+'?limit=100')).items;}
 let engine=engines.find(e=>e.address===address);
 if(engine&&engine.certificatePin!==pin)throw new MissingPrerequisite('paired engine pin differs');
 if(!engine&&override){engine=engines.find(e=>e.address===new URL(trust.address).origin&&e.certificatePin===pin);if(engine){await call(base+'/'+engine.id,'PATCH',{name:engine.name,address,certificatePin:trust.pin});engine=EnginePage.parse(await call(base+'?limit=100')).items.find(e=>e.id===engine!.id&&e.address===address&&e.certificatePin===pin);}}
 if(!engine)throw new MissingPrerequisite('paired engine unavailable');return engine.id;
}
