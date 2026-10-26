import type {Clock} from '../../shared/kernel/index.js';
import {LocalFileMailAdapter} from './local-file-adapter.js';
import {SmtpMailAdapter,smtpSettings} from './infrastructure/smtp-adapter.js';
export function configuredMail(clock:Clock,env:Record<string,string|undefined>=process.env){
 const config=smtpSettings(env),base=env.APP_BASE_URL??'http://localhost:5173';
 return config?new SmtpMailAdapter(config,clock,base):new LocalFileMailAdapter(env.MAIL_OUTPUT_DIR??'./tmp/mail',clock,undefined,base);
}
