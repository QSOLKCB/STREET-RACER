# STREET-RACER monorepo architecture · Phase 1

## Deployment and compatibility

The repository currently contains **five playable racing experiences**. The first is the original career game kept at `/` for existing bookmarks, root service-worker scope, save-game compatibility and the established Chromium checks. `games/street-racer/README.md` records this explicit package boundary. A later migration of original files requires separate redirects, import rewrites, service-worker tests and saved-career compatibility proofs; this PR does **not** silently break those interfaces.

All new games are ordinary static pages below `games/`. Root `arcade-hub.html` links to all of them. `scripts/site.mjs` packages all new directories, rejects symlinks and checks every local ES-module import. Its content-addressed service worker must be refreshed after asset changes; offline navigation falls back to the cached **requested game page** before the legacy root. Each standalone game registers the root-scoped worker on HTTPS or localhost, so direct deep links support offline reloads after the initial precache. CI runs the complete local test, actual offline deep-link reloads and browser suite before Pages deployment.

## Shared dependencies and provenance

| Source | Use | License/source policy |
| --- | --- | --- |
| QSOLKCB/VANILLAJS | Direct import: `vendor/vanillajs/modules/time/index.js` (`FixedClock`), `vendor/vanillajs/modules/math/index.js` (`seededRandom`). Existing pinned copies and SHA-256 entries are reused as-is. | Apache-2.0; see vendor/vanillajs/LICENSE and NOTICE |
| QSOLKCB/SONIFICATION | Existing pinned `APP/js/namespace.js`, `math64.js`, and `synthesis.js`; FM/additive sample generation happens at sound-cue time **after a browser gesture**, not every frame. | MPL-2.0; see vendor/sonification/LICENSE and NOTICE. The copied implementation is not modified. |
| QSOLKCB/OPT | The technique **OPT-REDUCE-001 (early working-set reduction)** shapes near-distance culling and 11-fixture render window; **OPT-DSP-001** informs separating slow sound-cue generation from high-frequency engine control. The read revision is `7556dd36acd53ed3ed538fd03b1db44e5c1ec869`. | Reference methodology, not imported runtime code or independently verified speedup |

All new files are authored under the repository Apache-2.0 license. The game names, art, track layouts, vehicles and code are original; historical commercial games are inspirations, not an asset donor. No direct game-franchise affiliation is claimed.

## Race contracts

- Fixed simulation step **60 Hz** via the vendored VANILLAJS clock, at most 15 updates per rendered browser frame; elapsed time is clamped and over-budget time is not silently simulated as a giant physics step.
- Gameplay position, speed, lane and rivals are stored as safe-integer Q16.16 units (`Q=65,536`). Race ticks take normalized keyboard/touch actions; no browser timing, network or ambient random values enter the tick function.
- Seeded initial opponent positions and speeds use the pinned VANILLAJS generator. Identical seed and input tape should replay identically **inside the same JS implementation**. Visual projection, Web Audio and browser float DSP have separate reproducibility boundaries; no cross-platform bit-identity is claimed for pixels or sound.
- Fixed bounds: 5–7 opponents, 11 roadside fixtures and 920 m drawing range. Opponent collision and weapon interactions consider only the local active window. Separate output-mode tests demonstrate no regression to the existing game.
- Coast checkpoint: timer starts at 90 s and three gates add 20 s each; road combat: 12-round ammo and deterministic cooldown; circuit: 3 laps.
- All three games can be paused, restarted, driven with keyboard or touch; focus loss and hidden tabs pause rather than allowing arbitrary time skips. WebAudio needs a user gesture, is optional and is muted on pause.

## Checks and limitations

`node --test tests/*.test.mjs` covers arithmetic bounds, deterministic input replay, mode-specific contracts, braking, off-road limits, weapon cooldown, timeouts and terminal idempotence. `node tests/racer-browser.mjs` (after `build` with Playwright available) exercises all three game pages and captures browser evidence. Original tests and vendor fingerprint checks continue unchanged.

This is a **playable proof-of-concept**, not a pixel-accurate Need for Speed II, OutRun or Outlander reimplementation: physics are arcade approximations, track elevations are render-only and traffic AI is currently lane-fixed. OPT methods are implemented but performance gains have not been established by an A/B benchmark. Do not imply a formal proof of the physics or of numerical speedups.

## Review hardening: runtime lifetime and sound feedback

- Every simulation tick clears and fills its own ordered `events` array; `lastEvent` remains the latest-tick compatibility field. `advanceRaceFrame` aggregates all event batches from a bounded `FixedClock.advance` call and publishes them once for HUD and SFX, so sub-60-FPS rendering cannot suppress cues.
- The audio adapter is silenced within the terminal step and cannot schedule another engine gain for that frame. Regression tests cover finish and collision destruction.
- `pagehide.persisted` pauses play, clears input and cancels the RAF without disposing the optional audio receiver. `pageshow.persisted` starts a single fresh RAF with reset wall-clock origin; players must explicitly resume. Non-persisted navigation still disposes audio. The browser suite tests simulated BFCache restoration and real Back navigation.

## RACING-002 upgrade

The fifth package is `games/coastal-sprint/`. Its `shared/racer/webgl.js` composes the existing pinned VANILLAJS WebGL renderer, while `shared/racer/course.js` defines an original analytic centreline and touring palette progression. The game stays Q16.16; 3D geometry uses render-only floating point and is outside replay identity. Static geometry is built once, and only the bounded traffic mesh is updated per render.

COAST RUN commits three route choices at 1,300 m thresholds. Forks change palette and downstream *rendered* road curvature, not independent physical junction topology. Rivals perform deterministic defensive lane changes. Longitudinal swept contact is 1D detection, **not** full 3D rigid-body physics.

VANILLAJS reference: merged PR #84 head `5bc76a58d8d87284d8138f3ee5bd0f35dbb54bbe`. Existing SHA-256-pinned vendor code remains unchanged.

## RACING-003 authored Track Foundry contract

See [RACING_003.md](RACING_003.md) for the source SHA, Q16.16 integration,
explicit stored-pack ownership, authored road/circuit semantics, compatibility
and verification. The editable circuit is gate-distance-parametric, not an
unclaimed free-roaming 2D kinematic solver. Existing Q16.16 race modes, root
career and pinned vendor files retain their independent evidence boundaries.

## Integration resolution — Track Foundry and Endurance Studio

The independently authored RACING-003 branches have been reconciled *without
silently replacing either implementation*. The classic arcade and original
Track Foundry from PR #5 are unchanged; PR #6's enhanced road-simulation
modules are namespaced as `shared/racer/*-endurance.js`, and its runnable
courses are `games/endurance-*/`. PR #6's advanced creator is now
`games/track-foundry-studio/`, not a replacement for the saved-pack editor.

Both use the same source-pinned upstream `track.v1` schema from
`vendor/vanillajs/demos/racing-lab/track.js`, which remains indexed by the
existing SHA-256 vendor provenance manifest. Independent Node and Chromium
suites cover the two numerical paths, both editors and their offline entries.
The static site inventory is regenerated and strictly pinned before merging.
