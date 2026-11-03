import process from 'node:process';
import {xqDevice,DeviceFailure} from './xq-device.mjs';
for(const name of ['log','info','warn','error','debug'])globalThis.console[name]=()=>{};
let device;let queue=Promise.resolve();
process.on('message',message=>{queue=queue.then(async()=>{
 try{
  if(message.operation==='exchange'){device??=await xqDevice(message.apiKey);const result=await device.exchange(message.certificateId,message.deviceName,message.directory);process.send?.({id:message.id,value:result.association});}
  else if(message.operation==='share'){if(!device)throw new DeviceFailure('device authorization');const result=await device.fetchShare(message.certificateId,message.locator);try{process.send?.({id:message.id,value:{share:result.share.toString('base64url')}});}finally{result.share.fill(0);}}
  else throw new DeviceFailure('operation validation');
 }catch(error){process.send?.({id:message.id,error:error instanceof DeviceFailure?{phase:error.phase,status:error.status}:{phase:'agent operation',status:null}});}
 });});
process.on('disconnect',()=>{device?.clear();process.exit(0);});
