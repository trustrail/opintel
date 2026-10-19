import {StringDecoder} from 'node:string_decoder';
import {readinessMessages} from '../src/shared/engine-readiness.js';

const safeLines=new Set([
 ...Object.values(readinessMessages).map(message=>'Opintel Engine startup failed: query engine readiness: Error: '+message),
 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
 'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory',
 'Segmentation fault','Segmentation fault (core dumped)','Aborted','Aborted (core dumped)',
 '----- Native stack trace -----','----- JavaScript stack trace -----',
]);
export const stderrTailLimit=4096;
const withheld='[stderr content withheld]';
/** Never duplicate arbitrary native stderr into the exit log: it can contain SQL, rows or
 * credentials. Retain only authored lines/prefixes; unknown content is explicitly
 * withheld. The byte count and signal still distinguish silence from redaction. */
export class EngineStderrTail {
 private readonly decoder=new StringDecoder('utf8');
 private prefix='';private discarding=false;private tail='';private bytes=0;private withheldLines=0;private truncated=false;
 private append(line:string):string{
  const value=line+'\n';this.tail+=value;
  if(Buffer.byteLength(this.tail)>stderrTailLimit){this.tail=Buffer.from(this.tail).subarray(-stderrTailLimit).toString('utf8');this.truncated=true;}
  return value;
 }
 private consume(text:string):string{
  let output='';
  for(const character of text){
   if(character==='\n'){
    if(!this.discarding&&this.prefix){if(safeLines.has(this.prefix))output+=this.append(this.prefix);else{this.withheldLines++;output+=this.append(withheld);}}
    this.prefix='';this.discarding=false;
   }else if(!this.discarding&&character!=='\r'){
    this.prefix+=character;
    if(![...safeLines].some(line=>line.startsWith(this.prefix))){this.prefix='';this.discarding=true;this.withheldLines++;output+=this.append(withheld);}
   }
  }
  return output;
 }
 push(chunk:Buffer):string{this.bytes+=chunk.length;return this.consume(this.decoder.write(chunk));}
 finish():string{let output=this.consume(this.decoder.end());if(this.prefix){if(safeLines.has(this.prefix))output+=this.append(this.prefix);else{this.withheldLines++;output+=this.append(withheld);}}this.prefix='';this.discarding=false;return output;}
 snapshot(){return {stderrTail:this.tail,stderrBytes:this.bytes,stderrWithheldLines:this.withheldLines,stderrTailTruncated:this.truncated};}
}
