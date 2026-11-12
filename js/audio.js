// SPDX-License-Identifier: Apache-2.0
// Original STREET-RACER arrangements and Web Audio receiver. Donor source is
// unchanged in vendor/. Pitch, rhythm and timbre are authored musical choices.
import '../vendor/e8-music/js/e8-core.js';
import '../vendor/arcade/js/core.js';
import '../vendor/sonification/APP/js/namespace.js';
import '../vendor/sonification/APP/js/math64.js';
import '../vendor/sonification/APP/js/synthesis.js';

const E8 = globalThis.E8Core;
const synthesis = globalThis.QSOLIMC.Synthesis;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
const frequency = midi => E8.midiToFrequency(midi, 440);
const VOICE_LIMIT = 24;
const BUFFER_LIMIT = 64;

/** A seeded, authored 64-step surf-rock phrase derived from projected E8 roots.
 * This is interpretive music, not canonical or physical E8 sonification. */
export function buildScore(seed = 'street-racer-radio-1967') {
  const roots = E8.generateE8Roots();
  const projection = E8.projectRoots(roots, 'golden');
  const order = E8.traversal(roots, projection, 'seeded', seed);
  const bass = [40, 40, 36, 38];
  return Object.freeze(Array.from({length:64}, (_, step) => {
    const chord = bass[Math.floor(step / 16)];
    const root = order[(step * 7) % order.length];
    const note = E8.quantizeMidi(56 + projection.normalized[root] * 19, 'pentatonic', 4);
    return Object.freeze({
      root, bass:step % 4 === 0 ? chord : step % 4 === 2 ? chord + 7 : 0,
      lead:step % 2 === 0 || step % 16 === 13 ? note : 0,
      accent:step % 8 === 0 ? 1 : .7,
      kick:step % 8 === 0 || step % 8 === 3,
      snare:step % 8 === 4,
      hat:step % 2 === 0
    });
  }));
}

/** Bounded controls shared by the live receiver and tests. Speed is m/s. */
export function engineSignal(player = {}) {
  const rpm = clamp(Number(player.rpm ?? 850), 650, 9500);
  const speed = clamp(Number(player.speed ?? 0), 0, 120);
  const road = Math.max(Math.abs(Number(player.x ?? player.lateral ?? 0)) - .82, 0);
  return Object.freeze({
    frequency:clamp(rpm / 60 * 2, 22, 300),
    gain:.055 + speed / 120 * .075,
    cutoff:360 + rpm * .28,
    skid:clamp(road * speed / 42, 0, .2)
  });
}

/** Explicit-gesture, optional audio. No timers, network, ambient random source or
 * AudioContext allocation at module load. The caller drives update() from RAF. */
