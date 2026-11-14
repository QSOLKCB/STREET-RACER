// SPDX-License-Identifier: Apache-2.0
// Fixed-step adapter: separates per-tick events from per-frame rendering/audio.
// No DOM or wall-clock dependencies; injectable clock/audio for regression tests.
import {Q,tickRace} from './sim-endurance.js';

export function advanceRaceFrame(clock,race,input,elapsed,audio){
  if(race.status!=='running'){
    audio.silence();
    return {events:[],finished:true};
  }
  const events=[];
  let finished=false;
  clock.advance(elapsed,()=>{
    tickRace(race,input);
    events.push(...race.events);
    if(race.status!=='running'){
      finished=true;
      clock.setPaused(true); // Abort remaining catch-up steps on termination.
      audio.silence();
    }
  });
  // Never schedule a positive engine gain after the terminal silence.
  if(!finished&&!clock.paused)audio.update(race.speedQ/Q);
  return {events,finished};
}
