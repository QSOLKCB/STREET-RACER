// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../../vendor/vanillajs/modules/time/index.js';
import {MODES,TRACKS,CARS} from './config.js';
import {createRace,distanceMeters,speedKph,finishMeters} from './sim.js';
import {advanceRaceFrame} from './frame.js';
import {render,W,H} from './renderer.js';
import {createRaceAudio} from './audio.js';
import {createSprintRenderer} from './webgl.js';
import {selectedTrackFromStorage,sourceEnvironmentToGame,FOUNDRY_MODES} from './foundry.js';

const mode=document.body.dataset.mode;
if(!Object.hasOwn(MODES,mode))throw new Error('Invalid game mode');
const settings=MODES[mode],canvas=document.querySelector('#race-canvas'),ctx=canvas.getContext('2d',{alpha:false});
if(!ctx)throw new Error('Canvas 2D is required');
canvas.width=W;canvas.height=H;
const $=id=>document.getElementById(id);
const trackSelect=$('track'),carSelect=$('vehicle'),overlay=$('overlay'),heading=$('overlay-heading'),
  description=$('overlay-description'),start=$('start'),sound=$('sound'),pause=$('pause'),
  status=$('status'),speed=$('speed'),lap=$('lap'),rank=$('rank'),health=$('health'),nitro=$('nitro'),
  ammo=$('ammo'),distance=$('distance'),event=$('event'),timer=$('timer'),
  sector=$('sector'),route=$('route');
const clock=new FixedClock({step:1/60,maxFrame:.25,maxSteps:15,snapTolerance:.0005});
const audio=createRaceAudio(),held=new Set();
// Accessing the localStorage property itself may throw SecurityError in a
// sandboxed/private origin. No game (even a non-Foundry mode) depends on it.
const savedFoundry=(()=>{
  if(!FOUNDRY_MODES.includes(mode))return null;
  try{return selectedTrackFromStorage(window.localStorage,mode);}
  catch{return null;}
})();
const selectedOptions=()=>{
  const usePack=savedFoundry&&trackSelect.value==='foundry';
  return {mode,track:usePack?sourceEnvironmentToGame(savedFoundry.environment):
    trackSelect.value,car:carSelect.value,trackPack:usePack?savedFoundry:null};
};
let race=createRace({mode,track:savedFoundry?
  sourceEnvironmentToGame(savedFoundry.environment):undefined,trackPack:savedFoundry}),
  last=null,playing=false,frameId=null,messageUntil=0;
const three=$('webgl-view');
let scene3d=null;
if(three){
  try{scene3d=createSprintRenderer(three,race.foundry);three.hidden=false;}
  catch{three.hidden=true;} // WebGL is optional; native Canvas remains playable.
  three.addEventListener('webglcontextlost',e=>{
    e.preventDefault();scene3d=null;three.hidden=true;
  });
}
function paintRace(){
  if(scene3d){
    try{scene3d.draw(race);return;}
    catch{
      try{scene3d.dispose()}catch{}
      scene3d=null;three.hidden=true;
    }
  }
  render(ctx,race);
}
const keyMap={ArrowUp:'accelerate',KeyW:'accelerate',ArrowDown:'brake',KeyS:'brake',
  ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',
  Space:'boost',ShiftLeft:'boost',KeyF:'fire'};
for(const track of Object.values(TRACKS))trackSelect.add(new Option(track.name,track.id));
if(savedFoundry){
  trackSelect.add(new Option('TRACK FOUNDRY · '+savedFoundry.name,'foundry'));
  trackSelect.value='foundry';
}else trackSelect.value=settings.defaultTrack;
for(const car of Object.values(CARS))carSelect.add(new Option(car.name,car.id));
carSelect.value=settings.combat?'bruiser':'comet';
$('title').textContent=settings.title;$('subtitle').textContent=settings.subtitle;
$('mode').textContent=settings.kind.toUpperCase();
if(!settings.combat){$('ammo-box').hidden=true}
if(settings.kind!=='checkpoint'){$('timer-box').hidden=true}
if(settings.kind==='checkpoint'){
  $('objective').textContent='3 LEFT / RIGHT forks · collect +20s checkpoints';
}
if(settings.kind==='sprint'){
  $('objective').textContent='Native WebGL · 3.6 km · 4 scenic gates';
  trackSelect.parentElement.hidden=!savedFoundry; // Existing one-route UI remains unchanged.
}
if(sector)sector.closest('.metric').hidden=!['checkpoint','sprint'].includes(settings.kind);
if(route)route.closest('.metric').hidden=settings.kind!=='checkpoint';
if(settings.combat)$('objective').textContent='Survive · F to fire · take down rivals';
if(savedFoundry)$('objective').textContent=
  'TRACK FOUNDRY · '+savedFoundry.name+' · '+(mode==='supercar'?'8 edited gates':'4 authored road stages');
