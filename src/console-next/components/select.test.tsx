import {useState} from 'react';
import {it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {Select} from './select.js';
import {selectOption} from '../test-select.js';
it('keyboard selection preserves literal values and the empty option without a sentinel collision',async()=>{
 function Form(){const [value,setValue]=useState('');return <><Select aria-label="Choice" value={value} onChange={e=>setValue(e.target.value)}><option value="">Choose</option><option value="__opintel_empty_selection__">Literal name</option><option value="blocked" disabled>Unavailable</option></Select><output>{value||'empty'}</output></>;}
 render(<Form/>);expect(screen.getByRole('combobox',{name:'Choice'}).textContent).toContain('Choose');await selectOption('Choice','Literal name');expect(screen.getByRole('status').textContent).toBe('__opintel_empty_selection__');await selectOption('Choice','Choose');expect(screen.getByRole('status').textContent).toBe('empty');fireEvent.keyDown(screen.getByRole('combobox',{name:'Choice'}),{key:'ArrowDown'});expect((await screen.findByRole('option',{name:'Unavailable'})).getAttribute('aria-disabled')).toBe('true');
});
