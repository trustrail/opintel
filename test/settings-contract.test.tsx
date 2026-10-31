import {readFileSync} from 'node:fs';
// @vitest-environment happy-dom
import {it,expect,afterEach,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SettingsEditor} from '../src/console-next/settings/controls.js';
import {projectSettingDefinitions,ProjectSettings,settingSchema,settingDescription} from '../src/shared/project-settings.js';
it('Q-038: screen descriptions, input bounds and write validation agree for every §5.8 setting',()=>{
 for(const section of ['discovery','query','evidence','agents']){
  render(<QueryClientProvider client={new QueryClient()}><SettingsEditor project="p" settings={{}} paths={projectSettingDefinitions.filter(d=>section==='agents'?!d.path.includes('.'):d.path.startsWith(section+'.')).map(d=>d.path)} onClose={()=>{}}/></QueryClientProvider>);
  const defs=projectSettingDefinitions.filter(d=>section==='agents'?!d.path.includes('.'):d.path.startsWith(section+'.'));
  for(const d of defs){const input=screen.getByLabelText(d.label);expect(document.getElementById(d.path+'-hint')?.textContent).toBe(settingDescription(d));
   if(d.kind==='integer'||d.kind==='number'){expect(input.getAttribute('max')).toBe(String(d.max));if(d.min!==0)expect(input.getAttribute('min')).toBe(String(d.min));expect(settingSchema(d).safeParse(d.max).success).toBe(true);expect(settingSchema(d).safeParse(d.max!+1).success).toBe(false);expect(settingSchema(d).safeParse(d.min===0?0:d.min!-1).success).toBe(false);}
   if(d.default!==undefined)expect(settingSchema(d).safeParse(d.default).success).toBe(true);
  }cleanup();
 }
});
it('Q-017: absent sampleSize with sampling off is coherent, enabling without size refuses',()=>{
 expect(ProjectSettings.safeParse({discovery:{valueSampling:false}}).success).toBe(true);
 expect(ProjectSettings.safeParse({discovery:{valueSampling:true}}).success).toBe(false);
 expect(ProjectSettings.safeParse({discovery:{valueSampling:true,sampleSize:10000}}).success).toBe(true);
 expect(ProjectSettings.safeParse({discovery:{valueSampling:true,sampleSize:10001}}).success).toBe(false);
 expect(ProjectSettings.safeParse({query:{dailyRowBudgetPerPool:100}}).success).toBe(false);
 expect(ProjectSettings.safeParse({discovery:{schedule:'daily'}}).success).toBe(false);
});
it('Q-025 configuration: rollups cannot expire before full records; required limits remain absent',()=>{
 expect(ProjectSettings.safeParse({evidence:{fullRetentionDays:90,rollupRetentionDays:30}}).success).toBe(false);
 expect(ProjectSettings.parse({})).toEqual({});
});
it('Q-001: dates follow the locale and selected timezone',async()=>{
 const {formatTimestamp}=await import('../src/console-next/components/account.js');
 const at='2026-01-02T01:00:00Z';
 expect(formatTimestamp(at,'America/Toronto','en-US')).toContain('1/1/2026');
 expect(formatTimestamp(at,'UTC','en-US')).toContain('1/2/2026');
 expect(formatTimestamp(at,'UTC','en-GB')).toContain('02/01/2026');
});

it('§5.8: every active documented project setting has exactly one executable definition',()=>{
 const doc=readFileSync('docs/slice1-technical-documentation.md','utf8').split('## 5.8 Project settings contract')[1]!.split('### Review points')[0]!;
 const documented=[...doc.matchAll(/^\| `([^`]+)` \|/gm)].map(m=>m[1]).sort();
 expect(projectSettingDefinitions.map(d=>d.path).sort()).toEqual(documented);
 expect(new Set(projectSettingDefinitions.map(d=>d.path)).size).toBe(projectSettingDefinitions.length);
});

it('invalid stored values are named instead of silently presented as defaults',()=>{
 render(<QueryClientProvider client={new QueryClient()}><SettingsEditor project="p" settings={{query:{aggregateMinGroupSize:1001}}} paths={['query.aggregateMinGroupSize']} onClose={()=>{}}/></QueryClientProvider>);
 expect(screen.getByRole('alert').textContent).toContain('Invalid stored value for Minimum aggregate group size');cleanup();
});

it('SET-002: editing evidence preserves an explicitly stored empty allowlist',async()=>{
 const calls:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{calls.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({settings:{evidence:{allowlistedFields:[]}}}),{headers:{'content-type':'application/json'}});}));
 const {fireEvent,waitFor}=await import('@testing-library/react');
 render(<QueryClientProvider client={new QueryClient()}><SettingsEditor project="p" settings={{evidence:{allowlistedFields:[],fullRetentionDays:30}}} paths={['evidence.allowlistedFields','evidence.fullRetentionDays']} onClose={()=>{}}/></QueryClientProvider>);
 fireEvent.change(screen.getByLabelText('Full-record retention (days)'),{target:{value:'31'}});
 fireEvent.click(screen.getByRole('button',{name:'Save settings'}));
 await waitFor(()=>expect(calls).toHaveLength(1));expect(calls[0]).toEqual({evidence:{allowlistedFields:[],fullRetentionDays:31}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
