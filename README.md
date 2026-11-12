<p align="center">
  <img src="assets/icon.svg" width="104" height="104" alt="An original orange STREET RACER coupe">
</p>

<h1 align="center">STREET RACER</h1>

<p align="center"><strong>A little cash. An empty bay. A whole county to make your name.</strong></p>
<p align="center">An original browser garage-and-racing game from QSOL-IMC.<br>Buy the project. Build the motor. Earn the boulevard crown.</p>

<p align="center">
  <a href="https://github.com/QSOLKCB/STREET-RACER/actions/workflows/pages.yml"><img src="https://github.com/QSOLKCB/STREET-RACER/actions/workflows/pages.yml/badge.svg" alt="Test and deploy STREET RACER workflow"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Original_code-Apache--2.0-dc7746" alt="Original code: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/Browser-HTML_%C2%B7_CSS_%C2%B7_JavaScript-628b9c" alt="Native HTML, CSS and JavaScript">
  <img src="https://img.shields.io/badge/Play-Offline_after_first_load-b9cab5" alt="Offline play after the first load">
</p>

<p align="center">
  <strong>8 original classics · 8 rivals · 3 roads · 18 upgrades · 4 garage bays · 5 arcade side events</strong><br>
  <a href="#play-locally">Play locally</a> ·
  <a href="docs/GAMEPLAY.md">Driver's handbook</a> ·
  <a href="docs/ARCADE.md">Arcade side events</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/PROVENANCE.md">Source provenance</a> ·
  <a href="docs/VALIDATION.md">Validation evidence</a>
</p>

---

## RACING-003: Track Foundry Integration

[**Track Foundry**](games/track-foundry/index.html) lets you author original
four-stage touring routes, physically different branches and eight-gate racing
circuits. It accepts and exports the source-pinned VANILLAJS Track Foundry
JSON format, compiles game distances and lane geometry into Q16.16, and sends
validated courses to **COAST RUN**, **COASTAL SPRINT 3D** (authored 4.8 km),
or **VELOCITY II**. The existing career and built-in roads stay available.
[Design, scope and verification](docs/RACING_003.md).

## Welcome to Redline County

It is the summer of ’67. Your garage is empty, your budget is $2,400, and the
regulars are gathering at the diner. A $900 Kestrel Sparrow is enough to get
started. What happens after that is up to your right foot and your parts budget.

STREET RACER takes inspiration from *Street Rod*'s buy, tune, challenge and race
loop, with an original setting, vehicles, rivals, artwork and soundtrack. It has
no accounts, remote game services, CDN assets or runtime package installation.
The game runs as a small static website, with local saves and offline play after
the initial installation completes.

### Wrench. Race. Repeat.

- **Build a collection.** Buy and sell eight fictional classics with different
  power, weight and grip. Choose an active car from four garage bays.
- **Make the build matter.** Fit three upgrade levels in each of six categories:
  engine, intake, exhaust, transmission, tyres and suspension. Tune the final
  drive, pick a paint colour, service the motor and fill the tank.
- **Drive the race.** Manage throttle, braking, steering and automatic or manual
  gears. Read the bends, avoid roadwork markers and watch the tachometer.
- **Choose the stakes.** Practice without costs, challenge a rival for cash, or
  deliberately risk the active car in a pink-slip race.
- **Earn the crown.** Defeat the county's eight regulars and challenge The Monarch
  on Blackridge Pass. The garage and races remain available after victory.
- **Keep going after a loss.** A workshop shift always earns $180, even after
  losing the last car. There is no career deadline.
- **Burn a Saturday at the arcade.** Five stake-free side events, from a
  pseudo-3D highway to an elevated stunt course, in your own car's paint.

## Three roads, three reasons to build

| Event | Distance | What matters |
| --- | ---: | --- |
| **Foundry Quarter** | 402 m | A clean launch, acceleration and well-timed shifts. |
| **Saltline Run** | 4,800 m | Long flowing coastal bends, a stable line and useful top speed. |
| **Blackridge Pass** | 6,400 m | Cornering grip, braking, fuel and composure through the hills. |

The workshop and classified listings use original Canvas2D car illustrations.
The racing view adds roadside scenery, curves, a rival, instruments and a
readable race-progress display. The interface supports narrow screens, touch
controls, high contrast and the system's reduced-motion preference.

An original instrumental score combines E8-derived phrase material with
plucked-string synthesis, bass and percussion. Engine and tyre sounds respond
to game telemetry. **Sound starts only when you turn it on.** The musical
mapping is an authored interpretation, not a scientific claim about E8 or engines.

## Five ways to burn a Saturday

The **Arcade** view runs five original side events that never touch your career:

