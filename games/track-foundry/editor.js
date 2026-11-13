// SPDX-License-Identifier: Apache-2.0
// Offline-first, inert-data Track Foundry editor and playable Q16.16 circuit.
// No dynamic source loading, eval, remote service, or implicit save mutations.
import {starterTrack,validateTrack,parseTrackJSON,serializeTrack,
  TRACK_STORAGE_KEY,foundryCenter,foundryWidth} from '../../shared/racer/foundry.js';
import {SECTION_LENGTH,TRACK_TOTAL_LENGTH,trackCenter} from '../../vendor/vanillajs/racing-track/track.js';
import {createCircuit,tickCircuit,circuitSnapshot} from '../../shared/racer/circuit.js';
import {FixedClock} from '../../vendor/vanillajs/modules/time/index.js';
const $=id=>document.getElementById(id),canvas=$('track-preview'),ctx=canvas.getContext('2d');
if(!ctx)throw new Error('Track Foundry requires Canvas2D');
const name=$('track-name'),environment=$('track-environment'),target=$('track-target'),
  sections=$('track-sections'),gates=$('track-gates'),status=$('track-message'),
  telemetry=$('telemetry'),hint=$('drive-hint'),driveButton=$('circuit-drive'),
  pauseButton=$('circuit-pause'),picker=$('track-import'),preset=$('track-preset');
