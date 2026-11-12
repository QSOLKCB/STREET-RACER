// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODES, ARCADE_STEP, TRACK_LENGTH, RACE_GATES, OBJECTIVES, RETRO_DISTANCE, stuntRoad, createArcade, stepArcade, arcadeTelemetry } from '../js/arcade.js';
import { sceneGeometry, dynamicGeometry, paintToRgb } from '../js/arcade-geometry.js';
import { retroRoad, drawRetro } from '../js/arcade-render.js';

const drive = { throttle: 1, steer: .28, boost: true, handbrake: false, jump: false, flip: false };

test('all five arcade modes initialise, carry longer objectives and reject invalid state and timestep', () => {
  assert.deepEqual(MODES, ['retro', 'circuit', 'derby', 'ball', 'stunt']);
  assert.throws(() => createArcade('none'), RangeError);
  assert.throws(() => stepArcade({ mode: 'retro' }), TypeError);
  assert.equal(RETRO_DISTANCE, 7500);
  assert.equal(OBJECTIVES.circuit.laps, 5); assert.equal(OBJECTIVES.stunt.laps, 3);
  assert.equal(OBJECTIVES.derby.knockouts, 5); assert.equal(OBJECTIVES.ball.goals, 5);
  for (const mode of MODES) {
    const w = createArcade(mode);
    assert.equal(w.mode, mode); assert.equal(w.player.health, 100);
    assert.equal(w.tick, 0); assert.equal(w.elapsed, 0); assert.equal(w.won, false);
    assert.throws(() => stepArcade(w, {}, NaN), RangeError);
    assert.throws(() => stepArcade(w, {}, -.1), RangeError);
    assert.throws(() => stepArcade(w, {}, 1), RangeError);
  }
});

test('identical tick inputs produce identical sessions without ambient randomness', () => {
  for (const mode of MODES) {
    const a = createArcade(mode), b = createArcade(mode);
    for (let i = 0; i < 800; i++) {
      const input = { throttle: i % 120 < 95 ? 1 : -.7, steer: i % 180 < 70 ? .4 : -.25,
        boost: i % 140 < 25, handbrake: i % 90 < 15, jump: i % 100 === 0, flip: i % 100 < 26 };
      stepArcade(a, input); stepArcade(b, input);
    }
    assert.deepEqual(a, b, mode);
    for (const value of [a.player.x, a.player.y, a.player.z, a.player.speed]) assert.ok(Number.isFinite(value), mode);
    assert.ok(a.tick <= 800);
  }
});

test('hostile control values stay bounded and finite in every mode', () => {
  for (const mode of MODES) {
    const w = createArcade(mode);
    for (let i = 0; i < 1500 && !w.finished; i++) {
      stepArcade(w, i % 2 ? { throttle: Infinity, steer: NaN, boost: 'yes', jump: 1, flip: {} } : { throttle: -99, steer: 1e9, handbrake: true });
      const p = w.player;
      for (const value of [p.x, p.y, p.z, p.speed, p.boost, p.health]) assert.ok(Number.isFinite(value), `${mode} tick ${i}`);
      assert.ok(p.health >= 0 && p.health <= 100 && p.boost >= 0 && p.boost <= 100);
    }
  }
});

test('horizon tour counts five stages, impacts, boost and shoulder friction', () => {
  const w = createArcade('retro');
  stepArcade(w, { throttle: 1, boost: true }, ARCADE_STEP);
  assert.ok(w.player.speed > 0); assert.ok(w.player.boost < 100);
  w.player.x = 8; w.player.speed = 50;
  stepArcade(w, { throttle: 0 });
  assert.ok(w.player.x <= 6.3); assert.ok(w.player.speed < 50);
  w.player.x = 0; w.player.cooldown = 0;
  const bot = w.bots[0]; bot.x = 0; bot.s = w.distance + 2;
  w.player.speed = 60; stepArcade(w, { throttle: 1 });
  assert.ok(w.contacts >= 1);
  w.distance = 1499.9; w.player.speed = 70; stepArcade(w, { throttle: 1 });
  assert.equal(w.player.lap, 1); assert.match(w.event, /STAGE 2 OF 5/);
  w.distance = RETRO_DISTANCE - .01; w.player.speed = 70;
  stepArcade(w, { throttle: 1 });
  assert.equal(w.finished, true); assert.equal(w.won, true); assert.equal(w.player.lap, 4);
});

test('a flat-out horizon tour with constant nitro still lasts over 80 s of simulated time', () => {
  const w = createArcade('retro'); w.bots = [];
  let ticks = 0;
  while (!w.finished && ticks++ < 60 * 600) stepArcade(w, { throttle: 1, boost: true });
  assert.equal(w.won, true, w.result);
  assert.ok(w.elapsed > 80, `elapsed ${w.elapsed}`);
});

test('ordered circuit gates count five complete laps and stop stepping once finished', () => {
  const w = createArcade('circuit'); w.bots = [];
  for (let lap = 0; lap < OBJECTIVES.circuit.laps; lap++) {
    for (let i = 1; i <= 8; i++) {
      const target = RACE_GATES[i % 8];
      w.player.x = target.x; w.player.z = target.z; w.player.speed = 0;
      stepArcade(w, {});
    }
  }
  assert.equal(w.player.lap, 5); assert.equal(w.finished, true); assert.equal(w.won, true);
  const tick = w.tick; stepArcade(w, { throttle: 1 }); assert.equal(w.tick, tick);
});

