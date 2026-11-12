// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,createRace,tickRace,replay,distanceMeters,speedKph,finishMeters} from '../shared/racer/sim.js';
import {MODES,modeSettings} from '../shared/racer/config.js';
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {advanceRaceFrame} from '../shared/racer/frame.js';
import {TOUR_STAGE_METERS,TOUR_STAGES,sprintCenter,sprintHeading,tourPalette,routeBend,
  sweptLongitudinalContact} from '../shared/racer/course.js';
import {sprintSceneGeometry,sprintTrafficGeometry} from '../shared/racer/webgl.js';
import {project} from '../shared/racer/renderer.js';
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

test('all events survive two physics ticks in one render frame',()=>{
  const s=createRace({mode:'wasteland'}),r=s.rivals[0];
  r.distanceQ=0;r.laneQ=0;r.speedQ=0;
  const clock=new FixedClock({step:1/60,maxSteps:15}),calls=[];
  const audio={update:value=>calls.push(['update',value]),silence:()=>calls.push(['silence'])};
  const result=advanceRaceFrame(clock,s,{fire:true},1/30,audio);
  assert.equal(clock.ticks,2);
  assert.deepEqual(result.events,['IMPACT','HIT +100']);
  assert.equal(s.lastEvent,''); // The second uneventful tick no longer loses feedback.
  assert.deepEqual(s.events,[]);
  assert.equal(result.finished,false);
  assert.equal(calls.filter(c=>c[0]==='update').length,1);
});

test('terminal finish and crash silence the engine without reviving it',()=>{
  for(const outcome of ['won','lost']){
    const s=createRace(),clock=new FixedClock({step:1/60,maxSteps:15}),calls=[];
    const audio={update:value=>calls.push(['update',value]),silence:()=>calls.push(['silence'])};
    s.speedQ=20*Q;
    if(outcome==='won'){
      s.distanceQ=Math.round((finishMeters(s)-.1)*Q);
    }else{
      s.health=1;
      const rival=s.rivals[0];rival.distanceQ=0;rival.speedQ=20*Q;rival.laneQ=0;
    }
    const result=advanceRaceFrame(clock,s,{accelerate:true},1/30,audio);
    assert.equal(s.status,outcome);
    assert.equal(result.finished,true);
    assert.equal(clock.paused,true);
    assert.deepEqual(calls,[['silence']]);
    assert.ok(result.events.includes(outcome==='won'?'FINISH':'CAR DESTROYED'));
  }
});

test('same-tick collision and weapons are both emitted in order',()=>{
  const s=createRace({mode:'wasteland'}),r=s.rivals[0];
  r.distanceQ=0;r.laneQ=0;r.speedQ=0;
  tickRace(s,{fire:true});
  assert.deepEqual(s.events,['IMPACT','HIT +100']);
  assert.equal(s.lastEvent,'HIT +100');
  tickRace(s,{});
  assert.deepEqual(s.events,[]);
});

test('RACING-002 all eight Scenic Tour histories advance distinct palettes and checkpoint clocks',()=>{
  for(let n=0;n<8;n++){
    const choices=[0,1,2].map(bit=>(n>>bit&1)?'right':'left');
    const race=createRace({mode:'coast',seed:108});
    let before=tourPalette([],race.track).id;
    for(let stage=1;stage<TOUR_STAGES;stage++){
      race.distanceQ=Math.round((stage*TOUR_STAGE_METERS-.5)*Q);
      race.speedQ=80*Q;
      race.laneQ=choices[stage-1]==='left'?-Math.round(.55*Q):Math.round(.55*Q);
      tickRace(race,{accelerate:true});
      assert.deepEqual(race.route,choices.slice(0,stage));
      assert.equal(race.checkpoints,stage);
      assert.notEqual(tourPalette(race.route,race.track).id,before);
      assert.ok(race.events.includes('CHECKPOINT +20s'));
      before=tourPalette(race.route,race.track).id;
    }
    assert.equal(race.timeLeft,90*60+3*20*60-3);
  }
  for(const previous of [[],['left'],['right'],['left','right']]){
    const left=tourPalette([...previous,'left']).id;
    const right=tourPalette([...previous,'right']).id;
    assert.notEqual(left,right);
    assert.notEqual(left,tourPalette(previous).id);
    assert.notEqual(right,tourPalette(previous).id);
  }
  assert.notEqual(routeBend(1420,['left']),routeBend(1420,['right']));
  assert.notEqual(project(300,1400,0,'coast',['left']).x,
    project(300,1400,0,'coast',['right']).x);
});

