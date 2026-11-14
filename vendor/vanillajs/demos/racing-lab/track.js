// SPDX-License-Identifier: Apache-2.0
// RACING-002B — inert, bounded, data-only track packs; no DOM, network or ambient state.
export const TRACK_FORMAT='qsol.vanillajs.track.v1';
export const SECTION_LENGTH=1200,TRACK_TOTAL_LENGTH=SECTION_LENGTH*4;
export const ENVIRONMENTS=Object.freeze(['coast','canyon','forest','night']);
export const MAX_TRACK_BYTES=16*1024;
const BENDS=14;
const THEMES=Object.freeze({
  coast:Object.freeze({sky:'#17264a',sunset:'#ffd18c',verge:'#225854',land:[.17,.45,.43]}),
  canyon:Object.freeze({sky:'#51304e',sunset:'#f4b280',verge:'#5e5334',land:[.48,.29,.25]}),
  forest:Object.freeze({sky:'#142c39',sunset:'#9bd8bd',verge:'#244f3b',land:[.19,.38,.28]}),
  night:Object.freeze({sky:'#080e32',sunset:'#a68bd2',verge:'#222b4d',land:[.19,.24,.4]})
});
export function environmentTheme(name){
  if(!Object.hasOwn(THEMES,name))throw new RangeError('unknown track environment');
  return THEMES[name];
}
function exactRecord(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    (Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))
    throw new TypeError(label+' must be a plain record');
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))
    throw new TypeError(label+' has missing, extra or forbidden keys');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(keys.some(k=>!Object.hasOwn(descriptors,k)||!Object.hasOwn(descriptors[k],'value')))
    throw new TypeError(label+' contains accessor fields');
}
// Unlike Array.prototype.map, descriptor-based admission rejects holes and
// never executes caller-defined array getters, overrides or custom prototypes.
function exactArray(value,length,label){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||
    value.length!==length)
    throw new TypeError(label+' must be a dense, ordinary array of length '+length);
  const desc=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(desc);
  if(keys.length!==length+1||!Object.hasOwn(desc,'length'))
    throw new TypeError(label+' has missing, extra or forbidden indices');
  return Array.from({length},(_,i)=>{
    const field=desc[String(i)];
    if(!field||!Object.hasOwn(field,'value'))
      throw new TypeError(label+' contains a hole or accessor element');
    return field.value;
  });
}
function boundedNumber(value,low,high,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)
    throw new RangeError(label+' outside supported range');
  return value;
}
const DEFAULT_GATES=[
  {x:0,z:55},{x:36,z:39},{x:50,z:0},{x:36,z:-39},
  {x:0,z:-55},{x:-36,z:-39},{x:-50,z:0},{x:-36,z:39}
];
export function starterTrack(){
  return validateTrack({
    format:TRACK_FORMAT,version:1,name:'The Long Way Home',environment:'coast',
    sections:[
      {curve:.5,width:12,fork:9},
      {curve:-.8,width:13,fork:12},
      {curve:.7,width:11,fork:10},
      {curve:-.35,width:12,fork:8}
    ],
    gates:DEFAULT_GATES
  });
}
function orientation(a,b,c){
  return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
}
function onSegment(a,b,p){
  if(Math.abs(orientation(a,b,p))>1e-9)return false;
  return p.x>=Math.min(a.x,b.x)-1e-9&&p.x<=Math.max(a.x,b.x)+1e-9&&
    p.z>=Math.min(a.z,b.z)-1e-9&&p.z<=Math.max(a.z,b.z)+1e-9;
}
function intersect(a,b,c,d){
  const u=orientation(a,b,c),v=orientation(a,b,d),
    w=orientation(c,d,a),x=orientation(c,d,b);
  return (u*v<0&&w*x<0)||
    onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
export function validateTrack(source){
  exactRecord(source,['format','version','name','environment','sections','gates'],'track');
  if(source.format!==TRACK_FORMAT||source.version!==1)throw new TypeError('unknown track format/version');
  if(typeof source.name!=='string'||source.name.trim()!==source.name||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,47}$/.test(source.name))
    throw new TypeError('track name must be 1–48 safe characters');
  if(!ENVIRONMENTS.includes(source.environment))throw new RangeError('invalid track environment');
  const sections=exactArray(source.sections,4,'track sections').map((section,i)=>{
    exactRecord(section,['curve','width','fork'],'section '+i);
    return Object.freeze({
      curve:boundedNumber(section.curve,-1,1,'section curve'),
      width:boundedNumber(section.width,8,16,'road half-width'),
      fork:boundedNumber(section.fork,6,14,'branch separation')
    });
  });
  const gates=exactArray(source.gates,8,'circuit gates').map((g,i)=>{
    exactRecord(g,['x','z'],'gate '+i);
    return Object.freeze({
      x:boundedNumber(g.x,-70,70,'gate x'),
      z:boundedNumber(g.z,-70,70,'gate z')
    });
  });
  // Every checkpoint capture radius is 12 m. Two gates closer than 24 m
  // admit stationary multi-gate progression and aren't useful track topology.
  for(let i=0;i<gates.length;i++){
    for(let j=i+1;j<gates.length;j++){
      if(Math.hypot(gates[i].x-gates[j].x,gates[i].z-gates[j].z)<24)
        throw new RangeError('circuit gate centres must be at least 24 m apart');
    }
    const a=gates[i],b=gates[(i+1)%8];
    for(let j=i+2;j<gates.length;j++){
      if(i===0&&j===7)continue; // Only closing neighbours share endpoint 0.
      if(intersect(a,b,gates[j],gates[(j+1)%8]))
        throw new RangeError('circuit edges cannot cross, touch or overlap');
    }
  }
  const validated=Object.freeze({
    format:TRACK_FORMAT,version:1,name:source.name,environment:source.environment,
    sections:Object.freeze(sections),gates:Object.freeze(gates)
  });
  if(new TextEncoder().encode(JSON.stringify(validated)).length>MAX_TRACK_BYTES)
    throw new RangeError('track exceeds 16 KiB');
  return validated;
}
export function parseTrackJSON(text){
  if(typeof text!=='string')throw new TypeError('track import requires JSON text');
  if(new TextEncoder().encode(text).length>MAX_TRACK_BYTES)
    throw new RangeError('track import exceeds 16 KiB');
  return validateTrack(JSON.parse(text));
}
export function serializeTrack(track){
  return JSON.stringify(validateTrack(track),null,2)+'\n';
}
function routeCheck(route){
  if(!Array.isArray(route)||Object.getPrototypeOf(route)!==Array.prototype||
    route.length>3||Array.from({length:route.length},(_,i)=>
      !Object.hasOwn(route,i)||!['left','right'].includes(route[i])).some(Boolean))
    throw new TypeError('route must contain at most three explicit left/right choices');
}
function sample(track,s){
  if(!Number.isFinite(s))throw new RangeError('track distance must be finite');
  const k=Math.min(3,Math.floor(Math.max(0,s)/SECTION_LENGTH));
  const u=Math.min(1,Math.max(0,(s-k*SECTION_LENGTH)/SECTION_LENGTH));
  return {k,u};
}
// The centreline is continuous: road curvature integrates through a section;
// a chosen fork diverges smoothly in the *next* section, rather than teleporting.
export function trackCenter(track,s,route=[]){
  routeCheck(route);
  const {k,u}=sample(track,s);
  let x=0;
  for(let i=0;i<k;i++){
    x+=track.sections[i].curve*BENDS;
    if(i>0&&route[i-1])
      x+=(route[i-1]==='right'?1:-1)*track.sections[i-1].fork;
  }
  x+=track.sections[k].curve*BENDS*u;
  if(k>0&&route[k-1]){
    const a=Math.min(1,u*5),smooth=a*a*(3-2*a);
    x+=(route[k-1]==='right'?1:-1)*track.sections[k-1].fork*smooth;
  }
  return x;
}
export function trackHalfWidth(track,s){
  const {k,u}=sample(track,s);
  const width=track.sections[k].width;
  if(k===0)return width;
  const t=Math.min(1,u*5);
  return track.sections[k-1].width*(1-t)+width*t;
}
export function trackHeading(track,s,route=[]){
  return Math.atan2(trackCenter(track,s+2,route)-trackCenter(track,s-2,route),4);
}

/** Use the same upcoming stage centreline for UI guidance and committed route. */
export function chooseTourFork(track,route,playerX){
  routeCheck(route);
  if(!Number.isFinite(playerX))throw new RangeError('fork lane must be finite');
  const boundary=(route.length+1)*SECTION_LENGTH;
  const center=track?trackCenter(track,boundary,route):0;
  return playerX<center?'left':'right';
}
