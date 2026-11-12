# RACING-003 — STREET-RACER Track Foundry

**Status:** experimental original playable browser-native implementation.
The original STREET RACER career remains at the repository root.

## From short on-rails runs to long authored roads

| Game | Previous length | RACING-003 course |
| --- | ---: | ---: |
| VELOCITY II | 6.6 km | **14.4 km** (three 4.8 km laps) |
| COAST RUN | 5.2 km | **19.2 km** (four 4.8 km authored legs) |
| COASTAL SPRINT 3D | 3.6 km | **19.2 km** (four 4.8 km authored legs) |
| OUTLAND ROAD | 5.0 km | **12.0 km** (two 6 km endurance laps) |

A/D and left/right keys control the integer lateral lane at 60 Hz.
Steering input now produces an observable vehicle displacement on screen,
rather than a completely tracking chase camera. The signed steer lane is
visible in every racing game's HUD. Real Chromium keyboard checks
assert movement in both directions for every standalone racer.

COAST RUN has 16 road sections, 15 time-extension checkpoints and **12
explicit fork decisions** (three per leg). The donor Track Foundry function
integrates section curvature and eases a chosen left/right branch into the
following stage's world-space centreline. RACING-003 joins repeated legs
continuously: each leg starts at the previous leg's actual endpoint, with
bounded half-width interpolation at the seam. Every branch has different
physical X coordinates. The player remains in coordinates relative to the
road, avoiding teleporting the car at the decision boundary.

The sprint's WebGL scene draws only a bounded 1.4 km near window, remeshing
at most once per 200 m or on a route selection. It uses the same centreline,
half-width, driver lane and actual authored pack as the fixed-step simulation.
This is an OPT invariant/working-set optimization design, **not** a claim
of a measured speedup or of cross-device bit-identical pixels.

## Editor and portable data

[Track Foundry](../games/track-foundry/index.html) is a new offline page.
Creators can:
- choose one of three local JSON preset packs or the original upstream starter
- edit four section curves, widths, fork separation and environment
- select a scenic-mode road preview or a circuit preview showing gate geometry
- drag eight ordered gates and change their X/Z numerically
- drive a live Q16.16 ten-lap circuit against the authored gate route
- import/export validated **16 KiB maximum**, inert JSON packs
- apply a pack to COAST RUN or COASTAL SPRINT via current-tab sessionStorage

Track pack format is exactly `qsol.vanillajs.track.v1`, unchanged.
The validator rejects unknown fields, exotic prototypes, getters, holes,
invalid sections, gates closer than 24 m, and crossing polygon segments.
A rejected import never replaces the active track. Later asynchronous reads
cannot overwrite subsequent user edits. Track objects are independently
validated/frozen; game state never holds a mutable editor record.

Upstream evidence: `QSOLKCB/VANILLAJS` commit
`4d55d06ac3852307e7013468fff7b195da548929`,
source file `demos/racing-lab/track.js`,
vendored at `vendor/vanillajs/racing-track/track.js`,
SHA-256 `e81fdb79e3378273c1623daea58fbfb538d6d9da71a8a214ec4bf2eaa1c765f2`.
Existing Apache-2.0 LICENSE and NOTICE remain present and unchanged.
The `vendor/PROVENANCE.json` inventory is checked on every CI run.

## Driving and verification boundaries

- Source of truth: integer Q16.16 simulation tick, explicit input, seeded
  rivals and ordered fork choices. Visual WebGL/Canvas projection is
  floating point; no exact cross-GPU pixel equivalence is claimed.
- Circuit steering uses fixed-point state with explicitly rounded sine/cosine
  at each tick. This provides deterministic same-runtime replay, not an
  independently proved trigonometric arithmetic refinement.
- WebGL lane movement and pseudo-3D driving remain arcade abstractions,
  not rigid-body vehicle suspension, tyre dynamics or beam-contact physics.
- Track packs do not include scripts or arbitrary executable content.
  No remote runtime CDNs, analytics, accounts or cloud state are introduced.
- No third-party commercial game asset, vehicle likeness or layout is copied.

Verification:
```sh
node --test tests/*.test.mjs
node scripts/verify-vendor.mjs
node scripts/site.mjs check
node scripts/site.mjs build _site
# hosted CI: node tests/browser.mjs && node tests/racer-browser.mjs
```

Regression tests must cover actual A/D browser input, long-course clocks,
all fork trajectories and leg seams, hostile pack parsing, circuit gate
simulation, import/export and editor-to-game hand-off, focus cancellation,
offline deep-link reload and WebGL-to-Canvas fallback. CI is authoritative
for its executed checks; this document does not claim physical-GPU acceptance.
