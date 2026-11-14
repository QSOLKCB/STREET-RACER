// SPDX-License-Identifier: Apache-2.0
// Canvas pseudo-3D: procedural, original geometry only. No external textures.
import {Q,curvature,altitude} from './sim.js';
import {modeSettings,TRACKS} from './config.js';
import {roadPositionQ,halfWidthQ,sourceEnvironmentToGame} from './foundry.js';
import {tourPalette,routeBend,TOUR_STAGE_METERS} from './course.js';
export const W=960,H=540,VIEW_METERS=920;
const horizon=190,steps=88;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function poly(ctx,points,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fill();
}
export function project(z,distance,lane,track,route=[],pack=null,mode='coast'){
  const f=clamp(1-z/VIEW_METERS,0,1),perspective=Math.pow(f,1.46);
  const y=horizon+perspective*(H-horizon);
  let width=5+455*Math.pow(f,1.65),bend;
  if(pack){
    const before=roadPositionQ(pack,mode,Math.round(distance*Q),route);
    const ahead=roadPositionQ(pack,mode,Math.round((distance+z)*Q),route);
    const curveMetres=(ahead.xQ-before.xQ)/Q;
    bend=curveMetres*5.2*(1-f);
    width*=Math.max(.6,Math.min(1.4,halfWidthQ(pack,Math.round((distance+z)*Q))/(12*Q)));
  }else{
    const curved=curvature(distance+z,track)-curvature(distance,track);
    const branching=routeBend(distance+z,route)-routeBend(distance,route);
    bend=(curved+branching)*155*(1-f)-Math.sin(distance/460)*65*f;
  }
  const center=W/2+bend-lane*width*.69;
  return {x:center,y,width,f};
}
function sky(ctx,track,distance){
  const gradient=ctx.createLinearGradient(0,0,0,horizon+15);
  gradient.addColorStop(0,track.sky);gradient.addColorStop(1,track.horizon);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
  const sunX=track.id==='coast'?730:790;
  const halo=ctx.createRadialGradient(sunX,103,8,sunX,103,138);
  halo.addColorStop(0,'rgba(255,245,185,.30)');
  halo.addColorStop(1,'rgba(255,220,140,0)');
  ctx.fillStyle=halo;ctx.fillRect(sunX-140,-30,280,280);
  ctx.fillStyle='#ffe4aa';ctx.beginPath();ctx.arc(sunX,103,track.id==='desert'?48:29,0,Math.PI*2);ctx.fill();
  // Bounded deterministic parallax cloud bands. No frame-random flicker.
  for(let i=0;i<6;i++){
    const x=((i*207-distance*.018)%1260+1260)%1260-170;
    const y=41+i%3*36;
    const size=18+(i*17)%24;
    ctx.fillStyle='rgba(242,248,255,.14)';
    ctx.beginPath();ctx.ellipse(x,y,size*2.8,size*.42,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(x+size*.55,y-4,size*1.15,size*.44,0,0,Math.PI*2);ctx.fill();
  }
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
  const d=s.distanceQ/Q,lane=s.laneQ/Q,route=s.mode==='coast'?s.route:[];
  for(let i=0;i<steps;i++){
    const z0=VIEW_METERS*(1-i/steps),z1=VIEW_METERS*(1-(i+1)/steps);
    const a=project(z0,d,lane,track.id,route,s.foundry,s.mode),
      b=project(z1,d,lane,track.id,route,s.foundry,s.mode);
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
    // Reflective centre paint and a narrow shadow seam make the road
    // readable at high speed without adding texture files or shaders.
    if(section%5===0&&b.f>.27){
      const thin=Math.max(.65,b.width*.008);
      poly(ctx,[[a.x-thin,a.y],[a.x+thin,a.y],[b.x+thin*2,b.y],[b.x-thin*2,b.y]],
        'rgba(229,236,239,.22)');
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
    const a=project(z,d,s.laneQ/Q,track.id,s.mode==='coast'?s.route:[],s.foundry,s.mode);
    const size=8+170*Math.pow(a.f,1.6);
    for(const side of [-1,1]){
      const x=a.x+side*(a.width*1.5+size*.15);
      tree(ctx,x,a.y,size,track,((Math.trunc(m/85)+side)&1)!==0);
      if(m%255===0&&side===1&&size>16){
        ctx.fillStyle='#162a33';ctx.fillRect(x-size*.8,a.y-size*1.45,size*1.4,size*.42);
        ctx.strokeStyle='#9af2e9';ctx.strokeRect(x-size*.8,a.y-size*1.45,size*1.4,size*.42);
        ctx.fillStyle='#eafff6';ctx.textAlign='center';
        ctx.font=Math.max(8,size*.17)+'px monospace';
        ctx.fillText('QSOL / '+(Math.floor(m/100)%10),x-size*.1,a.y-size*1.16);
      }
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
    const z=rival.distanceQ/Q-d,p=project(z,d,s.laneQ/Q,track.id,s.mode==='coast'?s.route:[],s.foundry,s.mode);
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
function forkBanner(ctx,s,track){
  if(s.mode!=='coast'||s.route.length>=3)return;
  const distance=s.distanceQ/Q;
  const at=(s.route.length+1)*(s.foundry?1200:TOUR_STAGE_METERS),z=at-distance;
  if(z<=10||z>VIEW_METERS)return;
  const p=project(z,distance,s.laneQ/Q,track.id,s.route,s.foundry,s.mode);
  const scale=Math.max(.7,Math.min(3.1,1+p.f*2.5));
  const width=126*scale,height=26*scale;
  const x=p.x-width/2,y=p.y-100*scale;
  ctx.fillStyle='#122a34';ctx.fillRect(x,y,width,height);
  ctx.lineWidth=Math.max(1,scale);ctx.strokeStyle='#9ce8d9';ctx.strokeRect(x,y,width,height);
  ctx.fillStyle='#f8edb7';ctx.textAlign='center';
  ctx.font='bold '+Math.max(10,Math.round(scale*11))+'px monospace';
  ctx.fillText('◀ LEFT   |   RIGHT ▶',p.x,y+height*.68);
  ctx.strokeStyle='#445968';ctx.lineWidth=2*scale;
  for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(p.x+side*width*.38,y+height);
    ctx.lineTo(p.x+side*width*.38,p.y);ctx.stroke();}
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
  if(s.mode==='coast'){
    ctx.fillStyle='#d4f8ee';ctx.font='bold 15px monospace';
    ctx.textAlign='left';
    ctx.fillText(track.name.toUpperCase(),24,H-24);
    const next=(s.route.length+1)*(s.foundry?1200:TOUR_STAGE_METERS)-s.distanceQ/Q;
    if(s.route.length<3&&next<340){
      ctx.fillStyle='rgba(7,22,32,.83)';ctx.fillRect(W-302,86,280,70);
      ctx.strokeStyle='#9eead7';ctx.strokeRect(W-302,86,280,70);
      ctx.fillStyle='#f5edbd';ctx.font='bold 16px monospace';
      ctx.fillText('FORK AHEAD '+Math.max(0,Math.ceil(next))+' m',W-290,110);
      ctx.font='bold 15px monospace';
      ctx.fillText(s.laneQ<0?'◀ LEFT SELECTED':'RIGHT SELECTED ▶',W-290,139);
    }
  }
}
export function render(ctx,s){
  const setup=modeSettings(s.mode,s.track,s.car);
  ctx.clearRect(0,0,W,H);
  const track=s.foundry?
    TRACKS[sourceEnvironmentToGame(s.trackPack.environment)]:
    s.mode==='coast'?tourPalette(s.route,s.track):setup.track;
  sky(ctx,track,s.distanceQ/Q);
  road(ctx,s,track);roadside(ctx,s,track);rivals(ctx,s,track);
  forkBanner(ctx,s,track);
  player(ctx,s,setup.car.color);overlays(ctx,s,track);
  if(s.foundry){
    ctx.fillStyle='rgba(7,25,34,.83)';ctx.fillRect(20,H-56,352,27);
    ctx.fillStyle='#91f8da';ctx.font='bold 12px monospace';ctx.textAlign='left';
    ctx.fillText('FOUNDRY / '+s.trackPack.name.toUpperCase(),30,H-38);
  }
}
