import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, PARTS, RIVALS, COURSES, SLOT_IDS } from '../js/catalog.js';
import { createCareer, validateCareer, serializeSave, parseSave, getActiveCar, carStats,
  applyAction, repairCost, refuelCost, upgradeCost, saleValue, canRace, startRace,
  stepRace, settleRace, forfeitRace, roadCurve, gapAhead, sweptContact, STEP, SAVE_LIMIT,
  CAR_WIDTH, FLOW_LANES, ONCOMING_LANE } from '../js/core.js';

const copy = value => JSON.parse(JSON.stringify(value));
const act = (state, action) => {
  const result = applyAction(state, action);
  assert.equal(result.ok, true, result.message);
  return result.state;
};
const starter = (seed = 1967) => act(createCareer(seed), { type: 'buy', modelId: 'sparrow' });

// An explicit test driver, not a claim about human difficulty or a hidden game
// assist. It is a pure function of the race state, so two runs with the same
// seed produce the same input tape.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function driver(race) {
  const player = race.player, opponent = race.opponent, course = race.course;
  const ratio = player.speed / (player.stats.topSpeed / 3.6);
  const curve = roadCurve(course, player.distance);
  let target = course.type === 'drag' ? -0.35 : course.traffic === 'oncoming' ? 0.35 : -0.28, throttle = 1, brake = 0;
  if (course.traffic === 'oncoming') {
    const rivalAhead = opponent.distance - player.distance;
    const rivalBlocks = Math.abs(opponent.x - 0.35) < CAR_WIDTH + 0.1 && rivalAhead > -6 && rivalAhead < 45 && opponent.speed <= player.speed + 1;
    const leftClear = gapAhead(race, player, ONCOMING_LANE, 150 + player.speed * 4) === Infinity;
    if (rivalBlocks && leftClear) target = -0.4;
    else if (rivalBlocks && rivalAhead < 14) { throttle = 0; brake = 0.5; }
    if (player.x < -0.05 && !leftClear) { target = 0.35; if (rivalBlocks) { throttle = 0; brake = 0.7; } }
  } else if (course.traffic === 'flow') {
    const lanes = [...FLOW_LANES].sort((a, b) => Math.abs(a - player.x) - Math.abs(b - player.x));
    const current = lanes[0], gap = gapAhead(race, player, current, 75);
    target = current;
    if (gap < 75) {
      let best = current, bestGap = gap;
      for (const lane of lanes.slice(1)) {
        if (Math.abs(lane - current) > 0.7) continue;
        const candidate = gapAhead(race, player, lane, 95);
        if (candidate > bestGap + 20) { bestGap = candidate; best = lane; }
      }
      target = best;
      if (best === current && gap < 28) { throttle = 0; brake = 0.5; }
    }
  } else if (course.type === 'road') {
    const hazard = race.hazards.find(item => !item.hit && item.distance - player.distance > 0 && item.distance - player.distance < 110);
    if (hazard && Math.abs(hazard.x - target) < 0.27) target = hazard.x > 0 ? -0.58 : 0.58;
  }
  return { throttle, brake, steer: clamp(curve * ratio * ratio * 0.82 / player.stats.grip / 1.5 + (target - player.x) * 2, -1, 1) };
}

function run(state, options, input = driver) {
  const start = startRace(state, options);
  assert.equal(start.ok, true, start.message);
  const race = start.race;
  let steps = 0;
  while (race.status !== 'finished' && steps++ < 40000) stepRace(race, input(race));
  assert.equal(race.status, 'finished');
  return race;
}

test('fresh career has a useful budget and requires an actual first car purchase', () => {
  const career = createCareer(123);
  assert.equal(career.cash, 2400);
  assert.equal(getActiveCar(career), null);
  assert.equal(canRace(career, { rivalId: 'mags', courseId: 'foundry' }).ok, false);
  const bought = starter(123);
  assert.equal(bought.cash, 1500);
  assert.equal(bought.cars.length, 1);
  assert.equal(career.cars.length, 0, 'garage actions do not mutate their input');
  assert.equal(getActiveCar(bought).modelId, 'sparrow');
  assert.deepEqual(validateCareer(bought), bought);
});

