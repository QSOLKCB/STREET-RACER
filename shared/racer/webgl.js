// SPDX-License-Identifier: Apache-2.0
// Original Coastal Sprint 3D: winding road, chase camera, traffic and scenery.
// Geometry + camera follow the same analytic centreline as the simulation view.
// Uses STREET-RACER's SHA-256-pinned VANILLAJS WebGL renderer; no remote shader.
import {Renderer,boxVertices} from '../../vendor/vanillajs/modules/render-webgl/index.js';
import {quatMultiply} from '../../vendor/vanillajs/modules/math/index.js';
import {Q} from './sim.js';
import {sprintCenter,sprintHeading,SPRINT_METERS,SPRINT_ROAD_HALF_WIDTH_METRES,
  sprintLateralMetres} from './course.js';

const COLORS=Object.freeze({
  asphalt:[.13,.17,.23],asphaltAlt:[.16,.20,.25],
  centre:[.98,.91,.62],edge:[.81,.89,.93],pink:[.99,.26,.48],cyan:[.19,.88,.91],
  sand:[.35,.28,.28],green:[.10,.32,.27],ridge:[.23,.27,.39],
  tree:[.14,.40,.30],leaf:[.17,.57,.37],rock:[.48,.36,.32],dark:[.035,.045,.067],
  glass:[.18,.29,.40],lamp:[1,.88,.60],
});

function box(out,x,y,z,sx,sy,sz,color){boxVertices([x,y,z],[sx,sy,sz],color,out);}
function oriented(out,x,y,z,sx,sy,sz,color,yaw=0){
  // Keep transform order aligned with VANILLAJS's source-owned RACING-002
  // geometry: the +X road edge rotates with the analytic centreline heading.
  const vertices=boxVertices([0,0,0],[sx,sy,sz],color);
  const c=Math.cos(yaw),sn=Math.sin(yaw);
  for(let i=0;i<vertices.length;i+=6)
    out.push(x+vertices[i]*c-vertices[i+2]*sn,y+vertices[i+1],
      z+vertices[i]*sn+vertices[i+2]*c,vertices[i+3],vertices[i+4],vertices[i+5]);
}
function roadside(out,cx,z,yaw,side,stage,index){
  const c=Math.cos(yaw),sn=Math.sin(yaw),x=cx+c*side*32,z0=z+sn*side*32;
  const hues=stage===0?[COLORS.tree,COLORS.leaf]:stage===1?[COLORS.rock,COLORS.sand]:
    stage===2?[COLORS.ridge,COLORS.sand]:[COLORS.cyan,COLORS.green];
  if(stage===0){
    box(out,x,4.0,z0,1.0,8.0,1.0,COLORS.tree);
    oriented(out,x,8.7,z0,8.5,2.1,8.5,hues[1],yaw);
    oriented(out,x,11.1,z0,6.3,1.7,6.3,hues[0],yaw);
  }else if(stage===1){
    box(out,x,5.5,z0,6,11,7,hues[index%2]);
    box(out,x+side*4,10.5,z0-2,4,5,4,COLORS.rock);
  }else if(stage===2){
    box(out,x,4,z0,4,8,4,COLORS.ridge);
    oriented(out,x,8.7,z0,3.3,3.5,3.3,hues[index%2],yaw);
  }else{
    box(out,x,3.8,z0,.9,7.6,.9,COLORS.tree);
    oriented(out,x+side*2.1,8.6,z0-1.2,9,1.1,6.5,COLORS.leaf,yaw+.3*side);
  }
}

