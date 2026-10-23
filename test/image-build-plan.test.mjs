import {describe,it,expect} from 'vitest';
import {selectedImages,targetPlatforms,runtimeBase} from '../scripts/images/build-plan.mjs';
describe('independent image selection',()=>{
 it.each(['api','engine','console','egress'])('builds only the selected %s product',target=>{
  expect(selectedImages(target)).toEqual([target]);
 });
 it('selects all products only when requested/defaulted',()=>{
  expect(selectedImages()).toEqual(['api','engine','console','egress']);
 });
 it('rejects unknown products and invalid or duplicate architectures',()=>{
  expect(()=>selectedImages('api,engine')).toThrow('IMAGE');
  for(const value of ['','darwin/arm64','linux/amd64,linux/amd64'])expect(()=>targetPlatforms(value)).toThrow('PLATFORM');
 });
 it('keeps the firewall base exclusive to egress and supports combined platforms',()=>{
  expect(runtimeBase('egress')).toBe('firewall-runtime');
  expect(runtimeBase('engine')).toBe('runtime-base');
  expect(targetPlatforms()).toEqual(['linux/amd64','linux/arm64']);
 });
});