test('all cars, part levels, courses and rival dependencies resolve', () => {
  assert.equal(CARS.length, 8);
  assert.equal(new Set(CARS.map(item => item.id)).size, CARS.length);
  assert.equal(COURSES.length, 7);
  assert.deepEqual(COURSES.map(c => c.id).slice(0, 1), ['foundry'], 'the quarter stays the default course');
  for (const course of COURSES) assert.ok(['Drag strip', 'Road sprint', 'Night road race', 'Highway run'].includes(course.label));
  assert.equal(SLOT_IDS.length, 6);
  for (const part of PARTS) {
    assert.equal(part.levels.length, 4);
    assert.equal(part.levels[0].price, 0);
    assert.ok(part.levels.slice(1).every(level => Number.isSafeInteger(level.price) && level.price > 0));
  }
  for (const rival of RIVALS) {
    assert.ok(CARS.some(car => car.id === rival.carId));
    assert.ok(COURSES.some(course => course.id === rival.courseId));
  }
});

test('invalid purchases and unknown actions preserve career and cash', () => {
  const career = createCareer();
  for (const action of [{ type: 'buy', modelId: '__proto__' }, { type: 'buy', modelId: 'constructor' },
    { type: 'buy', modelId: 'sovereign' }, { type: 'upgrade', slot: 'engine' }, { type: 'bogus' }]) {
    const result = applyAction(career, action);
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, career);
  }
  assert.equal(career.cash, 2400);
});

test('garage occupancy, selection, resale and active-car replacement stay coherent', () => {
  let career = createCareer(); career.cash = 100000;
  for (const model of CARS.slice(0, 4)) career = act(career, { type: 'buy', modelId: model.id });
  assert.equal(applyAction(career, { type: 'buy', modelId: 'bison' }).ok, false);
  const first = career.cars[0];
  career = act(career, { type: 'select', carId: first.uid });
  assert.equal(getActiveCar(career).uid, first.uid);
  const cash = career.cash, value = saleValue(first);
  career = act(career, { type: 'sell', carId: first.uid });
  assert.equal(career.cash, cash + value);
  assert.equal(career.cars.length, 3);
  assert.equal(career.activeCarId, career.cars[0].uid);
  assert.deepEqual(validateCareer(career), career);
});

test('each upgrade changes its useful stat, is priced once and stops at level three', () => {
  for (const part of PARTS) {
    let career = starter(); career.cash = 100000;
    let previous = carStats(getActiveCar(career));
    for (let level = 1; level <= 3; level++) {
      const price = upgradeCost(getActiveCar(career), part.id), oldCash = career.cash;
      career = act(career, { type: 'upgrade', slot: part.id });
      const stats = carStats(getActiveCar(career));
      assert.equal(career.cash, oldCash - price);
      if (['engine', 'intake', 'exhaust'].includes(part.id)) assert.ok(stats.hp > previous.hp);
      if (['tyres', 'suspension'].includes(part.id)) assert.ok(stats.grip > previous.grip);
      if (part.id === 'gearbox') assert.ok(stats.acceleration > previous.acceleration && stats.shiftTime < previous.shiftTime);
      previous = stats;
    }
    assert.equal(upgradeCost(getActiveCar(career), part.id), null);
    assert.equal(applyAction(career, { type: 'upgrade', slot: part.id }).ok, false);
  }
});

test('service, fuel, paint and final-drive tuning have bounded explicit effects', () => {
  let career = starter();
  getActiveCar(career).condition = 40.5; getActiveCar(career).fuel = 12.4;
  const service = repairCost(getActiveCar(career)), fuel = refuelCost(getActiveCar(career));
  const budget = career.cash;
  career = act(career, { type: 'service' }); career = act(career, { type: 'refuel' });
  assert.equal(career.cash, budget - service - fuel);
  assert.equal(getActiveCar(career).condition, 100); assert.equal(getActiveCar(career).fuel, 100);
  const stats = carStats(getActiveCar(career));
  career = act(career, { type: 'tune', value: 1 });
  assert.ok(carStats(getActiveCar(career)).acceleration > stats.acceleration);
  assert.ok(carStats(getActiveCar(career)).topSpeed < stats.topSpeed);
  assert.equal(applyAction(career, { type: 'tune', value: Infinity }).ok, false);
  assert.equal(applyAction(career, { type: 'paint', color: 'url(script)' }).ok, false);
  career = act(career, { type: 'paint', color: '#8380ad' });
  assert.equal(getActiveCar(career).color, '#8380ad');
});

