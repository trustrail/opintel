import {createDecipheriv,createPublicKey,verify} from 'node:crypto';
let input='';for await(const chunk of process.stdin)input+=chunk;
const value=JSON.parse(input);
if(value.operation==='verify'){
 const [header,payload,signature]=value.grant.split('.');
 const h=JSON.parse(Buffer.from(header,'base64url'));
 const jwk=value.keys.find(k=>k.kid===h.kid);
 if(h.alg!=='EdDSA'||!jwk||!verify(null,Buffer.from(header+'.'+payload),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(signature,'base64url')))throw new Error('Grant verification failed.');
 process.stdout.write(JSON.stringify(JSON.parse(Buffer.from(payload,'base64url'))));
}else{
 const first=Buffer.from(value.first,'base64url'),second=Buffer.from(value.second,'base64url');
 if(first.length!==32||second.length!==32)throw new Error('Invalid release shares.');
 const key=Buffer.from(first.map((byte,index)=>byte^second[index]));
 try{
  const rows=value.rows.map((row,ordinal)=>row.map((cell,index)=>{
   if(!value.columns.includes(value.names[index]))return cell;
   if(!cell.startsWith('opintelsealed:v1:'))throw new Error('Custody cell is not sealed.');
   const bytes=Buffer.from(cell.slice('opintelsealed:v1:'.length),'base64url');
   const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
   const aad=Buffer.concat([value.receipt,value.names[index],String(ordinal)].map(field=>{const bytes=Buffer.from(field),length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);return Buffer.concat([length,bytes]);}));
   cipher.setAAD(aad);cipher.setAuthTag(bytes.subarray(-16));
   const plain=Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]);
   try{return JSON.parse(plain);}finally{plain.fill(0);}
  }));process.stdout.write(JSON.stringify(rows));
 }finally{key.fill(0);first.fill(0);second.fill(0);}
}
