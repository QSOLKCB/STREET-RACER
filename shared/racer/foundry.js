// SPDX-License-Identifier: Apache-2.0
// RACING-003: adapt the byte-pinned VANILLAJS Track Foundry data contract to
// STREET-RACER's original safe-integer Q16.16 gameplay. Not a physics import.
import {TRACK_FORMAT,TRACK_TOTAL_LENGTH,SECTION_LENGTH,ENVIRONMENTS,
  MAX_TRACK_BYTES,starterTrack,validateTrack,parseTrackJSON,serializeTrack
} from '../../vendor/vanillajs/demos/racing-lab/track.js';
export {TRACK_FORMAT,TRACK_TOTAL_LENGTH,SECTION_LENGTH,ENVIRONMENTS,
  MAX_TRACK_BYTES,starterTrack,validateTrack,parseTrackJSON,serializeTrack};
export const Q=65536;
export const PLAYER_TYRE_HALF_WIDTH=1.57;
export const PACK_STORAGE_KEY='qsol.street-racer.foundry-selected.v1';
export const FOUNDRY_MODES=Object.freeze(['coast','sprint','supercar']);
const safeInt=n=>Number.isSafeInteger(n);
const quant=n=>Math.round(n*Q);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mul=(a,b,den=Q)=>Number(BigInt(a)*BigInt(b)/BigInt(den));
function safeRecord(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     (Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))
    throw new TypeError(label+' must be a plain object');
}
export function compileTrack(pack){
  const source=validateTrack(pack); // strict, frozen source-owned schema and geometry
  const sections=source.sections.map(s=>Object.freeze({
    curveQ:quant(s.curve),widthQ:quant(s.width),forkQ:quant(s.fork)
  }));
  const gates=source.gates.map(g=>Object.freeze({xQ:quant(g.x),zQ:quant(g.z)}));
  const lengthsQ=[0];let lengthQ=0;
  for(let i=0;i<gates.length;i++){
    const a=gates[i],b=gates[(i+1)%gates.length];
    const step=Math.round(Math.hypot(b.xQ-a.xQ,b.zQ-a.zQ));
    if(!safeInt(step)||step<24*Q)throw new RangeError('invalid quantized circuit segment');
    lengthQ+=step;lengthsQ.push(lengthQ);
  }
  if(!safeInt(lengthQ)||lengthQ<=0)throw new RangeError('circuit perimeter overflow');
  return Object.freeze({
    spec:source,
    sections:Object.freeze(sections),
    gates:Object.freeze(gates),
    lengthsQ:Object.freeze(lengthsQ),
    circuitLengthQ:lengthQ
  });
}
function checkedQ(q,label){
  if(!safeInt(q))throw new RangeError(label+' must be safe-integer Q16.16');
  return q;
}
function checkRoute(route){
  if(!Array.isArray(route)||route.length>3||
    route.some(c=>c!=='left'&&c!=='right'))throw new TypeError('invalid fork history');
}
/** Exact integer centreline position, Q16.16. Smoothstep is evaluated with
 * BigInt intermediate products and truncated toward zero. No float in ticks. */
export function tourCenterQ(compiled,distanceQ,route=[]){
  checkedQ(distanceQ,'distance');checkRoute(route);
  const k=clamp(Math.floor(Math.max(0,distanceQ)/(SECTION_LENGTH*Q)),0,3);
  const remainder=clamp(distanceQ-k*SECTION_LENGTH*Q,0,SECTION_LENGTH*Q);
  const tQ=mul(remainder,Q,SECTION_LENGTH*Q);
  let xQ=0;
  for(let i=0;i<k;i++){
    xQ+=compiled.sections[i].curveQ*14;
    if(i>0&&route[i-1])
      xQ+=(route[i-1]==='right'?1:-1)*compiled.sections[i-1].forkQ;
  }
  xQ+=mul(compiled.sections[k].curveQ*14,tQ);
  if(k>0&&route[k-1]){
    const a=clamp(tQ*5,0,Q);
    const smooth=mul(mul(a,a),3*Q-2*a);
    xQ+=(route[k-1]==='right'?1:-1)*mul(compiled.sections[k-1].forkQ,smooth);
  }
  return checkedQ(xQ,'tour centreline');
}
export function halfWidthQ(compiled,distanceQ){
  checkedQ(distanceQ,'distance');
  const k=clamp(Math.floor(Math.max(0,distanceQ)/(SECTION_LENGTH*Q)),0,3);
  const previous=k>0?compiled.sections[k-1].widthQ:compiled.sections[0].widthQ;
  const current=compiled.sections[k].widthQ;
  const at=Math.max(0,distanceQ-k*SECTION_LENGTH*Q);
  const tQ=clamp(mul(at,Q,SECTION_LENGTH*Q)*5,0,Q);
  return previous+mul(current-previous,tQ);
}
/** Ordered circuit is a 1D track-distance parameter along eight authored
 * planar gate segments. This is not free 2D steering / a rigid-body solver. */
export function circuitPositionQ(compiled,atQ){
  checkedQ(atQ,'circuit distance');
  const total=compiled.circuitLengthQ;
  const d=((atQ%total)+total)%total;
  let index=0;
  while(index<7&&d>=compiled.lengthsQ[index+1])index++;
  const a=compiled.gates[index],b=compiled.gates[(index+1)%8],
    span=compiled.lengthsQ[index+1]-compiled.lengthsQ[index],
    tQ=mul(d-compiled.lengthsQ[index],Q,span);
  return Object.freeze({xQ:a.xQ+mul(b.xQ-a.xQ,tQ),
    zQ:a.zQ+mul(b.zQ-a.zQ,tQ),segment:index});
}
export function roadPositionQ(compiled,mode,distanceQ,route=[]){
  if(mode==='supercar')return circuitPositionQ(compiled,distanceQ);
  const xQ=tourCenterQ(compiled,distanceQ,mode==='coast'?route:[]);
  return Object.freeze({xQ,zQ:-distanceQ,segment:clamp(Math.floor(distanceQ/(SECTION_LENGTH*Q)),0,3)});
}
export function lateralPositionQ(compiled,atQ,laneQ){
  checkedQ(laneQ,'lane');
  return mul(laneQ,halfWidthQ(compiled,atQ)-quant(PLAYER_TYRE_HALF_WIDTH));
}
export function selectedTrackFromStorage(storage,mode){
  if(!FOUNDRY_MODES.includes(mode))return null;
  try{
    const value=storage?.getItem(PACK_STORAGE_KEY);
    if(typeof value!=='string'||value.length>MAX_TRACK_BYTES+200)return null;
    const parsed=JSON.parse(value);
    safeRecord(parsed,'selected pack');
    if(Object.keys(parsed).sort().join(',')!=='mode,track'||
       parsed.mode!==mode)return null;
    return validateTrack(parsed.track);
  }catch{return null;} // Never block the existing built-in game.
}
export function storeSelectedTrack(storage,mode,pack){
  if(!FOUNDRY_MODES.includes(mode))throw new RangeError('unsupported racing game');
  const selected=validateTrack(pack),text=JSON.stringify({mode,track:selected});
  if(text.length>MAX_TRACK_BYTES+200)throw new RangeError('selected pack too large');
  storage.setItem(PACK_STORAGE_KEY,text);
}
export function sourceEnvironmentToGame(name){
  return Object.freeze({coast:'coast',canyon:'canyon',forest:'alpine',night:'desert'})[name];
}
