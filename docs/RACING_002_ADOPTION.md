# RACING-002 adoption — original arcade upgrades

Upstream inspiration: QSOLKCB/VANILLAJS PR #84 (source revision `5bc76a58d8d87284d8138f3ee5bd0f35dbb54bbe`).

The new games adapt original **design patterns**, not the demo-owned experimental Float64 Racing Lab.

| Game | Player-visible improvement | Runtime |
| --- | --- | --- |
| COAST RUN | 4 × 1,300 m stages, three left/right forks, evolving palette and bends, +20 s gates | Q16.16 + Canvas2D |
| VELOCITY II | Boosted momentum, gradual release and weaving traffic | Q16.16 + Canvas2D |
| OUTLAND ROAD | Defensive rival steering, improved nitro and swept contact checks | Q16.16 + Canvas2D |
| COASTAL SPRINT 3D | 3,600 m native WebGL road, four dynamic rivals, four gate markers, on-road finish, Canvas fallback | Q16.16 + pinned VANILLAJS Renderer |

The original garage game and already pinned SONIFICATION/VANILLAJS vendor assets are not modified.

## Evidence boundary

Simulation decisions and opponent manoeuvres depend only on the seeded state, explicit inputs and fixed 60 Hz ticks. WebGL appearance is floating-point and does not imply bit-for-bit pixel identity across devices. Static geometry is generated once; only nearby moving traffic is updated, an OPT invariant/working-set optimization pattern without claimed measured speedup.

The swept longitudinal contact rule is not full continuous 3D rigid-body collision. Scenic fork choices alter subsequent palette and rendered bend but **do not create physically divergent course topology**. The native WebGL view falls back to Canvas2D if unavailable or context-lost. Game art is original rather than copied from any commercial racing title.

Run `node --test tests/*.test.mjs`, `node scripts/verify-vendor.mjs`, `node scripts/site.mjs check`, and `node scripts/site.mjs build _site`. Hosted CI also runs the legacy browser suite plus the expanded five-game Playwright smoke suite and offline reloads.

## WebGL overlay and physical lane alignment (review hardening)

`#webgl-view` is absolutely positioned over `#race-canvas`, and the `hidden`
attribute overrides that display rule on context loss. The packaged Chromium
check compares both canvas and stage rectangles, checks a real WebGL context,
and verifies that a simulated context loss hides the overlay and repaints the
Canvas2D fallback.

The original asphalt slab spans 26 m (half-width 13 m). The player model's
outer tyre lies 1.57 m from vehicle centre (wheel offset 1.25 m plus
0.64 m wheel width / 2). Normalized lane `1.0` now places that tyre exactly
on the road edge: `13 - 1.57 = 11.43` metres per lane. Lane `1.2`
visibly crosses the road edge and triggers the simulation's off-road penalty.
A valid finish requires `|lane| <= 0.95`, keeping the entire car inside
the asphalt with a deliberate safety margin. Unit tests project actual mesh
wheel vertices onto the same road-normal axis and check both Q16.16 rules.

## Superseded by RACING-003 for track geometry and length

RACING-003 replaces the previous 5.2 km scenic road and 3.6 km WebGL sprint
with 19.2 km authored roads, reuses a **pinned** VANILLAJS Track Foundry
validation/centreline module, and separates the viewer from source-owned
mutable editor drafts. See `docs/RACING_003.md` for the current contracts.
Older RACING-002 notes above describe the preceding milestone.