test('save roundtrip preserves every owned car and strict campaign state', () => {
  let state = starter(0); state = act(state, { type: 'upgrade', slot: 'intake' });
  state = act(state, { type: 'tune', value: 0.4 });
  assert.deepEqual(parseSave(serializeSave(state)), state);
  assert.deepEqual(createCareer(0).seed, 0, 'seed zero is not replaced with a default');
});

test('save admission rejects malformed, nonfinite, oversized and prototype-bearing input', () => {
  for (const raw of ['not JSON', '{}', '{"format":"street-racer","version":2,"career":{}}', ' '.repeat(SAVE_LIMIT + 1)]) assert.throws(() => parseSave(raw));
  const original = starter();
  for (const [key, value] of [['cash', -1], ['cash', 1.5], ['cash', Infinity], ['rep', NaN], ['version', 99], ['activeCarId', 'car-999'], ['champion', true]]) {
    const state = copy(original); state[key] = value;
    assert.throws(() => validateCareer(state), key);
  }
  const state = copy(original); state.cars[0].parts.tyres = 4;
  assert.throws(() => validateCareer(state));
  const duplicate = copy(original); duplicate.cars.push(copy(duplicate.cars[0]));
  assert.throws(() => validateCareer(duplicate));
  const hostile = JSON.stringify({ format: 'street-racer', version: 1, career: original }).replace('"career":{', '"career":{"__proto__":{"polluted":true},');
  assert.throws(() => parseSave(hostile), /forbidden/);
  assert.equal({}.polluted, undefined);
  const oversizedUnicode = JSON.stringify({ format: 'street-racer', version: 1, career: original, extra: 'é'.repeat(34000) });
  assert.ok(oversizedUnicode.length < SAVE_LIMIT);
  assert.throws(() => parseSave(oversizedUnicode), /64 KiB/);
});

test('accepted save identities remain bounded and roundtrip through formatted exports', () => {
  const state = starter();
  state.history = Array.from({ length: 20 }, (_, index) => ({ day: index + 1, text: 'x'.repeat(240) }));
  state.lastRaceId = `race-${'9'.repeat(59000)}-0-0`;
  const compact = JSON.stringify({ format: 'street-racer', version: 1, career: state });
  assert.ok(new TextEncoder().encode(compact).length < SAVE_LIMIT);
  assert.throws(() => parseSave(compact), /last race identity/);
  state.lastRaceId = 'race-4294967295-1000000000-1000000000';
  const accepted = parseSave(JSON.stringify({ format: 'street-racer', version: 1, career: state }));
  const exported = serializeSave(accepted);
  assert.ok(new TextEncoder().encode(exported).length < SAVE_LIMIT);
  assert.deepEqual(parseSave(exported), accepted);
});

test('car identity capacity rejects a pink-slip challenge before an unrepresentable prize', () => {
  const state = starter(); state.nextCarId = 1000000000;
  assert.deepEqual(validateCareer(state), state);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'pink' }).ok, false);
  assert.equal(startRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'pink' }).ok, false);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'cash' }).ok, true);
  const race = run(state, { rivalId: 'mags', courseId: 'foundry', stake: 'cash' });
  assert.equal(settleRace(state, race).ok, true, 'ordinary cash racing does not consume a car identity');
});

test('race admission respects reputation, fuel, condition, cash and garage risk', () => {
  const state = starter();
  assert.equal(canRace(state, { rivalId: 'monarch', courseId: 'canyon' }).ok, false);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'unknown' }).ok, false);
  getActiveCar(state).fuel = 1;
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry' }).ok, false);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'practice' }).ok, true);
  getActiveCar(state).fuel = 100; getActiveCar(state).condition = 2;
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry' }).ok, false);
  getActiveCar(state).condition = 100; state.cash = 0;
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry' }).ok, false);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'pink' }).ok, true);
  state.rep = 112; state.cash = 10000;
  assert.equal(canRace(state, { rivalId: 'monarch', courseId: 'foundry', stake: 'cash' }).ok, false);
  assert.equal(canRace(state, { rivalId: 'monarch', courseId: 'foundry', stake: 'practice' }).ok, true);
  assert.equal(canRace(state, { rivalId: 'monarch', courseId: 'canyon', stake: 'cash' }).ok, true);
});

