import {forwardRef,type ComponentPropsWithoutRef} from 'react';

/** One chevron geometry for every select in Settings, including engine forms. */
export const SettingsSelect=forwardRef<HTMLSelectElement,ComponentPropsWithoutRef<'select'>>(function SettingsSelect(props,ref){
 return <span data-part="settings-picker"><select {...props} ref={ref}/><svg data-part="picker-chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></span>;
});
