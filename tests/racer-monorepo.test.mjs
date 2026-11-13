// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,createRace,tickRace,replay,distanceMeters,speedKph,finishMeters} from '../shared/racer/sim.js';
import {MODES,modeSettings} from '../shared/racer/config.js';
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {advanceRaceFrame} from '../shared/racer/frame.js';
import {TOUR_STAGE_METERS,TOUR_STAGES,sprintCenter,sprintHeading,tourPalette,routeBend,
  sweptLongitudinalContact,SPRINT_ROAD_HALF_WIDTH_METRES,
  SPRINT_TYRE_HALF_WIDTH_METRES,SPRINT_LANE_SCALE_METRES,
  SPRINT_FINISH_LANE,SPRINT_OFFROAD_LANE,sprintLateralMetres} from '../shared/racer/course.js';
import {sprintSceneGeometry,sprintTrafficGeometry} from '../shared/racer/webgl.js';
import {project,playerScreenX,render} from '../shared/racer/renderer.js';
import {starterTrack,validateTrack,parseTrackJSON,serializeTrack,foundryCenter,
  foundryWidth,foundryHeading,foundryForkAt,foundryLeg,
  FOUNDRY_TOTAL,FOUNDRY_FORKS,foundryLateralMetres} from '../shared/racer/foundry.js';
import {createCircuit,tickCircuit,circuitSnapshot} from '../shared/racer/circuit.js';
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
  const s=createRace({mode:'coast'});for(let i=0;i<300*60+1;i++)tickRace(s,{});
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
    assert.equal(race.timeLeft,300*60+3*20*60-3);
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
  race.distanceQ=Math.round(1199.5*Q);race.speedQ=90*Q;
  tickRace(race,{accelerate:true});
  assert.equal(race.checkpoints,1);
  assert.ok(race.events.includes('SCENIC GATE 1 / 16'));
  race.distanceQ=Math.round((FOUNDRY_TOTAL-.5)*Q);race.speedQ=90*Q;race.laneQ=Math.round(1.2*Q);
  tickRace(race,{accelerate:true});
  assert.equal(race.status,'running');
  assert.equal(race.distanceQ,(FOUNDRY_TOTAL-10)*Q);
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

