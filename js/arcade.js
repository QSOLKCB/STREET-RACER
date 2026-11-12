// SPDX-License-Identifier: Apache-2.0
// STREET-RACER arcade side events: five original stake-free racing modes.
// Adapted from QSOLKCB/VANILLAJS pull request #83, demos/racing-lab/world.js at
// a32953075e42cebe6866d17cb86ee7c796186e9d (Apache-2.0). The rules are owned by
// this game: objectives were lengthened and the module is DOM-free.
// SI units, +Y up, -Z forward. Float64 simulation repeats for the same
// input/tick sequence in one JS runtime; cross-engine bit-exactness is not claimed.
import { clamp } from '../vendor/vanillajs/modules/math/index.js';

export const ARCADE_STEP = 1 / 60;
export const MODES = Object.freeze(['retro', 'circuit', 'derby', 'ball', 'stunt']);
export const TRACK_LENGTH = 900;
export const OBJECTIVES = Object.freeze({
  retro: Object.freeze({ stages: 5, stageLength: 1500 }),
  circuit: Object.freeze({ laps: 5 }),
  derby: Object.freeze({ knockouts: 5 }),
  ball: Object.freeze({ goals: 5 }),
  stunt: Object.freeze({ laps: 3 })
});
export const RACE_GATES = Object.freeze([
  { x: 0, z: 55 }, { x: 36, z: 39 }, { x: 50, z: 0 }, { x: 36, z: -39 },
  { x: 0, z: -55 }, { x: -36, z: -39 }, { x: -50, z: 0 }, { x: -36, z: 39 }
]);
export const RETRO_DISTANCE = OBJECTIVES.retro.stages * OBJECTIVES.retro.stageLength;

const forward = yaw => [Math.sin(yaw), -Math.cos(yaw)];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const bounded = v => Number.isFinite(v) ? clamp(v, -1, 1) : 0;
function driver(x, z, yaw = 0, color = 0) {
  return { x, z, y: 0, yaw, vx: 0, vz: 0, vy: 0, speed: 0, grounded: true,
    boost: 100, health: 100, lap: 0, checkpoint: 1, flip: 0, knockouts: 0, color,
    cooldown: 0, lastSafe: 0 };
}

/** Elevated stunt course height at track position s, or null over a real gap. */
export function stuntRoad(s) {
  if (!Number.isFinite(s)) throw new TypeError('track position must be finite');
  const t = ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  if ((t >= 210 && t < 235) || (t >= 590 && t < 617)) return null;
  if (t < 120) return 2;
  if (t < 160) return 2 + (t - 120) * 7 / 40;
  if (t < 235) return 9;
  if (t < 300) return 7;
  if (t < 340) return 7 - (t - 300) * 5 / 40;
  if (t < 400) return 2;
  if (t < 470) return 2 + Math.sin((t - 400) * Math.PI / 14) * .6;
  if (t < 520) return 2;
  if (t < 560) return 2 + (t - 520) * 9 / 40;
  if (t < 617) return 11;
  if (t < 670) return 9;
  if (t < 720) return 9 - (t - 670) * 7 / 50;
  return 2;
}
export function retroCurve(s) { return Math.sin(s / 190) * 2.7 + Math.sin(s / 490) * 2; }

export function createArcade(mode = 'retro') {
  if (!MODES.includes(mode)) throw new RangeError('unknown arcade mode');
  const p = mode === 'circuit' ? driver(0, 55, Math.atan2(36, 16)) :
    mode === 'stunt' ? driver(0, 0) : driver(0, 32);
  if (mode === 'stunt') p.y = 2;
  const bots = mode === 'retro' ?
    [0, 1, 2, 3, 4].map(i => ({ id: i, x: [-3.2, 2.5, 0, -1.8, 3][i],
      s: 105 + i * 145, speed: 24 + i * 4, color: i % 3 })) :
    mode === 'stunt' ? [] :
    [0, 1, 2, 3].map(i => {
      const a = driver(mode === 'circuit' ? RACE_GATES[i].x : [-24, 24, -18, 18][i],
        mode === 'circuit' ? RACE_GATES[i].z : [-25, -21, 12, 19][i], 0, i);
      a.checkpoint = (i + 1) % RACE_GATES.length;
      return a;
    });
  return { mode, tick: 0, elapsed: 0, player: p, bots, finished: false, won: false,
    result: '', event: '', score: [0, 0], distance: 0, contacts: 0,
    ball: { x: 0, y: 1.3, z: 0, vx: 0, vz: 0, vy: 0 } };
}

