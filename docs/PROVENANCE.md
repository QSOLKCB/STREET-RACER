# Source provenance and music contract

STREET-RACER is an original garage and racing game. It uses small, pinned components from the five QSOLKCB projects requested in the repository brief. It needs no CDN, package download, remote music service or network request during play. Runtime donor files remain byte-identical to the pinned sources.

| Repository | Exact commit | Used source | Runtime purpose | Licence |
| --- | --- | --- | --- | --- |
| QSOLKCB/VANILLAJS | `227dd5ee0f2821b8e30a151524830f0a0027cf11` | `modules/time/index.js` | Fixed-step 60 Hz clock with bounded catch-up and pause reset | Apache-2.0 |
| QSOLKCB/VANILLAJS | `1c195d910405e89a6f98ecc914309ff583f0ac7e` | `modules/math/index.js`, `modules/render-webgl/index.js` | Clamp and quaternion maths, the seeded generator behind career hazards, strip crosswind and traffic placement, and the low-poly XYZ/RGB WebGL renderer used by the arcade's 3D modes | Apache-2.0 |
| QSOLKCB/GAMES | `7e0a9019d07b491cffc9b698fa51acdb843c49cc` | `shared/qsol-input.js` | Standard gamepad reader, deadzones, button edges and neutral rearming | MIT; the file also preserves its Apache-2.0 VANILLAJS derivation notice |
| QSOLKCB/ARCADE | `f29b780734a50171d55ae2f770930db8a487b31c` | `js/core.js` | Seeded `Arcade.rng` generates the percussion and tyre noise buffer once per audio context | Apache-2.0 |
| QSOLKCB/E8_MUSIC | `d8e5983d84af03f03a969abe3356dcf80c0e0e97` | `js/e8-core.js` | E8 root generation, seeded traversal, projection, pitch quantization and MIDI-frequency conversion for original instrumental phrases | MPL-2.0 |
| QSOLKCB/SONIFICATION | `2ca65c6540d7051a77ed571b83f5a9df453094ec` | `APP/js/namespace.js`, `APP/js/math64.js`, `APP/js/synthesis.js` | Music-first laboratory Karplus-Strong instrument, cached by pitch and sample rate | MPL-2.0 |

The original licence and applicable notice files are included alongside each donor. `vendor/PROVENANCE.json` lists all 18 source/licence files with repository, full commit SHA, source path, local path and SHA-256. `node scripts/verify-vendor.mjs` rejects changed or unrecorded donor bytes. The GAMES reader retains attribution to its earlier VANILLAJS input source; the complete upstream notices remain in the package. The root Apache-2.0 licence applies to original STREET-RACER code; the separate MPL-2.0 and MIT donor files retain their respective licences and editable source.

## Arcade side events adapt a VANILLAJS pull request

`js/arcade.js`, `js/arcade-geometry.js` and `js/arcade-render.js` adapt the
Racing Lab demo from [QSOLKCB/VANILLAJS pull request #83](https://github.com/QSOLKCB/VANILLAJS/pull/83)
at head commit `a32953075e42cebe6866d17cb86ee7c796186e9d` (`demos/racing-lab/world.js`,
`geometry.js` and `app.js`, Apache-2.0). They are STREET-RACER source, not vendored
bytes: objectives were lengthened, the player's car takes the career paint, the
presentation moved into the garage shell and the audio feeds the existing receiver.
Each file header records the source. The pull request was a draft at the time of
adaptation; this repository does not depend on it merging. The pinned engine
modules above come from VANILLAJS `main` and are byte-identical to the pull
request's copies.

## Music is an authored interpretation

`js/audio.js` creates a seeded 64-step phrase from the ambient 240-root E8 set, a golden projection and a seeded traversal. The game chooses E minor pentatonic pitch quantization, 440 Hz A4 tuning, an E/E/C/D bass progression, rhythm, tempo, synthesis and mixing. Those musical choices are **not intrinsic E8 properties**, and this is **not canonical ETQ-101 sound, scientific audification, or a physical claim**.

The SONIFICATION code comes only from its separate `APP/` music-first laboratory. STREET-RACER neither imports nor changes SONIFICATION's root ETQ export workflow. Its root output restrictions remain intact.

The garage track uses restrained plucked-string phrases, bass, kick, snare and hats. Race mode raises the tempo and adds an RPM-controlled engine and tyre noise. Engine pitch and intensity follow bounded game telemetry; no purported exact acoustic vehicle model is claimed. Audio is off initially and creates an AudioContext only following explicit sound activation. Pause/focus loss suspends it; only an explicit resume can restart a paused receiver.

## Resource bounds

- No audio timers: the app's presentation frame calls `audio.update(raceOrNull)`.
- At most 24 transient voices, three reused continuous sources, and 64 synthesized note buffers.
- A single seeded half-second noise buffer is shared by percussion and tyre noise.
- Missed music beats are skipped after a long frame; they never produce an unbounded catch-up burst.
- Muting zeros the master immediately, stops transient voices and suspends the context. Disposal disconnects sources and closes the context.
- Node tests exercise deterministic phrase construction, bounded telemetry and audio lifecycle with an instrumented context. Browser checks can verify actual Web Audio starts, pauses and resumes; neither establishes subjective listening quality or physical-device coverage.

## Original game content

Cars, rival names, track layouts, garage artwork, race presentation, campaign fiction and arrangements are original to STREET-RACER. The arcade courses, vehicles and modes are original work shared with the VANILLAJS Racing Lab; Skyline Span follows the elevated-stunt genre without reproducing any commercial track, asset or level data. The historical *Street Rod* reference informs the buy/tune/challenge/race loop; no original game binaries, artwork, recordings, car badges or dialogue are included.