test('countdown locks motion, pause locks time and the starter can win the first cash race', () => {
  const career = starter(); const untouched = serializeSave(career);
  const { race } = startRace(career, { rivalId: 'mags', courseId: 'foundry' });
  for (let i = 0; i < 179; i++) stepRace(race, { throttle: 1 });
  assert.equal(race.status, 'countdown'); assert.equal(race.player.distance, 0);
  race.paused = true; const ticks = race.ticks;
  for (let i = 0; i < 100; i++) stepRace(race, { throttle: 1 });
  assert.equal(race.ticks, ticks); race.paused = false;
  while (race.status !== 'finished') stepRace(race, { throttle: 1 });
  assert.equal(race.winner, 'player');
  assert.ok(race.player.condition > 99, 'automatic shifting and the top-speed governor do not burn the engine');
  assert.equal(serializeSave(career), untouched, 'race stepping cannot mutate the career');
  const result = settleRace(career, race);
  assert.equal(result.ok, true); assert.equal(result.state.wins, 1); assert.equal(result.state.rep, 10);
  assert.equal(result.state.cash, career.cash + RIVALS[0].wager + RIVALS[0].reward);
});

test('same seed and inputs replay byte for byte across all routes', () => {
  for (const seed of [0, 1, 1967, 0xffffffff]) for (const course of COURSES) {
    const state = starter(seed);
    const options = { rivalId: 'mags', courseId: course.id, stake: 'practice' };
    const first = run(state, options), second = run(state, options);
    assert.equal(JSON.stringify(first), JSON.stringify(second), `${seed}/${course.id}`);
    assert.equal(first.winner, 'player', `${seed}/${course.id}`);
    assert.ok(first.player.condition > 70 && first.player.fuel > 40, `${seed}/${course.id} fuel ${first.player.fuel}`);
    assert.ok(first.player.distance >= course.length);
  }
});

test('constant controls yield the same fixed ticks at 30, 60 and 120 presentation Hz', () => {
  const state = starter();
  const snapshots = [];
  for (const hz of [30, 60, 120]) {
    const { race } = startRace(state, { rivalId: 'mags', courseId: 'foundry' });
    for (let i = 0; i < hz * 8; i++) stepRace(race, { throttle: 1 }, 1 / hz);
    snapshots.push({ ticks: race.ticks, time: race.time, player: race.player, opponent: race.opponent });
  }
  assert.deepEqual(snapshots[0], snapshots[1]); assert.deepEqual(snapshots[1], snapshots[2]);
});

test('manual shifts survive sub-tick frames and held keys do not skip gears', () => {
  const { race } = startRace(starter(), { rivalId: 'mags', courseId: 'foundry', transmission: 'manual' });
  for (let i = 0; i < 180; i++) stepRace(race, {});
  stepRace(race, { shiftUp: true }, STEP / 2);
  assert.equal(race.player.gear, 1);
  stepRace(race, { shiftUp: true }, STEP / 2);
  assert.equal(race.player.gear, 2);
  for (let i = 0; i < 80; i++) stepRace(race, { shiftUp: true });
  assert.equal(race.player.gear, 2);
  stepRace(race, { shiftUp: false }); stepRace(race, { shiftUp: true });
  assert.equal(race.player.gear, 3);
});

test('manual redline, leaving the road, and hazards impose real costs', () => {
  const state = starter();
  const manual = run(state, { rivalId: 'mags', courseId: 'foundry', transmission: 'manual' }, () => ({ throttle: 1 }));
  assert.equal(manual.winner, 'opponent'); assert.ok(manual.player.condition < 90);
  const offroad = run(state, { rivalId: 'mags', courseId: 'coast' }, () => ({ throttle: 1, steer: 1 }));
  assert.equal(offroad.winner, 'opponent'); assert.ok(offroad.player.condition < 70);
  const { race } = startRace(state, { rivalId: 'mags', courseId: 'coast' });
  race.hazards = [{ distance: 5, x: 0, type: 'barrel', hit: false }];
  for (let i = 0; i < 400; i++) stepRace(race, { throttle: 1 });
  assert.equal(race.hazards[0].hit, true); assert.ok(race.player.condition < 95);
});

test('practice does not charge cash, consume resources, grant reputation or alter records', () => {
  const state = starter(); getActiveCar(state).condition = 3; getActiveCar(state).fuel = 1;
  const race = run(state, { rivalId: 'mags', courseId: 'canyon', stake: 'practice' });
  const result = settleRace(state, race); assert.equal(result.ok, true);
  for (const key of ['cars', 'cash', 'rep', 'wins', 'losses', 'defeated', 'champion', 'bestTimes']) assert.deepEqual(result.state[key], state[key], key);
  assert.equal(result.state.races, 1);
});

