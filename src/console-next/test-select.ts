import {screen,fireEvent} from '@testing-library/react';
export async function selectOption(label:string,option:string|RegExp){
 const control=await screen.findByRole('combobox',{name:label});fireEvent.keyDown(control,{key:'ArrowDown'});
 fireEvent.click(await screen.findByRole('option',{name:option}));
}
