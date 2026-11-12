// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRace,tickRace,replay,Q,finishMeters} from '../shared/racer/sim.js';
import {project} from '../shared/racer/renderer.js';
import {sprintSceneGeometry,sprintTrafficGeometry} from '../shared/racer/webgl.js';
import {TRACK_FORMAT,SECTION_LENGTH,TRACK_TOTAL_LENGTH,starterTrack,compileTrack,
  validateTrack,parseTrackJSON,serializeTrack,tourCenterQ,halfWidthQ,circuitPositionQ,
  roadPositionQ,lateralPositionQ,selectedTrackFromStorage,storeSelectedTrack,
  PACK_STORAGE_KEY,PLAYER_TYRE_HALF_WIDTH} from '../shared/racer/foundry.js';

const copy=obj=>JSON.parse(JSON.stringify(obj));
const starter=()=>copy(starterTrack());
test('RACING-003 exact byte-pinned VANILLAJS track schema preserves donor source',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../vendor/PROVENANCE.json',import.meta.url),'utf8'));
  const row=manifest.files.find(x=>x.local==='vendor/vanillajs/demos/racing-lab/track.js');
  assert.equal(row.repository,'QSOLKCB/VANILLAJS');
  assert.equal(row.commit,'4d55d06ac3852307e7013468fff7b195da548929');
  assert.equal(createHash('sha256').update(readFileSync(new URL(
    '../vendor/vanillajs/demos/racing-lab/track.js',import.meta.url))).digest('hex'),row.sha256);
  const pack=starterTrack();
  assert.equal(pack.format,TRACK_FORMAT);
  assert.equal(pack.sections.length,4);
  assert.equal(pack.gates.length,8);
  assert.deepEqual(parseTrackJSON(serializeTrack(pack)),pack);
});
test('RACING-003 rejects malformed, oversized, crossing and accessor track packs before racing',()=>{
  assert.throws(()=>parseTrackJSON('{'),SyntaxError);
  assert.throws(()=>parseTrackJSON('x'.repeat(17_000)),RangeError);
  const bad=starter();bad.sections=new Array(4);
  assert.throws(()=>createRace({mode:'coast',trackPack:bad}),/array|indices|hole/);
  const bad2=starter();bad2.gates[0]=bad2.gates[1];
  assert.throws(()=>createRace({mode:'supercar',trackPack:bad2}),/24/);
  assert.throws(()=>createRace({mode:'wasteland',trackPack:starter()}),RangeError);
  assert.throws(()=>createRace({mode:'sprint',trackPack:{name:'forged'}}));
});
test('RACING-003 Q16 centreline and road widths are safe integers and preserve seams',()=>{
  const pack=compileTrack(starterTrack());
  assert.equal(SECTION_LENGTH,1200);assert.equal(TRACK_TOTAL_LENGTH,4800);
  for(const route of [[],['left'],['right'],['left','left','right']])
    for(let metres=0;metres<=4800;metres+=20){
      const d=metres*Q,centre=tourCenterQ(pack,d,route),half=halfWidthQ(pack,d);
      assert.ok(Number.isSafeInteger(centre)&&Number.isSafeInteger(half));
      assert.ok(half>=8*Q&&half<=16*Q);
      assert.ok(Number.isSafeInteger(lateralPositionQ(pack,d,Q)));
    }
  for(const junction of [1200,2400,3600]){
    const a=tourCenterQ(pack,junction*Q-1,['right','left','right']);
    const b=tourCenterQ(pack,junction*Q,['right','left','right']);
    assert.ok(Math.abs(a-b)<=Q,'authored road seam must not teleport');
  }
});
test('RACING-003 every touring branch choice changes physically different road positions',()=>{
  const pack=compileTrack(starterTrack());
  for(let bits=0;bits<8;bits++){
    const route=[0,1,2].map(i=>(bits>>i)&1?'right':'left');
    for(let stage=1;stage<=3;stage++){
      const prefix=route.slice(0,stage-1),distance=(stage*SECTION_LENGTH+300)*Q;
      const left=tourCenterQ(pack,distance,[...prefix,'left']);
      const right=tourCenterQ(pack,distance,[...prefix,'right']);
      assert.notEqual(left,right,'fork must change actual centreline in Q16');
    }
  }
});
test('RACING-003 inherited arcade races remain unchanged when no pack is selected',()=>{
  for(const mode of ['coast','sprint','supercar','wasteland']){
    const base=createRace({mode,seed:2026});
    assert.equal(base.trackPack,null);assert.equal(base.foundry,null);
    assert.equal(base.worldXQ,0);
    assert.equal(base.courseQ,({coast:5200,sprint:3600,supercar:2200,wasteland:2500})[mode]*Q);
  }
});
test('RACING-003 authentic source pack is copied into game state and can be replayed deterministically',()=>{
  for(const mode of ['coast','sprint','supercar']){
    const authored=starter(),s=createRace({mode,trackPack:authored});
    authored.sections[0].curve=-1;
    assert.notEqual(s.trackPack.sections[0].curve,-1,'caller mutation cannot alter admitted pack');
    assert.equal(s.trackPack.name,'The Long Way Home');
    const tape=Array.from({length:240},(_,i)=>({accelerate:true,steer:i%95<40?.7:-.6,boost:i%9===0}));
    const a=replay(tape,{mode,trackPack:s.trackPack,seed:999});
    const b=replay(tape,{mode,trackPack:s.trackPack,seed:999});
    assert.deepEqual(a,b);
    assert.ok(Number.isSafeInteger(a.worldXQ)&&Number.isSafeInteger(a.worldZQ));
  }
});
test('RACING-003 Coast Run applies all three source-authored forks and checkpoint timing',()=>{
  for(let mask=0;mask<8;mask++){
    const s=createRace({mode:'coast',trackPack:starter()});
    assert.equal(finishMeters(s),4800);
    const route=[0,1,2].map(i=>(mask>>i)&1?'right':'left');
    for(let stage=1;stage<=3;stage++){
      s.distanceQ=(stage*SECTION_LENGTH*Q)-Math.trunc(.5*Q);
      s.speedQ=80*Q;s.laneQ=route[stage-1]==='left'?-Math.trunc(.5*Q):Math.trunc(.5*Q);
      tickRace(s,{accelerate:true});
      assert.deepEqual(s.route,route.slice(0,stage));
      assert.equal(s.checkpoints,stage);
      assert.ok(Number.isSafeInteger(s.worldXQ));
    }
    assert.equal(s.timeLeft,90*60+3*20*60-3);
  }
});
test('RACING-003 4.8 km 3D sprint retains strict on-road finish and origin geometry',()=>{
  const pack=starter(),s=createRace({mode:'sprint',trackPack:pack});
  assert.equal(finishMeters(s),4800);
  s.distanceQ=4799*Q;s.speedQ=90*Q;s.laneQ=Q;
  tickRace(s,{accelerate:true});
  assert.equal(s.status,'running');
  assert.equal(s.distanceQ,4790*Q,'missed gate forces renewed approach');
  s.laneQ=0;s.laneVQ=0;s.speedQ=90*Q;
  for(let i=0;i<30&&s.status==='running';i++)tickRace(s,{accelerate:true});
  assert.equal(s.status,'won');
  const built=sprintSceneGeometry(),authored=sprintSceneGeometry(s.foundry);
  assert.ok(authored.length>built.length,'source-authored 4.8 km course extends the old 3.6 km path');
  assert.ok(authored.every(Number.isFinite));
  const moving=sprintTrafficGeometry(createRace({mode:'sprint',trackPack:pack}));
  assert.ok(moving.length>0&&moving.every(Number.isFinite));
  assert.notDeepEqual(authored,built);
});
test('RACING-003 editable circuit gates define perimeter, positions and ordered progression',()=>{
  const altered=starter();altered.gates[2].x=56;
  const c=compileTrack(altered);
  assert.ok(c.circuitLengthQ>24*8*Q);
  for(let i=0;i<8;i++){
    const pos=circuitPositionQ(c,c.lengthsQ[i]);
    assert.ok(Math.abs(pos.xQ-c.gates[i].xQ)<=1);
    assert.ok(Math.abs(pos.zQ-c.gates[i].zQ)<=1);
  }
  const a=createRace({mode:'supercar',trackPack:altered}),b=createRace({mode:'supercar'});
  assert.notEqual(finishMeters(a),finishMeters(b),'authored gate layout controls lap length');
  a.distanceQ=c.lengthsQ[1]-Math.trunc(.1*Q);a.speedQ=90*Q;
  tickRace(a,{accelerate:true});
  assert.equal(a.circuitGates,1,'actual first authored checkpoint must be crossed');
  assert.ok(Number.isSafeInteger(a.worldXQ)&&Number.isSafeInteger(a.worldZQ));
  const view1=project(300,50,0,'alpine',[],a.foundry,'supercar');
  const view2=project(300,50,0,'alpine');
  assert.notEqual(view1.x,view2.x,'authored gate geometry must alter the road view');
});
test('RACING-003 storage requires explicit apply and validates mode/pack on every read',()=>{
  const rows=new Map(),storage={
    getItem:key=>rows.get(key)??null,setItem:(k,v)=>rows.set(k,v),
    removeItem:key=>rows.delete(key)};
  assert.equal(selectedTrackFromStorage(storage,'coast'),null);
  storeSelectedTrack(storage,'coast',starterTrack());
  assert.equal(selectedTrackFromStorage(storage,'coast').name,'The Long Way Home');
  assert.equal(selectedTrackFromStorage(storage,'sprint'),null);
  assert.deepEqual(Object.keys(JSON.parse(rows.get(PACK_STORAGE_KEY))).sort(),['mode','track']);
  rows.set(PACK_STORAGE_KEY,'{');assert.equal(selectedTrackFromStorage(storage,'coast'),null);
  rows.set(PACK_STORAGE_KEY,JSON.stringify({mode:'coast',track:{bad:1}}));
  assert.equal(selectedTrackFromStorage(storage,'coast'),null);
  assert.throws(()=>storeSelectedTrack(storage,'wasteland',starterTrack()),RangeError);
});
test('RACING-003 editor and offline deep links preserve the root legacy career',()=>{
  const file=readFileSync(new URL('../games/track-foundry/index.html',import.meta.url),'utf8');
  for(const id of ['track-name','environment','target-mode','course-preview','section-editor',
    'gate-editor','import-track','export-track','apply-track','clear-track'])
    assert.match(file,new RegExp('id="'+id+'"'));
  assert.match(file,/<script type="module" src="\.\.\/\.\.\/shared\/racer\/foundry-editor\.js">/);
  const app=readFileSync(new URL('../shared/racer/app.js',import.meta.url),'utf8');
  assert.match(app,/selectedTrackFromStorage/);
});