trackSelect.addEventListener('change',()=>{
  // A course selection is an explicit *new race*, not a pause of the prior
  // Foundry state followed by RESUME on its obsolete centreline.
  if(playing)pauseGame('COURSE CHANGED');
  else{clearInput();audio.silence();}
  newSelectedRace();
  playing=false;clock.setPaused(true);last=null;
  showOverlay('COURSE CHANGED',
    'The selected course has been applied. This starts a fresh race.',
    'START NEW COURSE');
  pause.textContent='START';
});
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
function newSelectedRace(){
  race=createRace(selectedOptions());
  clock.reset();messageUntil=0;event.textContent='';
  if(three&&scene3d){
    scene3d.dispose();scene3d=null;
    try{scene3d=createSprintRenderer(three,race.foundry);three.hidden=false;}
    catch{three.hidden=true;}
  }
}
function startGame(){
  if(race.status!=='running'||race.ticks===0)newSelectedRace();
  playing=true;clock.setPaused(false);last=null;clearInput();
  overlay.hidden=true;pause.textContent='PAUSE';
}
start.addEventListener('click',()=>{startGame()});
pause.addEventListener('click',()=>playing?pauseGame():startGame());
$('restart').addEventListener('click',()=>{race=createRace(selectedOptions());
  clock.reset();playing=false;pauseGame();startGame()});
sound.addEventListener('click',async()=>{
  const enabled=await audio.setSound(!audio.enabled);
  sound.textContent=enabled?'SOUND ON':'SOUND OFF';sound.setAttribute('aria-pressed',String(enabled));
});
document.addEventListener('keydown',e=>{
  if(e.code==='KeyP'||e.code==='Escape'){
    if(!e.repeat){playing?pauseGame():startGame()}e.preventDefault();return;
  }
  if(e.code==='KeyR'&&!e.repeat){race=createRace(selectedOptions());
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
// BFCache retains this module instance: do not permanently dispose the sound
// receiver when the document is only frozen. Resume must be an explicit gesture.
window.addEventListener('pagehide',pageEvent=>{
  if(playing)pauseGame('RACE PAUSED');
  else clearInput();
  if(!pageEvent.persisted){void audio.dispose();scene3d?.dispose();scene3d=null;}
  if(frameId!==null){cancelAnimationFrame(frameId);frameId=null;}
  last=null;
});
window.addEventListener('pageshow',pageEvent=>{
  if(!pageEvent.persisted)return;
  last=null;
  clearInput();
  if(playing)pauseGame('RACE PAUSED');
  if(frameId===null)frameId=requestAnimationFrame(frame);
});
function updateHud(now,frameEvents=[]){
  speed.textContent=String(speedKph(race));
  lap.textContent=settings.kind==='checkpoint'?String(Math.min(4,race.route.length+1))+' / 4':
    settings.kind==='sprint'?String(Math.min(4,race.checkpoints+1))+' / 4':
    String(race.lap)+' / '+settings.laps;
  if(sector)sector.textContent=settings.kind==='checkpoint'?
    String(Math.min(4,race.route.length+1))+' / 4':
    String(Math.min(4,race.checkpoints+1))+' / 4';
  if(route)route.textContent=race.route.length?
    race.route.map(choice=>choice==='left'?'L':'R').join(' · '):'CHOOSE';
  rank.textContent=String(race.position)+' / '+(race.rivals.length+1);
  health.textContent=String(race.health)+'%';nitro.textContent=String(Math.ceil(race.boost/6))+'%';
  ammo.textContent=String(race.ammo);distance.textContent=Math.floor(distanceMeters(race))+' / '+finishMeters(race)+' m';
  timer.textContent=String(Math.ceil((race.timeLeft??0)/60))+'s';
  status.textContent=race.status==='running'?(playing?'LIVE RACE':'READY'):race.status.toUpperCase();
  if(frameEvents.length){
    // Display every distinct event in this render interval and cue every
    // occurrence, including consecutive ticks with identical event names.
    event.textContent=[...new Set(frameEvents)].join(' · ');
    messageUntil=now+1400;
    for(const name of frameEvents)audio.cue(name);
  }
  if(now>messageUntil)event.textContent='';
}
function frame(now){
  frameId=requestAnimationFrame(frame);
  if(last===null)last=now;
  const elapsed=clampDelta((now-last)/1000);last=now;
  let frameEvents=[];
  if(playing){
    const result=advanceRaceFrame(clock,race,controls(),elapsed,audio);
    frameEvents=result.events;
    if(result.finished){
      playing=false;clearInput();
      showOverlay(race.status==='won'?'RACE COMPLETE':'RACE OVER',
        race.status==='won'?'You finished with '+race.score+' points. Try another car or circuit.':
          'The road wins this round. Tune your route and go again.','RACE AGAIN');
    }
  }
  paintRace();updateHud(now,frameEvents);
}
const clampDelta=t=>Math.max(0,Math.min(.25,t));
showOverlay(settings.title,settings.kind==='circuit'?'Three laps, rival supercars, mountain passes and earned nitro.':
  settings.kind==='checkpoint'?'Four dramatic stages, three lane-selected forks and a ticking checkpoint clock.':
  settings.kind==='sprint'?'A 3.6 km winding WebGL coastal road with moving rivals, scenic gates and a strict on-road finish.':
    'Armoured road combat, limited ammunition and rival takedowns.','START ENGINE');
// A direct deep link must install the same root-scoped, content-addressed PWA
// as the legacy game. Registration is local-only and optional for file:// previews.
if('serviceWorker' in navigator &&
    (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  navigator.serviceWorker.register('../../sw.js').catch(()=>{});
}
frameId=requestAnimationFrame(frame);
