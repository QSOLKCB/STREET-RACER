# AGENTS.md — STREET-RACER monorepo

## Scope

- Keep the original root career game (`index.html`, `js/`, `style.css`,
  saves, root PWA) working unless a separate compatibility plan is reviewed.
- Racing arcade games live under `games/`; shared runtime code lives under
  `shared/racer/`; all source is native browser HTML/CSS/ES modules.
- No Node/NPM build-time dependencies at runtime, no CDN and no telemetry.
- Use VANILLAJS only from verified pinned modules in `vendor/`. After copying
  donor bytes, append a SHA-256 source record to `vendor/PROVENANCE.json`,
  retain LICENSE/NOTICE, and run the inventory check.
- Do not change source pins silently or mutate donor files in place.
- Track packs are untrusted inert data, validated before use. Never execute
  pack-supplied JavaScript, URL payloads or arbitrary network requests.
- Fixed 60 Hz input-driven simulation, safe Q16.16 integer state and
  replay evidence take precedence over visual shortcuts.
- WebGL is optional; Canvas2D fallback, pause and BFCache recovery must stay
  playable. Do not confuse display frame rate with simulation ticks.
- Preserve failed tests/reproductions. Correctness outranks speed.

## Review and gates

Run `node --test tests/*.test.mjs`, `node scripts/verify-vendor.mjs`,
`node scripts/site.mjs check` and `node scripts/site.mjs build _site`.
Browser CI covers the static Pages subpath, keyboard steering, offline
navigation, editor and WebGL fallback. Any added public file requires an
explicit content-addressed `sw.js` refresh and commit before merge.
Do not merge or publish tags/releases without owner authorization.
