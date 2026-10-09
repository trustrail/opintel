import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {navGroups} from '../src/app/navigation.js';
import {Mark,markNames,EmptyState,type MarkSize} from '../src/shared/ui/index.js';

// Compare independent HTML specification geometry, including circles and strokes.
const geometry=(svg:string)=>[...svg.matchAll(/<(circle|path|rect|line)\b([^>]*)>/gu)].map(shape=>({
 tag:shape[1],attributes:[...shape[2]!.matchAll(/([\w-]+)="([^"]*)"/gu)].map(attribute=>[attribute[1],attribute[2]]).sort((a,b)=>a[0]!.localeCompare(b[0]!)),
}));
describe('5.27 visual identity',()=>{
 it('VIS-001: all 40 specified marks are identifiable, passive geometry using existing tokens',()=>{
  expect(markNames).toHaveLength(40);
  const master=readFileSync(new URL('../docs/opintel-master.css',import.meta.url),'utf8');
  const spec=readFileSync(new URL('../docs/visual-language.html',import.meta.url),'utf8');
  const expected=new Map<string,string>();
  const spectrum=spec.slice(spec.indexOf('<h2>Exposure is a spectrum'),spec.indexOf('<h2>At the sizes'));
  for(const match of spectrum.matchAll(/(<svg[^>]*>.*?<\/svg>)<\/div>\s*<div class="nm">([^<]+)<\/div>/gsu))expected.set('treatment-'+match[2]!.toLowerCase(),match[1]!);
  const kinds=spec.slice(spec.indexOf('<h2>The things themselves'),spec.indexOf('<h2>Navigation'));
  for(const match of kinds.matchAll(/(<svg[^>]*>.*?<\/svg>)\s*<div class="nm">([^<]+)<\/div>/gsu))expected.set(match[2]!.toLowerCase().replaceAll(' ','-'),match[1]!);
  for(const match of spec.matchAll(/<div class="ni">(<svg.*?<\/svg>)<span>([^<]+)<\/span>/gsu))expected.set('nav-'+match[2]!.toLowerCase().replaceAll(' ','-'),match[1]!);
  expect(expected.size).toBe(40);
  for(const name of markNames){
   const markup=renderToStaticMarkup(<Mark name={name} size={34}/>);
   expect(markup).toContain(`data-mark="${name}"`);
   expect(geometry(markup),name).toEqual(geometry(expected.get(name)!));
   expect(markup).toMatch(/data-mark-category="(kind|state|treatment)"/u);
   expect(markup).toContain('aria-hidden="true"');expect(markup).toContain('focusable="false"');
   expect(markup).not.toMatch(/class=|#[\da-f]{3,8}\b|var\(--(?:yellow|green)\)/iu);
   // Every path is specified, rather than a similar substitute from an icon font.
   for(const path of markup.matchAll(/\sd="([^"]+)"/gu))expect(spec).toContain(`d="${path[1]}"`);
   for(const token of markup.matchAll(/var\((--[\w-]+)\)/gu))expect(master).toContain(`${token[1]}:`);
   expect(markup).toMatch(/<(?:circle|path|rect|line) /u);
  }
 });
 it('VIS-002: the same geometry is available at 12 through 48 with no extra container',()=>{
  for(const size of [12,16,18,19,22,24,26,30,34,48] as const satisfies readonly MarkSize[]){
   const markup=renderToStaticMarkup(<Mark name="treatment-tokenized" size={size}/>);
   expect(markup).toContain(`width="${size}" height="${size}"`);expect(markup).toMatch(/^<svg /u);
   const weights:Partial<Record<MarkSize,number>>={12:2.6,16:2.4,18:2.3,22:2.2,34:2,48:1.8};
   expect(markup).toContain(`stroke-width="${weights[size]??2}"`);
  }
 });
 it('standalone treatment marks have an accessible name and remain non-focusable',()=>{
  const markup=renderToStaticMarkup(<Mark name="treatment-undecided" label="Undecided"/>);
  expect(markup).toContain('role="img"');expect(markup).toContain('aria-label="Undecided"');
  expect(markup).not.toContain('aria-hidden="true"');expect(markup).toContain('focusable="false"');
 });
 it('VIS-004: empty states do not repeat the screen identity; dormant designs are not navigation',()=>{
  const markup=renderToStaticMarkup(<EmptyState title="Dashboard" description="Connect a source."/>);
  expect(markup).not.toContain('◎');expect(markup).not.toContain('data-mark');
  const visible=navGroups.flatMap(group=>group.items).filter(item=>!item.hidden);
  expect(visible.map(item=>item.icon)).not.toContain('nav-audit-log');
  expect(visible.map(item=>item.icon)).not.toContain('prompt');
  expect(markNames).toContain('nav-audit-log');expect(markNames).toContain('prompt');
 });
});