function vehicle(p, input, dt, maxSpeed = 38) {
  const throttle = bounded(input.throttle), steer = bounded(input.steer);
  const nitro = Boolean(input.boost) && p.boost > 0;
  const limit = nitro ? maxSpeed * 1.4 : maxSpeed;
  p.speed = clamp(p.speed + (throttle >= 0 ? throttle * 24 : throttle * 35) * dt -
    (Math.abs(throttle) < .01 ? p.speed * 1.1 * dt : 0), -15, limit);
  if (nitro) { p.speed = clamp(p.speed + 38 * dt, -15, limit); p.boost = Math.max(0, p.boost - 24 * dt); }
  else p.boost = Math.min(100, p.boost + 9 * dt);
  const turn = Math.min(1, Math.abs(p.speed) / 12) * steer * 1.9 * dt;
  p.yaw += turn * (p.speed < 0 ? -1 : 1);
  const [fx, fz] = forward(p.yaw), grip = input.handbrake ? 1.7 : 7.5;
  const blend = Math.min(1, grip * dt);
  p.vx += (fx * p.speed - p.vx) * blend;
  p.vz += (fz * p.speed - p.vz) * blend;
  p.x += p.vx * dt; p.z += p.vz * dt;
  if (p.grounded && input.jump) { p.vy = 9.5; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= 19 * dt;
    if (input.flip) p.flip += 4.8 * dt;
  }
  p.y += p.vy * dt;
}
function contact(a, b, w) {
  if (a.cooldown || b.cooldown || distance(a, b) > 3.5 || Math.abs(a.y - b.y) > 2.5) return;
  const dx = a.x - b.x, dz = a.z - b.z, d = Math.max(.001, Math.hypot(dx, dz));
  const nx = dx / d, nz = dz / d, relative = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  const impulse = Math.max(4, Math.abs(relative) * .55);
  a.vx += nx * impulse; a.vz += nz * impulse;
  b.vx -= nx * impulse; b.vz -= nz * impulse;
  a.speed *= .73; b.speed *= .65;
  const damage = Math.max(4, Math.round(impulse * 1.2));
  // Derby balancing: a player ram must be able to disable five rivals before the
  // player's own body fails. Other modes keep symmetric collision damage.
  const suffered = w.mode === 'derby' ? Math.max(1, Math.round(damage * .3)) : damage;
  const inflicted = w.mode === 'derby' ? damage + 20 : damage;
  a.health = Math.max(0, a.health - suffered);
  b.health = Math.max(0, b.health - inflicted);
  a.cooldown = 18; b.cooldown = 18; w.contacts++;
  w.event = 'BODY CONTACT · ' + suffered + ' DAMAGE';
  if (b.health === 0) { a.knockouts++; b.cooldown = 180; w.event = 'RIVAL DISABLED'; }
}
function arenaBounds(p) {
  if (Math.abs(p.x) > 63) { p.x = clamp(p.x, -63, 63); p.vx *= -.55; p.speed *= .75; }
  if (Math.abs(p.z) > 63) { p.z = clamp(p.z, -63, 63); p.vz *= -.55; p.speed *= .75; }
}
function updateBots(w, dt) {
  for (const b of w.bots) {
    if (b.health === 0) {
      if (b.cooldown > 60) { b.cooldown--; continue; }
      b.health = 100; b.x = -25 + b.color * 15; b.z = 20; b.speed = 0; b.cooldown = 30;
    } else if (b.cooldown > 0) b.cooldown--; // Contact immunity expires for living rivals too.
    const target = w.mode === 'circuit' ? RACE_GATES[b.checkpoint] :
      w.mode === 'ball' ? w.ball : w.player;
    const desired = Math.atan2(target.x - b.x, -(target.z - b.z));
    const delta = Math.atan2(Math.sin(desired - b.yaw), Math.cos(desired - b.yaw));
    vehicle(b, { throttle: 1, steer: clamp(delta * 2, -1, 1),
      boost: w.mode === 'derby' && w.tick % 240 < 55 }, dt, w.mode === 'circuit' ? 31 : 30);
    b.y = 0; b.vy = 0; b.grounded = true;
    if (w.mode === 'circuit' && distance(b, target) < 12) {
      if (b.checkpoint === 0) b.lap++;
      b.checkpoint = (b.checkpoint + 1) % RACE_GATES.length;
    }
    arenaBounds(b);
    contact(w.player, b, w);
  }
}
function updateBall(w, dt) {
  const b = w.ball;
  b.x += b.vx * dt; b.z += b.vz * dt;
  b.vx *= Math.exp(-.75 * dt); b.vz *= Math.exp(-.75 * dt);
  for (const car of [w.player, ...w.bots]) {
    const dx = b.x - car.x, dz = b.z - car.z, d = Math.hypot(dx, dz);
    if (d < 3.7) {
      const m = Math.max(.1, d), strength = 12 + Math.abs(car.speed) * .8;
      b.vx = clamp(b.vx + dx / m * strength, -55, 55);
      b.vz = clamp(b.vz + dz / m * strength, -55, 55);
      b.x = car.x + dx / m * 3.7; b.z = car.z + dz / m * 3.7;
      w.event = 'BALL IMPACT';
    }
  }
  if (Math.abs(b.x) > 60) { b.x = clamp(b.x, -60, 60); b.vx *= -.8; }
  if (Math.abs(b.z) > 58) {
    if (Math.abs(b.x) < 15) {
      const side = b.z < 0 ? 0 : 1; w.score[side]++; w.event = side === 0 ? 'GOAL · YOU SCORED' : 'GOAL · OPPONENTS';
      Object.assign(b, { x: 0, z: 0, vx: 0, vz: 0 });
      w.player.x = 0; w.player.z = 32; w.player.speed = 0;
    } else { b.z = clamp(b.z, -58, 58); b.vz *= -.8; }
  }
}
function stepRetro(w, input, dt) {
  const p = w.player, { stages, stageLength } = OBJECTIVES.retro;
  const boosting = Boolean(input.boost) && p.boost > 0, limit = boosting ? 90 : 75;
  p.speed = clamp(p.speed + bounded(input.throttle) * 25 * dt -
    (Math.abs(bounded(input.throttle)) < .01 ? p.speed * .35 * dt : 0), 0, 90);
  if (boosting) { p.speed = Math.min(90, p.speed + 35 * dt); p.boost = Math.max(0, p.boost - 20 * dt); }
  else p.boost = Math.min(100, p.boost + 8 * dt);
  // Boosted speed is kept while boosting and bleeds off gradually afterwards.
  if (p.speed > limit) p.speed = Math.max(limit, p.speed - 45 * dt);
  p.x += bounded(input.steer) * (3.5 + p.speed * .08) * dt;
  if (Math.abs(p.x) > 5.6) {
    p.x = clamp(p.x, -6.3, 6.3); p.speed *= 1 - 1.4 * dt;
    if (w.tick % 50 === 0) { p.health = Math.max(0, p.health - 1); w.event = 'OFF ROAD'; }
  }
  const before = w.distance;
  w.distance += p.speed * dt;
  for (const b of w.bots) {
    b.s += b.speed * dt;
    if (b.s < w.distance - 20) { b.s = w.distance + 240 + (b.id * 83) % 360; b.x = [-3, 2.9, 0, -1.5, 3.1][b.id]; }
    if (before <= b.s + 4 && w.distance >= b.s - 4 && Math.abs(p.x - b.x) < 1.8 && !p.cooldown) {
      p.speed *= .5; p.health = Math.max(0, p.health - 9);
      p.cooldown = 48; w.contacts++; w.event = 'TRAFFIC IMPACT';
    }
  }
  const stage = Math.min(stages - 1, Math.floor(w.distance / stageLength));
  if (stage !== p.lap) { p.lap = stage; w.event = 'STAGE ' + (stage + 1) + ' OF ' + stages; }
  if (w.distance >= stages * stageLength) { w.finished = true; w.won = true; w.result = 'RETRO TOUR COMPLETED'; }
}
function recoverStunt(w) {
  const p = w.player;
  p.x = 0; p.z = -p.lastSafe; p.y = stuntRoad(p.lastSafe) ?? 2;
  p.vx = 0; p.vy = 0; p.vz = 0; p.speed = 8; p.grounded = true; p.flip = 0;
  p.health = Math.max(0, p.health - 18); w.contacts++;
  w.event = 'TRACK FALL · RESPAWN -18 HP';
}
function stepStunt(w, input, dt) {
  const p = w.player, previousY = p.y;
  vehicle(p, input, dt, 47);
  const s = -p.z;
  const track = s >= 0 ? stuntRoad(s) : null;
  if (track !== null && Math.abs(p.x) < 8) {
    const elevation = track;
    // Grounded suspension follows the grade; a real gap removes support and
    // gravity takes over on the next fixed tick.
    if (p.grounded) { p.y = elevation; p.vy = 0; }
    // A landing needs the car to arrive from above the deck (with a little
    // suspension travel for rising ramps); a car already well below it keeps falling.
    if (p.y <= elevation + .05 && p.vy <= 0 && (p.grounded || previousY >= elevation - 1.2)) {
      const impact = -p.vy;
      if (!p.grounded && impact > 12) {
        const damage = Math.round((impact - 12) * 2.5);
        p.health = Math.max(0, p.health - damage); w.event = 'HARD LANDING · -' + damage + ' HP';
      }
      p.y = elevation; p.vy = 0; p.grounded = true; p.flip = 0;
    }
    if (p.grounded && s - p.lastSafe > 55) {
      // A checkpoint must never land inside either unsupported span.
      let safe = Math.floor(s / 55) * 55;
      while (safe > 0 && stuntRoad(safe) === null) safe -= 55;
      p.lastSafe = safe;
    }
  } else p.grounded = false;
  if (p.y < -15 || Math.abs(p.x) > 14 || s < -20) { recoverStunt(w); return; }
  if (p.health === 0) { w.finished = true; w.result = 'VEHICLE DESTROYED'; return; }
  if (s >= TRACK_LENGTH) {
    p.z += TRACK_LENGTH; p.lastSafe = 0; p.lap++;
    w.event = 'STUNT LAP ' + p.lap + ' OF ' + OBJECTIVES.stunt.laps;
    if (p.lap >= OBJECTIVES.stunt.laps) { w.finished = true; w.won = true; w.result = 'ELEVATED CIRCUIT CLEARED'; }
  }
}
function stepCircuit(w) {
  const p = w.player;
  if (distance(p, RACE_GATES[p.checkpoint]) < 12) {
    if (p.checkpoint === 0) { p.lap++; w.event = 'LAP ' + p.lap + ' OF ' + OBJECTIVES.circuit.laps; }
    p.checkpoint = (p.checkpoint + 1) % RACE_GATES.length;
    if (p.lap >= OBJECTIVES.circuit.laps) { w.finished = true; w.won = true; w.result = 'CIRCUIT RACE WON'; }
  }
}