export function createAudio({contextFactory} = {}) {
  let ctx = null, master = null, music = null, fx = null, delay = null, feedback = null;
  let engine = null, noiseBuffer = null, enabled = false, paused = false, engineSounding = false;
  let disposed = false, failed = false, volume = .55, scene = 'garage';
  let nextBeat = 0, beat = 0, previousGear = null, previousStatus = null;
  const active = new Set(), buffers = new Map(), score = buildScore();
  const factory = contextFactory || (() => {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    return C ? new C() : null;
  });

  function setParam(param, value, time = ctx?.currentTime || 0, smoothing = .025) {
    if (!param) return;
    param.cancelScheduledValues?.(time);
    if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, time, smoothing);
    else param.value = value;
  }
  function muteParam(param) {
    if (!param) return;
    param.cancelScheduledValues?.(ctx?.currentTime || 0);
    param.setValueAtTime(0, ctx?.currentTime || 0);
  }
  function silence() {
    for (const voice of [...active]) {
      try { voice.source.stop(); } catch { /* Already ended. */ }
      voice.cleanup();
    }
    if (engine) { muteParam(engine.gain.gain); muteParam(engine.tyreGain.gain); }
    engineSounding = false;
    nextBeat = 0;
  }
  function ready() { return enabled && !paused && !disposed && ctx?.state === 'running'; }
  function createEngine() {
    const gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    gain.gain.value = 0; filter.type = 'lowpass'; filter.frequency.value = 700;
    filter.Q.value = .55; filter.connect(gain); gain.connect(fx);
    const low = ctx.createOscillator(), rasp = ctx.createOscillator();
    low.type = 'triangle'; rasp.type = 'sawtooth';
    low.frequency.value = 30; rasp.frequency.value = 60;
    const raspGain = ctx.createGain(); raspGain.gain.value = .17;
    low.connect(filter); rasp.connect(raspGain); raspGain.connect(filter);
    low.start(); rasp.start();
    const tyre = ctx.createBufferSource(), tyreFilter = ctx.createBiquadFilter(), tyreGain = ctx.createGain();
    tyre.buffer = noiseBuffer; tyre.loop = true; tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 1850; tyreFilter.Q.value = .7; tyreGain.gain.value = 0;
    tyre.connect(tyreFilter); tyreFilter.connect(tyreGain); tyreGain.connect(fx); tyre.start();
    engine = {gain,filter,low,rasp,raspGain,tyre,tyreFilter,tyreGain};
  }
  function initialise() {
    if (ctx || disposed) return Boolean(ctx);
    try {
      ctx = factory();
      if (!ctx) { failed = true; return false; }
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = .58; music.connect(master);
      fx = ctx.createGain(); fx.gain.value = .8; fx.connect(master);
      // A restrained slapback rather than a large convolution asset.
      delay = ctx.createDelay(.5); delay.delayTime.value = .145;
      feedback = ctx.createGain(); feedback.gain.value = .17;
      music.connect(delay); delay.connect(feedback); feedback.connect(delay); feedback.connect(master);
      noiseBuffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * .5), ctx.sampleRate);
      const pcm = noiseBuffer.getChannelData(0), random = globalThis.Arcade.rng(19670421);
      for (let i = 0; i < pcm.length; i++) pcm[i] = random() * 2 - 1;
      createEngine(); failed = false; return true;
    } catch {
      failed = true;
      try { ctx?.close()?.catch?.(() => {}); } catch { /* Optional receiver. */ }
      ctx = null; return false;
    }
  }
  async function unlock() {
    if (!enabled || disposed || !initialise()) return false;
    if (paused) return false;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      if (ready()) setParam(master.gain, volume * .55);
      return ready();
    } catch { failed = true; return false; }
  }
  function voice(source, duration, gain, bus = music, at = ctx?.currentTime || 0, filter = null) {
    if (!ready() || active.size >= VOICE_LIMIT) return false;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.linearRampToValueAtTime(gain, at + .004);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + Math.max(.02, duration));
    source.connect(filter || envelope); if (filter) filter.connect(envelope); envelope.connect(bus);
    const entry = {source, cleanup:() => {
      if (!active.delete(entry)) return;
      source.onended = null;
      try { source.disconnect(); envelope.disconnect(); filter?.disconnect(); } catch { /* Already disconnected. */ }
    }};
    active.add(entry); source.onended = entry.cleanup;
    source.start(at); source.stop(at + duration + .025);
    return true;
  }
  function tone(hz, duration, gain, type = 'triangle', end = hz, bus = fx, at = ctx?.currentTime || 0) {
    if (!ready() || active.size >= VOICE_LIMIT) return;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, hz), at);
    if (hz !== end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    voice(osc, duration, gain, bus, at);
  }
  function noise(duration, gain, hz, type = 'highpass', bus = music, at = ctx?.currentTime || 0) {
    if (!ready() || active.size >= VOICE_LIMIT) return;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    source.buffer = noiseBuffer; filter.type = type; filter.frequency.value = hz; filter.Q.value = .7;
    voice(source, duration, gain, bus, at, filter);
  }
  function pluck(midi, gain, at) {
    if (!ready() || active.size >= VOICE_LIMIT) return;
    const key = `${midi}:${ctx.sampleRate}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      // One donor synthesis call per unique pitch/rate, never per audio sample or frame.
      const samples = synthesis.karplus({frequencyHz:frequency(midi),durationSeconds:.22,velocity:.85,sampleRate:ctx.sampleRate,seed:1967n + BigInt(midi)});
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);
      if (buffers.size >= BUFFER_LIMIT) buffers.delete(buffers.keys().next().value);
      buffers.set(key, buffer);
    }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    voice(source, .6, gain, music, at);
  }
  function playBeat(at) {
    const n = score[beat % score.length], racing = scene === 'race';
    if (n.bass) tone(frequency(n.bass), .23, .18, 'triangle', frequency(n.bass), music, at);
    if (n.lead) pluck(n.lead + (racing && beat % 16 >= 12 ? 12 : 0), .2 * n.accent, at);
    if (n.kick) tone(105, .15, .3, 'sine', 36, music, at);
    if (n.snare) { noise(.105, .09, 1400, 'bandpass', music, at); tone(170, .07, .07, 'triangle', 80, music, at); }
    if (n.hat) noise(.035, .025, 6500, 'highpass', music, at);
    beat++;
  }
  function cue(name) {
    if (!ready()) return;
    if (name === 'shift') tone(120, .07, .08, 'triangle', 65);
    else if (name === 'win') [52,59,64,71].forEach((n,i)=>tone(frequency(n),.34,.16,'triangle',frequency(n),fx,ctx.currentTime + i * .09));
    else if (name === 'lose') tone(196, .6, .13, 'triangle', 65);
    else if (name === 'buy' || name === 'upgrade') { tone(440,.12,.09); tone(660,.2,.09,'triangle',660,fx,ctx.currentTime + .07); }
    else if (name === 'start') tone(880, .2, .14, 'sine');
    else if (name === 'countdown') tone(440, .07, .09, 'sine');
    else if (name === 'crash') { noise(.2,.15,500,'lowpass',fx); tone(72,.22,.12,'triangle',25); }
    else tone(520,.04,.035,'sine',680);
  }
  function update(race = null) {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (!nextBeat || nextBeat < now - .25) nextBeat = now;
    // At most one scheduled note group per frame. Long pauses skip missed music.
    if (nextBeat <= now + .05) {
      playBeat(Math.max(now, nextBeat));
      nextBeat += 60 / (scene === 'race' ? 136 : 108) / 2;
    }
    const status = race?.status ?? race?.phase;
    const racing = scene === 'race' && race && !['finished','dnf','complete','result','forfeit'].includes(status);
    if (engine) {
      if (racing) {
        engineSounding = true;
        const player = race.player || {}, signal = engineSignal(player);
        setParam(engine.low.frequency, signal.frequency);
        setParam(engine.rasp.frequency, signal.frequency * 2.01);
        setParam(engine.filter.frequency, signal.cutoff);
        setParam(engine.gain.gain, signal.gain);
        setParam(engine.tyreGain.gain, signal.skid);
        if (previousGear !== null && player.gear !== previousGear) cue('shift');
        if (previousStatus === 'countdown' && status !== 'countdown') cue('start');
        previousGear = player.gear; previousStatus = status;
      } else {
        engineSounding = false;
        setParam(engine.gain.gain, 0); setParam(engine.tyreGain.gain, 0);
        previousGear = null; previousStatus = null;
      }
    }
  }
  async function suspend() {
    paused = true; silence();
    muteParam(master?.gain);
    try { if (ctx?.state === 'running') await ctx.suspend(); } catch { /* Optional. */ }
  }
  async function resume() { paused = false; nextBeat = 0; return enabled ? unlock() : false; }
  async function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) return unlock();
    // Muting is independent of focus pause and cannot silently unpause the game.
    silence(); muteParam(master?.gain);
    try { if (ctx?.state === 'running') await ctx.suspend(); } catch { /* Optional. */ }
    return false;
  }
  function setVolume(value) { volume = clamp(Number(value), 0, 1); if (master) setParam(master.gain, ready() ? volume * .55 : 0); }
  function setScene(value) {
    const next = value === 'race' ? 'race' : 'garage';
    if (next !== scene) { scene = next; silence(); beat = 0; previousGear = null; previousStatus = null; }
  }
  async function dispose() {
    disposed = true; enabled = false; silence();
    if (engine) {
      for (const name of ['low','rasp','tyre']) { try { engine[name].stop(); } catch { /* Already ended. */ } }
      for (const node of Object.values(engine)) { try { node.disconnect(); } catch { /* Optional. */ } }
    }
    engine = null; buffers.clear();
    try { await ctx?.close(); } catch { /* Already closed. */ }
  }
  return Object.freeze({unlock,setEnabled,setVolume,setScene,update,cue,suspend,resume,dispose,
    get state() { return Object.freeze({enabled,available:!failed,unlocked:Boolean(ctx),status:disposed?'closed':failed?'unavailable':ctx?.state || 'locked',scene,volume,voices:active.size,engineActive:Boolean(engineSounding && ready()),bufferCount:buffers.size,paused}); }
  });
}