test('cash and pink-slip settlement happens once, including after save/reload', () => {
  const state = starter();
  const race = run(state, { rivalId: 'mags', courseId: 'foundry', stake: 'pink' });
  assert.equal(race.winner, 'player'); const result = settleRace(state, race);
  assert.equal(result.ok, true); assert.equal(result.state.cars.length, 2);
  assert.notEqual(result.state.cars[0].uid, result.state.cars[1].uid);
  const reloaded = parseSave(serializeSave(result.state));
  assert.equal(settleRace(reloaded, { ...race, settled: false }).ok, false);
  assert.equal(settleRace(state, race).ok, false);
  const staleRace = run(state, { rivalId: 'mags', courseId: 'foundry' });
  assert.equal(settleRace(act(state, { type: 'work' }), staleRace).ok, false);
});

test('losing the last car with no cash remains recoverable through workshop work', () => {
  let state = starter(); state.cash = 0;
  const { race } = startRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'pink' });
  forfeitRace(race);
  const result = settleRace(state, race); assert.equal(result.ok, true); state = result.state;
  assert.equal(state.cars.length, 0); assert.equal(state.activeCarId, null); assert.equal(state.cash, 0);
  for (let i = 0; i < 5; i++) state = act(state, { type: 'work' });
  state = act(state, { type: 'buy', modelId: 'sparrow' });
  assert.ok(getActiveCar(state)); assert.equal(state.cash, 0);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'practice' }).ok, true);
});

test('all campaign rivals and the crown are reachable using only valid career actions', () => {
  let state = createCareer(67), jobs = 0, played = 0;
  const fund = amount => {
    while (state.cash < amount) { state = act(state, { type: 'work' }); jobs++; assert.ok(jobs < 1000); }
  };
  for (const [index, rival] of RIVALS.entries()) {
    assert.ok(state.rep >= rival.rep, `unlocked ${rival.id} through previous first wins`);
    if (getActiveCar(state)) state = act(state, { type: 'sell', carId: state.activeCarId });
    const model = CARS[index]; fund(model.price);
    state = act(state, { type: 'buy', modelId: model.id });
    for (const slot of SLOT_IDS) for (let level = 0; level < 2; level++) {
      fund(upgradeCost(getActiveCar(state), slot)); state = act(state, { type: 'upgrade', slot });
    }
    fund(rival.wager);
    const race = run(state, { rivalId: rival.id, courseId: rival.courseId }); played += race.ticks;
    assert.equal(race.winner, 'player', rival.id);
    const settled = settleRace(state, race); assert.equal(settled.ok, true, settled.message);
    state = parseSave(serializeSave(settled.state));
  }
  assert.equal(state.champion, true); assert.equal(state.wins, RIVALS.length); assert.equal(state.defeated.length, RIVALS.length);
  assert.ok(played > 10000);
  assert.equal(canRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'practice' }).ok, true, 'free play remains available after the crown');
});

test('adversarial controls and clock inputs remain bounded without nonfinite vehicle state', () => {
  for (const course of COURSES) {
    const { race } = startRace(starter(9), { rivalId: 'mags', courseId: course.id, stake: 'practice' });
    let previousFuel = 100, previousCondition = 100;
    for (let i = 0; i < 10000 && race.status !== 'finished'; i++) {
      const controls = i % 3 === 0 ? { throttle: Infinity, brake: NaN, steer: -999 } : { throttle: 99, brake: -10, steer: Math.sin(i * 0.03) * 20, shiftUp: true };
      stepRace(race, controls);
      const p = race.player;
      for (const value of [p.speed, p.distance, p.x, p.rpm, p.condition, p.fuel]) assert.ok(Number.isFinite(value));
      assert.ok(p.fuel >= 0 && p.fuel <= previousFuel); assert.ok(p.condition >= 0 && p.condition <= previousCondition);
      assert.ok(p.speed >= 0 && p.speed <= p.stats.topSpeed / 3.6 + 1e-9); assert.ok(Math.abs(p.x) <= 1.6);
      previousFuel = p.fuel; previousCondition = p.condition;
    }
    const fresh = startRace(starter(), { rivalId: 'mags', courseId: course.id }).race;
    for (const bad of [NaN, Infinity, -1, 0.251]) assert.throws(() => stepRace(fresh, {}, bad), RangeError);
  }
});

