// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScore,engineSignal,createAudio} from '../js/audio.js';

class Param {
  constructor(value=0) { this.value=value; }
  setValueAtTime(value) { this.value=value; }
  linearRampToValueAtTime(value) { this.value=value; }
  exponentialRampToValueAtTime(value) { this.value=value; }
  setTargetAtTime(value) { this.value=value; }
  cancelScheduledValues() {}
}
class Node {
  constructor(ctx,type) { this.ctx=ctx;this.kind=type;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.delayTime=new Param();this.connections=[];this.stopped=false; }
  connect(other) { this.connections.push(other);return other; }
  disconnect() { this.connections=[]; }
  start(at=0) { this.started=at; }
  stop(at=this.ctx.currentTime) { this.stopAt=at;if(at<=this.ctx.currentTime)this.end(); }
  end() { if(!this.stopped){this.stopped=true;this.onended?.();} }
}
class Context {
  constructor() { this.state='suspended';this.sampleRate=48000;this.currentTime=0;this.destination={};this.nodes=[];this.buffers=[]; }
  node(type) { const n=new Node(this,type);this.nodes.push(n);return n; }
  createGain() {return this.node('gain');}
  createBiquadFilter() {return this.node('filter');}
  createOscillator() {return this.node('oscillator');}
  createBufferSource() {return this.node('source');}
  createDelay() {return this.node('delay');}
  createBuffer(_channels,length,sampleRate) { const data=new Float32Array(length),b={length,sampleRate,getChannelData:()=>data};this.buffers.push(b);return b; }
  async resume() {this.state='running';}
  async suspend() {this.state='suspended';}
  async close() {this.state='closed';}
  advance(dt) { if(this.state!=='running')return;this.currentTime+=dt;for(const n of this.nodes)if(n.stopAt<=this.currentTime)n.end(); }
}

test('E8-derived arrangement is seeded, bounded and uses all authored phrase roles',()=>{
  const a=buildScore('test-drive'),b=buildScore('test-drive'),c=buildScore('other-drive');
  assert.deepEqual(a,b);assert.notDeepEqual(a,c);assert.equal(a.length,64);
  assert.ok(a.every(n=>Number.isInteger(n.root)&&n.root>=0&&n.root<240));
  assert.ok(a.every(n=>n.lead===0||(n.lead>=50&&n.lead<=80)));
  assert.ok(a.some(n=>n.kick)&&a.some(n=>n.snare)&&a.some(n=>n.hat)&&a.some(n=>n.bass));
  assert.equal(globalThis.E8Core.validateRoots(globalThis.E8Core.generateE8Roots()).valid,true);
});

test('engine telemetry remains finite under missing, invalid and extreme values',()=>{
  for(const input of [{},{rpm:Infinity,speed:NaN,x:NaN},{rpm:-900,speed:-4},{rpm:1e20,speed:1e20,x:1e20}]){
    const signal=engineSignal(input);
    assert.ok(Object.values(signal).every(Number.isFinite));
    assert.ok(signal.frequency>=22&&signal.frequency<=300);
    assert.ok(signal.skid>=0&&signal.skid<=.2);
  }
  assert.ok(engineSignal({rpm:6000}).frequency>engineSignal({rpm:900}).frequency);
});

test('optional audio allocates nothing until activation and fails gracefully without a receiver',async()=>{
  let allocations=0;
  const audio=createAudio({contextFactory:()=>{allocations++;return null;}});
  audio.update();audio.cue('win');assert.equal(allocations,0);
  assert.equal(await audio.unlock(),false);assert.equal(allocations,0);
  assert.equal(await audio.setEnabled(true),false);assert.equal(allocations,1);
  assert.equal(audio.state.status,'unavailable');
  await audio.dispose();assert.equal(audio.state.status,'closed');
});

test('sound pause, mute and explicit resume retain bounded source and buffer lifecycles',async()=>{
  const ctx=new Context();let allocations=0;
  const audio=createAudio({contextFactory:()=>{allocations++;return ctx;}});
  assert.equal(await audio.setEnabled(true),true);assert.equal(allocations,1);
  audio.update();assert.ok(audio.state.voices>0);assert.ok(audio.state.bufferCount>0);
  const audibleBuffers=ctx.buffers.slice(1);
  assert.ok(audibleBuffers.length>0);
  for(const buffer of audibleBuffers){const pcm=buffer.getChannelData(0);assert.ok(pcm[0]===0);assert.ok(pcm.at(-1)===0);assert.ok(pcm.every(Number.isFinite));assert.ok(pcm.some(x=>Math.abs(x)>.001));}
  audio.setScene('race');
  for(let i=0;i<500;i++){
    ctx.advance(.1);audio.update({status:'running',player:{speed:45,rpm:3600+(i%25)*100,gear:1+i%4,x:1.1}});
    assert.ok(audio.state.voices<=24);assert.ok(audio.state.bufferCount<=64);
  }
  assert.equal(allocations,1);
  await audio.suspend();assert.equal(ctx.state,'suspended');assert.equal(audio.state.voices,0);
  const before=ctx.nodes.length;audio.update({player:{rpm:8000}});audio.cue('win');assert.equal(ctx.nodes.length,before);
  assert.equal(await audio.unlock(),false,'focus pause needs explicit resume');
  assert.equal(await audio.resume(),true);
  audio.update({status:'running',player:{speed:45,rpm:6000,gear:4}});
  await audio.setEnabled(false);assert.equal(ctx.state,'suspended');assert.equal(audio.state.voices,0);
  assert.equal(ctx.nodes[0].gain.value,0,'master is immediately muted');
  await audio.dispose();assert.equal(ctx.state,'closed');assert.equal(audio.state.bufferCount,0);
  assert.ok(ctx.nodes.filter(n=>n.kind==='oscillator'||n.kind==='source').every(n=>n.stopped));
});

test('a long frame skips music debt and repeated mute/unmute uses one context',async()=>{
  const ctx=new Context();let count=0;const audio=createAudio({contextFactory:()=>{count++;return ctx;}});
  await audio.setEnabled(true);audio.update();ctx.advance(600);audio.update();
  assert.ok(audio.state.voices<=8,'no catch-up note storm after a long frame');
  for(let i=0;i<4;i++){await audio.setEnabled(false);await audio.setEnabled(true);audio.update();}
  assert.equal(count,1);await audio.dispose();
});
