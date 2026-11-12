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

The first implementation has 31 regression tests:

| Area | Coverage |
| --- | --- |
| Career and economy (21) | All eight rivals through a legally played championship; car ownership, upgrade prices/effects, recovery after losing the last car; immutable rejected actions; one-time settlement and save/reload. |
| Determinism and admission | Twelve course/seed replay pairs; 30/60/120 Hz fixed-step equivalence; queued manual shifts; extreme controls; UTF-8 save bounds, finite values, prototype-bearing input and identity limits. These are included in the career total. |
| Audio (5) | No audio allocation before activation; deterministic E8-derived score; missing audio support; pause/mute/resume; bounded voices and instrument buffers; no burst after a long frame. |
| Renderer (5) | Rounded fractional-DPR geometry, unchanged backing-store reuse, finite bounded perspective, deterministic road geometry, read-only input state and unavailable Canvas2D. |

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

The browser clock advances genuine animation frames and input processing; the suite does not mutate live simulation state. `__streetRacer` exposes only copied observation snapshots. Injected browser-capability failures and stored-save fixtures are explicitly identified in the tests.

Each run retains `test-results/browser/result.json`, screenshots and failed attempts in an Actions artifact for fourteen days. Its receipt records browser version, completed checks, page errors, failed HTTP responses, external runtime requests and hashes of the staged source. A passing run requires all checks and empty error/request lists. Use the workflow run attached to the exact PR head; the pull request records the inspected run and artifact digest.

The managed local environment was also tried: its bundled browser executable was missing, and the available system Chromium was blocked before page load by denied socket creation. Those local attempts are preserved under `evidence/first-night`. They are not browser passes; hosted Actions supplies browser evidence.

## Review fixes included

Independent review reproduced and fixed exhausted pink-slip prize identities, oversized race identity exports, controller-disconnect continuation, keyboard-only audio recovery, hidden mobile help/save actions and inaccessible quarantined-save recovery after a normal reload. Delayed file reads are also invalidated when the user changes dialogs. Critical simulation admission fixes have regression tests; browser interaction paths are exercised by the hosted suite.

## Limits

- Racing is an arcade simulation using bounded JavaScript numbers, not a formally verified physical model. There is no vehicle-to-vehicle collision model in this version.
- Same-source, same-runtime replay is tested. Cross-engine bit-identical floating-point results are not claimed.
- Headless Chromium and emulated touch do not establish physical-phone, gamepad hardware, Firefox, WebKit or subjective listening quality.
- Native Canvas inspection is separate from browser screenshots. Native pixel receipts do not substitute for running the packaged application.
- There is no before/after runtime benchmark for this new game. Fixed-step limits, backing-store reuse and bounded audio resources are inspectable contracts, not a universal performance promise.
- Merge, release and Pages enablement remain owner actions. PR validation does not deploy the public site.
