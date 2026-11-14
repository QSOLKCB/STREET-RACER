# RACING-003 Endurance Collection — integration and verification

## Why there are two Track Foundry paths

PR #5 established the existing arcade with an explicit source-pinned
VANILLAJS Track Foundry data contract. PR #6 separately developed a larger
Endurance system. Both branches changed the same core filenames with
different numerical contracts. Choosing either side of a textual merge would
discard working features.

The integrated tree therefore deliberately retains **both**.
The original `games/{coast-run,coastal-sprint,supercar-circuit,outland-road}/`
and `games/track-foundry/` keep their established URLs and behaviour. Their
existing `shared/racer/{app,sim,renderer,webgl,foundry}.js` files remain the
source-pinned Q16.16 runtime from PR #5.

The Endurance modes run in separate page paths:

| Game | Authored distance | Dedicated entrypoint |
| --- | ---: | --- |
| VELOCITY II | 14.4 km | `games/endurance-supercar-circuit/` |
| COAST RUN | 19.2 km | `games/endurance-coast-run/` |
| COASTAL SPRINT 3D | 19.2 km | `games/endurance-coastal-sprint/` |
| OUTLAND ROAD | 12 km | `games/endurance-outland-road/` |

Their code is namespaced as `shared/racer/{app,sim,config,frame,renderer,
webgl,foundry,circuit}-endurance.js`. The Endurance Track Foundry Studio
is `games/track-foundry-studio/` with bundled JSON-only presets and an
independently drivable Q16.16 ten-lap authored circuit.

## Geometry, streaming and numerical evidence

- PR #6 Endurance steering uses signed Q16.16 lane state and player displacement
  visible in Canvas2D. The WebGL chase camera follows 35% of lateral motion.
- Four 4.8 km joined legs yield twelve explicit left/right route decisions,
  each easing into a different world-space centreline with bounded width.
- The WebGL 3D sprint retains a **240 m rear buffer** behind each 200 m
  streaming anchor and a bounded **1,400 m forward buffer**. This keeps
  asphalt and ground under the 16 m rearward chase camera at rebuilds.
  The regression samples actual generated asphalt vertices at every boundary.
- No full rigid-body collision solver, measured renderer speedup or
  cross-device pixel-bit identity is claimed. Same-runtime input-driven Q16.16
  behaviour is subject to independent regression tests.

## Single pinned VANILLAJS donor

Both editors use the **same unchanged** donor at
`vendor/vanillajs/demos/racing-lab/track.js`, source commit
`4d55d06ac3852307e7013468fff7b195da548929`.
No second copy of the same donor or duplicate provenance entry is needed.
PR #5's strict source validation, Q16 compiler, saved-pack admission and
legacy career game remain intact. PR #6's Endurance Studio uses the same
strict data-only validator but separate in-memory/session-scoped packs.

## Verification

```sh
node --test tests/*.test.mjs
node scripts/verify-vendor.mjs
node scripts/site.mjs check
node scripts/site.mjs build _site
# CI browser stage:
node tests/browser.mjs
node tests/racer-browser.mjs
node tests/racer-endurance-browser.mjs
```

CI for the combined tree, not separate green CI runs on independent branches,
is the authoritative acceptance gate. No merge into `main`, release or tag
is performed without owner approval.
