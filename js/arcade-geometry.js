// SPDX-License-Identifier: Apache-2.0
// Original low-poly arcade art: every mesh is native XYZ/RGB triangles.
// Adapted from QSOLKCB/VANILLAJS pull request #83, demos/racing-lab/geometry.js at
// a32953075e42cebe6866d17cb86ee7c796186e9d (Apache-2.0). Reads world state only.
import { boxVertices } from '../vendor/vanillajs/modules/render-webgl/index.js';
import { TRACK_LENGTH, RACE_GATES, stuntRoad } from './arcade.js';

const ASPHALT = [.105, .15, .22], WHITE = [.73, .84, .9], ORANGE = [.93, .49, .27], SAGE = [.73, .8, .71];
export const PLAYER_DEFAULT = Object.freeze([.93, .49, .27]);
const RIVAL_COLORS = [[.39, .55, .61], [.86, .4, .33], [.51, .5, .68], [.83, .67, .31]];

/** Convert a #rrggbb paint into linear-ish RGB floats; unknown values use the house orange. */
export function paintToRgb(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return [...PLAYER_DEFAULT];
  return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
}

function box(out, x, y, z, sx, sy, sz, color) { boxVertices([x, y, z], [sx, sy, sz], color, out); }
function oriented(out, x, y, z, sx, sy, sz, color, yaw = 0, roll = 0) {
  const vertices = boxVertices([0, 0, 0], [sx, sy, sz], color);
  const c = Math.cos(yaw), s = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  for (let i = 0; i < vertices.length; i += 6) {
    const lx = vertices[i] * cr - vertices[i + 1] * sr;
    const ly = vertices[i] * sr + vertices[i + 1] * cr;
    const lz = vertices[i + 2];
    out.push(x + lx * c - lz * s, y + ly, z + lx * s + lz * c,
      vertices[i + 3], vertices[i + 4], vertices[i + 5]);
  }
}
function car(out, p, color) {
  const roll = p.grounded ? 0 : p.flip;
  oriented(out, p.x, p.y + .72, p.z, 1.9, .65, 3.5, color, p.yaw, roll);
  oriented(out, p.x, p.y + 1.15, p.z + .24, 1.5, .56, 1.6, [.14, .25, .35], p.yaw, roll);
  oriented(out, p.x, p.y + .92, p.z + 1.53, 2.3, .18, .24, [.09, .1, .13], p.yaw, roll);
  oriented(out, p.x, p.y + .35, p.z, 2.1, .7, .65, [.035, .05, .07], p.yaw, roll);
  oriented(out, p.x, p.y + .7, p.z - 1.78, 1.45, .15, .07, [1, .91, .56], p.yaw, roll);
}

/** Static course geometry for one 3D mode. */
export function sceneGeometry(mode) {
  const out = [];
  if (mode === 'stunt') {
    box(out, 0, -20, -TRACK_LENGTH / 2, 420, 1, TRACK_LENGTH + 120, [.04, .095, .12]);
    for (let s = 0; s < TRACK_LENGTH; s += 6) {
      const h = stuntRoad(s + 3); if (h === null) continue;
      box(out, 0, h - .33, -s - 3, 16, .65, 6.15, (Math.floor(s / 48) % 2) ? [.19, .23, .30] : [.26, .29, .36]);
      for (const side of [-1, 1])
        box(out, side * 8.1, h + .24, -s - 3, .28, .9, 6.1, side < 0 ? SAGE : ORANGE);
    }
    for (let s = 24; s < TRACK_LENGTH; s += 48) {
      const h = stuntRoad(s); if (h !== null)
        for (const side of [-1, 1]) box(out, side * 7.3, (h - 18) / 2 - 1, -s, .9, h + 18, 1, [.16, .26, .31]);
    }
    box(out, 0, 7, -898, 22, 1, 1, ORANGE);
    return out;
  }
  box(out, 0, -.35, 0, 180, .5, 180, [.065, .16, .13]);
  if (mode === 'circuit') {
    box(out, 0, -.12, 0, 110, .15, 126, [.06, .11, .1]);
    for (let i = 0; i < 128; i++) {
      const t = 2 * Math.PI * i / 128;
      const x = 50 * Math.sin(t), z = 55 * Math.cos(t);
      const yaw = Math.atan2(50 * Math.cos(t), 55 * Math.sin(t));
      oriented(out, x, .01, z, 21, .14, 5, ASPHALT, yaw);
      if (i % 4 === 0) oriented(out, x, .1, z, 1.0, .02, 2, WHITE, yaw);
    }
    for (const g of RACE_GATES) box(out, g.x, .25, g.z, 1.2, .45, 1.2, ORANGE);
  } else {
    box(out, 0, -.09, 0, 130, .14, 124, [.15, .2, .24]);
    for (let v = -60; v <= 60; v += 12) {
      box(out, v, .04, 0, .16, .03, 120, [.25, .31, .34]);
      box(out, 0, .04, v, 120, .03, .16, [.25, .31, .34]);
    }
    for (const s of [-1, 1]) {
      box(out, s * 64, 1.8, 0, 1.1, 3.6, 130, [.32, .25, .31]);
      box(out, 0, 1.8, s * 62, 130, 3.6, 1.1, [.32, .25, .31]);
    }
    if (mode === 'ball') {
      for (const s of [-1, 1]) {
        box(out, -15, 2, s * 59, 1, 4, 1, ORANGE);
        box(out, 15, 2, s * 59, 1, 4, 1, ORANGE);
        box(out, 0, 4, s * 59, 31, .5, 1, ORANGE);
      }
      box(out, 0, .05, 0, 1, .06, 118, WHITE);
    } else for (const [x, z] of [[-30, -10], [29, 18], [0, -20], [15, 38], [-25, 33]])
      box(out, x, 1.3, z, 4, 2.6, 4, [.5, .27, .29]);
  }
  return out;
}

/** Per-frame geometry: player, live rivals and the ball. */
export function dynamicGeometry(w, playerColor = PLAYER_DEFAULT) {
  const out = [];
  car(out, w.player, playerColor);
  for (const b of w.bots) {
    if (b.health > 0) car(out, b, RIVAL_COLORS[b.color % RIVAL_COLORS.length]);
  }
  if (w.mode === 'ball') {
    const b = w.ball; box(out, b.x, b.y, b.z, 2.6, 2.6, 2.6, [.99, .82, .22]);
    box(out, b.x, b.y + 1.45, b.z, .9, .3, .9, [1, .96, .7]);
  }
  return out;
}
