import {ParentSize} from '@visx/responsive';
import {Group} from '@visx/group';
import {Text} from '@visx/text';
import {scalePoint} from '@visx/scale';
import type {EvidenceDetail} from '../../shared/api/activity.js';
/** The prototype's only visx consumer. Stages are recorded facts, not inferred progress. */
export function ReceiptDiagram({receipt}:{receipt:EvidenceDetail}){
 const stages=receipt.stages.length?receipt.stages.map((stage,index)=>({id:String(index),name:stage.stage,result:stage.result})): [{id:'receipt',name:receipt.status,result:'No stage detail recorded'}];
 return <figure aria-label="Recorded receipt stages"><div data-visual="receipt"><ParentSize debounceTime={0}>{({width,height})=>{if(!width||!height)return null;const narrow=width<600,shown=stages.slice(0,5),w=narrow?width*.88:width/(shown.length+1),h=narrow?height/(shown.length+1)*.7:height*.4,point=scalePoint({domain:shown.map(s=>s.id),range:narrow?[h/2+height*.04,height-h/2-height*.04]:[w/2+width*.04,width-w/2-width*.04]});return <svg width={width} height={height} role="img" aria-label={shown.map(s=>`${s.name}: ${s.result}`).join('; ')}>{shown.slice(1).map((s,i)=><line key={s.id} x1={narrow?width/2:point(shown[i]!.id)} y1={narrow?point(shown[i]!.id):height/2} x2={narrow?width/2:point(s.id)} y2={narrow?point(s.id):height/2} stroke="var(--plum)"/>)}{shown.map(s=><Group key={s.id} left={(narrow?width/2:point(s.id)??0)-w/2} top={(narrow?point(s.id)??0:height/2)-h/2}><rect width={w} height={h} rx={8} fill="var(--ivory)" stroke="var(--plum)"/><Text x={w/2} y={h/2} width={w-16} textAnchor="middle" verticalAnchor="middle" fontFamily="var(--body)" fontSize={14} fill="var(--plum)">{s.name}</Text></Group>)}</svg>;}}</ParentSize></div><figcaption>{stages.length>5?`First 5 of ${stages.length} recorded stages; full detail below.`:'Recorded execution order. Full results below.'}</figcaption></figure>;
}
