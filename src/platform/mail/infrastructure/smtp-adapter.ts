import nodemailer from 'nodemailer';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {DomainError,err,ok,type Clock} from '../../../shared/kernel/index.js';
import type {MailPort,OutboundMail} from '../types.js';
import {mailLink} from '../render.js';
const settings=z.object({host:z.string().min(1),port:z.coerce.number().int().min(1).max(65535),user:z.string(),password:z.string(),sender:z.email(),tlsMode:z.enum(['implicit','starttls'])}).refine(v=>Boolean(v.user)===Boolean(v.password));
export function smtpSettings(env:Record<string,string|undefined>){
 const names=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_SENDER','SMTP_TLS_MODE'];
 if(!names.some(name=>env[name]))return null;
 const parsed=settings.safeParse({host:env.SMTP_HOST,port:env.SMTP_PORT,user:env.SMTP_USER??'',password:env.SMTP_PASSWORD??'',sender:env.SMTP_SENDER,tlsMode:env.SMTP_TLS_MODE});
 if(!parsed.success)throw new Error('Invalid SMTP configuration. Set host, port, sender and TLS mode; user and password must be paired.');
 return parsed.data;
}
export class SmtpMailAdapter implements MailPort{
 private readonly transport;
 constructor(private readonly config:z.infer<typeof settings>,private readonly clock:Clock,private readonly base:string,ca?:string|Buffer){
  this.transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.tlsMode==='implicit',requireTLS:config.tlsMode==='starttls',auth:config.user?{user:config.user,pass:config.password}:undefined,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
 }
 async send(message:OutboundMail){
  const link=mailLink(message,this.base);
  if((message.template==='magic_link'||message.template==='invitation')&&!link)return err(new DomainError('dependency_unavailable','Mail cannot be rendered.',undefined,true));
  try{
   const id=createHash('sha256').update(message.idempotencyKey).digest('hex');
   const result=await this.transport.sendMail({from:this.config.sender,to:message.to,messageId:`<${id}@opintel.local>`,subject:message.template==='magic_link'?'Sign in to Opintel':message.template==='invitation'?'Your Opintel invitation':'Opintel notification',text:link?`Open this link to continue:\n${link.toString()}\n`:JSON.stringify(message.vars)});
   if(result.rejected.length)return err(new DomainError('dependency_unavailable','Mail delivery was refused.',undefined,true));
   return ok({providerId:id,acceptedAt:this.clock.now()});
  }catch{return err(new DomainError('dependency_unavailable','SMTP delivery is unavailable.',undefined,true));}
 }
}
