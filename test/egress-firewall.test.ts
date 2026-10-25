import {it,expect,vi} from 'vitest';
import {firewall,type FirewallCommand} from '../sidecar/egress/infrastructure/firewall.js';
it('refreshes each family in one atomic commit, retaining reply-only, root-DNS and explicit destination boundaries',()=>{
 const execute=vi.fn<FirewallCommand>();
 firewall([{address:'192.0.2.4',port:5432},{address:'2001:db8::4',port:5433}],execute);
 expect(execute).toHaveBeenCalledTimes(2);
 const inputs=execute.mock.calls.map(([command,args,options])=>({command,args,input:String(options?.input)}));
 expect(inputs.map(v=>v.command)).toEqual(['iptables-restore','ip6tables-restore']);
 for(const value of inputs){expect(value.args).toEqual(['--wait','5','--noflush']);expect(value.input).toMatch(/^\*filter\n:OUTPUT DROP \[0:0\]\n-F OUTPUT\n/u);expect(value.input).toContain('--ctstate ESTABLISHED,RELATED --ctdir REPLY -j ACCEPT');expect(value.input).toMatch(/\nCOMMIT\n$/u);expect(value.input).not.toContain('-P OUTPUT ACCEPT');}
 expect(inputs[0]?.input).toContain('--uid-owner 0 -p udp -d 127.0.0.11 -j ACCEPT');
 expect(inputs[0]?.input).toContain('-A OUTPUT -d 127.0.0.11 -j DROP');
 expect(inputs[0]?.input).toContain('-A OUTPUT -p tcp -d 192.0.2.4 --dport 5432 -j ACCEPT');
 expect(inputs[0]?.input).not.toContain('2001:db8');expect(inputs[1]?.input).not.toContain('192.0.2');
 expect(inputs[1]?.input).toContain('-A OUTPUT -d ::ffff:127.0.0.11 -j DROP');
 expect(inputs[1]?.input).toContain('-A OUTPUT -p tcp -d 2001:db8::4 --dport 5433 -j ACCEPT');
});
it('failed commits clear old destination authority under DROP and propagate failure',()=>{
 const execute=vi.fn<FirewallCommand>(command=>{if(command==='ip6tables-restore')throw new Error('synthetic apply failure');});
 expect(()=>firewall([{address:'192.0.2.4',port:5432}],execute)).toThrow('synthetic apply failure');
 expect(execute.mock.calls.slice(2).map(([command,args])=>[command,args])).toEqual([
  ['iptables',['-w','5','-P','OUTPUT','DROP']],['iptables',['-w','5','-F','OUTPUT']],
  ['ip6tables',['-w','5','-P','OUTPUT','DROP']],['ip6tables',['-w','5','-F','OUTPUT']]
 ]);
});
