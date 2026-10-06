import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {navGroups} from '../src/app/navigation.js';
import {Mark,markNames,EmptyState,type MarkSize} from '../src/shared/ui/index.js';

describe('5.27 visual identity',()=>{
 it('VIS-001: all 38 specified marks are identifiable, passive geometry using existing tokens',()=>{
  expect(markNames).toHaveLength(38);
  const master=readFileSync(new URL('../docs/opintel-master.css',import.meta.url),'utf8');
  const spec=readFileSync(new URL('../docs/visual-language.html',import.meta.url),'utf8');
  for(const name of markNames){
   const markup=renderToStaticMarkup(<Mark name={name}/>);
   expect(markup).toContain(`data-mark="${name}"`);
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
  }
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
