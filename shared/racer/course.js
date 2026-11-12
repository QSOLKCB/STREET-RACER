// SPDX-License-Identifier: Apache-2.0
// STREET-RACER adaptations of the source-owned RACING-002 touring/sprint ideas.
// Independent game data and functions; no VANILLAJS demo runtime is copied.
import {TRACKS} from './config.js';
export const TOUR_STAGE_METERS=1300,TOUR_STAGES=4,SPRINT_METERS=3600;
const TRACK_IDS=Object.keys(TRACKS);

export function tourPalette(route=[],startingTrack='coast'){
  if(!TRACK_IDS.includes(startingTrack)||
     !Array.isArray(route)||route.length>3||
     route.some(choice=>choice!=='left'&&choice!=='right')){
    throw new RangeError('invalid touring palette history');
  }
  // A fork advances one or two palettes, never zero. The previous stage
  // cannot reappear, and both choices yield different following palettes.
  const index=route.reduce((before,choice)=>(before+(choice==='left'?1:2))%TRACK_IDS.length,
    TRACK_IDS.indexOf(startingTrack));
  return TRACKS[TRACK_IDS[index]];
}

export function routeBend(meters,route=[]){
  if(!Number.isFinite(meters)||!Array.isArray(route))throw new TypeError('invalid route curve');
  const stage=Math.max(0,Math.floor(meters/TOUR_STAGE_METERS));
  const choice=route[Math.min(stage-1,route.length-1)];
  if(!choice)return 0;
  const direction=choice==='left'?-1:1;
  const section=meters%TOUR_STAGE_METERS;
  return direction*(.24*Math.sin(section/210)+.16*Math.sin(section/82));
}

export function sprintCenter(meters){
  if(!Number.isFinite(meters))throw new TypeError('sprint distance must be finite');
  const s=Math.max(0,Math.min(SPRINT_METERS,meters));
  return 16*Math.sin(s/176)+7.5*Math.sin(s/78)+3*Math.sin(s/39);
}

export function sprintHeading(meters){
  return Math.atan2(sprintCenter(meters+2)-sprintCenter(meters-2),4);
}

// Swept overlap of integer Q16.16 longitudinal positions during one tick.
// Endpoint overlaps and crossed relative trajectories both count. This is
// collision detection, not a continuous full-shape contact-response solver.
export function sweptLongitudinalContact(playerBefore,playerAfter,rivalBefore,rivalAfter,radiusQ){
  if(![playerBefore,playerAfter,rivalBefore,rivalAfter,radiusQ].every(Number.isSafeInteger)||
      radiusQ<0)throw new RangeError('Q16 contact coordinates must be bounded integers');
  const before=rivalBefore-playerBefore,after=rivalAfter-playerAfter;
  return Math.abs(before)<=radiusQ||Math.abs(after)<=radiusQ||
    (before>0&&after<0)||(before<0&&after>0);
}