test('derby impacts disable rivals and five knockouts are achievable with health remaining', () => {
  const w = createArcade('derby'), b = w.bots[0], p = w.player;
  w.bots = [b]; b.x = p.x + .5; b.z = p.z; b.health = 1; b.cooldown = 0;
  stepArcade(w, { throttle: 1 });
  assert.equal(b.health, 0); assert.equal(p.knockouts, 1); assert.ok(p.health >= 0); assert.ok(w.contacts > 0);
  const fresh = createArcade('derby'), rival = fresh.bots[0], player = fresh.player;
  fresh.bots = [rival];
  let hits = 0;
  while (!fresh.finished && hits++ < 60) {
    player.cooldown = 0; player.x = 0; player.z = 0; player.vx = 0; player.vz = 0; player.speed = 20;
    rival.x = .5; rival.z = 0; rival.vx = 0; rival.vz = 0; rival.speed = 0; rival.cooldown = 0;
    if (rival.health === 0) rival.health = 100;
    stepArcade(fresh, { throttle: 1 });
  }
  assert.equal(player.knockouts, 5);
  assert.ok(player.health > 0, 'five knockouts must be achievable with health remaining');
  assert.equal(fresh.result, 'DERBY CHAMPION'); assert.equal(fresh.won, true);
});

test('living rivals recover from contact immunity so repeated rams reach five knockouts', () => {
  const w = createArcade('derby');
  for (let i = 0; i < 10800 && !w.finished; i++) stepArcade(w, {});
  assert.ok(w.contacts > 4, `rivals keep hitting a stationary player: ${w.contacts} contacts`);
  assert.ok(w.bots.every(b => b.health === 0 || b.cooldown <= 18));
  const ram = createArcade('derby'), rival = ram.bots[0], player = ram.player;
  ram.bots = [rival]; rival.x = .5; rival.z = 0; rival.health = 100; rival.cooldown = 0;
  let hits = 0;
  for (let i = 0; i < 4000 && rival.health > 0; i++) {
    player.x = 0; player.z = 0; player.vx = 0; player.vz = 0; player.speed = 20; player.cooldown = 0;
    rival.x = .5; rival.z = 0; rival.vx = 0; rival.vz = 0; rival.speed = 0;
    const before = ram.contacts; stepArcade(ram, { throttle: 1 }); if (ram.contacts > before) hits++;
  }
  assert.equal(rival.health, 0, 'a rival without manual cooldown resets is still disabled');
  assert.ok(hits > 1 && hits < 12, `rival disabled after ${hits} separate contacts`);
});

test('retro boost accumulates toward 90 m/s and bleeds off afterwards', () => {
  const w = createArcade('retro'); w.bots = [];
  for (let i = 0; i < 180; i++) stepArcade(w, { throttle: 1 });
  assert.ok(Math.abs(w.player.speed - 75) < 1e-9);
  for (let i = 0; i < 120; i++) stepArcade(w, { throttle: 1, boost: true });
  assert.ok(w.player.speed > 85, `boosted speed ${w.player.speed}`);
  const boosted = w.player.speed;
  stepArcade(w, { throttle: 1 });
  assert.ok(w.player.speed < boosted && w.player.speed > 75, 'speed bleeds off gradually, not in one tick');
  for (let i = 0; i < 180; i++) stepArcade(w, { throttle: 1 });
  assert.ok(Math.abs(w.player.speed - 75) < 1e-9, `settled speed ${w.player.speed}`);
});

test('a car that fell under the stunt deck keeps falling and respawns instead of teleporting up', () => {
  const w = createArcade('stunt');
  Object.assign(w.player, { z: -195, y: 9, speed: 20, vz: -20, grounded: true });
  let landedBelow = false, respawned = false;
  for (let i = 0; i < 400 && !respawned; i++) {
    const before = w.player.y;
    stepArcade(w, { throttle: .01 });
    if (w.event.startsWith('TRACK FALL')) respawned = true;
    else if (before < 0 && w.player.y > before + 3) landedBelow = true;
  }
  assert.equal(landedBelow, false, 'no upward teleport onto the far platform');
  assert.equal(respawned, true);
  assert.ok(w.player.health < 100);
});

test('car football awards a goal only inside the mouth and ends at five', () => {
  const w = createArcade('ball'); w.bots = [];
  w.ball.x = 20; w.ball.z = -59; stepArcade(w, {});
  assert.equal(w.score[0], 0); assert.ok(w.ball.z >= -58);
  w.ball.x = 0; w.ball.z = -59; stepArcade(w, {});
  assert.equal(w.score[0], 1); assert.equal(w.ball.z, 0);
  w.ball.x = 0; w.ball.z = 59; stepArcade(w, {});
  assert.equal(w.score[1], 1);
  for (let i = 0; i < 4; i++) { w.ball.x = 0; w.ball.z = 59; stepArcade(w, {}); }
  assert.equal(w.finished, true); assert.equal(w.won, false); assert.equal(w.result, 'RIVALS WIN');
});