test('RACING-002 road paint, tyres, and Q16.16 sprint penalties share a physical lane',()=>{
  const epsilon=1e-10,inside=SPRINT_FINISH_LANE,offroad=1.2;
  assert.ok(Math.abs(SPRINT_LANE_SCALE_METRES+SPRINT_TYRE_HALF_WIDTH_METRES-
    SPRINT_ROAD_HALF_WIDTH_METRES)<epsilon);
  assert.ok(sprintLateralMetres(inside)+SPRINT_TYRE_HALF_WIDTH_METRES<
    SPRINT_ROAD_HALF_WIDTH_METRES,'finish-valid tyre must fit entirely on road');
  assert.ok(sprintLateralMetres(SPRINT_OFFROAD_LANE)+SPRINT_TYRE_HALF_WIDTH_METRES<=
    SPRINT_ROAD_HALF_WIDTH_METRES+epsilon,'lane 1 should touch, not pass, the edge');
  assert.ok(sprintLateralMetres(offroad)-SPRINT_TYRE_HALF_WIDTH_METRES<
    SPRINT_ROAD_HALF_WIDTH_METRES&&
    sprintLateralMetres(offroad)+SPRINT_TYRE_HALF_WIDTH_METRES>
    SPRINT_ROAD_HALF_WIDTH_METRES,'lane 1.2 must visibly cross the painted road edge');
  const reference=createRace({mode:'sprint'});
  // The RACING-002 formula remains a compatibility path for a legacy
  // un-authored WebGL scene. The default RACING-003 game uses s.pack.
  reference.pack=null;
  for(const lane of [0,inside,SPRINT_OFFROAD_LANE,offroad,-offroad]){
    reference.laneQ=Math.round(lane*Q);
    const mesh=sprintTrafficGeometry(reference);
    const heading=sprintHeading(0),cx=sprintCenter(0),normal=[Math.cos(heading),Math.sin(heading)];
    // Ten box primitives describe the player, including the four wheels.
    // Project actual generated vertex locations on the road's lateral normal.
    const lateral=[];
    for(let i=0;i<10*36*6;i+=6){
      lateral.push((mesh[i]-cx)*normal[0]+mesh[i+2]*normal[1]);
    }
    const highest=Math.max(...lateral),lowest=Math.min(...lateral);
    // The simulation stores a quantised Q16.16 lane, not the original
    // unquantised JS number supplied by the test. Measure that exact lane.
    const expected=sprintLateralMetres(reference.laneQ/Q);
    assert.ok(Math.abs(highest-(expected+SPRINT_TYRE_HALF_WIDTH_METRES))<1e-8,
      'outer wheel at lane '+lane+': '+highest+' vs '+(expected+SPRINT_TYRE_HALF_WIDTH_METRES));
    assert.ok(Math.abs(lowest-(expected-SPRINT_TYRE_HALF_WIDTH_METRES))<1e-8,
      'inner wheel at lane '+lane+': '+lowest+' vs '+(expected-SPRINT_TYRE_HALF_WIDTH_METRES));
  }
  // Verify the actual first asphalt slab (following the first ground
  // primitive) spans ±13m in the road's local X axis, not only a constant.
  const road=sprintSceneGeometry(),roadHeading=sprintHeading(10);
  const mid=sprintCenter(10),roadNormal=[Math.cos(roadHeading),Math.sin(roadHeading)];
  const slab=[];
  for(let i=36*6;i<2*36*6;i+=6){
    slab.push((road[i]-mid)*roadNormal[0]+(road[i+2]+10)*roadNormal[1]);
  }
  assert.ok(Math.abs(Math.max(...slab)-SPRINT_ROAD_HALF_WIDTH_METRES)<1e-8);
  assert.ok(Math.abs(Math.min(...slab)+SPRINT_ROAD_HALF_WIDTH_METRES)<1e-8);
  assert.throws(()=>sprintLateralMetres(NaN),TypeError);
  const good=createRace({mode:'sprint'});good.laneQ=Math.round(inside*Q);
  good.distanceQ=Math.round((FOUNDRY_TOTAL-.5)*Q);good.speedQ=90*Q;
  tickRace(good,{accelerate:true});assert.equal(good.status,'won');
  const bad=createRace({mode:'sprint'});bad.laneQ=Math.round(offroad*Q);bad.speedQ=90*Q;
  tickRace(bad,{accelerate:true});
  assert.ok(bad.speedQ<=52*Q,'off-road lane should trigger the slow shoulder penalty');
});

test('RACING-003 pins strict VANILLAJS track-v1 schema and rejects malformed input',()=>{
  const pack=starterTrack(),encoded=serializeTrack(pack);
  assert.equal(pack.format,'qsol.vanillajs.track.v1');
  assert.deepEqual(parseTrackJSON(encoded),pack);
  assert.deepEqual(validateTrack(JSON.parse(encoded)),pack);
  assert.ok(Object.isFrozen(pack)&&Object.isFrozen(pack.sections));
  const invalid=JSON.parse(encoded);invalid.sections[0].width=2;
  assert.throws(()=>validateTrack(invalid),RangeError);
  assert.throws(()=>parseTrackJSON('x'.repeat(17000)),RangeError);
  const getter=JSON.parse(encoded);
  Object.defineProperty(getter.sections,'0',{get(){throw Error('hostile getter executed')},enumerable:true});
  assert.throws(()=>validateTrack(getter),/accessor/);
});

test('RACING-003 all 12 authored route forks change world-space geometry continuously',()=>{
  const pack=starterTrack();let history=[];
  assert.equal(FOUNDRY_TOTAL,19200);
  assert.equal(FOUNDRY_FORKS,12);
  for(let i=0;i<FOUNDRY_FORKS;i++){
    const at=foundryForkAt(i);
    assert.ok(Number.isSafeInteger(at));
    const before=foundryCenter(pack,at-.0001,history);
    const seam=foundryCenter(pack,at,history);
    assert.ok(Math.abs(before-seam)<.02);
    const left=foundryCenter(pack,at+240,[...history,'left']);
    const right=foundryCenter(pack,at+240,[...history,'right']);
    assert.ok(Math.abs(left-right)>4,'left/right must be physically divergent at fork '+i);
    history.push(i%2?'right':'left');
  }
  for(let leg=1;leg<4;leg++){
    const boundary=leg*4800;
    const before=foundryCenter(pack,boundary-.0001,history);
    const after=foundryCenter(pack,boundary+.0001,history);
    assert.ok(Math.abs(before-after)<.02,'road cannot teleport at leg seams');
    assert.ok(Math.abs(foundryWidth(pack,boundary-1)-foundryWidth(pack,boundary+1))<.08);
  }
  assert.equal(foundryLeg(12000).leg,2);
  assert.ok(Number.isFinite(foundryHeading(pack,4700,history)));
  assert.throws(()=>foundryCenter(pack,100,['bad']),TypeError);
  assert.throws(()=>foundryForkAt(12),RangeError);
});

