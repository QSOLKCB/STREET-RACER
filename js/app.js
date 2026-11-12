// SPDX-License-Identifier: Apache-2.0
import { CARS, CAR_BY_ID, PARTS, COURSES, RIVALS } from './catalog.js';
import { createCareer, parseSave, serializeSave, getActiveCar, carStats, applyAction, canRace, startRace, stepRace, settleRace, forfeitRace, saleValue } from './core.js';
import { drawGarage, drawCar, drawRace } from './render.js';
import { createAudio } from './audio.js';
import { FixedClock } from '../vendor/vanillajs/modules/time/index.js';
import '../vendor/games/shared/qsol-input.js';
import * as UI from './ui.js';

const $ = selector => document.querySelector(selector);
const SAVE_KEY = 'street-racer.career.v1', PREF_KEY = 'street-racer.preferences.v1', REJECTED_KEY = 'street-racer.rejected.v1';
const main = $('#main'), dialog = $('#dialog'), raceScreen = $('#race-screen');
const defaults = {volume:.42, sound:false, transmission:'auto', contrast:false};
let preferences = {...defaults}, career = createCareer(), storageOK = true, loadMessage = '', rejectedSave = '';
try {
  const raw = localStorage.getItem(PREF_KEY), pref = raw ? JSON.parse(raw) : {};
  if (pref && typeof pref === 'object') preferences = {volume:Number.isFinite(pref.volume)?Math.max(0,Math.min(1,pref.volume)):defaults.volume,sound:pref.sound===true,transmission:pref.transmission==='manual'?'manual':'auto',contrast:pref.contrast===true};
} catch { /* A malformed preference must not hide the garage. */ }
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try { career = parseSave(raw); }
    catch (error) {
      rejectedSave = raw;
      try { localStorage.setItem(REJECTED_KEY, raw); } catch { /* Preserve in memory when storage is full. */ }
      loadMessage = `Your saved career could not be opened: ${error.message} A copy is available in Save / load.`;
    }
  }
} catch { storageOK = false; loadMessage = 'This browser has disabled local storage. You can still play; export your career before leaving.'; }
if(!rejectedSave){try{rejectedSave=localStorage.getItem(REJECTED_KEY)||'';}catch{/* Recovery may still be present in this tab. */}}

const audio = createAudio();
audio.setVolume(preferences.volume);
const clock = new FixedClock({step:1/60,maxFrame:.1,maxSteps:6,snapTolerance:.0005});
const {GamepadReader,BUTTON,AXIS} = globalThis.QsolInput;
const pad = new GamepadReader();
const ui = {view:'garage',courseId:COURSES[0].id};
let race = null, paused = false, raceOptions = null, lastFrame = 0, lastPaint = 0, raceSettled = false;
let previousGear = 1, previousCountdown = 4, previousStatus = '', lastEvent = '', lastInput = {};
let toastTimer = 0, drawPending = false, activeDialog = '', challengeId = '', pendingImport = null, raceCashBefore = 0;
let dialogGeneration = 0;
const keys = new Set(), pointers = new Map();
let shiftUp = false, shiftDown = false;

