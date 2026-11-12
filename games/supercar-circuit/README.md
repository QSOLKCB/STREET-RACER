# VELOCITY II — Supercar Circuit

An original Need for Speed II–inspired browser arcade racer. Choose a supercar and an Alpine Pass, canyon or coastal track; drive a three-lap pseudo-3D race against five opponents. Uses the shared fixed-step Q16.16 race engine, projected canvas renderer, VANILLAJS clock, OPT-derived bounded near-phase selection and SONIFICATION audio. No commercial assets, names or source code are included.

Launch [index.html](index.html) from the built site or an HTTP server at the repository root.

## RACING-002 handling

Boost now exceeds the normal speed cap and loses momentum gradually on release. Rivals change lanes deterministically; the Q16.16 contact detector tests longitudinal motion during each tick rather than only at its endpoint.
