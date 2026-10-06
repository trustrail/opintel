import {readFileSync} from 'node:fs';
// @vitest-environment happy-dom
import {it,expect} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SettingForm} from '../src/app/settings/screens.js';
import {projectSettingDefinitions,ProjectSettings,settingSchema,settingDescription} from '../src/shared/project-settings.js';
it('Q-038: screen descriptions, input bounds and write validation agree for every §5.8 setting',()=>{
 for(const section of ['discovery','query','evidence','agents']){
  render(<QueryClientProvider client={new QueryClient()}><SettingForm projectId="p" settings={{}} disabled={false} section={'settings-'+section}/></QueryClientProvider>);
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
it('Q-001: dates honour the selected timezone and date format',async()=>{
 const {formatTimestamp}=await import('../src/app/settings/preferences.js');
 expect(formatTimestamp('2026-01-02T01:00:00Z','America/Toronto','DD/MM/YYYY')).toBe('01/01/2026 20:00:00 EST');
 expect(formatTimestamp('2026-01-02T01:00:00Z','UTC','YYYY-MM-DD')).toBe('2026-01-02 01:00:00 UTC');
});

it('§5.8: every active documented project setting has exactly one executable definition',()=>{
 const doc=readFileSync('docs/slice1-technical-documentation.md','utf8').split('## 5.8 Project settings contract')[1]!.split('### Review points')[0]!;
 const documented=[...doc.matchAll(/^\| `([^`]+)` \|/gm)].map(m=>m[1]).sort();
 expect(projectSettingDefinitions.map(d=>d.path).sort()).toEqual(documented);
 expect(new Set(projectSettingDefinitions.map(d=>d.path)).size).toBe(projectSettingDefinitions.length);
});

it('invalid stored values are named instead of silently presented as defaults',()=>{
 render(<QueryClientProvider client={new QueryClient()}><SettingForm projectId="p" settings={{query:{aggregateMinGroupSize:1001}}} disabled={false} section="settings-query"/></QueryClientProvider>);
 expect(screen.getByRole('alert').textContent).toContain('Invalid stored value for Minimum aggregate group size');cleanup();
});
