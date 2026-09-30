import {it,expect} from 'vitest';
import {exactDefaultNumeric} from '../sidecar/execution/application/exact-numeric.js';
import {refusalResponse} from '../src/modules/mcp/application/response.js';
it.each(['0','-0.00000000000','99999999999999999999999999999.999999999','-0.000000001','1.123456789000'])('accepts exactly representable %s without floating point',value=>{
 expect(exactDefaultNumeric(value,'premium','scalar')).toEqual({ok:true,value:undefined});
});
it.each(['100000000000000000000000000000','-0.0000000001','17.1234567891','NaN','Infinity','-Infinity'])('refuses %s without exposing the value',value=>{
 const result=exactDefaultNumeric(value,'premium','scalar');expect(result.ok).toBe(false);
 if(!result.ok){expect(result.error.details?.cause).toBe('numeric_not_representable');const response=refusalResponse(result.error);
 expect(response.content[0]!.text).toContain('premium');expect(response.content[0]!.text).toContain('magnitude');
 expect(JSON.stringify(response)).not.toContain(value);expect(response._meta.retryable).toBe(false);}
});
it('checks every array dimension without parsing decimal strings as numbers',()=>{
 expect(exactDefaultNumeric('[["1.000000000",null],["2.5","3"]]','rates','array').ok).toBe(true);
 expect(exactDefaultNumeric('[["1"],["0.0000000001"]]','rates','array').ok).toBe(false);
});