test('drag strips answer the wheel: steering moves the car, walls cost speed and condition', () => {
  const state = starter();
  for (const courseId of ['foundry', 'aqueduct', 'saltflat']) {
    const { race } = startRace(state, { rivalId: 'mags', courseId, stake: 'practice' });
    for (let i = 0; i < 420; i++) stepRace(race, { throttle: 1 });
    const x = race.player.x;
    for (let i = 0; i < 90; i++) stepRace(race, { throttle: 1, steer: 1 });
    assert.ok(race.player.x > x + 0.1, `${courseId}: steering right moves the car right`);
    for (let i = 0; i < 180; i++) stepRace(race, { throttle: 1, steer: -1 });
    assert.ok(race.player.x < x, `${courseId}: steering left moves the car left`);
  }
  const wall = run(state, { rivalId: 'mags', courseId: 'aqueduct', stake: 'practice' }, () => ({ throttle: 1, steer: 1 }));
  assert.ok(wall.player.x >= 0.92 && wall.player.x <= 1.02, 'the strip wall bounds the car');
  assert.ok(wall.player.condition < 90, 'scraping the wall wears the car');
  assert.ok(wall.player.contacts >= 1, 'crossing into the rival lane trades paint first');
  assert.ok(wall.events.some(e => /wall/i.test(e.message)));
  const clean = run(state, { rivalId: 'mags', courseId: 'aqueduct', stake: 'practice' });
  assert.ok(clean.finishTime < wall.finishTime || wall.winner === 'opponent', 'scraping the wall is slower than holding the lane');
  assert.equal(clean.winner, 'player');
});

test('the standing mile needs a hand on the wheel more often than the quarter', () => {
  const unattended = courseId => {
    let scrapes = 0;
    for (let seed = 0; seed < 24; seed++) {
      let state = createCareer(seed); state.cash = 100000; state = act(state, { type: 'buy', modelId: 'meteor' });
      const { race } = startRace(state, { rivalId: 'mags', courseId, stake: 'practice' });
      let scraped = false;
      while (race.status !== 'finished') { stepRace(race, { throttle: 1 }); scraped ||= race.player.offroad; }
      if (scraped) scrapes++;
    }
    return scrapes;
  };
  const quarter = unattended('foundry'), mile = unattended('saltflat');
  assert.ok(quarter <= 4, `quarter scrapes ${quarter}/24`);
  assert.ok(mile >= 12, `mile scrapes ${mile}/24`);
  for (let seed = 0; seed < 24; seed++) {
    const race = run(starter(seed), { rivalId: 'mags', courseId: 'saltflat', stake: 'practice' });
    assert.equal(race.winner, 'player', `a steered Sparrow beats Mags on the mile (seed ${seed})`);
    assert.ok(race.player.condition > 95, 'holding the lane avoids the walls');
  }
});

test('rivals in the same lane trade paint once per contact window and never pass through each other', () => {
  const state = starter();
  const { race } = startRace(state, { rivalId: 'mags', courseId: 'foundry', stake: 'practice' });
  for (let i = 0; i < 200; i++) stepRace(race, { throttle: 1 });
  race.player.x = 0.35; race.opponent.x = 0.35; race.player.distance = race.opponent.distance - 3;
  const before = { p: race.player.condition, o: race.opponent.condition };
  stepRace(race, { throttle: 1 });
  assert.equal(race.player.contacts, 1); assert.equal(race.opponent.contacts, 1);
  assert.ok(race.player.condition < before.p && race.opponent.condition < before.o);
  assert.ok(Math.abs(race.player.x - race.opponent.x) > 0.1, 'contact nudges the cars apart');
  assert.ok(race.events.some(e => /Traded paint with Mags/.test(e.message)));
  assert.equal(race.contactCooldown, 45);
  assert.equal(sweptContact(0, 10, 5, 5, 1), true, 'a crossed relative trajectory counts');
  assert.equal(sweptContact(0, 1, 5, 6, 1), false);
});