test('stunt circuit has elevated ramps, two real gaps, controlled descent, respawn and three laps', () => {
  assert.equal(stuntRoad(0), 2); assert.equal(stuntRoad(160), 9);
  assert.equal(stuntRoad(220), null); assert.equal(stuntRoad(600), null);
  assert.equal(stuntRoad(TRACK_LENGTH), 2);
  assert.throws(() => stuntRoad(NaN), TypeError);
  const w = createArcade('stunt');
  w.player.z = -195; w.player.y = 9; w.player.speed = 40;
  w.player.vx = 0; w.player.vz = -40; w.player.grounded = true;
  for (let i = 0; i < 38; i++) stepArcade(w, { throttle: 1 });
  assert.ok(w.player.z < -210, 'car reaches the first broken span');
  assert.ok(w.player.y <= 9.1);
  w.player.x = 16; stepArcade(w, {});
  assert.equal(w.event, 'TRACK FALL · RESPAWN -18 HP');
  assert.equal(w.player.x, 0); assert.ok(w.player.health < 100);
  for (let lap = 1; lap <= 3; lap++) {
    w.player.z = -TRACK_LENGTH + .1; w.player.y = 2; w.player.speed = 30; w.player.vz = -30; w.player.grounded = true;
    stepArcade(w, { throttle: 1 });
    assert.equal(w.player.lap, lap);
  }
  assert.equal(w.finished, true); assert.equal(w.won, true);
});

test('low-poly geometry is finite, non-empty and bounded, and paint maps to RGB', () => {
  assert.deepEqual(paintToRgb('#ff0080').map(v => Math.round(v * 255)), [255, 0, 128]);
  assert.deepEqual(paintToRgb('url(x)'), paintToRgb(''));
  for (const mode of MODES.filter(v => v !== 'retro')) {
    const w = createArcade(mode), scene = sceneGeometry(mode), cars = dynamicGeometry(w, paintToRgb('#628b9c'));
    assert.ok(scene.length > 0 && scene.length < 250000, mode);
    assert.ok(cars.length > 0 && cars.length < 50000, mode);
    for (const list of [scene, cars]) {
      assert.equal(list.length % 6, 0);
      assert.ok(list.every(Number.isFinite), mode);
    }
    stepArcade(w, drive); assert.ok(dynamicGeometry(w).every(Number.isFinite));
  }
});

test('retro road projection is finite and the renderer survives a missing canvas', () => {
  const w = createArcade('retro'); w.distance = 1234; w.player.x = -3;
  let prior = -Infinity;
  for (let i = 0; i <= 90; i++) {
    const p = retroRoad(w, i / 90, 900, 500, 215);
    assert.ok(Object.values(p).every(Number.isFinite)); assert.ok(p.y >= 215 && p.y <= 500); assert.ok(p.half > 0); assert.ok(p.y >= prior, 'road rows descend toward the viewer'); prior = p.y;
  }
  for (const canvas of [null, {}, { getContext: () => null }]) assert.equal(drawRetro(canvas, w), false);
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get(target, key) { if (key in target) return target[key]; if (String(key).startsWith('create')) return () => gradient; return (...args) => { calls.push([key, ...args]); }; }, set(target, key, value) { target[key] = value; return true; } });
  const canvas = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 640, height: 360 }) };
  const before = JSON.stringify(w);
  assert.equal(drawRetro(canvas, w, { dpr: 1.5, playerColor: '#628b9c' }), true);
  assert.equal(JSON.stringify(w), before, 'rendering never mutates the world');
  assert.ok(calls.length > 500);
  for (const [, ...args] of calls) for (const v of args) if (typeof v === 'number') assert.ok(Number.isFinite(v));
});

test('engine telemetry for the shared audio receiver stays bounded', () => {
  for (const mode of MODES) {
    const w = createArcade(mode);
    for (let i = 0; i < 300; i++) stepArcade(w, { throttle: 1, boost: true, handbrake: i % 2 === 0 });
    const t = arcadeTelemetry(w, { boost: true, handbrake: true });
    assert.equal(t.status, w.finished ? 'finished' : 'running');
    assert.ok(t.player.rpm >= 1400 && t.player.rpm <= 7300, mode);
    assert.ok(t.player.gear >= 1 && t.player.gear <= 4);
    assert.ok(Number.isFinite(t.player.speed) && Number.isFinite(t.player.x));
  }
});

test('browser entrypoint and app expose each mode, the arcade screen and safety controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  assert.match(html, /data-view="arcade"/); assert.match(html, /id="arcade-screen"/);
  for (const mode of MODES) assert.match(ui, new RegExp(`data-mode="\\$\\{m.mode\\}"|mode: '${mode}'`));
  for (const control of ['arcade-launch', 'arcade-exit', 'arcade-export']) assert.ok(app.includes(`'${control}'`), control);
  for (const event of ['visibilitychange', 'pagehide', 'blur', 'webglcontextlost']) assert.ok(app.includes(event), event);
});
