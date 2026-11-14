# The boulevard is yours to earn

STREET-RACER is an original browser garage-and-racing game inspired by the
buy, build, challenge and race loop of classic street-racing games. The cars,
rivals, routes, writing and progression in this repository are original.

## A first evening

You begin with **$2,400 and an empty four-bay garage**. Buy the $900 Kestrel
Sparrow from the classifieds. It can beat Mags at the Foundry Quarter without
upgrades: choose automatic shifting, hold the throttle through the green light,
and let the four-speed box work. Practice first if you want a run without costs.

Cash challenges require enough cash to cover the displayed wager. A win earns
the rival's wager plus a purse; a loss pays the wager. Your first win against
each rival earns the full purse and advances your reputation. Repeat wins earn
35% of the purse and two reputation. Rivals do not become permanently unavailable
after a win. There is no calendar deadline or loss screen that destroys a career.

Workshop shifts are always available, including when you have no car and no
cash. Each shift earns **$180** and advances one day. Five shifts can buy a new
Sparrow after a complete pink-slip loss. This is a recovery route and a way to
fund a build; it does not grant reputation.

## The garage

Eight fictional cars cover light sedans, a coupe, a pickup, a muscle car and
fastbacks. Each has its own power, mass, grip and top speed. All cars can be
bought when affordable; reputation controls rival invitations, not the car lot.

| Car | Year | Purchase price | Stock power |
| --- | --- | ---: | ---: |
| Kestrel Sparrow | 1954 | $900 | 98 hp |
| Morrow Eight | 1957 | $1,500 | 142 hp |
| Vela Comet | 1959 | $2,600 | 183 hp |
| Rook Raven | 1961 | $4,000 | 218 hp |
| Bison Stepside | 1956 | $4,300 | 262 hp |
| Aster Meteor | 1964 | $6,500 | 292 hp |
| Nocturne Phantom | 1965 | $9,200 | 334 hp |
| Regent Sovereign | 1966 | $13,200 | 378 hp |

There are six part categories, each with three purchasable upgrades beyond
factory specification:

- **Engine, intake and exhaust:** increase power; exhaust also reduces weight.
- **Transmission:** improves acceleration and reduces the time spent changing gear.
- **Tyres and suspension:** increase traction and grip, helping the launch and bends.

Upgrades are fitted immediately and charged once. The next level's displayed
price is the complete price of that purchase. Parts stay with a car when it is
sold or won; sale value depends on the model, installed specification and condition.

Final-drive tuning is free. A shorter drive trades some top speed for
acceleration; a longer drive does the reverse. A balanced setting is useful while
learning. Repainting costs $60. Service restores condition, and refuelling fills
the tank; both prices reflect the missing amount and are shown before purchase.

Cash and pink-slip races require at least **15% condition and 8% fuel**. This is
an admission floor, not a promise that a nearly empty tank will finish every
route. Service and refuel before a long challenge.

## The roads

| Route | Length | Character |
| --- | ---: | --- |
| Foundry Quarter | 402 m | Straight quarter-mile under the foundry lights. Forgiving, but the car still drifts. |
| Aqueduct Half | 805 m | Half a mile down a walled concrete channel. Torque steer and wind pull at the wheel. |
| Saltflat Mile | 1,609 m | A standing mile across the dry lake; crosswind at top speed demands corrections. |
| Saltline Run | 4,800 m | Long flowing coastal road with gentler bends and roadwork markers. |
| Ridgeline Drive | 5,600 m | Night road race. Two lanes; oncoming traffic owns the left one. |
| Blackridge Pass | 6,400 m | Long hill-road run with tighter curves and roadside markers. |
| Interstate 67 | 8,000 m | Three-lane highway with slower same-direction traffic, including trucks. |

The simulation advances in **fixed 1/60-second steps**. The browser may render
at another refresh rate; accumulated frame time feeds the same steps. Pausing
stops simulation time. A three-second countdown prevents either car from moving.
You may rev during the countdown; this version has no jump-start disqualification.

Automatic shifting changes up around **6,250 rpm**. With manual shifting, change
up around **6,000–6,250 rpm**, before sustained redline above 7,100 rpm damages
the engine. Holding a shift key causes only one change; release and press again
for another gear. Short sub-frame key presses are retained until a simulation
step consumes them.

Throttle, braking, gear choice, traction, condition and final drive affect the
car's acceleration. Speed is displayed by the interface in km/h; the simulation
uses metres and seconds. The model is intentionally an arcade driving model,
not a mechanical engineering or real-road performance model. The estimated
0–100 figure is a build comparison, not a measured vehicle certification.

Keyboard and touch steering ramp in over about 0.14 s and release in 0.07 s, so
a tap nudges the car rather than snapping it; a gamepad stick is read directly.
Steering authority grows with speed. On road events, steer against the bend and
keep the car on the paved surface.
Excess speed in a tight corner scrubs speed; leaving the road slows and damages
the car. Clipping a cone or barrel costs speed and condition. Their positions are
seeded, so the same career state and race can be retried consistently.

On the drag strips the wheel matters too. Wheelspin on the launch pulls a
powerful car to one side, and a seeded crosswind wanders every car at speed, so
hold your lane with small corrections. Drifting past the shoulder scrapes the
wall, which costs speed and condition; the quarter rarely needs a correction,
the half mile sometimes does and the standing mile usually does.

Cars touch when their lanes overlap: the car behind loses most of the speed,
both lose a little condition and they are nudged apart. Rivals follow a
deterministic line and never steer into the player's lane deliberately, but a
rival that merges or passes can trade paint if you hold the same lane.

