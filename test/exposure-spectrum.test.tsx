// @vitest-environment happy-dom
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {ExposureSpectrum,DecisionMarks} from '../src/shared/ui/index.js';
afterEach(cleanup);
it('exposure uses Dashboard fills in one order while legend marks match segment fills with uniform ink outlines',()=>{
 const treatments=['clear','tokenized','masked','aggregate_only','withheld','undecided'];
 const {container}=render(<ExposureSpectrum decisions={treatments.map(value=>({value,count:1}))}/>);
 const bar=screen.getByRole('group',{name:'Treatment distribution'});
 expect([...bar.children].map(e=>e.getAttribute('data-treatment'))).toEqual(treatments);
 expect([...bar.children].map(e=>(e as HTMLElement).style.background)).toEqual(['var(--green)','var(--token)','var(--mask)','var(--agg)','var(--held)','var(--yellow)']);
 const legend=container.querySelector('.speclegend')!;
 expect([...legend.children].map(e=>e.getAttribute('data-treatment'))).toEqual(treatments);
 expect([...legend.querySelectorAll('svg')].map(e=>e.style.getPropertyValue('--plum'))).toEqual(['var(--green)','var(--token)','var(--mask)','var(--agg)','var(--held)','var(--yellow)']);
 for(const shape of legend.querySelectorAll('[stroke]')){expect(shape.getAttribute('stroke')).toBe('var(--ink)');expect(shape.getAttribute('stroke-width')).toBe('1');expect(shape.getAttribute('vector-effect')).toBe('non-scaling-stroke');}
 expect(screen.getByRole('img',{name:'Tokenized: 1 decisions'}).getAttribute('title')).toBe('Tokenized: 1 decisions');
});
it('screen count units and compact legends do not change segment palette or order',()=>{
 const {container}=render(<ExposureSpectrum decisions={[{value:'tokenized',count:3}]} unit="members" compact density="compact"/>);
 expect(screen.getByRole('img',{name:'Tokenized: 3 members'}).getAttribute('style')).toContain('var(--token)');
 expect(container.querySelectorAll('.speclegend > div')).toHaveLength(1);
 expect(container.querySelector('.bar')?.children).toHaveLength(6);
});

it('row and list marks retain their dark palette',()=>{const {container}=render(<DecisionMarks decisions={[{value:'tokenized',count:1}]}/>);expect(container.querySelector('svg')?.style.getPropertyValue('--plum')).toBe('var(--token-dk)');});