export function sprintSceneGeometry(){
  const out=[];
  // Fixed-size, bounded source-generated mesh: create once on load, then
  // only update the moving car mesh each frame (OPT invariant reuse).
  for(let m=0;m<SPRINT_METERS;m+=20){
    const at=m+10,x=sprintCenter(at),z=-at,yaw=sprintHeading(at);
    const stage=Math.min(3,Math.floor(at/900));
    const ground=stage===0?COLORS.green:stage===1?COLORS.sand:stage===2?COLORS.ridge:COLORS.green;
    oriented(out,x,-.78,z,185,.30,20,ground,yaw);
    oriented(out,x,-.08,z,2*SPRINT_ROAD_HALF_WIDTH_METRES,.26,20.25,m%40===0?COLORS.asphalt:COLORS.asphaltAlt,yaw);
    for(const side of [-1,1]){
      const edge=side*(SPRINT_ROAD_HALF_WIDTH_METRES-.3);
      oriented(out,x+Math.cos(yaw)*edge,.072,z+Math.sin(yaw)*edge,.32,.05,20,
        m%80===0?COLORS.edge:side<0?COLORS.cyan:COLORS.pink,yaw);
      const shoulder=side*(SPRINT_ROAD_HALF_WIDTH_METRES+1);
      oriented(out,x+Math.cos(yaw)*shoulder,-.16,z+Math.sin(yaw)*shoulder,2.2,.1,20,ground,yaw);
    }
    if(m%60===0){
      oriented(out,x,.09,z,.2,.035,11,COLORS.centre,yaw);
      for(const side of [-1,1]){
        oriented(out,x+Math.cos(yaw)*side*5.6,.078,z+Math.sin(yaw)*side*5.6,.11,.028,11,
          COLORS.edge,yaw);
      }
    }
    if(m%100===0){
      roadside(out,x,z,yaw,-1,stage,m/100);
      roadside(out,x,z,yaw,1,stage,m/100);
    }
  }
  for(let m=900;m<=SPRINT_METERS;m+=900){
    const x=sprintCenter(m),z=-m,yaw=sprintHeading(m);
    for(const side of [-1,1]){
      const px=x+Math.cos(yaw)*side*(SPRINT_ROAD_HALF_WIDTH_METRES+1),
        pz=z+Math.sin(yaw)*side*(SPRINT_ROAD_HALF_WIDTH_METRES+1);
      oriented(out,px,4.2,pz,.85,8.4,.85,side===1?COLORS.pink:COLORS.cyan,yaw);
    }
    oriented(out,x,8.5,z,30,1,.8,m===SPRINT_METERS?COLORS.lamp:COLORS.cyan,yaw);
    oriented(out,x,.015,z,2*SPRINT_ROAD_HALF_WIDTH_METRES,.055,1.5,m===SPRINT_METERS?COLORS.lamp:COLORS.edge,yaw);
  }
  return out;
}

function hexRgb(hex){
  return [1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)/255);
}
function addCar(out,s,lane,d,color,player=false){
  const heading=sprintHeading(d),cx=sprintCenter(d),c=Math.cos(heading),sn=Math.sin(heading);
  const lateral=sprintLateralMetres(lane);
  const x=cx+c*lateral,z=-d+sn*lateral;
  const metal=hexRgb(color);
  // Every body-part offset must rotate into the car's local forward axis;
  // shifting only world Z pushed headlights/spoilers sideways on a curve.
  const part=(forward,y,sx,sy,sz,tint)=>
    oriented(out,x-forward*sn,y,z+forward*c,sx,sy,sz,tint,heading);
  part(0,.69,2.65,.70,4.75,metal);
  part(.25,1.28,2.12,.62,2.4,COLORS.glass);
  part(-1.76,1.16,2.58,.20,.33,COLORS.dark);
  part(2.28,1.05,2.6,.18,.22,COLORS.lamp);
  for(const side of [-1,1])for(const front of [-1.48,1.48]){
    const lx=side*1.25,lz=front;
    oriented(out,x+lx*c-lz*sn,.34,z+lx*sn+lz*c,.64,.68,.98,COLORS.dark,heading);
  }
  if(player){
    part(2.4,.9,2,.18,.16,COLORS.pink);
    part(-1.72,1.25,2.85,.10,.68,COLORS.cyan);
  }
}

export function sprintTrafficGeometry(s){
  const out=[],d=s.distanceQ/Q;
  addCar(out,s,s.laneQ/Q,d,['#ff5c55','#37d9f1','#edda9a','#ffb54e']
    [(['comet','vector','phantom','bruiser'].indexOf(s.car)+4)%4],true);
  for(const r of s.rivals){
    // Do not upload cars behind the camera or beyond fog. Fixed small workset.
    const rd=r.distanceQ/Q;
    if(r.wrecked||rd<d-50||rd>d+1150)continue;
    addCar(out,s,r.laneQ/Q,rd,r.color);
  }
  return out;
}

export function createSprintRenderer(canvas){
  const renderer=new Renderer(canvas);
  const road=renderer.mesh(sprintSceneGeometry());
  const traffic=renderer.mesh([]);
  let disposed=false;
  return {
    draw(s){
      if(disposed)throw new Error('3D scene disposed');
      const d=s.distanceQ/Q,heading=sprintHeading(d),lateral=sprintLateralMetres(s.laneQ/Q);
      const cx=sprintCenter(d)+Math.cos(heading)*lateral;
      const z=-d+Math.sin(heading)*lateral;
      const lookX=sprintCenter(Math.min(SPRINT_METERS,d+85))+
        lateral*Math.cos(sprintHeading(Math.min(SPRINT_METERS,d+85)));
      const yaw=Math.atan2(lookX-cx,75);
      const qYaw=[0,-Math.sin(yaw/2),0,Math.cos(yaw/2)];
      const qPitch=[Math.sin(-.27),0,0,Math.cos(-.27)];
      renderer.begin([cx-Math.sin(heading)*16,9,z+Math.cos(heading)*16],
        quatMultiply(qYaw,qPitch),{fog:.0024});
      renderer.update(traffic,sprintTrafficGeometry(s));
      renderer.draw(road);renderer.draw(traffic);
    },
    dispose(){if(!disposed){disposed=true;renderer.dispose()}},
  };
}
