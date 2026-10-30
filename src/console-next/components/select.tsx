import {Children,isValidElement,type ReactNode} from 'react';
import * as Primitive from '@radix-ui/react-select';
import {Glyph} from './kind.js';
type Option={value?:string;disabled?:boolean;children?:ReactNode};
type Props={value?:string;defaultValue?:string;onChange?:(event:{target:{value:string}})=>void;children:ReactNode;disabled?:boolean;required?:boolean;name?:string;id?:string;'aria-label'?:string;'aria-describedby'?:string};
const encode=(value:string)=>'value:'+value;
export function Select({value,defaultValue,onChange,children,disabled,required,name,id,...aria}:Props){
 const options:Array<{value:string;label:ReactNode;disabled?:boolean}>=[];
 const collect=(nodes:ReactNode)=>Children.forEach(nodes,node=>{if(!isValidElement<Option>(node))return;if(node.type==='option'){const label=node.props.children;options.push({value:node.props.value??String(label??''),label,disabled:node.props.disabled});}else collect(node.props.children);});collect(children);
 return <Primitive.Root value={value===undefined?undefined:value?encode(value):''} defaultValue={defaultValue===undefined?undefined:defaultValue?encode(defaultValue):''} onValueChange={v=>onChange?.({target:{value:v.slice(6)}})} disabled={disabled} required={required} name={name}><Primitive.Trigger data-select id={id} {...aria}><Primitive.Value placeholder={options.find(o=>!o.value)?.label}/><Primitive.Icon><Glyph name="switch" size={16}/></Primitive.Icon></Primitive.Trigger><Primitive.Portal><Primitive.Content data-select-content position="popper" sideOffset={8} collisionPadding={16}><Primitive.ScrollUpButton data-select-scroll><Glyph name="chevron" size={16}/></Primitive.ScrollUpButton><Primitive.Viewport>{options.map((o,i)=><Primitive.Item data-select-option key={o.value+':'+i} value={encode(o.value)} disabled={o.disabled}><Primitive.ItemText>{o.label}</Primitive.ItemText><Primitive.ItemIndicator><Glyph name="check" size={16}/></Primitive.ItemIndicator></Primitive.Item>)}</Primitive.Viewport><Primitive.ScrollDownButton data-select-scroll><Glyph name="chevron" size={16}/></Primitive.ScrollDownButton></Primitive.Content></Primitive.Portal></Primitive.Root>;
}