const clone=value=>JSON.parse(JSON.stringify(value));
let draft=clone(starterTrack()),lastValid=starterTrack(),revision=0,dragGate=-1;
let circuit=null,running=false,raf=null,lastTime=null;
const keys=new Set(),clock=new FixedClock({step:1/60,maxSteps:12});
function note(message,invalid=false){status.textContent=message;status.dataset.invalid=String(invalid);}
function valid(){
  try{const pack=validateTrack(draft);lastValid=pack;return pack;}
  catch(error){note('INVALID: '+error.message,true);return null;}
}
function field(label,kind,index,key,value,min,max,step='1'){
  const wrap=document.createElement('label'),input=document.createElement('input');
  wrap.textContent=label;
  Object.assign(input,{type:'number',min:String(min),max:String(max),step,value:String(value)});
  input.dataset[kind]=String(index);input.dataset.property=key;
  input.setAttribute('aria-label',(kind==='section'?'Section ':'Gate ')+(index+1)+' '+label);
  wrap.append(input);return wrap;
}
function fillForm(){
  name.value=draft.name;environment.value=draft.environment;
  sections.replaceChildren();
  for(const [index,section] of draft.sections.entries()){
    const row=document.createElement('div');row.className='section-row';
    const title=document.createElement('strong');title.textContent='STAGE '+(index+1);
    const group=document.createElement('div');group.className='section-fields';
    group.append(field('CURVE','section',index,'curve',section.curve,-1,1,'.05'),
      field('WIDTH','section',index,'width',section.width,8,16,'.5'),
      field('FORK','section',index,'fork',section.fork,6,14,'.5'));
    row.append(title,group);sections.append(row);
  }
  gates.replaceChildren();
  for(const [index,gate] of draft.gates.entries()){
    const row=document.createElement('div');row.className='gate-row';
    const title=document.createElement('strong');title.textContent='G'+(index+1);
    const group=document.createElement('div');group.className='gate-fields';
    group.append(field('X','gate',index,'x',gate.x,-70,70),
      field('Z','gate',index,'z',gate.z,-70,70));
    row.append(title,group);gates.append(row);
  }
  draw();
}
function pauseCircuit(message){
  if(!running)return;
  running=false;clock.setPaused(true);keys.clear();lastTime=null;
  if(raf!==null){cancelAnimationFrame(raf);raf=null;}
  driveButton.textContent='RESUME CIRCUIT';pauseButton.disabled=true;
  if(message)note(message);
  draw();
}
function changed(){
  revision++;
  // A paused (or running) circuit owns an immutable snapshot of its gates and
  // width. Never resume that old snapshot after any draft edit, including a
  // temporarily invalid numeric value. A plain pause without editing keeps
  // its existing progress.
  const hadCircuit=circuit!==null;
  pauseCircuit('Track edited; circuit stopped');
  if(hadCircuit){
    circuit=null;
    driveButton.textContent='DRIVE CIRCUIT';
    pauseButton.disabled=true;
    keys.clear();
    clock.reset();
    clock.setPaused(true);
    lastTime=null;
  }
  const pack=valid();
  if(pack)note('VALID: '+pack.name+' · '+(hadCircuit?
    'Circuit reset; DRIVE starts on the edited geometry':
    'four sections · eight circuit gates'));
  draw();
}
function coordX(x){return canvas.width/2+x*3;}
function coordY(z){return canvas.height/2+z*3;}
function ground(){
  ctx.fillStyle='#061726';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#183547';ctx.lineWidth=1;
  for(let x=0;x<canvas.width;x+=64){
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();
  }
  for(let y=0;y<canvas.height;y+=64){
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();
  }
}
function drawTour(pack){
  $('preview-title').textContent='PHYSICAL TOUR / 8 DISTINCT ROUTE HISTORIES';
  $('preview-position').textContent='4 × 4,800 m · 19.2 km';
  const x=s=>40+s/TRACK_TOTAL_LENGTH*(canvas.width-80);
  const y=value=>canvas.height/2-value*2.15;
  const histories=Array.from({length:8},(_,bits)=>[0,1,2].map(i=>(bits>>i)&1?'right':'left'));
  for(const [index,route]of histories.entries()){
    const primary=index===0;
    for(const side of [-1,1]){
      ctx.beginPath();
      for(let s=0;s<=TRACK_TOTAL_LENGTH;s+=30){
        const v=trackCenter(pack,s,route)+side*foundryWidth(pack,s);
        if(s===0)ctx.moveTo(x(s),y(v));else ctx.lineTo(x(s),y(v));
      }
      ctx.strokeStyle=primary?(side<0?'#ffa67c':'#77f1d9'):'rgba(106,157,172,.44)';
      ctx.lineWidth=primary?2.6:1;ctx.stroke();
    }
    ctx.beginPath();
    for(let s=0;s<=TRACK_TOTAL_LENGTH;s+=30){
      const px=x(s),py=y(trackCenter(pack,s,route));
      if(s===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.strokeStyle=primary?'#fff1ce':'rgba(175,217,219,.48)';
    ctx.lineWidth=primary?2.4:1.1;ctx.stroke();
  }
  ctx.setLineDash([7,6]);ctx.strokeStyle='#ffc785';
  for(let step=1;step<4;step++){const px=x(step*SECTION_LENGTH);
    ctx.beginPath();ctx.moveTo(px,45);ctx.lineTo(px,canvas.height-40);ctx.stroke();}
  ctx.setLineDash([]);
  ctx.textAlign='left';ctx.fillStyle='#d5e9f2';ctx.font='bold 15px monospace';
  ctx.fillText(pack.name.toUpperCase()+' / '+pack.environment.toUpperCase(),22,29);
  ctx.fillStyle='#a6cfce';ctx.font='14px monospace';
  ctx.fillText('Each four-stage leg is repeated with new fork decisions.',22,canvas.height-24);
}
function drawCircuit(pack){
  $('preview-title').textContent='EDITABLE CIRCUIT / DRAG THE GATES';
  $('preview-position').textContent=circuit?'LAP '+circuit.lap+' / '+circuit.laps:'8 ordered gates · 10-lap drive';
  ctx.lineWidth=pack.sections[0].width*6;
  ctx.lineJoin='round';ctx.strokeStyle='rgba(29,99,103,.62)';
  ctx.beginPath();
  for(const [i,g]of pack.gates.entries()){
    if(!i)ctx.moveTo(coordX(g.x),coordY(g.z));else ctx.lineTo(coordX(g.x),coordY(g.z));
  }
  ctx.closePath();ctx.stroke();
  ctx.lineWidth=4;ctx.strokeStyle='#91dccb';ctx.stroke();
  for(const [i,g]of pack.gates.entries()){
    const px=coordX(g.x),py=coordY(g.z);
    ctx.beginPath();ctx.arc(px,py,11,0,Math.PI*2);
    ctx.fillStyle=i===dragGate?'#ffd88b':i===circuit?.gateIndex?'#ffab82':'#47dfcf';
    ctx.fill();ctx.strokeStyle='#071421';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#061723';ctx.textAlign='center';ctx.font='bold 13px monospace';
    ctx.fillText(String(i+1),px,py+5);
  }
  if(circuit){
    const state=circuitSnapshot(circuit),x=coordX(state.x),y=coordY(state.z);
    ctx.save();ctx.translate(x,y);ctx.rotate(state.yaw);
    ctx.fillStyle='#f7eeb9';ctx.beginPath();
    ctx.moveTo(0,-18);ctx.lineTo(11,13);ctx.lineTo(-11,13);ctx.closePath();
    ctx.fill();ctx.restore();
    telemetry.textContent='SPEED '+state.kmh+' KM/H · LAP '+state.lap+'/'+circuit.laps;
    hint.textContent='NEXT GATE '+(state.gate+1)+' · '+state.status.toUpperCase();
  }else{
    telemetry.textContent='EDIT 8 GATES · G1 → G8 → G1';
    hint.textContent='Move the numbered gates. Gaps ≥24 m; no crossing edges.';
  }
}
function draw(){
  const pack=valid()||lastValid;
  ground();
  if(target.value==='circuit'||circuit)drawCircuit(pack);else drawTour(pack);
}
function updateForm(event){
  const field=event.target.closest?.('input[data-section],input[data-gate]');
  if(!field)return;
  const index=Number(field.dataset.section??field.dataset.gate),
    property=field.dataset.property,value=field.value===''?NaN:Number(field.value);
  if(field.dataset.section!==undefined)draft.sections[index][property]=value;
  else draft.gates[index][property]=value;
  changed();
}
name.addEventListener('input',()=>{draft.name=name.value;changed();});
environment.addEventListener('change',()=>{draft.environment=environment.value;changed();});
sections.addEventListener('input',updateForm);
gates.addEventListener('input',updateForm);
target.addEventListener('change',()=>{pauseCircuit('Changed preview mode');circuit=null;draw();});
const canvasPoint=e=>{const rect=canvas.getBoundingClientRect();return {
  x:(e.clientX-rect.left)/rect.width*canvas.width,
  y:(e.clientY-rect.top)/rect.height*canvas.height};};
canvas.addEventListener('pointerdown',e=>{
  if(target.value!=='circuit'||running)return;
  const p=canvasPoint(e);
  dragGate=draft.gates.findIndex(g=>Math.hypot(coordX(g.x)-p.x,coordY(g.z)-p.y)<18);
  if(dragGate>=0){canvas.setPointerCapture(e.pointerId);draw();e.preventDefault();}
});
canvas.addEventListener('pointermove',e=>{
  if(dragGate<0)return;const p=canvasPoint(e);
  draft.gates[dragGate]={x:Math.max(-70,Math.min(70,Math.round((p.x-canvas.width/2)/3))),
    z:Math.max(-70,Math.min(70,Math.round((p.y-canvas.height/2)/3)))};
  changed();
});
function endDrag(e){
  if(dragGate<0)return;
  dragGate=-1;fillForm();changed();
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
}
for(const action of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(action,endDrag);
function controls(){const has=(...codes)=>codes.some(c=>keys.has(c));
  return {accelerate:has('KeyW','ArrowUp'),brake:has('KeyS','ArrowDown'),
    steer:Number(has('KeyD','ArrowRight'))-Number(has('KeyA','ArrowLeft'))};}
function animate(now){
  raf=null;if(!running)return;
  const dt=lastTime===null?0:Math.max(0,Math.min(.25,(now-lastTime)/1000));lastTime=now;
  clock.advance(dt,()=>tickCircuit(circuit,controls()));
  draw();
  if(circuit.status!=='running'){pauseCircuit(circuit.lastEvent);return;}
  raf=requestAnimationFrame(animate);
}
function startCircuit(pack=valid()){
  if(!pack)return;
  if(!circuit||circuit.status!=='running')circuit=createCircuit(pack,10);
  keys.clear();clock.setPaused(false);lastTime=null;running=true;
  driveButton.textContent='RESTART CIRCUIT';pauseButton.disabled=false;
  note('DRIVING: W/↑ accelerate · S/↓ brake · A/D steer · 10 laps');
  canvas.focus({preventScroll:true});
  if(raf===null)raf=requestAnimationFrame(animate);
}
driveButton.addEventListener('click',()=>{
  const pack=valid();if(!pack)return;
  target.value='circuit';
  // Restart is explicit if a circuit is already running.
  if(running){pauseCircuit();circuit=null;}
  startCircuit(pack);
});
pauseButton.addEventListener('click',()=>pauseCircuit('CIRCUIT PAUSED · Press DRIVE to resume.'));
$('track-apply').addEventListener('click',()=>{
  const pack=valid();if(!pack)return;
  if(target.value==='circuit'){circuit=null;startCircuit(pack);return;}
  const targetPath=target.value==='coast'?'../coast-run/':'../coastal-sprint/';
  try{sessionStorage.setItem(TRACK_STORAGE_KEY,serializeTrack(pack));
    window.location.assign(targetPath);
  }catch(error){note('Cannot save the track to session storage: '+error.message,true);}
});
$('track-export').addEventListener('click',()=>{
  const pack=valid();if(!pack)return;
  const url=URL.createObjectURL(new Blob([serializeTrack(pack)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='street-racer-track-v1.json';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  note('Exported validated, inert-data track JSON');
});
picker.addEventListener('change',async()=>{
  const file=picker.files?.[0],stamp=++revision;
  if(!file)return;
  try{
    if(file.size>16*1024)throw new RangeError('track JSON exceeds 16 KiB');
    const value=parseTrackJSON(await file.text());
    if(stamp!==revision)return; // stale file reads cannot overwrite edits
    pauseCircuit('New track imported');circuit=null;
    draft=clone(value);fillForm();note('Imported '+value.name+' · review before driving');
  }catch(error){if(stamp===revision)note('Import rejected: '+error.message,true);}
  finally{picker.value='';}
});
preset.addEventListener('change',async()=>{
  const selected=preset.value,stamp=++revision;
  try{
    const value=selected==='starter'?starterTrack():
      parseTrackJSON(await (await fetch('./presets/'+selected+'.json')).text());
    if(stamp!==revision)return;
    pauseCircuit('Preset changed');circuit=null;
    draft=clone(value);fillForm();note('Loaded '+value.name+' · review and drive');
  }catch(error){if(stamp===revision)note('Preset unavailable: '+error.message,true);}
});
$('track-reset').addEventListener('click',()=>{
  revision++;pauseCircuit('Restored starter');circuit=null;
  draft=clone(starterTrack());preset.value='starter';fillForm();
  note('Restored source-pinned VANILLAJS starter pack');
});
document.addEventListener('keydown',e=>{
  if(!running||e.target.matches?.('input,select,textarea'))return;
  if(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){
    keys.add(e.code);e.preventDefault();
  }else if(e.code==='Escape'){pauseCircuit('PAUSED');e.preventDefault();}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
document.querySelector('.settings-panel').addEventListener('focusin',()=>{
  if(running)pauseCircuit('Circuit paused while editing');
});
window.addEventListener('blur',()=>pauseCircuit('Focus lost · circuit paused'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseCircuit('Tab hidden')});
window.addEventListener('pagehide',()=>pauseCircuit());
fillForm();note('VANILLAJS track.v1 starter loaded · edit, validate, drive or export');

// Register the same root-scoped content-addressed worker when the editor
// is reached directly; local import/export never leaves this origin.
if('serviceWorker' in navigator&&
   (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))
  navigator.serviceWorker.register('../../sw.js').catch(()=>{});
