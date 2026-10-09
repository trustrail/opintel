import type {ReactNode,CSSProperties} from 'react';

/** Geometry transcribed from docs/visual-language.html; no controls or CSS classes. */
const marks = {
  'treatment-clear': {category: 'treatment', viewBox: '0 0 34 34', props: {}, geometry: (_stroke:number)=> <><circle cx="17" cy="17" r="12" fill="var(--plum)"/></>},
  'treatment-masked': {category: 'treatment', viewBox: '0 0 34 34', props: {}, geometry: (_stroke:number)=> <><path d="M17 5a12 12 0 0 0 0 24z" fill="var(--plum)"/><circle cx="17" cy="17" r="12" fill="none" stroke="var(--plum)" strokeWidth={_stroke}/></>},
  'treatment-aggregate': {category: 'treatment', viewBox: '0 0 34 34', props: {}, geometry: (_stroke:number)=> <><circle cx="17" cy="17" r="12" fill="none" stroke="var(--plum)" strokeWidth={_stroke}/><circle cx="11" cy="20" r="3" fill="var(--plum)"/><circle cx="17" cy="12" r="3" fill="var(--plum)"/><circle cx="23" cy="20" r="3" fill="var(--plum)"/></>},
  'treatment-tokenized': {category: 'treatment', viewBox: '0 0 34 34', props: {}, geometry: (_stroke:number)=> <><circle cx="17" cy="17" r="12" fill="none" stroke="var(--plum)" strokeWidth={_stroke}/><circle cx="17" cy="17" r="4" fill="var(--plum)"/></>},
  'treatment-withheld': {category: 'treatment', viewBox: '0 0 34 34', props: {}, geometry: (_stroke:number)=> <><circle cx="17" cy="17" r="12" fill="none" stroke="var(--ink-3)" strokeWidth={_stroke}/><line x1="9" y1="25" x2="25" y2="9" stroke="var(--ink-3)" strokeWidth={_stroke}/></>},
  'treatment-undecided': {category: 'treatment', viewBox: '0 0 34 34', props: {}, geometry: (_stroke:number)=> <><circle cx="17" cy="17" r="12" fill="var(--yellow-bg)" stroke="var(--ink-2)" strokeWidth={_stroke} strokeDasharray="3.6 3.6"/></>},
  'source': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M3 7.5a9 3.5 0 1 0 18 0 9 3.5 0 1 0-18 0"/>
      <path d="M3 7.5v9c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5v-9"/>
      <path d="M3 12c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5"/>
    </>},
  'element': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <rect x="3" y="4" width="18" height="16" rx="2.5"/>
      <path d="M3 8.5h18"/><path d="M9.5 8.5V20"/><path d="M15 8.5V20"/>
      <rect x="9.5" y="8.5" width="5.5" height="11.5" fill="var(--plum)" stroke="none" opacity=".16"/>
    </>},
  'agent': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <rect x="4" y="8" width="16" height="11" rx="3"/>
      <path d="M12 8V4.8"/><circle cx="12" cy="3.6" r="1.3"/>
      <circle cx="9" cy="13" r="1.25" fill="var(--ink-2)" stroke="none"/>
      <circle cx="15" cy="13" r="1.25" fill="var(--ink-2)" stroke="none"/>
      <path d="M9.5 16.3h5"/>
    </>},
  'pool': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <rect x="2.5" y="9" width="9" height="7" rx="2.2"/>
      <path d="M7 9V6.6"/><circle cx="7" cy="5.7" r="1"/>
      <rect x="12.5" y="12" width="9" height="7" rx="2.2"/>
      <path d="M17 12V9.6"/><circle cx="17" cy="8.7" r="1"/>
    </>},
  'engine': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <rect x="3" y="7" width="18" height="10" rx="2.5"/>
      <path d="M7 11.5h2.5M7 14h4.5"/>
      <circle cx="17.5" cy="12.5" r="1.4" fill="var(--green-bg)" stroke="var(--green-dk)" strokeWidth=".9"/>
      <path d="M7 7V4.5M17 7V4.5M7 19.5V17M17 19.5V17"/>
    </>},
  'filing': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M13.5 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9.5z"/>
      <path d="M13.5 3v6.5H20"/>
      <path d="M8 13.5h8M8 17h5"/>
    </>},
  'evidence': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M13.5 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9.5z"/>
      <path d="M13.5 3v6.5H20"/>
      <circle cx="12" cy="15" r="5" fill="var(--green-bg)" stroke="none"/>
      <path d="M8.5 15.3l2.3 2.3 4.3-4.6" stroke="var(--green-dk)"/>
    </>},
  'pool-key': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <circle cx="8" cy="12" r="4.2"/>
      <path d="M12.2 12H21"/><path d="M17.5 12v3.4"/><path d="M20.4 12v2.4"/>
    </>},
  'query': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M4 6.5h16M4 11h11M4 15.5h14M4 20h8"/>
    </>},
  'prompt': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--plum)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M20 12.5c0 3.9-3.6 7-8 7a9.6 9.6 0 0 1-2.6-.35L4.5 21l1.2-3.4A6.6 6.6 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z"/>
      <path d="M9.6 10.4a2.5 2.5 0 1 1 3 2.45v1.1"/>
      <circle cx="12.6" cy="16.1" r=".9" fill="var(--plum)" stroke="none"/>
    </>},
  'dereference': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-2)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <circle cx="9" cy="9" r="3.2"/><circle cx="16" cy="9" r="3.2"/>
      <path d="M5 19c0-2.4 1.8-4.2 4-4.2s4 1.8 4 4.2"/>
      <path d="M12.6 15.2c.9-.3 1.9-.4 2.9-.3 2.1.2 3.7 1.9 3.7 4.1"/>
    </>},
  'healthy': {category: 'state', viewBox: '0 0 24 24', props: {}, geometry: <circle cx="12" cy="12" r="5" fill="var(--green-dk)"/>},
  'unreachable': {category: 'state', viewBox: '0 0 24 24', props: {}, geometry: <circle cx="12" cy="12" r="5" fill="var(--ink-3)"/>},
  'refused': {category: 'state', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-3)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <circle cx="12" cy="12" r="8.5"/><path d="M8.6 15.4l6.8-6.8"/>
    </>},
  'needs-a-decision': {category: 'state', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M12 3.5 21 19.5H3Z" fill="var(--yellow-bg)"/><path d="M12 10v4"/><circle cx="12" cy="16.9" r=".95" fill="var(--ink)" stroke="none"/>
    </>},
  'quarantined': {category: 'state', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="var(--yellow-bg)"/>
      <path d="M3.5 10.5h17"/><path d="M9 14.5h6"/>
    </>},
  'incomplete': {category: 'state', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-3)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.2 6.3"/>
      <path d="M3.4 5.2v4.8h4.8"/>
    </>},
  'stale': {category: 'state', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'var(--ink-3)',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3.4 3.4"/>
      <path d="M12 7.8V12l2.8 1.8"/>
    </>},
  'nav-dashboard': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><circle cx="12" cy="12" r="8.5"/><path d="M12 12l4.6-4.6"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></>},
  'nav-observations': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M12 4.2 21 19.2H3Z"/><path d="M12 10.3v4"/><circle cx="12" cy="16.6" r=".95" fill="currentColor" stroke="none"/></>},
  'nav-activity': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M3 12.5h4l2.5-6 4 12 2.5-6H21"/></>},
  'nav-releases': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><rect x="3.5" y="8.5" width="17" height="12" rx="2.3"/><path d="M6.5 5.5h11M8.5 2.8h7"/></>},
  'nav-workbench': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M8.5 6.2 17 12l-8.5 5.8Z"/></>},
  'nav-data-sources': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M3.8 7a8.2 3.2 0 1 0 16.4 0 8.2 3.2 0 1 0-16.4 0"/><path d="M3.8 7v10c0 1.8 3.7 3.2 8.2 3.2s8.2-1.4 8.2-3.2V7"/><path d="M3.8 12c0 1.8 3.7 3.2 8.2 3.2s8.2-1.4 8.2-3.2"/></>},
  'nav-vocabulary': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M6 4.2h9.5L20 8.7V19.8H6Z"/><path d="M15.5 4.2v4.5H20"/><path d="M9 11.5h7M9 15h4.5"/></>},
  'nav-source-of-truth': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.6 2.6 4.9-5.2"/></>},
  'nav-relationships': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><circle cx="6.5" cy="7" r="2.6"/><circle cx="17.5" cy="7" r="2.6"/><circle cx="12" cy="17.5" r="2.6"/><path d="M8.6 8.8 10.9 15M15.4 8.8 13.1 15M9.1 7h5.8"/></>},
  'nav-knowledge': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M12 3.3 20 7.9v8.2L12 20.7 4 16.1V7.9Z"/><path d="M12 12v8.7M12 12 4 7.9M12 12l8-4.1"/></>},
  'nav-entitlements': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.3"/><path d="M3.5 9.3h17M10 9.3v10.2"/></>},
  'nav-pools': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><rect x="2.6" y="8.6" width="8.6" height="6.6" rx="2.1"/><path d="M6.9 8.6V6.4"/><circle cx="6.9" cy="5.5" r="1"/><rect x="12.8" y="11.4" width="8.6" height="6.6" rx="2.1"/><path d="M17.1 11.4V9.2"/><circle cx="17.1" cy="8.3" r="1"/></>},
  'nav-access': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><circle cx="8" cy="12" r="4"/><path d="M12 12h8.5"/><path d="M17.2 12v3.2"/><path d="M20 12v2.3"/></>},
  'nav-audit-log': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><path d="M6 3.8h9.5L20 8.3V20.2H6Z"/><path d="M15.5 3.8v4.5H20"/><path d="M9.2 13.4l1.9 1.9 3.9-4.1"/></>},
  'nav-all-projects': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><rect x="3.3" y="4.3" width="7.4" height="7.4" rx="2"/><rect x="13.3" y="4.3" width="7.4" height="7.4" rx="2"/><rect x="3.3" y="13.3" width="7.4" height="7.4" rx="2"/><rect x="13.3" y="13.3" width="7.4" height="7.4" rx="2"/></>},
  'nav-settings': {category: 'kind', viewBox: '0 0 24 24', props: {fill: 'none',stroke: 'currentColor',strokeWidth: '1.7',strokeLinecap: 'round',strokeLinejoin: 'round'}, geometry: <><circle cx="12" cy="12" r="3.1"/><path d="M12 2.9v2.6M12 18.5v2.6M21.1 12h-2.6M5.5 12H2.9M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/></>},
} as const;
export type MarkName = keyof typeof marks;
export type MarkSize = 12 | 16 | 17 | 18 | 19 | 22 | 24 | 26 | 30 | 34 | 48;
const treatmentStrokeWeights:Partial<Record<MarkSize,number>>={12:2.6,16:2.4,17:2.35,18:2.3,22:2.2,34:2,48:1.8};
export const markNames = Object.keys(marks) as MarkName[];
const treatmentColours:Partial<Record<MarkName,`var(--${string})`>>={'treatment-clear':'var(--green-dk)','treatment-masked':'var(--mask-dk)','treatment-aggregate':'var(--agg-dk)','treatment-tokenized':'var(--token-dk)','treatment-withheld':'var(--held-dk)','treatment-undecided':'var(--ink-2)'};
export function Mark({name,size=16,navigation=false,label,treatmentColour,legendFill}:{name:MarkName;size?:MarkSize;navigation?:boolean;label?:string;treatmentColour?:`var(--${string})`;legendFill?:`var(--${string})`}):ReactNode {
 const mark=marks[name];
 const colour=legendFill??treatmentColour??treatmentColours[name];
 const style:CSSProperties & {'--plum'?:string;'--ink-3'?:string;'--yellow-bg'?:string}={verticalAlign:'middle',flexShrink:0,...(mark.category==='treatment'&&colour?{'--plum':colour,'--ink-3':colour}:{}),...(legendFill?{'--yellow-bg':legendFill}:{})};
 return <svg {...mark.props} {...(navigation?{stroke:'currentColor'}:{})} viewBox={mark.viewBox} width={size} height={size} style={style} aria-hidden={label?undefined:true} role={label?'img':undefined} aria-label={label} focusable="false" data-mark={name} data-mark-category={mark.category}>{legendFill&&mark.category==='treatment'?<LegendTreatment name={name} fill={legendFill}/>:typeof mark.geometry==='function'?mark.geometry(treatmentStrokeWeights[size]??2):mark.geometry}</svg>;
}

