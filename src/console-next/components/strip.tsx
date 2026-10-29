import {BarStack} from '@visx/shape';
import {scaleBand,scaleLinear} from '@visx/scale';
import type {Minute} from '../home/data.js';
import {Glyph} from './kind.js';
export function MinuteStrip({minutes,project,live,asOf}:{minutes:Minute[];project:string;live:boolean;asOf:string}){
 const data=minutes.map(m=>({...m,other:Math.max(0,m.requests-m.refused)})),x=scaleBand<string>({domain:data.map(m=>m.at),range:[0,1200],padding:0.45}),y=scaleLinear<number>({domain:[0,Math.max(1,...data.map(m=>m.requests))],range:[42,0]});
 return <section data-minute-strip aria-label="Requests in the last 30 minutes"><header><a href={`/projects/${project}/activity?${new URLSearchParams({from:minutes[0]?.at??asOf,to:asOf})}`}><span data-live={live}/><strong>30 min</strong></a><span data-strip-key><i/> requests <i data-refused/> refused <Glyph name="chevron" size={16}/></span></header>
 <svg viewBox="0 0 1200 44" preserveAspectRatio="none" role="img" aria-label={`${minutes.reduce((n,m)=>n+m.requests,0)} requests in 30 one-minute buckets`}><BarStack data={data} keys={['other','refused']} x={m=>m.at} xScale={x} yScale={y} color={key=>key==='refused'?'var(--treatment-withheld)':'var(--strip-bar)'}>{stacks=>stacks.flatMap(stack=>stack.bars.map(bar=><rect key={`${stack.key}-${bar.index}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={bar.color}><title>{bar.bar.data.at}: {bar.bar.data.requests} requests, {bar.bar.data.refused} refused</title></rect>))}</BarStack></svg>
 </section>;
}
