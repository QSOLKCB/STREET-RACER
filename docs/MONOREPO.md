# STREET-RACER monorepo architecture · Phase 1

## Deployment and compatibility

The repository currently contains **four playable racing experiences**. The first is the original career game kept at `/` for existing bookmarks, root service-worker scope, save-game compatibility and the established Chromium checks. `games/street-racer/README.md` records this explicit package boundary. A later migration of original files requires separate redirects, import rewrites, service-worker tests and saved-career compatibility proofs; this PR does **not** silently break those interfaces.

All new games are ordinary static pages below `games/`. Root `arcade-hub.html` links to all of them. `scripts/site.mjs` packages all new directories, rejects symlinks and checks every local ES-module import. Its content-addressed service worker must be refreshed after asset changes; offline navigation falls back to the cached **requested game page** before the legacy root. CI runs the complete local test and browser suite before Pages deployment.

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