| Side event | Picture | Finish |
| --- | --- | --- |
| **Horizon Tour** | Canvas2D pseudo-3D highway with traffic and nitro | 5 stages, 7,500 m |
| **Vector Ring** | Low-poly WebGL circuit, eight gates, four rivals | 5 laps |
| **Impact Arena** | Demolition derby against hunting rivals | 5 knockouts |
| **Boost Pitch** | Car football with jumps, drifts and boost | First to 5 goals |
| **Skyline Span** | Narrow elevated course with two real gaps | 3 laps |

They adapt the Racing Lab from [VANILLAJS pull request #83](https://github.com/QSOLKCB/VANILLAJS/pull/83)
on top of the pinned VANILLAJS WebGL renderer and maths. Every run can export a
JSON receipt of its per-tick inputs. See the [arcade guide](docs/ARCADE.md).

## Play locally

The browser game needs **no build step and no npm install**. Serve the repository
with Python's standard library:

```sh
git clone https://github.com/QSOLKCB/STREET-RACER.git
cd STREET-RACER
uv run --no-project python -m http.server 8000 --bind 127.0.0.1
```

Open **<http://127.0.0.1:8000/>** in a modern browser. Use the HTTP address rather
than opening `index.html` directly: browser modules and service workers need a
served origin. For offline use, allow the first page load and service-worker
installation to complete before disconnecting.

1. Buy the Sparrow from the garage or choose another affordable classified.
2. Go to the night meet and take a practice run at the Foundry Quarter.
3. Leave shifting on automatic and hold the throttle through the countdown.
4. Challenge Mags for cash when ready, then spend your winnings on the next build.

The stock Sparrow can win that first challenge. Tyres, suspension and a clean
line become more useful as the road gets less straight.

### Driving controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Accelerate | **W** / **↑** | Right trigger |
| Brake | **S** / **↓** / **Space** | Left trigger |
| Steer | **A / D** or **← / →** | Left stick |
| Shift up / down | **E / Q** | Right / left shoulder |
| Pause / resume | **Esc** / **P** | Start |
| Restart current run | **R** | Pause menu |
| Boost (arcade) | **Shift** | Shoulder button |
| Drift / jump / flip (arcade) | **X** / **Space** / **F** | X / A / Y |

Touch buttons are on the race screen. Keyboard and touch steering ramp in over a
short moment so a tap nudges the car instead of snapping it; a gamepad stick is
read directly. Controls are released and racing pauses when the window loses
focus or the tab is hidden; resume deliberately when ready.
Let gamepad controls return to neutral after connecting or reconnecting.

Revving during the three-second countdown is allowed. In manual mode, shift
around **6,000–6,250 rpm**; sustained redline above **7,100 rpm** damages the engine.
There is no jump-start penalty in this version.

## Your garage stays yours

Career changes automatically save to this browser. **Save / load** exports a JSON
backup or imports one on another device, with validation and confirmation before
replacement. Invalid saves leave the current career intact; an unreadable local
save is retained for recovery. If browser storage is unavailable, play still
works and the interface asks you to export before leaving.

Practice does not spend money, wear the car, use fuel, grant reputation or write
best-time records. Cash and pink-slip results settle once after the race. An
unfinished race is not saved; reloading returns to the last garage save. These
are local, owner-editable saves, with no online leaderboard or anti-cheat claim.

Read the [full gameplay guide](docs/GAMEPLAY.md) for costs, rival invitations,
pink-slip rules, recovery and the championship route.

## Built from good parts

The game uses small source-pinned components from the five repositories named
in its original brief. They are included locally with their licences:

| Project | Contribution |
| --- | --- |
| **VANILLAJS** | Fixed-step clock with bounded catch-up, vector/quaternion maths and the low-poly WebGL renderer behind the arcade. The arcade rules adapt its Racing Lab pull request. |
| **GAMES** | Standard gamepad input and neutral rearming. |
| **ARCADE** | Seeded noise used by percussion and tyre sound. |
| **E8_MUSIC** | Root generation, projection and traversal for original musical phrases. |
| **SONIFICATION** | Plucked-string instrument from its separate music-first application. |

[Source provenance](docs/PROVENANCE.md) records exact commit SHAs, file paths,
licences and how each component is used. The machine-readable
[vendor manifest](vendor/PROVENANCE.json) records the source-file hashes.
The runtime never fetches these projects from the network.

## Development and verification

Development checks use **Node.js 24 or newer**, without installing project
dependencies. Python is sufficient for playing the unbundled game.

```sh
node --test tests/*.test.mjs
node scripts/verify-vendor.mjs
node scripts/site.mjs check
node scripts/site.mjs build _site
```

After changing a public game file, regenerate and review the offline inventory:

```sh
node scripts/site.mjs refresh
node scripts/site.mjs check
```

`build` stages only the public game, manifest, licences and vendor sources in
`_site`; it does not bundle, minify or download anything. The test suites exercise
career transitions, save admission, deterministic replay, race settlement,
rendering contracts, audio resource bounds and the five arcade side events. Hosted browser checks exercise the
packaged game and preserve their receipts and screenshots, including failures.

The workflow installs pinned Playwright tooling in an isolated runner-temporary
directory. That is a **CI development tool**, not a game dependency. See
[validation evidence](docs/VALIDATION.md) for executed results and limitations;
the presence of a test or workflow is not itself a passing result.

### GitHub Pages

[The Pages workflow](.github/workflows/pages.yml) verifies pull requests and
changes to `main`. After successful verification on `main`, it deploys the staged
static game. In the repository's **Settings → Pages → Build and deployment**, the
source must be **GitHub Actions**.

The expected project address is
<https://qsolkcb.github.io/STREET-RACER/> after that configuration and a successful
deployment. This README does not assert that the initial deployment is already live.

## Engineering boundaries

The simulation is a deterministic arcade driving model, with finite resource
bounds and regression evidence. It is not a validated real-vehicle simulation or
a formally proved game. Rendering avoids unnecessary canvas reallocation and
audio limits active resources; those choices do not establish a universal
performance improvement. Browser and device coverage is recorded separately in
the validation report.

The [architecture guide](docs/ARCHITECTURE.md) explains state ownership, replay,
bounded timing, input recovery, rendering, audio and offline updates.

## Licence and credits

Original STREET-RACER code and content are **Apache-2.0**; see [LICENSE](LICENSE).
Vendored Apache-2.0, MIT and MPL-2.0 files retain their own licences and notices.
No *Street Rod* binaries, artwork, recordings, vehicle badges or dialogue are
included. The historical game is credited as an inspiration for the gameplay loop.

<p align="center"><strong>QSOL-IMC · AFTER HOURS MOTOR WORKS</strong><br>Your build. Your story.</p>


## Racing monorepo — five playable games

[**Open the Racing Arcade**](arcade-hub.html) to choose from these independently runnable games:

| Game | Location | Experience |
| --- | --- | --- |
| STREET RACER (existing) | [root](index.html); [package boundary](games/street-racer/README.md) | Garage, career, tuning and arcade side events. Kept at the root for backwards-compatible GitHub Pages, saves and CI. |
| VELOCITY II | [games/supercar-circuit/](games/supercar-circuit/index.html) | Original 1990s supercar circuit racer inspired by the *Need for Speed II* era; five rivals, car/track choice, three laps, nitro. |
| COAST RUN | [games/coast-run/](games/coast-run/index.html) | Original *OutRun*-inspired scenic checkpoint highway racer; countdown and three time extensions. |
| OUTLAND ROAD | [games/outland-road/](games/outland-road/index.html) | Original *Outlander*-inspired road-combat arcade racer; ammunition, collision damage, takedowns. |
| COASTAL SPRINT 3D | [games/coastal-sprint/](games/coastal-sprint/index.html) | Native WebGL point-to-point coast, four rivals, 900 m gates and on-road finish validation. |

The new games share `shared/racer/` (integer Q16.16 race rules, pseudo-3D Canvas renderer, controls and optional synthesis). Their page entrypoints and docs are in `games/`. All paths are relative and work on GitHub Pages' `/STREET-RACER/` subpath. The existing career game, `vendor/` pin inventory, and source-compatible PWA are preserved.

**Repository integration:** the new runtime imports VANILLAJS's pinned `FixedClock` and `seededRandom`, directly calls the pinned SONIFICATION `APP/js/synthesis.js` on requested sound cues, and implements OPT's early working-set reduction for collision, weapon and rendering candidates. OPT is an optimization methodology, **not** a linked library or a proof of speed. Exact source commitments and scope are in [docs/MONOREPO.md](docs/MONOREPO.md); copied donor files and their SHA-256 fingerprints remain verified by `vendor/PROVENANCE.json`.

Local verification (Node 24+, no runtime package install):

```sh
node --test tests/*.test.mjs
node scripts/verify-vendor.mjs
node scripts/site.mjs refresh # regenerate the content-addressed PWA precache when files change
node scripts/site.mjs check
node scripts/site.mjs build _site
```

For a full Chromium check, use the GitHub Actions workflow; it drives the existing STREET RACER UI and all three new games. Builds contain only local public files. No telemetry, external assets or paid service is needed.

All new game content is original and is **inspired by** retro racing genres; it does not contain or claim to be an official clone of any commercial franchise.

### RACING-002 upgrade (VANILLAJS PR #84)

COAST RUN now has four 1,300 m stages, three lane-selected forks with deterministic histories, palette and road-curve changes, and timed checkpoints. VELOCITY II and the combat racers gain nitro momentum that bleeds off gradually, tactical rival lane changes and integer longitudinal swept-contact detection. COASTAL SPRINT 3D adds an original 3,600 m winding WebGL course, scenery and rival traffic, with Canvas2D fallback. The existing STREET-RACER Q16.16 simulation remains authoritative; VANILLAJS RACING-002's Float64 lab is a design reference, not a copied simulation. See [adoption details](docs/RACING_002_ADOPTION.md).
