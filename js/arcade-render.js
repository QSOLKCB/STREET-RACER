// SPDX-License-Identifier: Apache-2.0
// Arcade presentation: original Canvas2D pseudo-3D highway and the WebGL camera
// for the low-poly modes. Adapted from the Canvas/WebGL presentation in
// QSOLKCB/VANILLAJS pull request #83, demos/racing-lab/app.js at
// a32953075e42cebe6866d17cb86ee7c796186e9d (Apache-2.0).
// Rendering reads the arcade world; it never advances or changes it.
import { Renderer } from '../vendor/vanillajs/modules/render-webgl/index.js';
import { quatMultiply } from '../vendor/vanillajs/modules/math/index.js';
import { prepareCanvas } from './render.js';
import { retroCurve } from './arcade.js';
import { sceneGeometry, dynamicGeometry, PLAYER_DEFAULT } from './arcade-geometry.js';

const paint = color => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#ed7c45';
const RIVAL_PAINT = ['#ffc569', '#f76e8e', '#80c5fa'];

function polygon(c, color, points) {
  c.fillStyle = color; c.beginPath(); c.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) c.lineTo(point[0], point[1]);
  c.closePath(); c.fill();
}
function sprite(c, x, y, scale, color) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  c.fillStyle = '#0d1b23'; c.fillRect(-17, -12, 9, 19); c.fillRect(8, -12, 9, 19);
  polygon(c, color, [[-14, -22], [14, -22], [19, 13], [14, 20], [-14, 20], [-19, 13]]);
  polygon(c, '#152b3c', [[-10, -10], [10, -10], [12, 6], [-12, 6]]);
  c.fillStyle = '#ffdf8d'; c.fillRect(-13, -21, 7, 3); c.fillRect(6, -21, 7, 3);
  c.restore();
}

/** Pure road projection for the retro highway; exported for regression checks. */
export function retroRoad(world, t, width, height, horizon) {
  const d = 26 / (t + .075), curve = retroCurve(world.distance + d) - retroCurve(world.distance);
  return { y: horizon + Math.pow(t, 1.52) * (height - horizon),
    mid: width * .5 + curve * t * t * 24 - world.player.x * t * t * (width * .035),
    half: 5 + Math.pow(t, 1.22) * width * .42 };
}

/** Draw the pseudo-3D highway. Returns false when Canvas2D is unavailable. */
export function drawRetro(canvas, world, options = {}) {
  const prepared = prepareCanvas(canvas, { dpr: options.eco ? 1 : options.dpr });
  if (!prepared || !world) return false;
  const { ctx, width: w, height: h } = prepared, horizon = h * .43;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#17264a'); sky.addColorStop(.66, '#d65e8f'); sky.addColorStop(1, '#ffd18c');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffe3b0'; ctx.beginPath(); ctx.arc(w * .78, h * .25, Math.max(20, w * .04), 0, Math.PI * 2); ctx.fill();
  for (let j = 0; j < 2; j++) {
    const points = [[0, horizon]];
    for (let i = 0; i <= 16; i++) points.push([w * i / 16, horizon - (j ? 34 : 67) - Math.sin(i * 1.7 + j) * 23]);
    points.push([w, horizon]);
    polygon(ctx, j ? '#46506a' : '#6f5571', points);
  }
  const road = t => retroRoad(world, t, w, h, horizon);
  for (let i = 0; i < 90; i++) {
    const a = road(i / 90), b = road((i + 1) / 90), stripe = (Math.floor((world.distance + i * 9) / 35) % 2) === 0;
    ctx.fillStyle = stripe ? '#1e5b55' : '#225854'; ctx.fillRect(0, a.y, w, b.y - a.y + 2);
    polygon(ctx, stripe ? '#e4d19f' : '#e8e2cb', [[a.mid - a.half * 1.16, a.y], [a.mid + a.half * 1.16, a.y],
      [b.mid + b.half * 1.16, b.y], [b.mid - b.half * 1.16, b.y]]);
    polygon(ctx, stripe ? '#343945' : '#303945', [[a.mid - a.half, a.y], [a.mid + a.half, a.y],
      [b.mid + b.half, b.y], [b.mid - b.half, b.y]]);
    if (stripe) for (const line of [-.36, .36]) polygon(ctx, '#dce8d0',
      [[a.mid + a.half * line - 1, a.y], [a.mid + a.half * line + 1, a.y],
        [b.mid + b.half * line + 3, b.y], [b.mid + b.half * line - 3, b.y]]);
  }
  const opponents = [...world.bots].sort((a, b) => b.s - a.s);
  for (const b of opponents) {
    const gap = b.s - world.distance; if (gap < 0 || gap > 350) continue;
    const t = Math.max(0, Math.min(1, 1 - gap / 350)), p = road(t), scale = .2 + 1.65 * t;
    sprite(ctx, p.mid + b.x * p.half * .15, p.y, scale, RIVAL_PAINT[b.color % RIVAL_PAINT.length]);
  }
  // Progress text lives in the DOM instruments; the canvas stays free of captions.
  sprite(ctx, w / 2 + world.player.x * 6, h * .86, Math.min(2.1, Math.max(1.2, w / 440)), paint(options.playerColor));
  return true;
}

/** Create the WebGL scene for a 3D mode. Throws when WebGL is unavailable. */
export function createScene(canvas, mode, world, playerColor = PLAYER_DEFAULT) {
  const renderer = new Renderer(canvas);
  return { renderer, mode, ground: renderer.mesh(sceneGeometry(mode)), moving: renderer.mesh(dynamicGeometry(world, playerColor)), playerColor };
}

/** Rebuild the static course for another mode on an existing renderer. */
export function resetScene(scene, mode, world) {
  scene.renderer.clearMeshes();
  scene.mode = mode;
  scene.ground = scene.renderer.mesh(sceneGeometry(mode));
  scene.moving = scene.renderer.mesh(dynamicGeometry(world, scene.playerColor));
  return scene;
}

/** Follow camera behind the player; draws one frame. */
export function drawScene(scene, world, options = {}) {
  if (!scene || !world) return false;
  const { renderer } = scene;
  renderer.update(scene.moving, dynamicGeometry(world, scene.playerColor));
  const p = world.player, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  const camera = [p.x - s * 13, p.y + 8, p.z + c * 13];
  const qYaw = [0, -Math.sin(p.yaw / 2), 0, Math.cos(p.yaw / 2)];
  const qPitch = [Math.sin(-.27), 0, 0, Math.cos(-.27)];
  renderer.begin(camera, quatMultiply(qYaw, qPitch), { fog: world.mode === 'stunt' ? .0016 : .003, resolution: options.eco ? .66 : 1 });
  renderer.draw(scene.ground); renderer.draw(scene.moving);
  return true;
}

export function disposeScene(scene) {
  if (!scene) return;
  try { scene.renderer.dispose(); } catch { /* Context may already be lost. */ }
  // Release the GPU context promptly instead of waiting for canvas garbage collection.
  try { scene.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* Optional extension. */ }
}
