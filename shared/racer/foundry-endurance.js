// SPDX-License-Identifier: Apache-2.0
// RACING-003 adapter: pinned, independently validated VANILLAJS track.v1 packs.
// Four continuous 4.8 km legs create a 19.2 km authored road with 12 choices.
// Native editor packs are data only; no embedded scripts or CDN dependencies.
import {starterTrack,validateTrack,parseTrackJSON,serializeTrack,SECTION_LENGTH,
  TRACK_TOTAL_LENGTH,trackCenter,trackHalfWidth,trackHeading,
  chooseTourFork,environmentTheme} from '../../vendor/vanillajs/demos/racing-lab/track.js';

export {starterTrack,validateTrack,parseTrackJSON,serializeTrack,environmentTheme};
export const FOUNDRY_LEGS=4,FOUNDRY_FORKS_PER_LEG=3;
export const FOUNDRY_TOTAL=TRACK_TOTAL_LENGTH*FOUNDRY_LEGS;
export const FOUNDRY_FORKS=FOUNDRY_FORKS_PER_LEG*FOUNDRY_LEGS;
export const TRACK_STORAGE_KEY='street-racer.foundry-track.v1';
const bounded=(value,min,max)=>Math.max(min,Math.min(max,value));

function checkRoute(route){
  if(!Array.isArray(route)||route.length>FOUNDRY_FORKS||
     route.some(x=>x!=='left'&&x!=='right'))throw new TypeError('invalid 12-fork route history');
}
export function foundryLeg(distance){
  if(!Number.isFinite(distance))throw new RangeError('non-finite track distance');
  const d=bounded(distance,0,FOUNDRY_TOTAL);
  const leg=Math.min(FOUNDRY_LEGS-1,Math.floor(d/TRACK_TOTAL_LENGTH));
  return {leg,local:d-leg*TRACK_TOTAL_LENGTH};
}
export function foundryCenter(pack,distance,route=[]){
  checkRoute(route);
  const {leg,local}=foundryLeg(distance);
  let base=0;
  for(let k=0;k<leg;k++)
    base+=trackCenter(pack,TRACK_TOTAL_LENGTH,route.slice(k*3,k*3+3));
  return base+trackCenter(pack,local,route.slice(leg*3,leg*3+3));
}
export function foundryWidth(pack,distance){
  const {leg,local}=foundryLeg(distance);
  const width=trackHalfWidth(pack,local);
  if(leg===0||local>=SECTION_LENGTH/5)return width;
  const previous=trackHalfWidth(pack,TRACK_TOTAL_LENGTH);
  const t=local/(SECTION_LENGTH/5),smooth=t*t*(3-2*t);
  return previous+(width-previous)*smooth;
}
export function foundryHeading(pack,distance,route=[]){
  return Math.atan2(foundryCenter(pack,distance+2,route)-
    foundryCenter(pack,distance-2,route),4);
}
export function foundryForkAt(index){
  if(!Number.isInteger(index)||index<0||index>=FOUNDRY_FORKS)
    throw new RangeError('invalid fork index');
  // Three decisions per four-stage leg: no fork at the between-leg seam.
  const leg=Math.floor(index/3),within=index%3;
  return leg*TRACK_TOTAL_LENGTH+(within+1)*SECTION_LENGTH;
}
export function foundryChoice(pack,route,playerLane){
  checkRoute(route);
  if(!Number.isFinite(playerLane))throw new RangeError('non-finite steering lane');
  // Driver position is maintained relative to the current road centreline.
  // Both branches diverge continuously after the gate; no teleport at commit.
  const choice=playerLane<0?'left':'right';
  const {leg}=foundryLeg(foundryForkAt(route.length));
  const local=route.slice(leg*3);
  // Exercise the same helper used by VANILLAJS's editor/driver contract.
  if(chooseTourFork(pack,local,trackCenter(pack,
    (route.length%3+1)*SECTION_LENGTH,local)+playerLane)!==choice)
    throw new Error('inconsistent track fork classification');
  return choice;
}
export function foundryLateralMetres(pack,distance,lane,tyreHalfWidth=1.57){
  if(!Number.isFinite(lane))throw new RangeError('non-finite lateral lane');
  return lane*Math.max(1,foundryWidth(pack,distance)-tyreHalfWidth);
}
export function foundryEnvironmentTrack(pack,configTracks){
  // Scene colours are an original renderer choice; validated pack metadata
  // stays inert and retains the upstream environment vocabulary.
  return configTracks[({coast:'coast',forest:'alpine',canyon:'canyon',night:'desert'})[pack.environment]];
}
export function loadTrackFromSession(session){
  if(!session||typeof session.getItem!=='function')return null;
  const raw=session.getItem(TRACK_STORAGE_KEY);
  return raw===null?null:parseTrackJSON(raw);
}
