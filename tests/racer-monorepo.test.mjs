// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,createRace,tickRace,replay,distanceMeters,speedKph,finishMeters} from '../shared/racer/sim.js';
import {MODES,modeSettings} from '../shared/racer/config.js';
const accelerate={accelerate:true,steer:0,boost:false,fire:false};
test('all modes start with different contracts and bounded Q16 state',()=>{
  for(const mode of Object.keys(MODES)){
    const s=createRace({mode});assert.equal(s.mode,mode);
    assert.ok(s.rivals.length>0);assert.equal(s.distanceQ,0);
    for(let t=0;t<1800;t++)tickRace(s,accelerate);
    assert.ok(Number.isSafeInteger(s.distanceQ));assert.ok(Number.isSafeInteger(s.speedQ));
    assert.ok(Number.isSafeInteger(s.laneQ));assert.ok(s.health>=0&&s.health<=100);
    assert.ok(speedKph(s)>0);assert.ok(distanceMeters(s)>0);
    assert.ok(s.distanceQ<=finishMeters(s)*Q+100*Q);
  }
});
test('same seed and input tape replay byte-identically, different seeds differ',()=>{
  const tape=Array.from({length:600},(_,i)=>({accelerate:true,steer:i%97<42?1:-1,boost:i%11===0,fire:i%29===0}));
  const a=replay(tape,{mode:'wasteland',seed:193});const b=replay(tape,{mode:'wasteland',seed:193});
  assert.deepEqual(a,b);assert.notDeepEqual(a,replay(tape,{mode:'wasteland',seed:194}));
});
test('held brakes stop motion; no negative speed',()=>{
  const s=createRace();
  for(let i=0;i<240;i++)tickRace(s,accelerate);
  const before=s.speedQ;assert.ok(before>0);
  for(let i=0;i<450;i++)tickRace(s,{brake:true});
  assert.equal(s.speedQ,0);
});
test('offroad boundary is bounded and slows racing',()=>{
  const s=createRace();for(let i=0;i<1800;i++)tickRace(s,{accelerate:true,steer:1});
  assert.ok(Math.abs(s.laneQ)<=Math.round(1.4*Q));assert.ok(s.speedQ<=52*Q);
});
test('combat consumes limited ammunition and respects cooldown',()=>{
  const s=createRace({mode:'wasteland'});
  for(let i=0;i<130;i++)tickRace(s,{accelerate:true,fire:true});
  assert.ok(s.shots>0);assert.ok(s.shots<12);assert.equal(s.ammo,12-s.shots);
  assert.ok(s.rivals.every(r=>r.integrity>=0&&r.integrity<=2));
});
test('checkpoint time is finite and eventually loses idle driver',()=>{
  const s=createRace({mode:'coast'});for(let i=0;i<90*60+1;i++)tickRace(s,{});
  assert.equal(s.status,'lost');assert.equal(s.lastEvent,'TIME EXPIRED');
});
test('race cannot advance after terminal state',()=>{
  const s=createRace({mode:'coast'});s.status='won';
  const before=structuredClone(s);tickRace(s,accelerate);assert.deepEqual(s,before);
});
test('reject invalid modes, cars, tracks and seeds',()=>{
  assert.throws(()=>createRace({mode:'not-a-game'}));
  assert.throws(()=>createRace({track:'unknown'}));
  assert.throws(()=>createRace({car:'unknown'}));
  assert.throws(()=>createRace({seed:-1}));
});
test('basic counterfactual replay: narrower culling cannot change far-away state',()=>{
  const a=createRace({mode:'supercar',seed:9}),b=createRace({mode:'supercar',seed:9});
  b.rivals.forEach(r=>r.distanceQ+=10000*Q);
  for(let i=0;i<40;i++){tickRace(a,accelerate);tickRace(b,accelerate)}
  assert.equal(a.distanceQ,b.distanceQ);assert.equal(a.speedQ,b.speedQ);
  assert.equal(a.health,b.health);
});
