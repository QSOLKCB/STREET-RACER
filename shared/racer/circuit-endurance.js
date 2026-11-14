// SPDX-License-Identifier: Apache-2.0
// RACING-003 authored circuit: eight validated VANILLAJS track-pack gates,
// with a fixed 60 Hz Q16.16 driving state and finite bounded visual sampling.
// Sin/cos are rounded at the tick boundary: same-runtime deterministic,
// not a mathematical claim of cross-platform exact trigonometry.
import {validateTrack,starterTrack} from './foundry-endurance.js';
export const Q=65536,CIRCUIT_HZ=60,DEFAULT_LAPS=10;
const q=v=>Math.round(v*Q);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function distanceToSegment(x,z,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,mag=dx*dx+dz*dz;
  const f=mag?clamp(((x-a.x)*dx+(z-a.z)*dz)/mag,0,1):0;
  return Math.hypot(x-(a.x+f*dx),z-(a.z+f*dz));
}
export function createCircuit(pack=starterTrack(),laps=DEFAULT_LAPS){
  const track=validateTrack(pack);
  if(!Number.isSafeInteger(laps)||laps<1||laps>20)throw new RangeError('laps must be 1–20');
  const a=track.gates[0],b=track.gates[1];
  return {track,laps,gateIndex:1,lap:0,xQ:q(a.x),zQ:q(a.z),
    speedQ:0,yawQ:q(Math.atan2(b.x-a.x,-(b.z-a.z))),
    ticks:0,status:'running',damage:0,offroad:false,
    lastEvent:'READY',events:[]};
}
export function tickCircuit(s,input={}){
  if(s.status!=='running')return s;
  const steer=clamp(Number(input.steer)||0,-1,1);
  const throttle=Boolean(input.accelerate),brake=Boolean(input.brake);
  const speed=s.speedQ/Q,steering=1.85*Math.min(1,Math.abs(speed)/12);
  s.yawQ+=q(steer*steering/CIRCUIT_HZ);
  s.speedQ=clamp(s.speedQ+Math.trunc(q((throttle?21:-7)-(brake?38:0))/CIRCUIT_HZ),0,q(52));
  const yaw=s.yawQ/Q;
  s.xQ+=Math.trunc(Math.sin(yaw)*s.speedQ/CIRCUIT_HZ);
  s.zQ-=Math.trunc(Math.cos(yaw)*s.speedQ/CIRCUIT_HZ);
  s.ticks++;s.events=[];s.lastEvent='';
  const x=s.xQ/Q,z=s.zQ/Q,gates=s.track.gates;
  const nearest=Math.min(...gates.map((g,i)=>
    distanceToSegment(x,z,g,gates[(i+1)%gates.length])));
  s.offroad=nearest>s.track.sections[0].width;
  if(s.offroad){
    s.speedQ=Math.trunc(s.speedQ*0.985);
    if(s.ticks%60===0){s.damage=Math.min(100,s.damage+2);
      s.events.push('OFF ROAD');s.lastEvent='OFF ROAD';}
  }
  const goal=gates[s.gateIndex];
  if(Math.hypot(x-goal.x,z-goal.z)<12){
    const crossed=s.gateIndex;s.gateIndex=(s.gateIndex+1)%gates.length;
    s.events.push('GATE '+(crossed+1));s.lastEvent='GATE '+(crossed+1);
    if(s.gateIndex===1){s.lap++;s.events.push('LAP '+s.lap);s.lastEvent='LAP '+s.lap;}
    if(s.lap>=s.laps){s.status='won';s.lastEvent='CIRCUIT COMPLETE';s.events.push(s.lastEvent);}
  }
  if(s.damage>=100){s.status='lost';s.lastEvent='CAR DAMAGED';s.events.push(s.lastEvent);}
  if(s.ticks>=CIRCUIT_HZ*900){s.status='lost';s.lastEvent='TIME EXPIRED';s.events.push(s.lastEvent);}
  for(const n of [s.xQ,s.zQ,s.yawQ,s.speedQ]){
    if(!Number.isSafeInteger(n))throw new RangeError('circuit Q16.16 exceeded safe integer domain');
  }
  return s;
}
export function circuitSnapshot(s){
  return Object.freeze({x:s.xQ/Q,z:s.zQ/Q,yaw:s.yawQ/Q,
    kmh:Math.round(s.speedQ/Q*3.6),lap:s.lap,gate:s.gateIndex,status:s.status});
}
