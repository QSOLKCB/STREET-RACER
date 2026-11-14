# Validation and evidence

STREET RACER separates simulation checks, presentation checks and actual browser play. A deterministic controller completing a career establishes reachability for that policy; it does not establish human difficulty or universal balance. A renderer receipt establishes the tested pixel contract, not a GPU speed claim.

## Local regression gate

Run from the repository root with Node 24:

```sh
node --test tests/*.test.mjs
node scripts/verify-vendor.mjs
node scripts/site.mjs check
node scripts/site.mjs build _site
```

The current implementation has 47 regression tests:

| Area | Coverage |
| --- | --- |
| Career and economy (21) | All eight rivals through a legally played championship; car ownership, upgrade prices/effects, recovery after losing the last car; immutable rejected actions; one-time settlement and save/reload. |
| Determinism and admission | Twelve course/seed replay pairs; 30/60/120 Hz fixed-step equivalence; queued manual shifts; extreme controls; UTF-8 save bounds, finite values, prototype-bearing input and identity limits. These are included in the career total. |
| Audio (5) | No audio allocation before activation; deterministic E8-derived score; missing audio support; pause/mute/resume; bounded voices and instrument buffers; no burst after a long frame. |
| Renderer (5) | Rounded fractional-DPR geometry, unchanged backing-store reuse, finite bounded perspective, deterministic road geometry, read-only input state and unavailable Canvas2D. |
| Arcade (16) | Five modes with longer objectives; invalid timesteps; same-input repeatability; hostile control values; five highway stages and a flat-out tour lasting over 80 s; rivals recovering from contact immunity; boost that accumulates and bleeds off; no upward teleport after falling under the stunt deck; five circuit laps; five derby knockouts with health remaining; football goals; stunt gaps, respawns and three laps; finite bounded WebGL geometry and paint mapping; the retro road projection and a mutation-free draw; bounded audio telemetry; and the entry points and safety handlers. |

The source-hashed Node receipt and its original output are in [evidence/first-night](evidence/first-night/). The donor verifier checks every pinned file against the checked-in SHA-256 manifest and rejects unknown vendor files. The site gate checks every local module import and the complete, content-addressed offline inventory.

## Hosted browser gate

[Test and deploy STREET RACER](../.github/workflows/pages.yml) stages the exact public files, installs Playwright 1.62.1 in an isolated runner-temporary directory, and executes [tests/browser.mjs](../tests/browser.mjs) in Chromium. No browser tooling is a game dependency.

The browser suite serves the game under `/STREET-RACER/`, the same path shape as GitHub Pages, and checks:

- Initial empty garage, eight classifieds, first purchase, every navigation view, upgrades, tuning, paint and local reload.
- Explicit sound activation and generated audio buffers, mute and persisted display/transmission preferences.
- A cash drag race driven with keyboard throttle through the real application animation loop to a settled result.
- One-time settlement, repairs, refuelling, manual gear shifts, pause/resume, released input, restart and practice retirement.
- Both road environments, steering, braking and focus-loss pause.
- Pink-slip confirmation, loss of the last car and recovery through workshop earnings.
- Export, malformed/oversized import rejection, cancelled import and confirmed restoration.
- Exact repeated/fresh renderer pixels at fractional DPR, 320/390px layout/navigation/help/save access, and emulated touch hold/release/pause.
- Offline worker reload and continued driving, disabled storage with working export, quarantined-save recovery after reload, and Canvas2D failure with surviving controls.
- All five arcade side events launched from the garage, driven with the keyboard, checked for drawn Canvas pixels or a live WebGL canvas, paused on blur with a frozen tick count, resumed, paused with Escape, exported as a parsed run JSON, and exited with the career byte-identical.

The browser clock advances genuine animation frames and input processing; the suite does not mutate live simulation state. `__streetRacer` exposes only copied observation snapshots. Injected browser-capability failures and stored-save fixtures are explicitly identified in the tests.

Each run retains `test-results/browser/result.json`, screenshots and failed attempts in an Actions artifact for fourteen days. Its receipt records browser version, completed checks, page errors, failed HTTP responses, external runtime requests and hashes of the staged source. A passing run requires all checks and empty error/request lists. Use the workflow run attached to the exact PR head; the pull request records the inspected run and artifact digest.

The managed local environment was also tried: its bundled browser executable was missing, and the available system Chromium was blocked before page load by denied socket creation. Those local attempts are preserved under `evidence/first-night`. They are not browser passes; hosted Actions supplies browser evidence.

## Review fixes included

Independent review reproduced and fixed exhausted pink-slip prize identities, oversized race identity exports, controller-disconnect continuation, keyboard-only audio recovery, hidden mobile help/save actions and inaccessible quarantined-save recovery after a normal reload. Delayed file reads are also invalidated when the user changes dialogs. Critical simulation admission fixes have regression tests; browser interaction paths are exercised by the hosted suite.

## Limits

- Racing is an arcade simulation using bounded JavaScript numbers, not a formally verified physical model. Career races detect rival and traffic contact with a one-dimensional swept longitudinal check plus a lane-overlap test and apply stylised speed, condition and lateral nudges; this is contact detection with scripted response, not a rigid-body solver. The arcade uses linear impulse contacts without swept collision.
- Hosted Chromium renders WebGL through SwiftShader. That exercises the code path, not GPU drivers, real-device frame rates or visual quality on hardware.
- Same-source, same-runtime replay is tested. Cross-engine bit-identical floating-point results are not claimed.
- Headless Chromium and emulated touch do not establish physical-phone, gamepad hardware, Firefox, WebKit or subjective listening quality.
- Native Canvas inspection is separate from browser screenshots. Native pixel receipts do not substitute for running the packaged application.
- There is no before/after runtime benchmark for this new game. Fixed-step limits, backing-store reuse and bounded audio resources are inspectable contracts, not a universal performance promise.
- Merge, release and Pages enablement remain owner actions. PR validation does not deploy the public site.

## Arcade side events and longer roads (local evidence)

[evidence/arcade-side-events](evidence/arcade-side-events/) holds the Node receipt for the 47-test suite and a local headless Chromium receipt for all 18 browser checks, produced with the pinned Playwright module and a locally installed Chromium build rather than the hosted runner. It records the five arcade modes launched, driven, paused, exported and exited with the career unchanged. The hosted workflow run attached to the pull request remains the authoritative browser evidence.
