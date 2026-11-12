// SPDX-License-Identifier: Apache-2.0
// Integer Q16.16 race core. Fixed 60 Hz steps; no DOM, wall clock, or randomness in tick().
import {seededRandom} from '../../vendor/vanillajs/modules/math/index.js';
import {modeSettings} from './config.js';
export const Q=65536, HZ=60;
export const q=n=>Math.round(n*Q);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const isInt=n=>Number.isSafeInteger(n);
function boundedSeed(seed){if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('seed must be uint32');return seed}
export function createRace({mode='supercar',track,car,seed=2026}={}){
  const setup=modeSettings(mode,track,car),random=seededRandom(boundedSeed(seed));
  const m=setup.mode, rivals=Array.from({length:m.rivals},(_,i)=>({
    id:i+1,distanceQ:q(110+i*110),laneQ:q((random()-.5)*1.45),
    speedQ:q(47+random()*27),color:['#f4a659','#75dbdc','#d583cf','#eee09a','#82cb76','#fb7778','#dbd8df'][i],
    integrity:2,wrecked:false
  }));
  return {mode:m.id,track:setup.track.id,car:setup.car.id,seed,status:'running',ticks:0,
    distanceQ:0,speedQ:0,laneQ:0,laneVQ:0,health:100,boost:600,
    nitro:0,ammo:m.combat?12:0,shots:0,knockouts:0,collisionCooldown:0,shotCooldown:0,
    checkpoints:0,timeLeft:m.kind==='checkpoint'?90*HZ:null,lap:1,position:m.rivals+1,
    score:0,rivals,lastEvent:''};
}
export const distanceMeters=s=>s.distanceQ/Q;
export const speedKph=s=>Math.round(s.speedQ/Q*3.6);
export const finishMeters=s=>{const m=modeSettings(s.mode).mode;return m.courseMeters*m.laps};
export function curvature(meters,track='alpine'){
  const t=modeSettings('supercar',track).track;
  return t.curve*(Math.sin(meters/230)*.52+Math.sin(meters/580+1.7)*.3+Math.sin(meters/96)*.12);
}
export function altitude(meters,track='alpine'){
  const t=modeSettings('supercar',track).track;
  return t.hills*(Math.sin(meters/190)*.6+Math.cos(meters/490)*.4);
}
export function tickRace(s,input={}){
  if(s.status!=='running')return s;
  const steer=clamp(Number(input.steer)||0,-1,1),go=Boolean(input.accelerate),
    brake=Boolean(input.brake),useBoost=Boolean(input.boost)&&s.boost>0&&go,
    setup=modeSettings(s.mode,s.track,s.car),car=setup.car,mode=setup.mode;
  s.lastEvent='';s.ticks++;
  if(s.collisionCooldown>0)s.collisionCooldown--;
  if(s.shotCooldown>0)s.shotCooldown--;
  const offroad=Math.abs(s.laneQ)>q(1);
  const acceleration=(go?car.acceleration:-8)-(brake?39:0)-(offroad?30:0)+(useBoost?29:0);
  s.speedQ=clamp(s.speedQ+Math.trunc(acceleration*Q/HZ),0,q(offroad?52:car.speed));
  if(useBoost)s.boost--; else if(s.boost<600&&s.ticks%3===0)s.boost++;
  const steeringForce=Math.round(steer*(180+s.speedQ/Q*1.7)*car.handling);
  s.laneVQ=Math.trunc(s.laneVQ*84/100)+steeringForce;
  s.laneQ=clamp(s.laneQ+s.laneVQ,-q(1.4),q(1.4));
  if(Math.abs(s.laneQ)>=q(1.4))s.laneVQ=0;
  if(offroad&&s.ticks%40===0)s.health=Math.max(0,s.health-1);
  const previousQ=s.distanceQ;
  s.distanceQ+=Math.trunc(s.speedQ/HZ);
  // OPT-REDUCE-001: only near cars enter the collision/weapon narrow phase.
  const near=q(mode.combat?145:8);
  for(const rival of s.rivals){
    if(rival.wrecked)continue;
    rival.distanceQ+=Math.trunc(rival.speedQ/HZ);
    const delta=rival.distanceQ-s.distanceQ;
    if(delta< -q(8)||delta>near)continue;
    const laneDelta=Math.abs(rival.laneQ-s.laneQ);
    if(Math.abs(delta)<q(5)&&laneDelta<q(.27)&&s.collisionCooldown===0){
      s.collisionCooldown=85;s.health=Math.max(0,s.health-15);
      s.speedQ=Math.trunc(s.speedQ*57/100);s.lastEvent='IMPACT';
    }
  }
  if(mode.combat&&input.fire&&s.ammo>0&&s.shotCooldown===0){
    s.ammo--;s.shots++;s.shotCooldown=18;
    let chosen=null,nearest=q(145)+1;
    for(const r of s.rivals){
      const ahead=r.distanceQ-s.distanceQ;
      if(!r.wrecked&&ahead>=0&&ahead<nearest&&Math.abs(r.laneQ-s.laneQ)<q(.33)){
        chosen=r;nearest=ahead;
      }
    }
    if(chosen){
      chosen.integrity--;
      s.score+=100;s.lastEvent='HIT +100';
      if(chosen.integrity===0){chosen.wrecked=true;s.knockouts++;s.score+=500;s.lastEvent='TAKEDOWN +600';}
    }else{s.lastEvent='SHOT MISSED';}
  }
  if(mode.combat&&s.ticks%540===0)s.ammo=Math.min(12,s.ammo+2);
  if(mode.kind==='checkpoint'){
    const segment=q(mode.courseMeters/4);
    const crossed=Math.min(3,Math.floor(s.distanceQ/segment));
    if(crossed>s.checkpoints){s.checkpoints=crossed;s.timeLeft+=20*HZ;s.score+=250;s.lastEvent='CHECKPOINT +20s';}
    s.timeLeft--;
  }
  s.lap=Math.min(mode.laps,1+Math.floor(s.distanceQ/q(mode.courseMeters)));
  s.position=1+s.rivals.filter(r=>!r.wrecked&&r.distanceQ>s.distanceQ).length;
  if(s.health<=0){s.status='lost';s.lastEvent='CAR DESTROYED';}
  else if(s.distanceQ>=q(mode.courseMeters*mode.laps)){
    s.status='won';s.score+=Math.max(0,10000-Math.trunc(s.ticks/2))+s.knockouts*300;s.lastEvent='FINISH';
  }else if(s.timeLeft!==null&&s.timeLeft<=0){s.status='lost';s.lastEvent='TIME EXPIRED';}
  if(![s.distanceQ,s.speedQ,s.laneQ,s.laneVQ,...s.rivals.flatMap(r=>[r.distanceQ,r.speedQ,r.laneQ])].every(isInt)){
    throw new RangeError('Q16 integer domain exceeded');
  }
  return s;
}
export function replay(inputs,options={}){
  const race=createRace(options);
  for(const input of inputs){if(race.status!=='running')break;tickRace(race,input)}
  return race;
}
