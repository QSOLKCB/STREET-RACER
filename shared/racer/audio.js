// SPDX-License-Identifier: Apache-2.0
// SONIFICATION's pinned FM/additive synthesis is invoked only after a user gesture.
// All Web Audio output is an optional receiver, never part of the race replay.
export function createRaceAudio(){
  let ctx=null,osc=null,filter=null,gain=null,muted=true,closed=false;
  const samples=new Map();
  async function activate(){
    if(closed)return false;
    try{
      if(!ctx){
        const C=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!C)return false;
        ctx=new C();gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);
        filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;
        filter.connect(gain);
        osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.value=40;osc.connect(filter);osc.start();
      }
      await ctx.resume();muted=false;return true;
    }catch{return false;}
  }
  async function setSound(enabled){
    if(!enabled){muted=true;if(gain&&ctx)gain.gain.setTargetAtTime(0,ctx.currentTime,.015);return false}
    return activate();
  }
  function cue(name){
    if(muted||!ctx||ctx.state!=='running')return;
    const synth=globalThis.QSOLIMC?.Synthesis;
    if(!synth)return;
    const sound=name.includes('HIT')||name.includes('TAKEDOWN')?'fm':'additive';
    const key=sound+':'+ctx.sampleRate;
    let buffer=samples.get(key);
    if(!buffer){
      try{
        const floats=synth.synthesize(sound,{frequencyHz:sound==='fm'?170:690,
          durationSeconds:.095,velocity:.5,sampleRate:ctx.sampleRate,seed:0x1254n});
        buffer=ctx.createBuffer(1,floats.length,ctx.sampleRate);
        buffer.getChannelData(0).set(floats);samples.set(key,buffer);
      }catch{return}
    }
    const source=ctx.createBufferSource(),level=ctx.createGain();
    level.gain.value=.23;source.buffer=buffer;source.connect(level);level.connect(ctx.destination);
    source.start();source.onended=()=>{source.disconnect();level.disconnect()};
  }
  function update(speed){
    if(!ctx||!gain||muted||ctx.state!=='running')return;
    const hz=35+Math.min(110,speed)*2.4;
    osc.frequency.setTargetAtTime(hz,ctx.currentTime,.045);
    filter.frequency.setTargetAtTime(300+speed*24,ctx.currentTime,.08);
    gain.gain.setTargetAtTime(Math.min(.065,speed/2000),ctx.currentTime,.045);
  }
  function silence(){if(gain&&ctx)gain.gain.setTargetAtTime(0,ctx.currentTime,.02)}
  async function dispose(){if(closed)return;closed=true;muted=true;try{osc?.stop();await ctx?.close()}catch{}}
  return {activate,setSound,cue,update,silence,dispose,get enabled(){return !muted}};
}