function toast(message,error=false) {
  clearTimeout(toastTimer); const target = $('#toast');
  target.textContent = message; target.classList.toggle('error',error); target.hidden = false;
  toastTimer = setTimeout(()=>{target.hidden=true;},error?6500:3600);
}
function savePreferences() {
  try {localStorage.setItem(PREF_KEY,JSON.stringify(preferences));} catch { /* Career export remains available. */ }
  document.documentElement.dataset.contrast = preferences.contrast?'high':'standard';
}
function saveCareer() {
  try { localStorage.setItem(SAVE_KEY,serializeSave(career));storageOK=true;$('#save-status').textContent='LOCAL GARAGE · SAVED'; }
  catch { if(storageOK)toast('Local storage is full or unavailable. Export your career in Save / load.',true);storageOK=false;$('#save-status').textContent='EXPORT YOUR CAREER TO KEEP IT'; }
}
function setView(view,focus=true) {
  if(race || !['garage','classifieds','parts','meet','logbook'].includes(view))return;
  ui.view=view;render();
  if(focus){main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
function render() {
  $('#account').innerHTML=`<div class="cash"><span>CASH</span><strong>${UI.money(career.cash)}</strong></div><div class="rep"><span>REPUTATION</span><strong>${career.rep}<small> / ${RIVALS.at(-1).rep}</small></strong></div>`;
  for(const button of document.querySelectorAll('#navigation [data-view]')){
    if(button.dataset.view===ui.view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  const views={garage:UI.garage,classifieds:UI.classifieds,parts:UI.parts,meet:UI.meet,logbook:UI.logbook};
  main.innerHTML=(loadMessage?`<div class="notice">${UI.esc(loadMessage)} <button class="text-button" data-action="save-menu">Save / load ↗</button></div>`:'')+views[ui.view](career,ui);
  updateSoundButton();queueDraw();
}
function queueDraw(){if(drawPending)return;drawPending=true;requestAnimationFrame(()=>{drawPending=false;drawMenus();if(race)paintRace();});}
function drawMenus(){
  const active=getActiveCar(career),garage=$('#garage-canvas');
  if(garage){const model=UI.displayCar(active);const ok=drawGarage(garage,model,carStats(active||UI.stockCar(model)),{reducedMotion:true});if(!ok)garage.setAttribute('aria-label','Canvas is unavailable. Vehicle statistics and all garage controls are still available.');}
  for(const canvas of main.querySelectorAll('canvas[data-car]')){
    const car=career.cars.find(c=>c.uid===canvas.dataset.car)||CARS.find(c=>c.id===canvas.dataset.car);
    if(car)drawCar(canvas,UI.displayCar(car));
  }
}
function runAction(action){
  if(race)return false;
  const result=applyAction(career,action);
  if(!result.ok){toast(result.message,true);return false;}
  career=result.state;saveCareer();render();toast(result.message);
  audio.cue(action.type==='buy'?'buy':action.type==='upgrade'?'upgrade':'shift');
  return true;
}
function showDialog(title,body,kind='generic'){
  dialogGeneration++;if(kind!=='import')pendingImport=null;
  activeDialog=kind;$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;
  if(!dialog.open)dialog.showModal();
}
function closeDialog(){dialogGeneration++;dialog.close();activeDialog='';pendingImport=null;}
function download(name,content){
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function saveMenu(){
  showDialog('Your garage, wherever you go.',`<p>Career changes save automatically on this device. Export a JSON copy to keep a backup or take your garage to another browser. Races in progress are not saved.</p><div class="stack" style="margin-top:22px"><button class="primary" data-action="export">Export career · JSON ↓</button><button data-action="import">Import career from a file ↑</button>${rejectedSave?'<button data-action="export-rejected">Download the unreadable save for recovery ↓</button>':''}<button data-action="reset-career" class="danger">Start a new career…</button></div><p class="file-hint">${storageOK?'Local auto save is available.':'Storage is unavailable. Export before leaving this page.'} Imports are validated before replacing your career. Maximum file size: 64 KiB.</p>`,'save');
}
function settings(){
  showDialog('Make yourself comfortable.',`<div class="setting-row"><div><label for="setting-sound">Sound & music</label><small>Original instrumental score, engine and tyre sound.</small></div><input type="checkbox" id="setting-sound" ${audio.state.enabled?'checked':''}></div><div class="setting-row"><div><label for="setting-volume">Master volume</label><small id="volume-label">${Math.round(preferences.volume*100)}%</small></div><input type="range" id="setting-volume" min="0" max="1" step="0.05" value="${preferences.volume}"></div><div class="setting-row"><div><label for="setting-transmission">Default transmission</label><small>Manual uses E/Q or the shift buttons.</small></div><select id="setting-transmission"><option value="auto" ${preferences.transmission==='auto'?'selected':''}>Automatic</option><option value="manual" ${preferences.transmission==='manual'?'selected':''}>Manual</option></select></div><div class="setting-row"><div><label for="setting-contrast">High contrast</label><small>Brighter text, borders and instrument panels.</small></div><input type="checkbox" id="setting-contrast" ${preferences.contrast?'checked':''}></div><p style="margin-top:20px">Sound starts only when you turn it on. Driving pauses when you switch tabs or leave the window. Reduced motion follows your device setting.</p><div class="dialog-actions"><button data-action="help">Driver’s handbook</button><button data-action="save-menu">Save / load</button><button class="primary" data-action="close">Done</button></div>`,'settings');
}
async function soundEnabled(enabled){
  try {await audio.setEnabled(enabled);if(enabled&&!paused)await audio.resume();preferences.sound=audio.state.enabled;savePreferences();updateSoundButton();if(enabled&&!audio.state.unlocked)toast('Sound is unavailable in this browser. The game is ready to play.',true);}
  catch{toast('The browser could not start audio. You can keep playing with sound off.',true);}
}
function updateSoundButton(){
  const enabled=audio.state.enabled,button=$('#sound-button');
  button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Turn sound off':'Turn sound on');
  button.querySelector('.sound-label').textContent=enabled?'Sound on':preferences.sound?'Resume sound':'Sound off';
  const racing=raceScreen.querySelector('[data-race-sound]');
  if(racing){racing.setAttribute('aria-label',enabled?'Turn race sound off':'Turn race sound on');racing.setAttribute('aria-pressed',String(enabled));racing.textContent=enabled?'♫':'♪';}
}
function challenge(rivalId,practice=false){
  const rival=RIVALS.find(r=>r.id===rivalId);if(!rival)return;
  challengeId=rivalId;
  if(rivalId==='monarch'&&!practice&&ui.courseId!=='canyon'){ui.courseId='canyon';render();}
  const course=COURSES.find(c=>c.id===ui.courseId)||COURSES[0];
  const car=getActiveCar(career);if(!car){toast('Buy a car first.',true);return;}
  const available=canRace(career,{rivalId,courseId:course.id,stake:'pink'});
  showDialog(`${rival.name} · ${course.name}`,`<div class="eyebrow">${UI.esc(rival.nickname)}</div><p>“${UI.esc(rival.quote)}”</p><div class="race-form"><label class="stake-option"><input type="radio" name="stake" value="practice" ${practice?'checked':''}><span><strong>Just for the run · practice</strong><small>No money, fuel, wear or reputation changes.</small></span></label><label class="stake-option"><input type="radio" name="stake" value="cash" ${practice?'':'checked'}><span><strong>Cash challenge · ${UI.money(rival.wager)} at stake</strong><small>${UI.money(rival.reward)} first-win purse, plus the rival’s wager. Repeat wins earn a smaller purse.</small></span></label><label class="stake-option"><input type="radio" name="stake" value="pink" ${available.ok?'':'disabled'}><span><strong>Pink slips · risk your ${UI.esc(UI.displayCar(car).name)}</strong><small>${available.ok?'Win their car or lose yours. Requires a separate confirmation.':UI.esc(available.message)}</small></span></label><label for="race-transmission">Shifting<select id="race-transmission"><option value="auto" ${preferences.transmission==='auto'?'selected':''}>Automatic · focus on the road</option><option value="manual" ${preferences.transmission==='manual'?'selected':''}>Manual · E / Q to shift</option></select></label></div><p class="file-hint">${course.type==='drag'?'A clean launch, four gears and a quarter mile.':'Steer through the bends. Brake before tight corners and avoid roadwork markers.'} You can pause at any time.</p><div class="dialog-actions"><button data-action="close">Maybe later</button><button class="primary" data-action="race-launch">Line up →</button></div>`,'challenge');
}
function launchChallenge(){
  const stake=$('input[name=stake]:checked')?.value||'practice';
  const options={rivalId:challengeId,courseId:ui.courseId,stake,transmission:$('#race-transmission')?.value||preferences.transmission};
  const allowed=canRace(career,options);
  if(!allowed.ok){toast(allowed.message,true);return;}
  if(stake==='pink'){
    raceOptions=options;
    showDialog('The car is on the line.',`<p>You are risking your <strong>${UI.esc(UI.displayCar(getActiveCar(career)).name)}</strong>. If you lose or retire from this run, it leaves your garage. If you win, you take the rival’s car.</p><p style="margin-top:15px">Workshop jobs remain available if you lose your last car. You can also go back and choose a cash or practice run.</p><div class="dialog-actions"><button data-action="pink-back">Choose other stakes</button><button class="danger" data-action="pink-confirm">I understand · race for pink slips</button></div>`,'pink');
  }else beginRace(options);
}

function clearInput(){keys.clear();pointers.clear();shiftUp=false;shiftDown=false;lastInput={throttle:0,brake:0,steer:0};pad.reset();for(const el of raceScreen.querySelectorAll('[data-held]'))el.removeAttribute('data-held');}
function beginRace(options){
  const result=startRace(career,options);if(!result.ok){toast(result.message,true);return;}
  if(dialog.open)closeDialog();
  race=result.race;raceOptions={...options};raceCashBefore=career.cash;raceSettled=false;paused=false;clearInput();
  previousGear=1;previousCountdown=4;previousStatus='';lastEvent='';clock.reset();clock.setPaused(false);
  lastFrame=0;lastPaint=0;
  $('#toast').hidden=true;$('.shell').inert=true;raceScreen.hidden=false;document.body.style.overflow='hidden';
  raceScreen.innerHTML=`<canvas id="race-canvas" role="img" aria-label="Driving view of ${UI.esc(race.course.name)}"></canvas><div class="race-top"><div class="race-label"><h2>${UI.esc(race.course.name)}</h2><p>YOU vs ${UI.esc(race.rival.name).toUpperCase()} · ${race.stake==='practice'?'PRACTICE':race.stake==='pink'?'PINK SLIPS':UI.money(race.cashStake)+' WAGER'}</p></div><div class="race-top-buttons"><button data-action="sound" data-race-sound aria-label="Turn race sound on">♪</button><button data-action="fullscreen" aria-label="Toggle race fullscreen">⛶ <span class="full-label">Fullscreen</span></button><button data-action="pause" aria-label="Pause race">Ⅱ Pause</button></div></div><div class="race-progress"><div class="race-progress-label"><span>YOU <span id="position-label">AT THE LINE</span></span><span id="remaining-label">${race.course.length} M</span></div><div class="meter"><span id="player-progress" style="width:0"></span></div><div class="meter rival-meter"><span id="opponent-progress" style="width:0"></span></div></div><div class="race-center" id="race-message"><div class="countdown-number" id="race-countdown">3</div><p id="race-callout">GET READY</p></div><div class="race-hud"><div class="speed-block"><span class="speed" id="speed">0</span><span class="units">KM/H</span><div class="rpm-track"><span id="rpm-bar"></span></div><div class="gear-block"><span>GEAR <strong id="gear">1</strong> / 4</span><span id="rpm">900 RPM</span></div></div><div class="race-telemetry"><div><small>TIME</small><span id="race-time">0:00.00</span></div><div><small>CONDITION</small><span id="race-condition">100%</span></div><div><small>FUEL</small><span id="race-fuel">100%</span></div><div><small>GEARBOX</small>${options.transmission.toUpperCase()}</div></div></div><div class="drive-controls"><div class="control-group steer-controls"><button data-control="left" aria-label="Steer left">←<small>A / ←</small></button><button data-control="right" aria-label="Steer right">→<small>D / →</small></button></div><div><div class="drive-hint" id="drive-hint">W / ↑ ACCELERATE · S / ↓ BRAKE · ESC PAUSE</div><div class="control-group shift-controls"><button data-action="shift-down" aria-label="Shift down" ${options.transmission==='auto'?'disabled':''}>−<small>Q · SHIFT</small></button><button data-action="shift-up" aria-label="Shift up" ${options.transmission==='auto'?'disabled':''}>＋<small>E · SHIFT</small></button></div></div><div class="control-group pedal-controls"><button data-control="brake" aria-label="Brake">BRAKE<small>S / ↓</small></button><button data-control="throttle" aria-label="Accelerate">THROTTLE<small>W / ↑</small></button></div></div><div class="pause-overlay" id="pause-overlay" hidden><div class="pause-panel"><div class="eyebrow">TAKE A BREATHER</div><h2>Run paused.</h2><p>The clock is stopped. Your controls are released. Resume when you’re ready.</p><div class="stack"><button class="primary" data-action="resume">Back behind the wheel →</button><button data-action="restart">Restart this run</button><button class="danger" data-action="retire">Retire to the garage…</button></div></div></div>`;
  audio.setScene('race');audio.resume().catch(()=>{});updateSoundButton();paintRace();
  raceScreen.querySelector('[data-action=pause]').focus({preventScroll:true});
}

function pauseRace(){
  if(!race||race.status==='finished'||paused)return;
  paused=true;clock.setPaused(true);clearInput();
  $('#pause-overlay').hidden=false;audio.suspend().catch(()=>{});
  if(!dialog.open)raceScreen.querySelector('[data-action=resume]').focus({preventScroll:true});
}
function resumeRace(){
  if(!race||race.status==='finished'||dialog.open)return;
  paused=false;clearInput();clock.setPaused(false);lastFrame=0;
  $('#pause-overlay').hidden=true;audio.resume().catch(()=>{});
  raceScreen.querySelector('[data-action=pause]').focus({preventScroll:true});
}
function retireDialog(){
  if(!race||race.status==='finished')return;
  pauseRace();
  const cost=race.stake==='practice'?'This practice run has no stakes or wear.':race.stake==='pink'?'Retiring loses your active car under the pink-slip agreement.':`Retiring counts as a loss and costs the ${UI.money(race.cashStake)} wager.`;
  showDialog('Call it a night?',`<p>${cost} You can keep this run paused and resume instead.</p><div class="dialog-actions"><button data-action="close">Keep the run paused</button><button class="danger" data-action="retire-confirm">Retire from this run</button></div>`,'retire');
}
function finishRace(){
  if(!race||raceSettled)return;
  raceSettled=true;clock.setPaused(true);clearInput();
  const result=settleRace(career,race);
  if(result.ok){career=result.state;saveCareer();}else toast(result.message,true);
  const won=race.winner==='player',practice=race.stake==='practice',delta=career.cash-raceCashBefore;
  audio.cue(won?'win':'lose');
  showDialog(practice?'Practice complete.':won?'That’s a run to remember.':'There’s always another night.',`<div class="result-flag">${practice?'NO STAKES · NO WEAR':won?'FIRST ACROSS THE LINE':'BACK TO THE DRAWING BOARD'}</div><div class="result-title">${!practice&&career.champion&&race.rival.id==='monarch'&&won?'THE CROWN IS YOURS.':won?'YOU TOOK THE LINE.':'YOU’LL BE BACK.'}</div><p style="margin-top:18px">${UI.esc(race.reason)}</p><div class="result-grid"><div><span>YOUR TIME</span><strong>${UI.time(race.finishTime)}</strong></div><div><span>${practice?'PRACTICE':'CASH CHANGE'}</span><strong>${practice?'NO COST':(delta>=0?'+':'−')+UI.money(Math.abs(delta))}</strong></div><div><span>REPUTATION</span><strong>${career.rep}</strong></div><div><span>GARAGE</span><strong>${career.cars.length} / 4</strong></div></div><p style="margin-top:18px">${UI.esc(result.message)}</p><div class="dialog-actions"><button data-action="race-exit">Back to the garage</button>${getActiveCar(career)?'<button class="primary" data-action="race-meet">Back to the meet →</button>':'<button class="primary" data-action="race-recover">Find another project →</button>'}</div>`,'result');
}
function exitRace(view='garage'){
  if(race&&!raceSettled)return;
  if(dialog.open)closeDialog();
  race=null;paused=false;raceScreen.hidden=true;raceScreen.innerHTML='';clearInput();clock.reset();
  $('.shell').inert=false;document.body.style.overflow='';audio.setScene('garage');audio.resume().catch(()=>{});
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  setView(view);
}
function setText(id,value){const el=document.getElementById(id);if(el&&el.textContent!==String(value))el.textContent=String(value);}
function paintRace(){
  if(!race)return;
  const canvas=$('#race-canvas');
  const ok=drawRace(canvas,race,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,braking:lastInput.brake>0});
  setText('speed',Math.round(race.player.speed*3.6));setText('gear',race.player.gear);setText('rpm',Math.round(race.player.rpm)+' RPM');
  $('#rpm-bar').style.width=Math.min(100,race.player.rpm/7900*100)+'%';
  $('#rpm-bar').style.background=race.player.rpm>7000?'var(--red)':'var(--green)';
  setText('race-time',UI.time(race.time));setText('race-condition',Math.ceil(race.player.condition)+'%');setText('race-fuel',Math.ceil(race.player.fuel)+'%');
  setText('position-label',race.status==='countdown'?'AT THE LINE':race.player.distance>=race.opponent.distance?'LEADING':'CHASING');
  setText('remaining-label',Math.max(0,Math.ceil(race.course.length-race.player.distance))+' M');
  $('#player-progress').style.width=Math.min(100,race.player.distance/race.course.length*100)+'%';
  $('#opponent-progress').style.width=Math.min(100,race.opponent.distance/race.course.length*100)+'%';
  const show=race.status==='countdown'||(race.status==='running'&&race.time<1.1);
  $('#race-message').hidden=!show;
  setText('race-countdown',race.status==='countdown'?Math.ceil(race.countdown):'GO');
  setText('race-callout',race.status==='countdown'?'REV IT UP. HOLD YOUR LINE.':race.course.type==='drag'?'FOUR GEARS. ONE LINE.':'READ THE ROAD.');
  if(!ok){setText('drive-hint','CANVAS UNAVAILABLE · USE THE INSTRUMENTS OR PAUSE');canvas.setAttribute('aria-label','Canvas unavailable. Race instruments and pause controls remain available.');}
  for(const el of raceScreen.querySelectorAll('[data-control]')){
    const control=el.dataset.control,held=control==='left'?lastInput.steer<0:control==='right'?lastInput.steer>0:lastInput[control]>0;
    const value=String(Boolean(held));if(el.dataset.held!==value)el.dataset.held=value;
  }
}
function sampleInput(){
  const held=name=>[...pointers.values()].includes(name);
  const axis=pad.axis(AXIS.LX),keyboard=(keys.has('ArrowRight')||keys.has('KeyD')||held('right')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')||held('left')?1:0);
  shiftUp ||= pad.pressed(BUTTON.RB);shiftDown ||= pad.pressed(BUTTON.LB);
  return {throttle:Math.max(keys.has('ArrowUp')||keys.has('KeyW')||held('throttle')?1:0,pad.value(BUTTON.RT)),brake:Math.max(keys.has('ArrowDown')||keys.has('KeyS')||keys.has('Space')||held('brake')?1:0,pad.value(BUTTON.LT)),steer:Math.abs(keyboard)>Math.abs(axis)?keyboard:axis,shiftUp,shiftDown};
}
function frame(timestamp){
  const dt=lastFrame?Math.max(0,(timestamp-lastFrame)/1000):0;lastFrame=timestamp;
  pad.poll();
  if(race&&!paused&&!raceSettled&&pad.lost){pauseRace();toast('Controller disconnected. The run is paused; reconnect or use the keyboard or touch controls.');}
  if(race&&!dialog.open&&pad.pressed(BUTTON.START)){if(paused)resumeRace();else pauseRace();}
  if(race&&!paused&&!raceSettled&&!dialog.open){
    const input=sampleInput();lastInput=input;
    clock.advance(dt,step=>{stepRace(race,input,step);shiftUp=false;shiftDown=false;input.shiftUp=false;input.shiftDown=false;});
    if(race.player.gear!==previousGear){audio.cue('shift');previousGear=race.player.gear;}
    const countdown=Math.ceil(race.countdown);
    if(race.status==='countdown'&&countdown!==previousCountdown){audio.cue('countdown');previousCountdown=countdown;}
    if(race.status==='running'&&previousStatus==='countdown')audio.cue('start');
    previousStatus=race.status;
    const event=race.events.at(-1),eventKey=event?event.time+':'+event.message:'';
    if(event&&eventKey!==lastEvent){lastEvent=eventKey;if(/clipped/.test(event.message)){audio.cue('crash');toast(event.message);}}
    if(timestamp-lastPaint>=1000/60-.5){paintRace();lastPaint=timestamp;}
    if(race.status==='finished')finishRace();
  }
  if(!document.hidden&&!paused)audio.update(raceSettled?null:race);
  requestAnimationFrame(frame);
}

async function handleAction(button){
  const action=button.dataset.action;
  if(action==='close'){if(activeDialog==='result')exitRace('garage');else closeDialog();return;}
  if(action==='sound'){await soundEnabled(!audio.state.enabled);return;}
  if(action==='settings'){if(!race)settings();return;}
  if(action==='help'){showDialog('Driver’s handbook',UI.help,'help');return;}
  if(action==='save-menu'){if(!race)saveMenu();return;}
  if(action==='export'){download(`street-racer-day-${career.day}.json`,serializeSave(career));toast('Career exported. Keep it somewhere safe.');return;}
  if(action==='export-rejected'){download('street-racer-unreadable-save.json',rejectedSave);return;}
  if(action==='import'){$('#import-file').value='';$('#import-file').click();return;}
  if(action==='import-confirm'&&pendingImport){career=pendingImport;pendingImport=null;loadMessage='';closeDialog();saveCareer();setView('garage');toast('Career imported. Welcome back.');return;}
  if(action==='reset-career'){showDialog('Start over?',`<p>This replaces the current career on this device. Export a backup first if you want to keep your cars and progress.</p><div class="dialog-actions"><button data-action="export">Export current career</button><button data-action="close">Keep playing</button><button class="danger" data-action="reset-confirm">Start a fresh career</button></div>`,'reset');return;}
  if(action==='reset-confirm'){career=createCareer();loadMessage='';closeDialog();saveCareer();setView('garage');toast('A fresh start. Your story begins here.');return;}
  if(action==='credits'){
    showDialog('Made from good parts.',`<div class="eyebrow">QSOL-IMC · STREET RACER</div><p>An original garage and racing game inspired by the buy, build and race loop of classic Street Rod. All vehicles, rivals, scenery and game artwork are original.</p><h3>The engine room</h3><p><strong>VANILLAJS</strong> supplies the fixed-step clock. <strong>GAMES</strong> supplies standard gamepad input. <strong>E8_MUSIC</strong> supplies the root projection used to compose the musical phrases. <strong>SONIFICATION</strong> supplies the plucked-string instrument. <strong>ARCADE</strong> supplies seeded sound noise.</p><p style="margin-top:15px">The music is an artistic mapping, not a scientific claim. Full source commits, hashes and retained licences are available in the repository.</p><div class="dialog-actions"><a href="https://github.com/QSOLKCB/STREET-RACER" target="_blank" rel="noopener noreferrer">Source & licences ↗</a><button class="primary" data-action="close">Back to the shop</button></div>`,'credits');return;
  }
  if(action==='buy'){if(runAction({type:'buy',modelId:button.dataset.model}))setView('garage');return;}
  if(action==='select'){runAction({type:'select',carId:button.dataset.carId});return;}
  if(['service','refuel','work'].includes(action)){runAction({type:action});return;}
  if(action==='upgrade'){runAction({type:'upgrade',slot:button.dataset.slot});return;}
  if(action==='paint'){runAction({type:'paint',color:button.dataset.color});return;}
  if(action==='sell'){
    const car=career.cars.find(c=>c.uid===button.dataset.carId);if(!car)return;
    showDialog('Make room for the next project?',`<p>Sell your ${UI.esc(UI.displayCar(car).name)}, including its installed parts, for <strong>${UI.money(saleValue(car))}</strong>.</p><div class="dialog-actions"><button data-action="close">Keep the car</button><button class="danger" data-action="sell-confirm" data-car-id="${car.uid}">Sell the car</button></div>`,'sell');return;
  }
  if(action==='sell-confirm'){closeDialog();runAction({type:'sell',carId:button.dataset.carId});return;}
  if(action==='challenge'){challenge(button.dataset.rival);return;}
  if(action==='practice'){challenge(RIVALS[0].id,true);return;}
  if(action==='race-launch'){launchChallenge();return;}
  if(action==='pink-back'){challenge(challengeId);return;}
  if(action==='pink-confirm'){beginRace(raceOptions);return;}
  if(action==='pause'){pauseRace();return;}
  if(action==='resume'){resumeRace();return;}
  if(action==='restart'){if(race&&!raceSettled)beginRace(raceOptions);return;}
  if(action==='retire'){retireDialog();return;}
  if(action==='retire-confirm'){closeDialog();forfeitRace(race);paused=false;finishRace();return;}
  if(action==='race-exit'){exitRace('garage');return;}
  if(action==='race-meet'){exitRace('meet');return;}
  if(action==='race-recover'){exitRace('classifieds');return;}
  if(action==='shift-up'){shiftUp=true;return;}
  if(action==='shift-down'){shiftDown=true;return;}
  if(action==='fullscreen'){
    try{if(document.fullscreenElement)await document.exitFullscreen();else if(raceScreen.requestFullscreen)await raceScreen.requestFullscreen();else toast('Fullscreen is unavailable in this browser.');}
    catch{toast('Fullscreen was not available. The race still works in this window.');}queueDraw();
  }
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.view){setView(button.dataset.view);return;}
  if(button.dataset.action)handleAction(button).catch(error=>toast(error.message||'That action could not be completed.',true));
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='tune-form')return;
  event.preventDefault();runAction({type:'tune',value:Number($('#tune-range').value)});
});
document.addEventListener('input',event=>{
  if(event.target.id==='tune-range')setText('tune-value',UI.tuneLabel(Number(event.target.value)));
  if(event.target.id==='setting-volume'){preferences.volume=Number(event.target.value);audio.setVolume(preferences.volume);setText('volume-label',Math.round(preferences.volume*100)+'%');savePreferences();}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.name==='course'&&COURSES.some(c=>c.id===el.value))ui.courseId=el.value;
  if(el.id==='setting-sound')soundEnabled(el.checked);
  if(el.id==='setting-transmission'){preferences.transmission=el.value==='manual'?'manual':'auto';savePreferences();}
  if(el.id==='setting-contrast'){preferences.contrast=el.checked;savePreferences();}
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>64*1024){toast('Save files must be smaller than 64 KiB. Your career has not changed.',true);return;}
  const generation=dialogGeneration;
  try{
    const imported=parseSave(await file.text());
    // The input may complete after a different dialog was opened; keep the
    // current career intact and require the explicit import confirmation.
    if(race||generation!==dialogGeneration){toast('Import cancelled because you moved to another screen. Choose the file again when ready.');return;}
    pendingImport=imported;
    showDialog('Bring this garage home?',`<p>This replaces the career on this device with the imported garage.</p><div class="result-grid"><div><span>CASH</span><strong>${UI.money(imported.cash)}</strong></div><div><span>REPUTATION</span><strong>${imported.rep}</strong></div><div><span>CARS</span><strong>${imported.cars.length} / 4</strong></div><div><span>DAY</span><strong>${imported.day}</strong></div></div><div class="dialog-actions"><button data-action="export">Export current first</button><button data-action="close">Cancel</button><button class="primary" data-action="import-confirm">Import this career</button></div>`,'import');
  }catch(error){toast(`Save rejected: ${error.message} Your current career is unchanged.`,true);}
});
dialog.addEventListener('cancel',event=>{event.preventDefault();if(activeDialog==='result')exitRace('garage');else closeDialog();});

const drivingKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyQ','Escape','KeyP','KeyR']);
document.addEventListener('keydown',event=>{
  if(!race&&audio.state.enabled&&!event.metaKey&&!event.ctrlKey&&!event.altKey)audio.resume().catch(()=>{});
  if(!race||raceSettled||dialog.open||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||event.target.isContentEditable)return;
  if(!drivingKeys.has(event.code))return;
  event.preventDefault();
  if(event.code==='Escape'||event.code==='KeyP'){
    if(!event.repeat){if(paused)resumeRace();else pauseRace();}return;
  }
  if(event.code==='KeyR'){if(!event.repeat)beginRace(raceOptions);return;}
  if(paused)return;
  keys.add(event.code);
  if(event.code==='KeyE'&&!event.repeat)shiftUp=true;
  if(event.code==='KeyQ'&&!event.repeat)shiftDown=true;
});
document.addEventListener('keyup',event=>{keys.delete(event.code);});
raceScreen.addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-control]');
  if(!button||!race||paused||raceSettled||dialog.open)return;
  event.preventDefault();pointers.set(event.pointerId,button.dataset.control);
  try{button.setPointerCapture(event.pointerId);}catch{/* Pointer may already have ended. */}
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])raceScreen.addEventListener(type,event=>{pointers.delete(event.pointerId);});
function focusLost(){clearInput();if(race&&!raceSettled)pauseRace();else audio.suspend().catch(()=>{});}
window.addEventListener('blur',focusLost);
document.addEventListener('visibilitychange',()=>{if(document.hidden)focusLost();});
// A deliberate interaction resumes menu audio after a focus pause; the race
// itself remains paused until the driver explicitly presses Resume.
document.addEventListener('pointerdown',()=>{if(!race&&audio.state.enabled)audio.resume().catch(()=>{});},{passive:true});
window.addEventListener('resize',queueDraw);
document.addEventListener('fullscreenchange',queueDraw);
if(typeof ResizeObserver==='function')new ResizeObserver(queueDraw).observe(main);
window.addEventListener('beforeunload',event=>{if(!storageOK&&career.revision>0){event.preventDefault();event.returnValue='';}});

// Observation only: callers receive copies, never the live career or race.
Object.defineProperty(globalThis,'__streetRacer',{get:()=>structuredClone({version:'0.1.0',view:ui.view,career,race,paused,input:lastInput,audio:audio.state,preferences,storageOK,clock:{ticks:clock.ticks,accumulator:clock.accumulator}})});
savePreferences();render();
if(!storageOK)$('#save-status').textContent='EXPORT YOUR CAREER TO KEEP IT';
requestAnimationFrame(frame);
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{toast('Offline installation was unavailable. The game still works while this page is open.',true);});
}