Two roads carry traffic. **Ridgeline Drive** runs at night with oncoming cars
and trucks in the left lane; a head-on nearly stops the car and costs 14–30%
condition. **Interstate 67** has three lanes of slower traffic in your
direction; rear-ending a car drops you in behind it at its pace and costs
6–14% condition, while traffic that runs into the back of a slowed car shoves
it forward, costs 4–10% and never pushes it back down the road. A contact in
the same step as a finish-line crossing cannot change the result: the winner
and the interpolated crossing time come from the driven positions. Every traffic vehicle is placed from the race seed before the
green light, so a retried race meets the same traffic. The rival reads the same
traffic, changes lanes or brakes to avoid it and can crash into it as well.

The first car across the line wins. If both cross during the same simulation
step, interpolated finish times decide the result. Mechanical failure, a complete
fuel stop, retirement or the time limit loses the challenge. Race time limits are
120, 150 and 200 seconds on the three strips, 420 seconds on Saltline Run,
480 on Ridgeline Drive, 600 on Blackridge Pass and 540 on Interstate 67. A
stock Sparrow needs roughly two minutes for the coast, about three and a
quarter for the Pass and a little over three for the highway, so fuel and
condition matter more on the long roads.

## Invitations and the crown

| Rival | Reputation needed | First-win purse | Cash wager | Home route |
| --- | ---: | ---: | ---: | --- |
| Mags — The Regular | 0 | $280 | $75 | Foundry Quarter |
| Patch — Night Shift | 10 | $450 | $125 | Aqueduct Half |
| June — Coastline | 22 | $700 | $200 | Saltline Run |
| Wren — Switchback | 36 | $1,000 | $300 | Blackridge Pass |
| Sol — Heavy Weather | 52 | $1,450 | $450 | Interstate 67 |
| Val — After Hours | 70 | $2,000 | $600 | Saltflat Mile |
| Kit — Ghost Line | 90 | $2,800 | $800 | Ridgeline Drive |
| The Monarch — Boulevard Crown | 112 | $4,200 | $1,000 | Blackridge Pass |

Each new rival defeated grants enough reputation to reach the next invitation,
in order: 10, 12, 14, 16, 18, 20, 22 and 24. Repeated victories can also build
reputation, so you can keep racing a favourite route while saving for a car.

Earlier rivals accept challenges on any route. **The Monarch's competitive
challenge must take place on Blackridge Pass**. Defeat the Monarch in a cash or
pink-slip race to earn the crown. The career remains playable afterwards.

### Pink slips

A pink-slip challenge risks the active car. Win and the rival's car joins your
garage, with its installed parts and remaining condition/fuel. Lose and your
active car is removed. The interface asks for confirmation before this stake.
You need a free bay for a potential prize, and the rival will decline a very
underpowered build. A win also earns the applicable purse, but no cash wager.

### Practice

Practice uses a fresh temporary tank and full condition. It changes no cash,
cars, fuel, wear, reputation, win/loss totals or best-time records. It still records
that an attempt was completed. Practice does not unlock the crown. Unlocked
rivals may practise on all three routes, including the Monarch away from the Pass.

## The arcade

The **Arcade** view runs five stake-free side events: Horizon Tour (five 1,500 m
highway stages), Vector Ring (five laps), Impact Arena (five knockouts), Boost
Pitch (first to five goals) and Skyline Span (three elevated laps with real gaps).
They use your active car's paint and nothing else from the career; cash, cars,
fuel, condition, reputation and records are untouched. **Shift** boosts, **X**
drifts, **Space** jumps in the 3D modes and **F** flips while airborne. The
[arcade guide](ARCADE.md) covers each mode, the controls and the run JSON export.

## Saves and result integrity

The public save envelope is JSON:

```json
{ "format": "street-racer", "version": 1, "career": {} }
```

The actual `career` object contains the budget, garage, installed parts, progress,
best times and the last twenty workshop/race entries. Imports are bounded to
64 KiB of UTF-8 and validate finite numbers, integer money, known model/rival/part
identities, unique car identities, garage size and championship consistency.
Prototype-related object keys are rejected. Invalid saves are not repaired into a
different career or used to overwrite the current career.

Races hold a separate copy of the active car. Starting, stepping or restarting a
race cannot spend career cash. A finished result settles once against the exact
career revision from which it started; duplicate or stale settlements are
rejected, including after saving and reloading an already settled career. This
protects normal UI actions from double payment. Browser save files are editable
by their owner and are not an anti-cheat or authenticated leaderboard format.

## Executed simulation checks

Run the suite from the repository root with:

```sh
node --test tests/core.test.mjs tests/arcade.test.mjs
```

The arcade suite covers the five side events separately. The career suite exercises garage/economy transitions; malformed, oversized and hostile
save inputs; resource admission; a stock starter win; manual redline and road
costs; fixed-step parity at 30/60/120 presentation Hz; queued shift presses;
deterministic replay over all routes and four seeds; practice isolation; one-time
settlement; recovery from zero cash/no car; and a complete campaign through the
Monarch using only legal purchases, upgrades, workshop jobs and played races.

The complete campaign test uses a specified steering controller and buys two
upgrade levels in all six categories. It proves that a valid route to the ending
exists under that policy. It does not prove human difficulty, every possible
build's viability or general game balance. Browser and visual checks are tracked
separately from this pure simulation suite.
