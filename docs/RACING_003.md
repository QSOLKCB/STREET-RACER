# RACING-003 — Track Foundry Integration

**Status:** Experimental integration submitted through a draft pull request.
The original garage career and the four earlier arcade-racing entry points
retain their routes, saves, controls, rendering fallbacks and offline scope.

## Origin and provenance

RACING-003 imports the **unmodified**, Apache-2.0 VANILLAJS source
`demos/racing-lab/track.js` from immutable source commit
`4d55d06ac3852307e7013468fff7b195da548929` (RACING-002B merged).
It lives at `vendor/vanillajs/demos/racing-lab/track.js` with a SHA-256
entry in `vendor/PROVENANCE.json`, checked against the actual bytes
by `scripts/verify-vendor.mjs`.

No VANILLAJS game-specific Float64 physics is imported. The new game-owned
`shared/racer/foundry.js` compiles admitted track sections and gates into
integer Q16.16 values used by STREET-RACER's existing fixed 60 Hz simulation.
Operations with fixed-point products use bounded BigInt intermediates,
truncation toward zero and safe-integer output checks. Canvas/WebGL geometry
uses floating point for presentation only.

## Player-facing workflow

From the [Racing Arcade](../arcade-hub.html), open
[Track Foundry](../games/track-foundry/index.html). Edit an original track's
name, environment, four 1,200 m sections and eight gates. The Canvas preview
draws the possible branch routes in **COAST RUN** and the authored gate polygon
in **VELOCITY II**. The track can be exported as an inert
`qsol.vanillajs.track.v1` JSON file and restored from a valid JSON file.

**Validate & Race** explicitly stores the selected track locally and
opens the matching arcade game:

| Game | Track consequence | Physical scope |
| --- | --- | --- |
| COAST RUN | 4 × 1,200 m stage sequence, three left/right decisions | Each choice changes the Q16.16 centreline after the fork; world position is updated from centreline + lane |
| COASTAL SPRINT 3D | 4,800 m original authorable road and checkpoints | Static WebGL asphalt and moving vehicles follow source geometry and variable road widths; the strict on-road finish is retained |
| VELOCITY II | Eight edited gates and derived polygon perimeter | Lap distance and progression follow ordered gate segments; 2D pseudo-3D projection responds to actual polygon shape |

The original 3,600 m 3D sprint, 5,200 m COAST RUN and 2,200 m
VELOCITY II tour remain available if no custom track is selected.
The existing `modeSettings`, cars, engine/fuel/boost and combat
rules retain their source-owned contracts.

A saved pack is only read for the matching arcade mode. On import the editor
validates the format/version, complete schema, limits, array descriptors,
gate spacing and polygon topology using the pinned VANILLAJS implementation.
JSON files are bounded to 16 KiB and are not executable. Failed imports
do not replace the active draft. An explicit **Clear saved track** action
restores the built-in mode; changing the course selector also allows
using the original named scenic presets. No accounts or external
asset dependencies are introduced.

## Engineering boundaries

- The authoritative race contains integer `distanceQ`, `speedQ`,
  `laneQ`, `worldXQ`, `worldZQ`, and Q16.16 compiled track positions.
  A Float64 representation may still be used by Canvas/WebGL to project
  geometry, but it is not a new physics state.
- The 3D sprint aligns asphalt width, car placement and Q16.16 normalized
  lane offsets using the same admitted per-section half-width and tyre
  half-width (1.57 m).
- Custom circuits are **ordered gate-distance road courses**. The car is
  controlled along a road with steering/lateral offsets, not free 2D rigid-body
  navigation between arbitrary XY waypoints. Full wheel contact and
  arbitrary continuous collision response remain future phases.
- This milestone does not replace existing vehicle handling with another
  model or claim physical tyre simulation, GPU speedup, cross-engine
  bit-exact rendering or formal numerical refinement of VANILLAJS Float64.
- Source portability is versioned and explicit. The donor Track Foundry
  JSON is compatible at the *data* boundary, not a claim that the two
  independent games have identical behaviour or replay hashes.

## Verification

```sh
node --test tests/*.test.mjs
node scripts/verify-vendor.mjs
node scripts/site.mjs check
node scripts/site.mjs build _site
```

Hosted Playwright also checks all original games, the root career,
validated Track Foundry export/import, 4.8 km authored sprint with live
WebGL and offline deep-link reload, authored coastal and circuit modes,
invalid-input rejection, mode-specific saved-pack admission and 390 px
responsive editor layout.

The generated content-addressed service worker is refreshed only from
the complete allowlisted public tree and committed for byte-exact CI.
Source-pinned vendor checks and full offline inventory checks are not skipped.

**No release, tag, or merge is authorised by this draft.**


## Codex P2 follow-up — review hardening

The source Float64 validator is authoritative for the 24 m minimum gate
separation. Integer compilation only rejects zero/unsafe segment lengths:
rounding component coordinates to Q16.16 can shorten a valid segment by one
or two Q16 units and must not contradict source admission. The editor's save
and the game loader both compile validated packs before use.

The game acquires optional localStorage in a try/catch (the getter can throw
SecurityError) and fails open to the built-in course. Changing the course
selector applies a fresh race immediately rather than resuming the previous
course at an incompatible tick. Coast and Sprint world coordinates initialize
from the touring centreline, independent of the circuit gate coordinates.
Direct Track Foundry deep links register the same root-scope offline worker
as the arcade games; a fresh browser profile can reopen the editor offline.
