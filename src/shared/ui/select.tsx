import {forwardRef,type ComponentPropsWithoutRef} from 'react';
/** Content-sized select with the console's single, symmetrically inset chevron. */
export const ConsoleSelect=forwardRef<HTMLSelectElement,ComponentPropsWithoutRef<'select'>>(function ConsoleSelect(props,ref){
 return <span data-part="console-picker"><select {...props} ref={ref}/><svg data-part="picker-chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></span>;
});