/** Exposure-legend variant: exact segment fill, uniform one-CSS-pixel ink edges. */
function LegendTreatment({name,fill}:{name:MarkName;fill:`var(--${string})`}){
 const edge={stroke:'var(--ink)',strokeWidth:1,vectorEffect:'non-scaling-stroke' as const};
 if(name==='treatment-clear')return <circle cx="17" cy="17" r="12" fill={fill} {...edge}/>;
 if(name==='treatment-masked')return <><path d="M17 5a12 12 0 0 0 0 24z" fill={fill} {...edge}/><circle cx="17" cy="17" r="12" fill="none" {...edge}/></>;
 if(name==='treatment-tokenized')return <><circle cx="17" cy="17" r="12" fill="none" {...edge}/><circle cx="17" cy="17" r="4" fill={fill} {...edge}/></>;
 if(name==='treatment-aggregate')return <><circle cx="17" cy="17" r="12" fill="none" {...edge}/>{[[11,20],[17,12],[23,20]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="3" fill={fill} {...edge}/>)}</>;
 if(name==='treatment-withheld')return <><circle cx="17" cy="17" r="12" fill={fill} {...edge}/><line x1="9" y1="25" x2="25" y2="9" {...edge}/></>;
 return <circle cx="17" cy="17" r="12" fill={fill} {...edge} strokeDasharray="3.6 3.6"/>;
}
