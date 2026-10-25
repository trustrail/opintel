import {execFileSync} from 'node:child_process';
import {isIP} from 'node:net';
export type FirewallCommand=(command:string,args:string[],options:{input?:string;stdio:'ignore'|['pipe','ignore','ignore'];timeout:number})=>unknown;
export function firewall(endpoints:ReadonlyArray<{address:string;port:number}>,execute:FirewallCommand=execFileSync){
 try{
  for(const [command,family] of [['iptables-restore',4],['ip6tables-restore',6]] as const){
   const rules=['*filter',':OUTPUT DROP [0:0]','-F OUTPUT',
    '-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED --ctdir REPLY -j ACCEPT'];
   if(family===4)for(const protocol of ['udp','tcp'])rules.push(`-A OUTPUT -m owner --uid-owner 0 -p ${protocol} -d 127.0.0.11 -j ACCEPT`);
   rules.push(`-A OUTPUT -d ${family===4?'127.0.0.11':'::ffff:127.0.0.11'} -j DROP`);
   for(const value of endpoints.filter(value=>isIP(value.address)===family))rules.push(`-A OUTPUT -p tcp -d ${value.address} --dport ${value.port} -j ACCEPT`);
   // One kernel table commit: ongoing source traffic never sees an empty chain.
   // --noflush preserves unrelated chains; OUTPUT alone is replaced explicitly.
   execute(command,['--wait','5','--noflush'],{input:rules.join('\n')+'\nCOMMIT\n',stdio:['pipe','ignore','ignore'],timeout:5000});
  }
 }catch(error){
  // A failed refresh cannot retain authority from the previous destination set.
  for(const command of ['iptables','ip6tables'])try{execute(command,['-w','5','-P','OUTPUT','DROP'],{stdio:'ignore',timeout:5000});execute(command,['-w','5','-F','OUTPUT'],{stdio:'ignore',timeout:5000});}catch{/* No readiness/acknowledgment is issued after failed installation. */}
  throw error;
 }
}