test('RACING-003 physical road and player renderer respond to A/D steering',()=>{
  for(const mode of ['coast','sprint','supercar','wasteland']){
    const left=createRace({mode}),right=createRace({mode});
    for(let i=0;i<32;i++){
      tickRace(left,{accelerate:true,steer:-1});
      tickRace(right,{accelerate:true,steer:1});
    }
    assert.ok(left.laneQ< -Math.round(.25*Q),mode+' must turn left');
    assert.ok(right.laneQ>Math.round(.25*Q),mode+' must turn right');
    assert.ok(playerScreenX(left)<480-30,mode+' should visibly move left on Canvas');
    assert.ok(playerScreenX(right)>480+30,mode+' should visibly move right on Canvas');
    if(left.pack){
      const d=left.distanceQ/Q;
      const width=foundryWidth(left.pack,d),offset=foundryLateralMetres(left.pack,d,left.laneQ/Q);
      assert.ok(Math.abs(offset)<=width*1.5,'bounded road lateral displacement');
    }
  }
});

test('RACING-003 endurance distances and checkpoint clock accommodate full courses',()=>{
  assert.equal(finishMeters(createRace({mode:'coast'})),19200);
  assert.equal(finishMeters(createRace({mode:'sprint'})),19200);
  assert.equal(finishMeters(createRace({mode:'supercar'})),14400);
  assert.equal(finishMeters(createRace({mode:'wasteland'})),12000);
  const coast=createRace({mode:'coast'});
  assert.equal(coast.timeLeft,300*60);
  for(let i=0;i<FOUNDRY_FORKS;i++){
    coast.distanceQ=Math.round((foundryForkAt(i)-.2)*Q);
    coast.speedQ=70*Q;
    coast.laneQ=i%2?Math.round(.6*Q):-Math.round(.6*Q);
    tickRace(coast,{accelerate:true});
  }
  assert.equal(coast.route.length,FOUNDRY_FORKS);
  assert.equal(coast.checkpoints,Math.floor(foundryForkAt(11)/1200));
  assert.ok(coast.timeLeft>0);
});

test('RACING-003 validated authored pack is isolated and changes physical course',()=>{
  const custom=JSON.parse(serializeTrack(starterTrack()));
  custom.name='Long Ridge';custom.sections[0].curve=-.9;
  const race=createRace({mode:'coast',pack:custom});
  custom.sections[0].curve=1;
  assert.equal(race.pack.sections[0].curve,-.9);
  assert.ok(Object.isFrozen(race.pack.sections[0]));
  assert.notEqual(foundryCenter(race.pack,900,[]),foundryCenter(starterTrack(),900,[]));
  assert.throws(()=>createRace({mode:'wasteland',pack:custom}),RangeError);
});

test('RACING-003 drivable circuit uses validated authored gate coordinates',()=>{
  const pack=JSON.parse(serializeTrack(starterTrack()));
  pack.gates[2].x=58;
  const circuit=createCircuit(pack,10);
  pack.gates[2].x=50;
  assert.equal(circuit.track.gates[2].x,58);
  const initial=circuitSnapshot(circuit);
  for(let i=0;i<90;i++)tickCircuit(circuit,{accelerate:true,steer:0});
  const moving=circuitSnapshot(circuit);
  assert.ok(moving.kmh>0);
  assert.ok(Math.hypot(moving.x-initial.x,moving.z-initial.z)>5);
  assert.ok(Number.isSafeInteger(circuit.xQ)&&Number.isSafeInteger(circuit.zQ));
  assert.throws(()=>createCircuit(starterTrack(),21),RangeError);
});

