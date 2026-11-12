// SPDX-License-Identifier: Apache-2.0
// Integer Q16.16 race core. Fixed 60 Hz steps; no DOM, wall clock, or randomness in tick().
import {seededRandom} from '../../vendor/vanillajs/modules/math/index.js';
import {modeSettings} from './config.js';
import {TOUR_STAGE_METERS,TOUR_STAGES,sweptLongitudinalContact,
  SPRINT_OFFROAD_LANE,SPRINT_FINISH_LANE} from './course.js';
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
    score:0,rivals,lastEvent:'',events:[],route:[]};
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
  // Every fixed tick exposes an ordered, bounded event batch.
  // lastEvent remains for callers that only need the most recent event.
  s.lastEvent='';s.events=[];s.ticks++;
  const emit=message=>{s.lastEvent=message;s.events.push(message);};
  if(s.collisionCooldown>0)s.collisionCooldown--;
  if(s.shotCooldown>0)s.shotCooldown--;
  const offroad=Math.abs(s.laneQ)>q(mode.kind==='sprint'?SPRINT_OFFROAD_LANE:1);
  const acceleration=(go?car.acceleration:-8)-(brake?39:0)-(offroad?30:0)+(useBoost?29:0);
  // RACING-002 nitro: speed exceeds the normal cap while burning fuel.
  // On release it bleeds off across ticks instead of snapping downward.
  const cap=offroad?q(52):useBoost?q(car.speed*1.32):
    Math.max(q(car.speed),s.speedQ-Math.trunc(30*Q/HZ));
  s.speedQ=clamp(s.speedQ+Math.trunc(acceleration*Q/HZ),0,cap);
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
    const rivalBefore=rival.distanceQ;
    rival.distanceQ+=Math.trunc(rival.speedQ/HZ);
    // Deterministic opponents change lanes and defend the apex. There are
    // no ambient random draws or per-frame dependent AI decisions.
    const delta=rival.distanceQ-s.distanceQ;
    const target=mode.combat&&delta>0&&delta<q(100) ? clamp(s.laneQ,-q(.82),q(.82)):
      q(((Math.floor(s.ticks/240)+rival.id+s.seed)%3-1)*.58);
    const laneStep=q(mode.combat?.006:.003);
    rival.laneQ+=clamp(target-rival.laneQ,-laneStep,laneStep);
    const beforeDelta=rivalBefore-previousQ;
    // OPT-REDUCE-001 narrow phase: admit any vehicle whose swept relative
    // position might cross the local window, even if the endpoint is far away.
    if(Math.max(beforeDelta,delta)<-q(8)||Math.min(beforeDelta,delta)>near)continue;
    if(Math.abs(rival.laneQ-s.laneQ)<q(.27)&&s.collisionCooldown===0&&
        sweptLongitudinalContact(previousQ,s.distanceQ,rivalBefore,rival.distanceQ,q(5))){
      s.collisionCooldown=85;s.health=Math.max(0,s.health-15);
      s.speedQ=Math.trunc(s.speedQ*57/100);emit('IMPACT');
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
      s.score+=100;emit('HIT +100');
      if(chosen.integrity===0){chosen.wrecked=true;s.knockouts++;s.score+=500;emit('TAKEDOWN +600');}
    }else{emit('SHOT MISSED');}
  }
  if(mode.combat&&s.ticks%540===0)s.ammo=Math.min(12,s.ammo+2);
  if(mode.kind==='checkpoint'){
    const segment=q(TOUR_STAGE_METERS);
    const crossed=Math.min(TOUR_STAGES-1,Math.floor(s.distanceQ/segment));
    while(s.route.length<crossed){
      const choice=s.laneQ<0?'left':'right';
      s.route.push(choice);
      emit('FORK '+choice.toUpperCase()+' · STAGE '+(s.route.length+1));
      s.score+=150;
    }
    if(crossed>s.checkpoints){
      // Each stage checkpoint grants one extension, even if a frame skips
      // more than one threshold during catch-up.
      const earned=crossed-s.checkpoints;
      s.checkpoints=crossed;s.timeLeft+=earned*20*HZ;
      s.score+=earned*250;emit('CHECKPOINT +'+(20*earned)+'s');
    }
    s.timeLeft--;
  }else if(mode.kind==='sprint'){
    const crossed=Math.min(3,Math.floor(s.distanceQ/q(900)));
    if(crossed>s.checkpoints){
      const earned=crossed-s.checkpoints;s.checkpoints=crossed;
      s.score+=earned*300;emit('SCENIC GATE '+crossed+' / 4');
    }
  }
  s.lap=Math.min(mode.laps,1+Math.floor(s.distanceQ/q(mode.courseMeters)));
  s.position=1+s.rivals.filter(r=>!r.wrecked&&r.distanceQ>s.distanceQ).length;
  if(s.health<=0){s.status='lost';emit('CAR DESTROYED');}
  else if(s.distanceQ>=q(mode.courseMeters*mode.laps)){
    if(mode.kind==='sprint'&&Math.abs(s.laneQ)>q(SPRINT_FINISH_LANE)){
      // No off-road finish. Preserve an approach to the line so the player
      // can re-enter the road and make a new valid forward crossing.
      s.distanceQ=q(mode.courseMeters-10);
      s.speedQ=Math.trunc(s.speedQ*65/100);
      emit('FINISH GATE MISSED · RETURN TO ROAD');
    }else{
      s.status='won';s.score+=Math.max(0,10000-Math.trunc(s.ticks/2))+s.knockouts*300;emit('FINISH');
    }
  }else if(s.timeLeft!==null&&s.timeLeft<=0){s.status='lost';emit('TIME EXPIRED');}
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