/** Advance one arcade world by one fixed step. Input is the explicit caller object. */
export function stepArcade(w, input = {}, dt = ARCADE_STEP) {
  if (!w || !MODES.includes(w.mode)) throw new TypeError('invalid arcade state');
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 30) throw new RangeError('fixed timestep outside safe bounds');
  if (w.finished) return w;
  w.event = ''; w.tick++; w.elapsed += dt;
  const p = w.player; if (p.cooldown > 0) p.cooldown--;
  if (w.mode === 'retro') {
    stepRetro(w, input, dt);
    if (p.health === 0) { w.finished = true; w.result = 'VEHICLE DESTROYED'; }
    return w;
  }
  if (w.mode === 'stunt') { stepStunt(w, input, dt); return w; }
  vehicle(p, input, dt, w.mode === 'circuit' ? 40 : 37);
  // Flat-world suspension: the collision plane is Y=0 at the car origin.
  if (p.y <= 0) {
    if (!p.grounded && p.vy < -14) {
      p.health = Math.max(0, p.health - Math.round((-p.vy - 14) * 2)); w.event = 'HARD LANDING';
    }
    p.y = 0; p.vy = 0; p.grounded = true; p.flip = 0;
  }
  arenaBounds(p); updateBots(w, dt);
  if (w.mode === 'circuit') stepCircuit(w);
  if (w.mode === 'ball') updateBall(w, dt);
  if (w.mode === 'derby' && p.knockouts >= OBJECTIVES.derby.knockouts) { w.finished = true; w.won = true; w.result = 'DERBY CHAMPION'; }
  if (w.mode === 'ball' && Math.max(...w.score) >= OBJECTIVES.ball.goals) {
    w.finished = true; w.won = w.score[0] > w.score[1]; w.result = w.won ? 'ARENA FOOTBALL WIN' : 'RIVALS WIN';
  }
  if (p.health === 0) { w.finished = true; w.result = 'VEHICLE DESTROYED'; }
  return w;
}

/** Bounded telemetry for the shared engine-sound receiver; never mutates the world. */
export function arcadeTelemetry(w, input = {}) {
  const p = w.player, top = w.mode === 'retro' ? 90 : w.mode === 'stunt' ? 66 : 56;
  const ratio = clamp(Math.abs(p.speed) / top, 0, 1);
  const gear = Math.min(4, 1 + Math.floor(ratio * 3.999));
  const within = ratio * 4 - (gear - 1);
  return { status: w.finished ? 'finished' : 'running',
    player: { speed: Math.abs(p.speed), gear, rpm: 1400 + within * 5200 + (input.boost ? 600 : 0),
      x: w.mode === 'retro' ? p.x / 5.6 * .92 : input.handbrake ? 1.25 : 0 } };
}
