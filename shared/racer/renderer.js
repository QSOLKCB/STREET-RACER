// SPDX-License-Identifier: Apache-2.0
// Canvas pseudo-3D: procedural, original geometry only. No external textures.
import {Q,curvature,altitude} from './sim.js';
import {modeSettings} from './config.js';
export const W=960,H=540,VIEW_METERS=920;
const horizon=190,steps=88;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function poly(ctx,points,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fill();
}
export function project(z,distance,lane,track){
  const f=clamp(1-z/VIEW_METERS,0,1),perspective=Math.pow(f,1.46);
  const y=horizon+perspective*(H-horizon);
  const width=5+455*Math.pow(f,1.65);
  const bend=(curvature(distance+z,track)-curvature(distance,track))*155*(1-f)
    -Math.sin(distance/460)*65*f;
  const center=W/2+bend-lane*width*.69;
  return {x:center,y,width,f};
}
function sky(ctx,track,distance){
  const gradient=ctx.createLinearGradient(0,0,0,horizon+15);
  gradient.addColorStop(0,track.sky);gradient.addColorStop(1,track.horizon);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
  const sunX=track.id==='coast'?730:790;
  ctx.fillStyle='#ffe4aa';ctx.beginPath();ctx.arc(sunX,103,track.id==='desert'?48:29,0,Math.PI*2);ctx.fill();
  for(let layer=0;layer<2;layer++){
    const base=layer===0?161:185,amplitude=layer===0?44:25;
    const color=layer===0?track.mountain:track.mountain2;
    ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(0,base);
    for(let x=0;x<=W+20;x+=16){
      const phase=(x+distance*(layer?0.014:0.008))*.009;
      const y=base-amplitude*(.42*Math.sin(phase*2.1)+.39*Math.abs(Math.sin(phase*1.2+2))+.28*Math.sin(phase*4.7));
      ctx.lineTo(x,y);
    }
    ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  ctx.fillStyle=track.ground;ctx.fillRect(0,horizon,W,H-horizon);
}
function road(ctx,s,track){
  const d=s.distanceQ/Q,lane=s.laneQ/Q;
  for(let i=0;i<steps;i++){
    const z0=VIEW_METERS*(1-i/steps),z1=VIEW_METERS*(1-(i+1)/steps);
    const a=project(z0,d,lane,track.id),b=project(z1,d,lane,track.id);
    const section=Math.floor((d+z0)/36),alternate=section%2===0;
    ctx.fillStyle=alternate?track.grass:track.grass2;
    ctx.fillRect(0,a.y,W,b.y-a.y+1);
    const rumble=alternate?'#f6f5e8':'#dd5d55';
    poly(ctx,[[a.x-a.width*1.11,a.y],[a.x+a.width*1.11,a.y],
      [b.x+b.width*1.11,b.y],[b.x-b.width*1.11,b.y]],rumble);
    poly(ctx,[[a.x-a.width,a.y],[a.x+a.width,a.y],[b.x+b.width,b.y],[b.x-b.width,b.y]],
      alternate?track.road:track.road2);
    if(section%3!==0){
      for(const laneLine of [-1/3,1/3]){
        const ax=a.x+a.width*laneLine, bx=b.x+b.width*laneLine;
        const thick=Math.max(.5,b.width*.007);
        poly(ctx,[[ax-thick/2,a.y],[ax+thick/2,a.y],[bx+thick,b.y],[bx-thick,b.y]],track.stripe);
      }
    }
    const shadow=altitude(d+z0,track.id);
    if(shadow>0.6&&b.f>.35){ctx.fillStyle='rgba(12,24,40,.035)';ctx.fillRect(0,a.y,W,b.y-a.y+1);}
  }
}
function tree(ctx,x,y,size,track,variant){
  if(size<2)return;
  const trunk=track.id==='desert'?'#533e32':'#403e36';
  ctx.fillStyle='rgba(0,0,0,.16)';ctx.beginPath();ctx.ellipse(x,y,size*.34,size*.085,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=trunk;ctx.fillRect(x-size*.055,y-size*.74,size*.11,size*.74);
  if(track.id==='desert'){
    ctx.strokeStyle='#38483a';ctx.lineWidth=Math.max(2,size*.16);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(x,y-size*.7);ctx.lineTo(x,y-size*1.3);
    ctx.moveTo(x,y-size*.95);ctx.lineTo(x-size*.23,y-size*1.03);ctx.lineTo(x-size*.23,y-size*1.22);
    ctx.moveTo(x,y-size*.87);ctx.lineTo(x+size*.22,y-size*.95);ctx.lineTo(x+size*.22,y-size*1.1);ctx.stroke();
  }else if(track.id==='coast'){
    ctx.strokeStyle='#294c3f';ctx.lineWidth=Math.max(2,size*.09);
    ctx.beginPath();ctx.moveTo(x,y-size*.75);ctx.quadraticCurveTo(x+size*.1,y-size*1.3,x+size*.33,y-size*1.5);ctx.stroke();
    for(let i=0;i<5;i++){
      const theta=i*Math.PI*2/5;
      ctx.strokeStyle=i%2?'#366d52':'#2f614c';ctx.lineWidth=Math.max(3,size*.085);
      ctx.beginPath();ctx.moveTo(x+size*.33,y-size*1.5);
      ctx.quadraticCurveTo(x+size*(.3+Math.cos(theta)*.4),y-size*1.75,
        x+size*(.36+Math.cos(theta)*.63),y-size*(1.42+Math.sin(theta)*.26));ctx.stroke();
    }
  }else{
    const dark=variant?'#294f43':'#325e4b',light=variant?'#427b58':'#497b59';
    for(let i=0;i<3;i++){
      poly(ctx,[[x,y-size*(1.85-i*.38)],[x-size*(.43+i*.11),y-size*(.78-i*.27)],
       [x+size*(.43+i*.11),y-size*(.78-i*.27)]],i%2?light:dark);
    }
  }
}
function roadside(ctx,s,track){
  const d=s.distanceQ/Q,first=Math.floor(d/85)*85;
  // OPT working-set reduction: only 11 nearby fixtures, far-to-near painter order.
  for(let m=first+11*85;m>=first;m-=85){
    const z=m-d;if(z<8||z>VIEW_METERS)continue;
    const a=project(z,d,s.laneQ/Q,track.id);
    const size=8+170*Math.pow(a.f,1.6);
    for(const side of [-1,1]){
      const x=a.x+side*(a.width*1.5+size*.15);
      tree(ctx,x,a.y,size,track,((Math.trunc(m/85)+side)&1)!==0);
    }
  }
}
export function visibleRivals(s){
  const d=s.distanceQ/Q;
  return s.rivals.filter(r=>!r.wrecked&&r.distanceQ/Q-d>1&&r.distanceQ/Q-d<VIEW_METERS)
    .sort((a,b)=>b.distanceQ-a.distanceQ);
}
function rivalCar(ctx,x,y,size,color){
  const w=size*.5,h=size*.46;
  ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(x,y,w*.8,h*.28,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#1b1e28';ctx.fillRect(x-w*.85,y-h*.7,w*.25,h*.65);
  ctx.fillRect(x+w*.6,y-h*.7,w*.25,h*.65);
  poly(ctx,[[x-w,y],[x-w*.78,y-h],[x-w*.56,y-h*1.45],[x+w*.56,y-h*1.45],[x+w*.78,y-h],[x+w,y]],color);
  poly(ctx,[[x-w*.56,y-h*.94],[x-w*.36,y-h*1.35],[x+w*.36,y-h*1.35],[x+w*.56,y-h*.94]],'#26354b');
  ctx.fillStyle='#f94c55';ctx.fillRect(x-w*.86,y-h*.4,w*.3,h*.15);ctx.fillRect(x+w*.56,y-h*.4,w*.3,h*.15);
  ctx.fillStyle='#202a36';ctx.fillRect(x-w*.33,y-h*.23,w*.66,h*.13);
}
function rivals(ctx,s,track){
  const d=s.distanceQ/Q;
  for(const rival of visibleRivals(s)){
    const z=rival.distanceQ/Q-d,p=project(z,d,s.laneQ/Q,track.id);
    const width=16+p.f*p.f*90;
    rivalCar(ctx,p.x+rival.laneQ/Q*p.width*.65,p.y,width,rival.color);
  }
}
function player(ctx,s,color){
  const x=W/2,y=H-12,w=92,h=89;
  ctx.fillStyle='rgba(0,0,0,.44)';ctx.beginPath();ctx.ellipse(x,y+2,125,15,0,0,Math.PI*2);ctx.fill();
  const shake=s.collisionCooldown>60?(s.ticks%2?3:-3):0;
  ctx.save();ctx.translate(shake,0);
  ctx.fillStyle='#161823';ctx.fillRect(x-w-6,y-80,24,74);ctx.fillRect(x+w-18,y-80,24,74);
  poly(ctx,[[x-w,y],[x-w*.85,y-h],[x-w*.59,y-h*1.32],
    [x+w*.59,y-h*1.32],[x+w*.85,y-h],[x+w,y]],color);
  poly(ctx,[[x-w*.6,y-h*.88],[x-w*.45,y-h*1.25],[x+w*.45,y-h*1.25],[x+w*.6,y-h*.88]],'#162638');
  ctx.fillStyle='#fff7cd';ctx.fillRect(x-w*.73,y-h*.91,w*.16,5);ctx.fillRect(x+w*.57,y-h*.91,w*.16,5);
  ctx.fillStyle='#ff343c';ctx.fillRect(x-w*.89,y-h*.35,37,12);ctx.fillRect(x+w*.49,y-h*.35,37,12);
  ctx.fillStyle='#1b202a';ctx.fillRect(x-w*.32,y-h*.24,w*.64,h*.18);
  ctx.fillStyle='#cad2d8';ctx.font='bold 13px monospace';ctx.textAlign='center';ctx.fillText('QSOL',x,y-h*.1);
  if(s.boost<600&&s.speedQ>0&&s.ticks%3!==0){
    ctx.fillStyle='#8bf3f9';poly(ctx,[[x-31,y],[x-20,y],[x-27,y+24+(s.ticks%4)*4]],'#77effa');
    poly(ctx,[[x+20,y],[x+31,y],[x+27,y+24+(s.ticks%4)*4]],'#ffbb6d');
  }
  ctx.restore();
}
function overlays(ctx,s,track){
  const shade=ctx.createLinearGradient(0,0,0,H);
  shade.addColorStop(0,'rgba(5,9,17,.36)');shade.addColorStop(.35,'rgba(0,0,0,0)');
  shade.addColorStop(1,'rgba(5,9,17,.2)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(6,15,23,.5)';ctx.fillRect(18,78,182,66);
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.strokeRect(18,78,182,66);
  ctx.fillStyle='#e7fbfc';ctx.font='bold 13px monospace';ctx.fillText('SECTOR FEED / LIVE',30,98);
  ctx.fillStyle='#b9d1d7';ctx.font='12px monospace';ctx.fillText('CURVE '+curvature(s.distanceQ/Q,track.id).toFixed(2),30,119);
  ctx.fillText('ELEV. '+altitude(s.distanceQ/Q,track.id).toFixed(2),30,136);
}
export function render(ctx,s){
  const setup=modeSettings(s.mode,s.track,s.car);
  ctx.clearRect(0,0,W,H);
  sky(ctx,setup.track,s.distanceQ/Q);
  road(ctx,s,setup.track);roadside(ctx,s,setup.track);rivals(ctx,s,setup.track);
  player(ctx,s,setup.car.color);overlays(ctx,s,setup.track);
}
