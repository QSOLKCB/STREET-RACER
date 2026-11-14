// SPDX-License-Identifier: Apache-2.0
// RACING-003: local, inert Track Foundry authoring, no remote requests.
import {starterTrack,validateTrack,parseTrackJSON,serializeTrack,storeSelectedTrack,
  MAX_TRACK_BYTES,TRACK_TOTAL_LENGTH,Q,tourCenterQ,compileTrack,circuitPositionQ
} from './foundry.js';

const $=id=>document.getElementById(id);
const page={name:$('track-name'),environment:$('environment'),mode:$('target-mode'),
  sections:$('section-editor'),gates:$('gate-editor'),preview:$('course-preview'),
  status:$('foundry-status'),import:$('import-track')};
const ctx=page.preview.getContext('2d');
const fresh=()=>JSON.parse(JSON.stringify(starterTrack()));
let draft=fresh(),generation=0,drag=-1;
const targets={coast:'../coast-run/',sprint:'../coastal-sprint/',supercar:'../supercar-circuit/'};
function note(message,invalid=false){
  page.status.textContent=message;page.status.dataset.invalid=String(invalid);
}
const checked=()=>{try{return validateTrack(draft)}
  catch(error){note(error.message,true);return null;}};
const coords=event=>{
  const r=page.preview.getBoundingClientRect();
  return {x:(event.clientX-r.left)/r.width*page.preview.width,
    y:(event.clientY-r.top)/r.height*page.preview.height};
};
function populate(){
  page.name.value=draft.name;page.environment.value=draft.environment;
  page.sections.replaceChildren();page.gates.replaceChildren();
  draft.sections.forEach((section,i)=>{
    const row=document.createElement('div');row.className='edit-row';
    const strong=document.createElement('strong');strong.textContent='STAGE '+(i+1);row.append(strong);
    for(const [key,min,max,step] of [['curve',-1,1,.05],['width',8,16,.5],['fork',6,14,.5]]){
      const label=document.createElement('label');label.textContent=key.toUpperCase();
      const input=document.createElement('input');
      Object.assign(input,{type:'number',min:String(min),max:String(max),step:String(step),value:String(section[key])});
      input.dataset.section=String(i);input.dataset.key=key;label.append(input);row.append(label);
    }
    page.sections.append(row);
  });
  draft.gates.forEach((g,i)=>{
    const row=document.createElement('label');row.className='gate-row';row.textContent='G'+(i+1);
    for(const key of ['x','z']){
      const field=document.createElement('input');
      Object.assign(field,{type:'number',min:'-70',max:'70',step:'1',value:String(g[key])});
      field.dataset.gate=String(i);field.dataset.key=key;
      field.setAttribute('aria-label','Gate '+(i+1)+' '+key.toUpperCase());row.append(field);
    }
    page.gates.append(row);
  });
  draw();
}
function applyEdit(update){
  generation++;update();
  const validated=checked();
  if(validated){note('Valid draft · '+validated.name);draw();}
}
page.name.addEventListener('input',()=>applyEdit(()=>{draft.name=page.name.value;}));
page.environment.addEventListener('change',()=>applyEdit(()=>{draft.environment=page.environment.value;}));
page.mode.addEventListener('change',draw);
function numerical(group,kind){
  const handler=event=>{
    const el=event.target;if(!(el instanceof HTMLInputElement))return;
    const index=Number(el.dataset[kind]),key=el.dataset.key;
    if(!Number.isInteger(index)||index<0||index>=(kind==='gate'?8:4))return;
    if(!(kind==='gate'?['x','z']:['curve','width','fork']).includes(key))return;
    applyEdit(()=>{draft[kind==='gate'?'gates':'sections'][index][key]=el.valueAsNumber;});
  };
  for(const event of ['input','change'])group.addEventListener(event,handler);
}
numerical(page.sections,'section');numerical(page.gates,'gate');
const gatePixel=g=>({x:page.preview.width/2+g.x*2.2,y:page.preview.height/2+g.z*2.2});
function draw(){
  if(!ctx)return;
  const w=page.preview.width,h=page.preview.height;
  ctx.fillStyle='#0a1c2b';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#244154';ctx.lineWidth=1;ctx.setLineDash([]);
  for(let x=30;x<w;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=30;y<h;y+=45){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.font='12px monospace';ctx.fillStyle='#a7cbd6';ctx.textAlign='left';
  ctx.fillText('QSOL-IMC / '+page.mode.value.toUpperCase()+' / '+draft.environment.toUpperCase(),15,24);
  if(page.mode.value==='supercar'){
    page.gates.hidden=false;
    ctx.lineWidth=18;ctx.strokeStyle='#477b88';ctx.lineJoin='round';ctx.beginPath();
    draft.gates.forEach((g,i)=>{const p=gatePixel(g);if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
    ctx.closePath();ctx.stroke();
    ctx.lineWidth=2;ctx.strokeStyle='#b8f8ee';ctx.stroke();
    draft.gates.forEach((g,i)=>{const p=gatePixel(g);
      ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fillStyle=i===drag?'#ffd089':'#6de2ce';ctx.fill();
      ctx.fillStyle='#041923';ctx.font='bold 10px monospace';ctx.fillText(String(i+1),p.x-3,p.y+3);
    });
  }else{
    page.gates.hidden=true;
    let compiled;try{compiled=compileTrack(draft);}catch{return;}
    const paths=page.mode.value==='coast'?Array.from({length:8},(_,mask)=>
      [0,1,2].map(bit=>(mask>>bit)&1?'right':'left')):[[]];
    const xs=m=>25+(m/TRACK_TOTAL_LENGTH)*(w-50),ys=v=>h/2-v*2.7;
    paths.forEach((route,i)=>{
      ctx.lineWidth=i===0?2.8:1.3;ctx.strokeStyle=i===0?'#a1f6d9':'#476f83';
      ctx.beginPath();for(let m=0;m<=TRACK_TOTAL_LENGTH;m+=12){
        const y=ys(tourCenterQ(compiled,Math.round(m*Q),route)/Q);
        if(m===0)ctx.moveTo(xs(m),y);else ctx.lineTo(xs(m),y);
      }ctx.stroke();
    });
    ctx.font='10px monospace';ctx.fillStyle='#ffdd91';
    for(let stage=1;stage<4;stage++){
      const x=xs(stage*1200);ctx.setLineDash([3,5]);
      ctx.beginPath();ctx.moveTo(x,40);ctx.lineTo(x,h-20);ctx.stroke();ctx.setLineDash([]);
      ctx.fillText('FORK '+stage,x-20,h-12);
    }
    ctx.fillStyle='#8af2de';ctx.fillText(page.mode.value==='sprint'?
      'AUTHORED 4,800 M COASTAL SPRINT':'8 DISTINCT BRANCH PATHS · Q16.16 CENTRELINES',15,h-40);
  }
}
page.preview.addEventListener('pointerdown',event=>{
  if(page.mode.value!=='supercar')return;
  const p=coords(event);
  const i=draft.gates.findIndex(g=>{const at=gatePixel(g);return Math.hypot(p.x-at.x,p.y-at.y)<16;});
  if(i<0)return;
  generation++;drag=i;page.preview.setPointerCapture(event.pointerId);draw();
});
page.preview.addEventListener('pointermove',event=>{
  if(drag<0)return;
  const p=coords(event);
  draft.gates[drag].x=Math.round(Math.max(-70,Math.min(70,(p.x-page.preview.width/2)/2.2)));
  draft.gates[drag].z=Math.round(Math.max(-70,Math.min(70,(p.y-page.preview.height/2)/2.2)));
  draw();
});
function stopDrag(){if(drag<0)return;drag=-1;populate();
  if(checked())note('Gate placement valid');}
for(const type of ['pointerup','pointercancel','lostpointercapture'])
  page.preview.addEventListener(type,stopDrag);
$('track-new').addEventListener('click',()=>{generation++;draft=fresh();populate();note('New original course');});
$('clear-track').addEventListener('click',()=>{
  try{localStorage.removeItem('qsol.street-racer.foundry-selected.v1');
    note('Saved course selection cleared. Built-in roads restored.');}
  catch(error){note('Storage unavailable: '+error.message,true);}
});
$('export-track').addEventListener('click',()=>{
  const pack=checked();if(!pack)return;
  const url=URL.createObjectURL(new Blob([serializeTrack(pack)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='street-racer-track-v1.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  note('Exported '+pack.name+' as portable Track Foundry JSON');
});
page.import.addEventListener('change',async()=>{
  const file=page.import.files?.[0],epoch=++generation;
  if(!file)return;
  try{
    if(file.size>MAX_TRACK_BYTES)throw new RangeError('Track file exceeds 16 KiB');
    const pack=parseTrackJSON(await file.text());
    if(epoch!==generation)return;
    draft=JSON.parse(JSON.stringify(pack));populate();note('Imported '+pack.name+' · review and validate before racing');
  }catch(error){if(epoch===generation)note('Import rejected: '+error.message,true);}
  finally{page.import.value='';}
});
$('apply-track').addEventListener('click',()=>{
  const pack=checked(),mode=page.mode.value;if(!pack)return;
  try{
    storeSelectedTrack(localStorage,mode,pack);
    location.href=targets[mode];
  }catch(error){note('Could not apply track: '+error.message,true);}
});
populate();note('Track Foundry ready · data-only, offline, source-pinned');


// Direct editor deep links must install the same verified, root-scoped PWA
// as the games. Browsing and importing local files never requires a worker.
if('serviceWorker' in navigator&&
   (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  navigator.serviceWorker.register('../../sw.js').catch(()=>{});
}