test('RACING-003 authored WebGL player tyre extent matches its variable road half-width',()=>{
  const race=createRace({mode:'sprint'}),pack=race.pack;
  for(const d of [0,1200,4800,9600,FOUNDRY_TOTAL-20]){
    for(const lane of [-1,0,.95,1.2]){
      race.distanceQ=Math.round(d*Q);
      race.laneQ=Math.round(lane*Q);
      const vertices=sprintTrafficGeometry(race);
      const heading=foundryHeading(pack,d,race.route),center=foundryCenter(pack,d,race.route);
      const xAxis=[Math.cos(heading),Math.sin(heading)],position=foundryLateralMetres(pack,d,race.laneQ/Q);
      const coords=[];
      for(let i=0;i<10*36*6;i+=6){
        coords.push((vertices[i]-center)*xAxis[0]+(vertices[i+2]+d)*xAxis[1]);
      }
      const maximum=Math.max(...coords),minimum=Math.min(...coords);
      assert.ok(Math.abs(maximum-(position+SPRINT_TYRE_HALF_WIDTH_METRES))<1e-7,
        'authored outer tyre at '+d+'m should match the road normal');
      assert.ok(Math.abs(minimum-(position-SPRINT_TYRE_HALF_WIDTH_METRES))<1e-7);
      const halfWidth=foundryWidth(pack,d);
      assert.ok(position+SPRINT_TYRE_HALF_WIDTH_METRES<=halfWidth+1e-7||lane>1,
        'within-lane rendered tyre must not cross asphalt');
    }
  }
});

test('RACING-003 roadside signs appear for all twelve physical forks, never after the last',()=>{
  // Record the authored overlay's actual Canvas2D drawing calls, rather
  // than checking a hard-coded source string for the obsolete 3-fork guard.
  const texts=[];
  const gradient={addColorStop(){}};
  const ctx=new Proxy({}, {
    get(target,key){
      if(key in target)return target[key];
      if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;
      if(key==='fillText')return text=>texts.push(String(text));
      return()=>{};
    },
    set(target,key,value){target[key]=value;return true;}
  });
  const race=createRace({mode:'coast'});race.rivals=[];
  for(let index=0;index<=FOUNDRY_FORKS;index++){
    race.route=Array.from({length:index},(_,i)=>i%2?'right':'left');
    race.distanceQ=Math.round((index<FOUNDRY_FORKS?
      foundryForkAt(index)-300:FOUNDRY_TOTAL-50)*Q);
    texts.length=0;
    render(ctx,race);
    const count=texts.filter(text=>text.includes('LEFT')&&text.includes('RIGHT')).length;
    assert.equal(count,index<FOUNDRY_FORKS?1:0,
      'fork '+(index+1)+' must '+(index<FOUNDRY_FORKS?'have':'not have')+' a roadside sign');
  }
});

test('RACING-003 sprint Canvas fallback paints the selected physical fork centreline',()=>{
  const pack=starterTrack();
  const makeContext=()=>{
    const trace=[],gradient={addColorStop(){}};
    const ctx=new Proxy({}, {
      get(target,key){
        if(key in target)return target[key];
        if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;
        if(key==='moveTo'||key==='lineTo')return(x,y)=>trace.push([key,x,y]);
        return()=>{};
      },
      set(target,key,value){target[key]=value;return true;}
    });
    return {ctx,trace};
  };
  const first=createRace({mode:'sprint',pack}),second=createRace({mode:'sprint',pack});
  first.rivals=[];second.rivals=[];
  // At 1,250 m the chosen fork is still physically diverging; after the
  // smooth transition, a follow-camera can correctly see the same relative
  // road shape despite different absolute world-space centrelines.
  first.distanceQ=second.distanceQ=Math.round(1250*Q);
  first.route=['left'];second.route=['right'];
  const a=makeContext(),b=makeContext();
  render(a.ctx,first);render(b.ctx,second);
  assert.ok(a.trace.length>600,'fallback must draw actual road geometry');
  assert.equal(a.trace.length,b.trace.length);
  assert.notDeepEqual(a.trace,b.trace,
    'Canvas fallback must visually distinguish physically different sprint forks');
  assert.notEqual(project(250,1250,0,'coast',first.route,first.pack).x,
    project(250,1250,0,'coast',second.route,second.pack).x);
});