test('night road race: oncoming traffic owns the left lane, head-ons hurt, and the clear lane is safe', () => {
  const state = starter();
  const { race } = startRace(state, { rivalId: 'mags', courseId: 'ridge', stake: 'practice' });
  assert.ok(race.traffic.length > 12);
  assert.ok(race.traffic.every(car => car.speed < 0 && car.x < -0.3 && car.distance >= 360));
  assert.equal(race.player.x, 0.35); assert.equal(race.opponent.x, -0.35);
  for (let i = 0; i < 600; i++) stepRace(race, { throttle: 1 });
  const first = race.traffic[0].distance;
  stepRace(race, { throttle: 1 });
  assert.ok(race.traffic[0].distance < first, 'oncoming cars move toward the start line');
  // Park the first oncoming car directly ahead in the player's lane.
  race.player.x = ONCOMING_LANE; race.player.speed = 30;
  race.traffic[0].distance = race.player.distance + 6; race.traffic[0].previous = race.traffic[0].distance;
  const condition = race.player.condition;
  stepRace(race, { throttle: 1 });
  assert.equal(race.player.contacts, 1);
  assert.ok(race.player.condition <= condition - 14 && race.player.speed < 12, 'a head-on nearly stops the car');
  assert.equal(race.opponent.contacts, 0, 'the rival keeps to its lane');
  assert.ok(race.events.some(e => /Head-on/.test(e.message)));
  assert.equal(race.traffic[0].cooldown, 60, "a struck car is immune for one second");
  const safe = run(state, { rivalId: 'mags', courseId: 'ridge', stake: 'practice' });
  assert.equal(safe.winner, 'player'); assert.equal(safe.player.contacts, 0, 'the test driver passes only on a clear road');
  assert.ok(safe.opponent.lane === 0.35, 'the rival merges into the right lane after the start');
});

test('highway run: three lanes of same-direction traffic, rear-end contacts and a lane-changing rival', () => {
  const state = starter();
  const { race } = startRace(state, { rivalId: 'mags', courseId: 'interstate', stake: 'practice' });
  assert.ok(race.traffic.length > 30);
  assert.ok(race.traffic.every(car => car.speed > 0 && FLOW_LANES.some(lane => Math.abs(car.x - lane) < 0.05)));
  assert.ok(race.traffic.some(car => car.style === 'truck'));
  assert.equal(race.player.x, 0); assert.equal(race.opponent.x, 0.62);
  for (let i = 0; i < 180; i++) stepRace(race, { throttle: 1 });
  const car = race.traffic[0];
  race.player.x = car.x; race.player.speed = 35; race.player.distance = car.distance - 4; car.previous = car.distance;
  const condition = race.player.condition;
  stepRace(race, { throttle: 1 });
  assert.equal(race.player.contacts, 1);
  assert.ok(race.player.distance < car.distance && race.player.speed <= car.speed * 0.8 + 1e-9, 'a rear-end drops the driver in behind traffic');
  assert.ok(race.player.condition < condition);
  assert.ok(race.events.some(e => /clipped/.test(e.message)));
  assert.equal(gapAhead(race, race.player, car.x, 100) < 100, true);
  const finished = run(state, { rivalId: 'mags', courseId: 'interstate', stake: 'practice' });
  assert.equal(finished.winner, 'player');
  assert.equal(finished.player.contacts, 0, 'the lane-choosing driver threads the traffic');
  assert.ok(finished.time < COURSES.find(c => c.id === 'interstate').timeLimit);
});

test('saved careers with the original three roads still load and the new roads record times', () => {
  const legacy = starter();
  legacy.bestTimes = { foundry: 15.2, coast: 140.5, canyon: 190.1 };
  const loaded = parseSave(serializeSave(legacy));
  assert.deepEqual(loaded.bestTimes, legacy.bestTimes);
  assert.equal(COURSES.find(c => c.id === 'foundry').length, 402, 'the quarter mile is unchanged for existing records');
  const race = run(legacy, { rivalId: 'mags', courseId: 'aqueduct' });
  assert.equal(race.winner, 'player');
  const settled = settleRace(legacy, race); assert.equal(settled.ok, true);
  assert.ok(settled.state.bestTimes.aqueduct > 0 && settled.state.bestTimes.aqueduct === race.finishTime);
  assert.deepEqual(parseSave(serializeSave(settled.state)), settled.state);
  const hostile = copy(settled.state); hostile.bestTimes.bogus = 12;
  assert.deepEqual(validateCareer(hostile).bestTimes, settled.state.bestTimes, 'unknown course records are dropped');
});
