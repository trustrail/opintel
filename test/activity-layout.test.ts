import {describe,expect,it} from 'vitest';
import {createActivityState} from '../src/app/activity/state.js';

describe('Activity measured heights',()=>{
 it('retains measurements when the initial viewport width arrives after them',()=>{
  const store=createActivityState();
  store.getState().measure('day',46);
  store.getState().measure('request',42);
  store.getState().resize(1080);
  expect(store.getState().width).toBe(1080);
  expect(store.getState().heights).toEqual({day:46,request:42});
 });
 it('retains unchanged heights and accepts new measurements after a resize',()=>{
  const store=createActivityState();
  store.getState().measure('day',46);
  store.getState().measure('request',42);
  store.getState().resize(390);
  store.getState().measure('request',210);
  expect(store.getState().heights).toEqual({day:46,request:210});
 });
});