test('RACING-002 nitro speed persists above the standard cap and decays over several ticks',()=>{
  const race=createRace({mode:'supercar'});
  race.speedQ=90*Q;
  tickRace(race,{accelerate:true,boost:true});
  const boosted=race.speedQ;
  assert.ok(boosted>90*Q&&boosted<120*Q);
  tickRace(race,{accelerate:true,boost:false});
  assert.ok(race.speedQ<boosted&&race.speedQ>90*Q);
  for(let i=0;i<200;i++)tickRace(race,{accelerate:true});
  assert.ok(race.speedQ<=90*Q);
});

test('RACING-002 exact longitudinal sweep detects fast crosses, not remote misses',()=>{
  const m=n=>Math.round(n*Q);
  assert.equal(sweptLongitudinalContact(m(0),m(30),m(14),m(15),m(5)),true);
  assert.equal(sweptLongitudinalContact(m(0),m(8),m(30),m(31),m(5)),false);
  assert.equal(sweptLongitudinalContact(m(0),m(1),m(5),m(6),m(5)),true);
  assert.throws(()=>sweptLongitudinalContact(1.5,2,3,4,m(5)),RangeError);
  const race=createRace({mode:'supercar'}),r=race.rivals[0];
  r.distanceQ=m(6);r.laneQ=0;r.speedQ=0;
  race.speedQ=m(90);
  tickRace(race,{accelerate:true});
  assert.equal(race.health,85);
  assert.ok(race.events.includes('IMPACT'));
});

test('RACING-002 lane-changing rivals replay identically without external randomness',()=>{
  const first=createRace({mode:'wasteland',seed:457}),again=createRace({mode:'wasteland',seed:457});
  const previous=first.rivals.map(r=>r.laneQ);
  for(let i=0;i<180;i++){tickRace(first,{});tickRace(again,{})}
  assert.deepEqual(first,again);
  assert.ok(first.rivals.some((r,i)=>r.laneQ!==previous[i]));
  assert.ok(first.rivals.every(r=>Math.abs(r.laneQ)<Q));
});

test('RACING-002 3D sprint gates and off-road finish require a valid renewed approach',()=>{
  const race=createRace({mode:'sprint',seed:12});
  race.distanceQ=Math.round(899.5*Q);race.speedQ=90*Q;
  tickRace(race,{accelerate:true});
  assert.equal(race.checkpoints,1);
  assert.ok(race.events.includes('SCENIC GATE 1 / 4'));
  race.distanceQ=Math.round(3599.5*Q);race.speedQ=90*Q;race.laneQ=Math.round(1.2*Q);
  tickRace(race,{accelerate:true});
  assert.equal(race.status,'running');
  assert.equal(race.distanceQ,3590*Q);
  assert.ok(race.events.includes('FINISH GATE MISSED · RETURN TO ROAD'));
  race.laneQ=0;race.laneVQ=0;race.speedQ=90*Q;
  for(let i=0;i<35&&race.status==='running';i++)tickRace(race,{accelerate:true});
  assert.equal(race.status,'won');assert.ok(race.events.includes('FINISH'));
  assert.throws(()=>sprintCenter(Infinity),TypeError);
  assert.notEqual(sprintCenter(100),sprintCenter(600));
  assert.ok(Number.isFinite(sprintHeading(1800)));
});

test('RACING-002 static WebGL road and moving car geometry are finite and bounded',()=>{
  const road=sprintSceneGeometry(),traffic=sprintTrafficGeometry(createRace({mode:'sprint'}));
  assert.ok(road.length>50000&&road.length<1600000);
  assert.equal(road.length%6,0);
  assert.ok(road.every(Number.isFinite));
  assert.ok(traffic.length>0&&traffic.length<150000);
  assert.equal(traffic.length%6,0);
  assert.ok(traffic.every(Number.isFinite));
});
