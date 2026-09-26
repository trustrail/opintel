import { expect,it } from 'vitest';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import { DescribeInput,DescribeOutput,ExplainInput,ExplainOutput,QueryInput,QueryOutput,mcpTools,toolDescriptor } from '../src/shared/api/mcp.js';
const validator=new AjvJsonSchemaValidator();
it('I-023: producer Zod schemas and independent consumer JSON Schema validation agree in both directions',()=>{
 const examples=[
  {input:{},output:{objects:[{name:'source.public.records',columns:[{name:'id',type:'VARCHAR',treatment:'tokenized'}],withheld:['salary']}]},badInput:{object:4},badOutput:{objects:[{name:'source.public.records',columns:[{name:'secret',type:'VARCHAR',treatment:'undecided'}],withheld:[]}]}},
  {input:{sql:'SELECT id FROM records'},output:{permitted:true,objects:['records'],columns:['id'],notes:[]},badInput:{sql:false},badOutput:{permitted:false}},
  {input:{sql:'SELECT id FROM records',maxRows:10},output:{columns:[{name:'id',type:'VARCHAR'}],rows:[['token']],truncated:false,evidenceId:'run-id'},badInput:{sql:'SELECT 1',maxRows:0},badOutput:{columns:[],rows:[],truncated:false}},
 ];
 for(const [index,tool] of mcpTools.entries()){
  const example=examples[index]!,wire=toolDescriptor(tool);
  const input=validator.getValidator(wire.inputSchema),output=validator.getValidator(wire.outputSchema);
  expect(input(tool.input.parse(example.input)).valid).toBe(true);
  expect(output(tool.output.parse(example.output)).valid).toBe(true);
  expect(tool.input.safeParse(JSON.parse(JSON.stringify(example.input))).success).toBe(true);
  expect(tool.output.safeParse(JSON.parse(JSON.stringify(example.output))).success).toBe(true);
  expect(input(example.badInput).valid).toBe(false);expect(tool.input.safeParse(example.badInput).success).toBe(false);
  expect(output(example.badOutput).valid).toBe(false);expect(tool.output.safeParse(example.badOutput).success).toBe(false);
 }
 expect(DescribeInput.parse({object:'source.public.records'})).toEqual({object:'source.public.records'});
 expect(ExplainOutput.parse({permitted:false,reason:'Withheld',code:'element_withheld'})).toHaveProperty('permitted',false);
 expect(DescribeOutput.safeParse({objects:[],undecided:['secret']}).success).toBe(false);
 expect(QueryInput.safeParse({sql:'SELECT 1',unexpected:true}).success).toBe(false);
 expect(ExplainInput.safeParse({}).success).toBe(false);expect(QueryOutput.safeParse({}).success).toBe(false);
});
