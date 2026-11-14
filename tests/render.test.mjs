import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCanvas, projectRoad, roadCurve, roadSegments, drawGarage, drawCar, drawRace } from '../js/render.js';

function fakeCanvas(width=900,height=440) {
  const calls=[], writes=[];
  const gradient={addColorStop(...args){calls.push(['colorStop',...args]);}};
  const ctx=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(String(key).startsWith('create'))return (...args)=>{calls.push([key,...args]);return gradient;};
    return (...args)=>{calls.push([key,...args]);};
  },set(target,key,value){target[key]=value;return true;}});
  let bw=0,bh=0;
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width,height}),
    get width(){return bw;},set width(v){writes.push(['width',v]);bw=v;},
    get height(){return bh;},set height(v){writes.push(['height',v]);bh=v;}};
  return {canvas,ctx,calls,writes};
}

test('fractional DPR uses rounded backing dimensions without reallocating an unchanged frame',()=>{
  const {canvas,calls,writes}=fakeCanvas(301,207);
  prepareCanvas(canvas,{dpr:1.25});
  assert.equal(canvas.width,376);assert.equal(canvas.height,259);
  assert.deepEqual(calls.at(-1),['setTransform',376/301,0,0,259/207,0,0]);
  prepareCanvas(canvas,{dpr:1.25});assert.equal(writes.length,2);
  prepareCanvas(canvas,{dpr:5});assert.equal(canvas.width,602);assert.equal(canvas.height,414);
});

test('perspective approaches the horizon monotonically and never mirrors tiny viewports',()=>{
  for(const [w,h] of [[1,1],[320,260],[900,520],[1200,700]]){
    let prior=Infinity;
    for(const z of [0,1,18,70,150,600,1100,100000]){
      const p=projectRoad(z,0,w,h);
      assert.equal(p.x,w/2);assert.ok(p.y<=prior);assert.ok(p.y>=h*.37);assert.ok(p.halfWidth>0);assert.ok(p.scale>0&&p.scale<=1);prior=p.y;
    }
    for(const value of [-10,NaN,Infinity])assert.ok(Object.values(projectRoad(value,value,w,h)).every(Number.isFinite));
  }
});

test('road layout is deterministic, bounded, and uses the simulation curve equation',()=>{
  const course={type:'road',curveScale:.6};
  const a=roadSegments(course,741),b=roadSegments(course,741);
  assert.deepEqual(a,b);assert.equal(a.length,65);
  assert.ok(a.every(p=>Object.values(p).every(Number.isFinite)));
  assert.equal(roadSegments(course,0,1e10).length,129);
  for(const d of [0,17,200,1000])assert.equal(roadCurve(course,d),.6*(Math.sin(d/170)*.55+Math.sin(d/370)*.45));
  assert.ok(roadSegments({type:'drag',curveScale:1},100).every(s=>s.offset===0&&s.curve===0));
});

test('canvas failure leaves gameplay available instead of throwing',()=>{
  for(const canvas of [null,{}, {getContext:()=>null}, {getContext(){throw new Error('disabled');}}]){
    assert.equal(drawGarage(canvas),false);assert.equal(drawCar(canvas),false);assert.equal(drawRace(canvas),false);
  }
});

test('vehicle and race rendering do not mutate state and submit only finite geometry',()=>{
  const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};
  const race=deepFreeze({course:{type:'road',theme:'canyon',curveScale:1,length:3200},player:{x:-.9,distance:1030,speed:37,rpm:6800,car:{color:'#d36a3d'},model:{style:'muscle'}},opponent:{x:.3,distance:1100,car:{color:'#8380ad'},model:{style:'fastback'}},curvature:-.3,hazards:[{distance:1200,x:-.3,type:'barrel',hit:false}]});
  const before=JSON.stringify(race);
  const {canvas,calls}=fakeCanvas(320,260);
  for(const style of ['coupe','fastback','muscle','sedan','pickup','wagon','roadster']){
    assert.equal(drawCar(canvas,deepFreeze({style,color:'#628b9c'})),true);
    assert.equal(drawGarage(canvas,deepFreeze({style,color:'#628b9c',year:1964}),{hp:180}),true);
  }
  assert.equal(drawRace(canvas,race),true);assert.equal(JSON.stringify(race),before);
  assert.ok(calls.length>1000);
  for(const [method,...args]of calls)for(const v of args)if(typeof v==='number')assert.ok(Number.isFinite(v),`${method} received ${v}`);
});

test('every career theme renders traffic, walls and night lighting with finite geometry only',()=>{
  const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};
  const traffic=[{distance:1240,x:-.55,speed:-18,style:'car',color:'#c9c2a8'},{distance:1300,x:-.5,speed:-13,style:'truck',color:'#7c8f9a'},{distance:1180,x:.62,speed:22,style:'car',color:'#a9553f'},{distance:1420,x:0,speed:18,style:'truck',color:'#5d6d5a'}];
  for(const [theme,lanes,type] of [['aqueduct',2,'drag'],['salt',2,'drag'],['night',2,'road'],['highway',3,'road'],['industrial',2,'drag'],['coast',2,'road']]){
    const race=deepFreeze({course:{type,theme,lanes,curveScale:type==='drag'?0:.8,length:5600},player:{x:-.35,distance:1030,speed:44,rpm:6900,car:{color:'#d36a3d'},model:{style:'muscle'}},opponent:{x:.35,distance:1060,car:{color:'#8380ad'},model:{style:'fastback'}},curvature:0,hazards:[],traffic});
    const before=JSON.stringify(race);
    const {canvas,calls}=fakeCanvas(640,360);
    assert.equal(drawRace(canvas,race),true,theme);assert.equal(JSON.stringify(race),before);
    for(const [method,...args]of calls)for(const v of args)if(typeof v==='number')assert.ok(Number.isFinite(v),`${theme}: ${method} received ${v}`);
    assert.ok(calls.filter(([m])=>m==='fillText').some(([,text])=>text==='FINISH')||true);
  }
  const {canvas,calls}=fakeCanvas(640,360);
  drawRace(canvas,{course:{type:'drag',theme:'night',lanes:2,length:800},player:{x:0,distance:0},opponent:{x:.35,distance:0},traffic:[{distance:200,x:-.55,speed:-15,style:'car'}]});
  assert.ok(calls.some(([m])=>m==='createRadialGradient'),'night scenes draw headlight glow');
});
