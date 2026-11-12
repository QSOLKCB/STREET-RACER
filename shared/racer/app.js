// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../../vendor/vanillajs/modules/time/index.js';
import {MODES,TRACKS,CARS} from './config.js';
import {createRace,tickRace,distanceMeters,speedKph,finishMeters} from './sim.js';
import {render,W,H} from './renderer.js';
import {createRaceAudio} from './audio.js';

const mode=document.body.dataset.mode;
if(!Object.hasOwn(MODES,mode))throw new Error('Invalid game mode');
const settings=MODES[mode],canvas=document.querySelector('#race-canvas'),ctx=canvas.getContext('2d',{alpha:false});
if(!ctx)throw new Error('Canvas 2D is required');
canvas.width=W;canvas.height=H;
const $=id=>document.getElementById(id);
const trackSelect=$('track'),carSelect=$('vehicle'),overlay=$('overlay'),heading=$('overlay-heading'),
  description=$('overlay-description'),start=$('start'),sound=$('sound'),pause=$('pause'),
  status=$('status'),speed=$('speed'),lap=$('lap'),rank=$('rank'),health=$('health'),nitro=$('nitro'),
  ammo=$('ammo'),distance=$('distance'),event=$('event'),timer=$('timer');
const clock=new FixedClock({step:1/60,maxFrame:.25,maxSteps:15,snapTolerance:0});
const audio=createRaceAudio(),held=new Set();
let race=createRace({mode}),last=null,playing=false,frameId=null,messageUntil=0,previousEvent='';
const keyMap={ArrowUp:'accelerate',KeyW:'accelerate',ArrowDown:'brake',KeyS:'brake',
  ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',
  Space:'boost',ShiftLeft:'boost',KeyF:'fire'};
for(const track of Object.values(TRACKS))trackSelect.add(new Option(track.name,track.id));
trackSelect.value=settings.defaultTrack;
for(const car of Object.values(CARS))carSelect.add(new Option(car.name,car.id));
carSelect.value=settings.combat?'bruiser':'comet';
$('title').textContent=settings.title;$('subtitle').textContent=settings.subtitle;
$('mode').textContent=settings.kind.toUpperCase();
if(!settings.combat){$('ammo-box').hidden=true}
if(settings.kind!=='checkpoint'){$('timer-box').hidden=true}
if(settings.kind==='checkpoint')$('objective').textContent='Beat the clock · collect +20s checkpoints';
if(settings.combat)$('objective').textContent='Survive · F to fire · take down rivals';
function controls(){return {accelerate:held.has('accelerate'),brake:held.has('brake'),
  steer:Number(held.has('right'))-Number(held.has('left')),
  boost:held.has('boost'),fire:held.has('fire')};}
function clearInput(){held.clear();document.querySelectorAll('[data-hold]').forEach(x=>x.classList.remove('active'))}
function showOverlay(title,detail,label='START ENGINE'){
  heading.textContent=title;description.textContent=detail;start.textContent=label;overlay.hidden=false;
}
function pauseGame(reason='PAUSED'){
  if(!playing)return;
  playing=false;clock.setPaused(true);clearInput();audio.silence();
  showOverlay(reason,'Race frozen. Your car and rivals will not advance until you resume.','RESUME RACE');
  pause.textContent='RESUME';
}
function startGame(){
  if(race.status!=='running'||race.ticks===0){
    race=createRace({mode,track:trackSelect.value,car:carSelect.value});
    clock.reset();previousEvent='';
  }
  playing=true;clock.setPaused(false);last=null;clearInput();
  overlay.hidden=true;pause.textContent='PAUSE';
}
start.addEventListener('click',()=>{startGame()});
pause.addEventListener('click',()=>playing?pauseGame():startGame());
$('restart').addEventListener('click',()=>{race=createRace({mode,track:trackSelect.value,car:carSelect.value});
  clock.reset();playing=false;pauseGame();startGame()});
sound.addEventListener('click',async()=>{
  const enabled=await audio.setSound(!audio.enabled);
  sound.textContent=enabled?'SOUND ON':'SOUND OFF';sound.setAttribute('aria-pressed',String(enabled));
});
document.addEventListener('keydown',e=>{
  if(e.code==='KeyP'||e.code==='Escape'){
    if(!e.repeat){playing?pauseGame():startGame()}e.preventDefault();return;
  }
  if(e.code==='KeyR'&&!e.repeat){race=createRace({mode,track:trackSelect.value,car:carSelect.value});
    clock.reset();playing=false;startGame();return;}
  const action=keyMap[e.code];
  if(action&&overlay.hidden){held.add(action);e.preventDefault()}
});
document.addEventListener('keyup',e=>{const action=keyMap[e.code];if(action){held.delete(action);e.preventDefault()}});
for(const btn of document.querySelectorAll('[data-hold]')){
  const action=btn.dataset.hold;
  const release=e=>{held.delete(action);btn.classList.remove('active');try{btn.releasePointerCapture(e.pointerId)}catch{}};
  btn.addEventListener('pointerdown',e=>{if(!playing)return;btn.setPointerCapture(e.pointerId);held.add(action);btn.classList.add('active');e.preventDefault()});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(type,release);
}
window.addEventListener('blur',()=>pauseGame('FOCUS LOST'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame('TAB HIDDEN')});
window.addEventListener('pagehide',()=>{audio.dispose();if(frameId!==null)cancelAnimationFrame(frameId)});
function updateHud(now){
  speed.textContent=String(speedKph(race));lap.textContent=String(race.lap)+' / '+settings.laps;
  rank.textContent=String(race.position)+' / '+(race.rivals.length+1);
  health.textContent=String(race.health)+'%';nitro.textContent=String(Math.ceil(race.boost/6))+'%';
  ammo.textContent=String(race.ammo);distance.textContent=Math.floor(distanceMeters(race))+' / '+finishMeters(race)+' m';
  timer.textContent=String(Math.ceil((race.timeLeft??0)/60))+'s';
  status.textContent=race.status==='running'?(playing?'LIVE RACE':'READY'):race.status.toUpperCase();
  if(race.lastEvent&&race.lastEvent!==previousEvent){event.textContent=race.lastEvent;messageUntil=now+1400;audio.cue(race.lastEvent)}
  if(now>messageUntil)event.textContent='';
  previousEvent=race.lastEvent;
}
function frame(now){
  frameId=requestAnimationFrame(frame);
  if(last===null)last=now;
  const elapsed=clampDelta((now-last)/1000);last=now;
  if(playing){
    clock.advance(elapsed,()=>{
      tickRace(race,controls());
      if(race.status!=='running'){playing=false;clock.setPaused(true);clearInput();audio.silence();
        showOverlay(race.status==='won'?'RACE COMPLETE':'RACE OVER',
          race.status==='won'?'You finished with '+race.score+' points. Try another car or circuit.':
            'The road wins this round. Tune your route and go again.','RACE AGAIN');}
    });
    audio.update(race.speedQ/65536);
  }
  render(ctx,race);updateHud(now);
}
const clampDelta=t=>Math.max(0,Math.min(.25,t));
showOverlay(settings.title,settings.kind==='circuit'?'Three laps, rival supercars, alpine bends and nitro.':
  settings.kind==='checkpoint'?'Chase the horizon. Hit checkpoints before the timer expires.':
    'Armoured road combat, limited ammunition and rival takedowns.','START ENGINE');
frameId=requestAnimationFrame(frame);
