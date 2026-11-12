# The arcade: five side events

The **Arcade** view in the garage sidebar opens five stake-free racing modes. They
never read or write career cash, car condition, fuel, reputation or records. The
only career fact they use is the active car's paint, which colours the player's
car in every mode.

The modes adapt the Racing Lab from
[QSOLKCB/VANILLAJS pull request #83](https://github.com/QSOLKCB/VANILLAJS/pull/83)
(head `a32953075e42cebe6866d17cb86ee7c796186e9d`, Apache-2.0). STREET-RACER owns
the rules in `js/arcade.js`, the low-poly art in `js/arcade-geometry.js` and the
presentation in `js/arcade-render.js`. The WebGL renderer and vector maths are
pinned, unmodified VANILLAJS modules under `vendor/vanillajs/modules/`.

## The five modes

| Mode | Picture | Challenge | Finish |
| --- | --- | --- | --- |
| **Horizon Tour** | Canvas2D pseudo-3D highway | Curved horizon, five traffic cars, nitro, road shoulders | 4 stages × 1,500 m = 6,000 m |
| **Vector Ring** | WebGL low-poly circuit | Eight ordered gates, four rivals, body contact | 5 laps |
| **Impact Arena** | WebGL low-poly arena | Ram four hunting rivals; manage body damage and boost | 5 knockouts |
| **Boost Pitch** | WebGL low-poly pitch | Car football: jump, drift, boost and shoot | First to 5 goals |
| **Skyline Span** | WebGL elevated course | Narrow roadway, two real missing spans, ramps, hard landings | 3 laps |

The objectives are longer than the donor demo's (three stages, three laps, four
knockouts and two laps) so a side event lasts a few minutes rather than one.
A flat-out Horizon Tour takes well over a minute of simulated time; Vector Ring
and Skyline Span take several minutes with contact and respawns.

Skyline Span takes the *genre* of elevated stunt driving: a narrow course, real
gaps, hard landings and the road itself as the opponent. The track, vehicles,
code and appearance are original. No third-party game assets or level data are
reproduced in any mode.

## Controls

| Action | Keyboard | Touch | Standard gamepad |
| --- | --- | --- | --- |
| Accelerate | **W** / **↑** | THROTTLE | Right trigger |
| Brake / reverse | **S** / **↓** (and **Space** on Horizon Tour) | BRAKE | Left trigger |
| Steer | **A / D** or **← / →** | ← → | Left stick |
| Boost | **Shift** | BOOST | Either shoulder button |
| Drift (handbrake) | **X** | DRIFT | X / Square |
| Jump (3D modes) | **Space** | JUMP | A / Cross |
| Aerial flip | **F** | FLIP | Y / Triangle |
| Pause / resume | **Esc** / **P** | Pause button | Start |
| Restart | **R** | Pause menu | Pause menu |

Keyboard and touch steering ramp in over about 0.14 s and release in 0.07 s, so a
tap nudges the car instead of snapping it. A gamepad stick bypasses the ramp.
The same ramp applies to career races. Controls release and the run pauses on
window blur, page hide, tab hiding or a controller disconnect; resuming is a
deliberate action.

## Simulation

A side event advances only through `stepArcade(world, input, dt)` at a fixed
**1/60 s**. The app passes the exact fixed step from a second VANILLAJS
`FixedClock` (`maxFrame` 0.1 s, `maxSteps` 8), so a stalled tab cannot create an
unbounded catch-up burst. Input is the explicit caller-supplied object; there is
no ambient randomness, network or external asset.

Driving uses Float64 velocity, rate-limited yaw, traction blending, linear
collision impulses, boost, vertical gravity and ground clamping. The elevated
course height is a piecewise function with **no floor under the two gaps**; a car
that falls returns to its last saved track interval with a damage penalty. In the
derby the player's ram deals more than it suffers so five knockouts are reachable;
a unit test proves that within one body. This is stylised arcade physics, not a
tyre or suspension solver, and repeating the same inputs in the same runtime
reproduces the same world. Cross-engine bit-exactness is not claimed.

Engine and tyre sound reuse the career race receiver. `arcadeTelemetry` maps
speed to a bounded synthetic rpm and gear, and boost or drift raise the pitch or
the tyre noise. It is an audio mapping, not a vehicle model.

## Run JSON

**Download run JSON** on the pause screen or result card writes:

```json
{ "format": "street-racer-arcade-run", "version": 1, "mode": "circuit", "step": 0.016666,
  "inputs": [], "observation": { "tick": 0, "elapsed": 0, "result": "" } }
```

`inputs` holds the explicit input object for every simulation tick, bounded to the
most recent 36,000 ticks (ten minutes). It is a same-runtime replay receipt, not
a save file, an importer or a certified cross-browser witness.

## What is verified

- `node --test tests/arcade.test.mjs` covers initialisation, invalid timesteps,
  same-input repeatability, hostile control values, the four-stage tour, five
  circuit laps, five derby knockouts with health remaining, football goals, stunt
  gaps and respawns, three stunt laps, finite bounded geometry, the retro road
  projection, a mutation-free retro draw and the audio telemetry bounds.
- The hosted browser suite launches every mode, drives it with the keyboard,
  checks drawn Canvas pixels and a live WebGL canvas, pauses on blur, exports and
  parses a run, and confirms the career is byte-identical afterwards.

Hosted Chromium uses SwiftShader for WebGL. That establishes the code path, not
GPU performance, driver coverage or real-device frame rates.

## Limits and next steps

- No swept collision: very high-speed impacts can overlap for a tick.
- Opponent pathfinding is a simple pursuit; it is not claimed optimal.
- No multiplayer, ghosts, authored track packs or integer-exact kernel yet.
- If WebGL is unavailable the 3D modes report it and keep their instruments and
  pause controls; Horizon Tour needs only Canvas2D.
