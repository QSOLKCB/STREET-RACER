import { CARS, CAR_BY_ID, PARTS, SLOT_IDS, RIVALS, RIVAL_BY_ID, COURSES, COURSE_BY_ID, PAINTS } from './catalog.js';
// Pinned VANILLAJS generator: the same seeded stream the arcade games use.
import { seededRandom } from '../vendor/vanillajs/modules/math/index.js';

export const STEP = 1 / 60;
export const SAVE_LIMIT = 64 * 1024;
export const GARAGE_LIMIT = 4;
const MONEY_LIMIT = 99999999;
const MAX_REVISION = 1000000000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new TypeError(message); };
const plain = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be an object.`);
  for (const key of ['__proto__', 'constructor', 'prototype']) if (own(value, key)) fail(`${label} contains a forbidden property.`);
  return value;
};
const num = (value, min, max, label, integer = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(`Invalid ${label}.`);
  return value;
};
const text = (value, max, label) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value)) fail(`Invalid ${label}.`);
  return value;
};
const modelFor = car => CAR_BY_ID[car?.modelId] || null;
const partFor = slot => PARTS.find(part => part.id === slot);

export function createCareer(seed = 1967) {
  num(seed, 0, 0xffffffff, 'seed', true);
  return { version: 1, seed, cash: 2400, rep: 0, day: 1, cars: [], activeCarId: null,
    wins: 0, losses: 0, defeated: [], champion: false, history: [], nextCarId: 1,
    revision: 0, races: 0, lastRaceId: null, bestTimes: {} };
}

export function validateCareer(input) {
  const source = plain(input, 'Career');
  if (source.version !== 1) fail('This save version is not supported.');
  const state = createCareer(num(source.seed, 0, 0xffffffff, 'seed', true));
  for (const key of ['cash', 'rep', 'day', 'wins', 'losses', 'nextCarId', 'revision', 'races']) {
    state[key] = num(source[key], ['day', 'nextCarId'].includes(key) ? 1 : 0,
      key === 'cash' ? MONEY_LIMIT : MAX_REVISION, key, true);
  }
  if (!Array.isArray(source.cars) || source.cars.length > GARAGE_LIMIT) fail('Garage exceeds four cars.');
  const seen = new Set();
  state.cars = source.cars.map(raw => {
    const car = plain(raw, 'Car');
    const uid = text(car.uid, 32, 'car identity');
    if (!/^car-[1-9][0-9]{0,9}$/.test(uid) || seen.has(uid) || Number(uid.slice(4)) >= state.nextCarId) fail('Invalid or duplicate car identity.');
    seen.add(uid);
    if (typeof car.modelId !== 'string' || !own(CAR_BY_ID, car.modelId)) fail('Unknown car model.');
    if (typeof car.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(car.color)) fail('Invalid paint color.');
    const parts = plain(car.parts, 'Installed parts');
    const normalized = { uid, modelId: car.modelId, color: car.color.toLowerCase(),
      condition: num(car.condition, 0, 100, 'condition'), fuel: num(car.fuel, 0, 100, 'fuel'),
      tune: num(car.tune, -1, 1, 'final-drive tune'), parts: {} };
    for (const slot of SLOT_IDS) normalized.parts[slot] = num(parts[slot], 0, 3, `${slot} level`, true);
    return normalized;
  });
  if (source.activeCarId !== null && (!seen.has(source.activeCarId) || typeof source.activeCarId !== 'string')) fail('Active car is not in the garage.');
  if (source.cars.length && source.activeCarId === null) fail('Choose an active car.');
  state.activeCarId = source.activeCarId;
  if (!Array.isArray(source.defeated) || source.defeated.length > RIVALS.length || new Set(source.defeated).size !== source.defeated.length || source.defeated.some(id => typeof id !== 'string' || !own(RIVAL_BY_ID, id))) fail('Invalid rival progress.');
  state.defeated = [...source.defeated];
  if (typeof source.champion !== 'boolean' || source.champion !== state.defeated.includes('monarch')) fail('Invalid championship progress.');
  state.champion = source.champion;
  if (source.lastRaceId !== null && (typeof source.lastRaceId !== 'string' || !/^race-[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,10}$/.test(source.lastRaceId))) fail('Invalid last race identity.');
  state.lastRaceId = source.lastRaceId;
  if (!Array.isArray(source.history) || source.history.length > 20) fail('Invalid career history.');
  state.history = source.history.map(entry => {
    const row = plain(entry, 'History entry');
    return { day: num(row.day, 1, MAX_REVISION, 'history day', true), text: text(row.text, 240, 'history text') };
  });
  const bestTimes = plain(source.bestTimes, 'Best times');
  for (const course of COURSES) if (own(bestTimes, course.id)) state.bestTimes[course.id] = num(bestTimes[course.id], STEP, 900, 'best time');
  return state;
}

export function serializeSave(state) {
  return JSON.stringify({ format: 'street-racer', version: 1, career: validateCareer(state) }, null, 2);
}

export function parseSave(serialized) {
  if (typeof serialized !== 'string' || serialized.length > SAVE_LIMIT || new TextEncoder().encode(serialized).byteLength > SAVE_LIMIT) fail('Save must be smaller than 64 KiB.');
  let data;
  try { data = JSON.parse(serialized); } catch { fail('This file is not valid JSON.'); }
  plain(data, 'Save');
  if (data.format !== 'street-racer' || data.version !== 1) fail('This is not a supported STREET-RACER save.');
  return validateCareer(data.career);
}

export const getActiveCar = state => state.cars.find(car => car.uid === state.activeCarId) || null;
export function carStats(car) {
  const model = modelFor(car);
  if (!model) return null;
  const level = slot => PARTS.find(part => part.id === slot).levels[car.parts[slot]];
  const power = level('engine').power * level('intake').power * level('exhaust').power;
  const hp = Math.round(model.hp * power);
  const weight = model.weight - car.parts.exhaust * 8;
  const grip = model.grip + level('tyres').grip + level('suspension').grip;
  const topSpeed = Math.round(model.topSpeed * Math.pow(power, 0.26) * (1 - car.tune * 0.075));
  const acceleration = hp / weight * 64 * level('gearbox').drive * (1 + car.tune * 0.11);
  return { hp, weight, grip, topSpeed, acceleration, gearRatios: [0.29, 0.52, 0.76, 1],
    shiftTime: 0.27 - car.parts.gearbox * 0.045, rating: Math.round(hp / 2 + topSpeed / 2 + grip * 50),
    zeroToHundred: +(27.7778 / (Math.min(acceleration, grip * 9) * 0.65) + 0.6).toFixed(1) };
}

export const repairCost = car => Math.ceil((100 - car.condition) * (1.2 + modelFor(car).price / 5000));
export const refuelCost = car => Math.ceil((100 - car.fuel) * 0.8);
export const upgradeCost = (car, slot) => {
  const part = partFor(slot);
  return part && car.parts[slot] < 3 ? part.levels[car.parts[slot] + 1].price : null;
};
export const saleValue = car => Math.max(100, Math.floor((modelFor(car).price + PARTS.reduce((sum, part) => sum + part.levels[car.parts[part.id]].price * 0.55, 0)) * (0.46 + car.condition * 0.0034)));

const makeCar = (modelId, index, color = CAR_BY_ID[modelId].color) => ({ uid: `car-${index}`, modelId, color, condition: 100, fuel: 100, tune: 0, parts: Object.fromEntries(SLOT_IDS.map(slot => [slot, 0])) });
function log(state, message) {
  state.history.unshift({ day: state.day, text: message });
  state.history.length = Math.min(state.history.length, 20);
}
function success(state, message) {
  state.revision++;
  log(state, message);
  return { ok: true, state: validateCareer(state), message };
}
const rejection = (state, message) => ({ ok: false, state, message });

export function applyAction(source, action) {
  let state;
  try { state = validateCareer(source); plain(action, 'Action'); } catch (error) { return rejection(source, error.message); }
  if (state.revision >= MAX_REVISION || state.day >= MAX_REVISION) return rejection(source, 'This career has reached its supported size. Export it before starting another.');
  let car = getActiveCar(state);
  const pay = amount => Number.isSafeInteger(amount) && amount >= 0 && amount <= state.cash;
  if (action.type === 'buy') {
    const model = typeof action.modelId === 'string' && own(CAR_BY_ID, action.modelId) ? CAR_BY_ID[action.modelId] : null;
    if (!model) return rejection(source, 'That classified is unavailable.');
    if (state.cars.length >= GARAGE_LIMIT) return rejection(source, 'All four garage bays are occupied. Sell a car first.');
    if (!pay(model.price)) return rejection(source, 'Not enough cash. Workshop jobs can help fund your next car.');
    if (state.nextCarId >= MAX_REVISION) return rejection(source, 'Car identity limit reached.');
    car = makeCar(model.id, state.nextCarId++);
    state.cars.push(car); state.activeCarId = car.uid; state.cash -= model.price;
    return success(state, `Bought a ${model.year} ${model.name} for $${model.price}.`);
  }
  if (action.type === 'work') {
    if (state.cash > MONEY_LIMIT - 180) return rejection(source, 'Your cash balance has reached its limit.');
    state.cash += 180; state.day++;
    return success(state, 'Finished a workshop shift. Earned $180; a new day begins.');
  }
  if (action.type === 'select' || action.type === 'sell') {
    car = state.cars.find(item => item.uid === action.carId);
    if (!car) return rejection(source, 'That car is not in your garage.');
    if (action.type === 'select') { state.activeCarId = car.uid; return success(state, `Selected ${modelFor(car).name}.`); }
    const value = saleValue(car);
    if (state.cash > MONEY_LIMIT - value) return rejection(source, 'Sale would exceed the cash limit.');
    state.cash += value; state.cars = state.cars.filter(item => item.uid !== car.uid);
    if (state.activeCarId === car.uid) state.activeCarId = state.cars[0]?.uid || null;
    return success(state, `Sold ${modelFor(car).name} for $${value}.`);
  }
  if (!car) return rejection(source, 'Buy a car from the classifieds first.');
  if (action.type === 'upgrade') {
    if (typeof action.slot !== 'string' || !SLOT_IDS.includes(action.slot)) return rejection(source, 'Unknown part slot.');
    const price = upgradeCost(car, action.slot);
    if (price === null) return rejection(source, 'That part is already at competition specification.');
    if (!pay(price)) return rejection(source, 'Not enough cash for that part.');
    state.cash -= price; car.parts[action.slot]++;
    return success(state, `Installed ${partFor(action.slot).levels[car.parts[action.slot]].name} for $${price}.`);
  }
  if (action.type === 'service' || action.type === 'refuel') {
    const service = action.type === 'service';
    const price = service ? repairCost(car) : refuelCost(car);
    if (price === 0) return rejection(source, service ? 'The car is already fully serviced.' : 'The tank is full.');
    if (!pay(price)) return rejection(source, 'Not enough cash. A workshop shift pays $180.');
    state.cash -= price;
    if (service) car.condition = 100; else car.fuel = 100;
    return success(state, `${service ? 'Serviced the car' : 'Filled the tank'} for $${price}.`);
  }
  if (action.type === 'tune') {
    if (typeof action.value !== 'number' || !Number.isFinite(action.value) || action.value < -1 || action.value > 1) return rejection(source, 'Final-drive tune must be between -1 and 1.');
    car.tune = Math.round(action.value * 100) / 100;
    return success(state, `Set final drive to ${car.tune > 0 ? 'shorter acceleration gearing' : car.tune < 0 ? 'longer top-speed gearing' : 'balanced gearing'}.`);
  }
  if (action.type === 'paint') {
    const paint = PAINTS.find(item => item.color === action.color);
    if (!paint) return rejection(source, 'Choose a paint from the workshop palette.');
    if (car.color === paint.color) return rejection(source, 'The car already wears that paint.');
    if (!pay(60)) return rejection(source, 'A repaint costs $60.');
    state.cash -= 60; car.color = paint.color;
    return success(state, `Repainted the car ${paint.name.toLowerCase()} for $60.`);
  }
  return rejection(source, 'Unknown garage action.');
}

export function canRace(state, { rivalId, courseId, stake = 'cash', transmission = 'auto' } = {}) {
  const car = getActiveCar(state);
  const rival = typeof rivalId === 'string' && own(RIVAL_BY_ID, rivalId) ? RIVAL_BY_ID[rivalId] : null;
  const course = typeof courseId === 'string' && own(COURSE_BY_ID, courseId) ? COURSE_BY_ID[courseId] : null;
  if (!car) return { ok: false, message: 'Buy a car from the classifieds first.' };
  if (!rival || !course) return { ok: false, message: 'Choose a rival and a course.' };
  if (!['practice', 'cash', 'pink'].includes(stake)) return { ok: false, message: 'Choose a valid race stake.' };
  if (!['auto', 'manual'].includes(transmission)) return { ok: false, message: 'Choose automatic or manual shifting.' };
  if (state.rep < rival.rep) return { ok: false, message: `${rival.name} requires ${rival.rep} reputation.` };
  if (rival.id === 'monarch' && stake !== 'practice' && course.id !== 'canyon') return { ok: false, message: 'The Monarch awards the boulevard crown on Blackridge Pass. Choose that course or run a practice.' };
  if (state.revision >= MAX_REVISION || state.races >= MAX_REVISION || state.day >= MAX_REVISION || state.wins >= MAX_REVISION || state.losses >= MAX_REVISION) return { ok: false, message: 'This career has reached its supported size. Export it before starting another.' };
  if (stake !== 'practice' && car.condition < 15) return { ok: false, message: 'Service this car before racing. Condition must be at least 15%.' };
  if (stake !== 'practice' && car.fuel < 8) return { ok: false, message: 'Refuel before racing. At least 8% fuel is required.' };
  if (stake === 'cash' && state.cash < rival.wager) return { ok: false, message: `This challenge needs $${rival.wager} in cash.` };
  if (stake === 'pink' && state.cars.length >= GARAGE_LIMIT) return { ok: false, message: 'Pink slips need a free garage bay for the car you could win.' };
  if (stake === 'pink' && state.nextCarId >= MAX_REVISION) return { ok: false, message: 'Car identity limit reached. Choose a cash challenge instead.' };
  if (stake === 'pink' && carStats(car).rating < carStats(rivalCar(rival)).rating * 0.56) return { ok: false, message: 'This rival will not risk their car against that build. Upgrade it or choose cash.' };
  return { ok: true, message: stake === 'practice' ? 'Practice: no stakes, wear, fuel or reputation changes.' : stake === 'pink' ? 'Winner takes the other car. Losing can cost your active car.' : `$${rival.wager} wager · $${rival.reward} first-win purse.`, wager: stake === 'cash' ? rival.wager : 0 };
}

function rivalCar(rival) {
  const car = makeCar(rival.carId, 1, rival.color);
  for (const slot of SLOT_IDS) car.parts[slot] = rival.upgrades;
  return car;
}

export function roadCurve(course, distance) {
  return course.type === 'drag' ? 0 : course.curveScale * (Math.sin(distance / 170) * 0.55 + Math.sin(distance / 370) * 0.45);
}

// Lane units: ±1 is the painted edge, ±0.92 the shoulder or strip wall. Two
// cars touch when their centres are closer than CAR_WIDTH lane units.
export const CAR_WIDTH = 0.28;
export const FLOW_LANES = Object.freeze([-0.62, 0, 0.62]);
export const ONCOMING_LANE = -0.55;
const TRAFFIC_COLORS = ['#c9c2a8', '#7c8f9a', '#a9553f', '#5d6d5a', '#d2b36a', '#8f8aa8', '#e2ddd0', '#4c5a66'];
const laneWidth = course => course.lanes === 3 ? 0.62 : 0.7;

export function startRace(source, options = {}) {
  let career;
  try { career = validateCareer(source); } catch (error) { return { ok: false, message: error.message }; }
  const normalized = { stake: 'cash', transmission: 'auto', ...options };
  const allowed = canRace(career, normalized);
  if (!allowed.ok) return allowed;
  const rival = RIVAL_BY_ID[normalized.rivalId];
  const course = COURSE_BY_ID[normalized.courseId];
  const car = clone(getActiveCar(career));
  const enemy = rivalCar(rival);
  const random = seededRandom((career.seed ^ Math.imul(career.races + 1, 2654435761) ^ course.length) >>> 0);
  // Start lanes: drag strips and the night road use one lane each; the
  // highway starts the rival in the right lane beside the centre lane.
  const playerLane = course.type === 'drag' ? -0.35 : course.traffic === 'oncoming' ? 0.35 : course.traffic === 'flow' ? 0 : 0;
  const opponentLane = course.type === 'drag' ? 0.35 : course.traffic === 'oncoming' ? -0.35 : course.traffic === 'flow' ? 0.62 : 0.35;
  const makeDriver = (owned, lane) => ({ car: owned, model: CAR_BY_ID[owned.modelId], stats: carStats(owned),
    speed: 0, distance: 0, x: lane, lane, gear: 1, rpm: 900, condition: normalized.stake === 'practice' ? 100 : owned.condition,
    fuel: normalized.stake === 'practice' ? 100 : owned.fuel, shiftCooldown: 0, redline: 0, offroad: false,
    drift: 0, pull: random() < 0.5 ? -1 : 1, scraping: false, contacts: 0 });
  const hazards = [];
  if (course.type === 'road' && !course.traffic) for (let distance = 380; distance < course.length - 180; distance += 310 + Math.floor(random() * 230)) {
    hazards.push({ distance, x: (random() * 1.5 - 0.75), type: random() > 0.5 ? 'barrel' : 'cone', hit: false });
  }
  // Traffic is inert seeded data: every car for the whole run is placed up
  // front, so a tick never draws from the generator.
  const traffic = [];
  if (course.traffic === 'oncoming') for (let distance = 360 + random() * 120; distance < course.length + 3200; distance += 170 + Math.floor(random() * 260)) {
    const truck = random() > 0.78;
    traffic.push({ id: traffic.length, distance, previous: distance, x: ONCOMING_LANE + (random() - 0.5) * 0.16, speed: -(truck ? 12 + random() * 4 : 14 + random() * 9),
      style: truck ? 'truck' : 'car', color: TRAFFIC_COLORS[traffic.length % TRAFFIC_COLORS.length], cooldown: 0, hits: 0 });
  } else if (course.traffic === 'flow') for (let distance = 240 + random() * 60; distance < course.length + 400; distance += 80 + Math.floor(random() * 150)) {
    const truck = random() > 0.8;
    traffic.push({ id: traffic.length, distance, previous: distance, x: FLOW_LANES[Math.floor(random() * 3)] + (random() - 0.5) * 0.06, speed: truck ? 17 + random() * 3 : 20 + random() * 7,
      style: truck ? 'truck' : 'car', color: TRAFFIC_COLORS[traffic.length % TRAFFIC_COLORS.length], cooldown: 0, hits: 0 });
  }
  const gusts = Array.from({ length: 96 }, () => random() * 2 - 1);
  return { ok: true, message: allowed.message, race: { version: 2,
    id: `race-${career.seed}-${career.revision}-${career.races}`, careerRevision: career.revision,
    seed: career.seed, status: 'countdown', countdown: 3, time: 0, ticks: 0, accumulator: 0,
    course, rival, player: makeDriver(car, playerLane), opponent: makeDriver(enemy, opponentLane),
    stake: normalized.stake, cashStake: allowed.wager, transmission: normalized.transmission,
    curvature: 0, hazards, traffic, gusts, contactCooldown: 0, events: [], winner: null, reason: '', settled: false,
    shiftLatch: false, downLatch: false, pendingShiftUp: false, pendingShiftDown: false,
    finishTime: null, opponentFinishTime: null,
    reward: 0, result: null } };
}

function event(race, message) {
  race.events.push({ time: race.time, message });
  if (race.events.length > 8) race.events.shift();
}

function finish(race, winner, reason) {
  race.status = 'finished'; race.winner = winner; race.reason = reason;
  race.result = { winner, reason, time: race.time, practice: race.stake === 'practice' };
  event(race, reason);
}

export function forfeitRace(race) {
  if (!race || race.status === 'finished') return race;
  finish(race, 'opponent', 'Retired from the race.');
  return race;
}

// Swept longitudinal overlap during one tick: endpoint proximity or a crossed
// relative trajectory both count, so a fast closing car cannot pass through.
export function sweptContact(aBefore, aAfter, bBefore, bAfter, radius) {
  const before = bBefore - aBefore, after = bAfter - aAfter;
  return Math.abs(before) <= radius || Math.abs(after) <= radius || (before > 0 && after < 0) || (before < 0 && after > 0);
}

function drive(race, driver, controls, isOpponent) {
  const step = STEP;
  const stats = driver.stats;
  const maxSpeed = stats.topSpeed / 3.6;
  const course = race.course;
  const curve = roadCurve(course, driver.distance);
  const oldDistance = driver.distance;
  let throttle = controls.throttle;
  driver.shiftCooldown = Math.max(0, driver.shiftCooldown - step);
  if (controls.shiftUp && driver.gear < 4 && driver.shiftCooldown === 0) {
    driver.gear++; driver.shiftCooldown = stats.shiftTime;
  }
  if (controls.shiftDown && driver.gear > 1 && driver.shiftCooldown === 0) {
    driver.gear--; driver.shiftCooldown = stats.shiftTime;
  }
  const gearMax = maxSpeed * stats.gearRatios[driver.gear - 1];
  driver.rpm = clamp(900 + driver.speed / Math.max(1, gearMax) * 6100, 800, 7900);
  if (isOpponent || race.transmission === 'auto') {
    if (driver.rpm > 6250 && driver.gear < 4 && driver.shiftCooldown === 0) {
      driver.gear++; driver.shiftCooldown = stats.shiftTime;
    } else if (driver.rpm < 2100 && driver.gear > 1 && driver.shiftCooldown === 0) {
      driver.gear--; driver.shiftCooldown = stats.shiftTime;
    }
  }
  if (driver.shiftCooldown > 0 || driver.fuel <= 0 || driver.condition <= 0) throttle = 0;
  const redlining = driver.rpm > 7100;
  driver.redline = redlining && throttle > 0.3 ? driver.redline + step : Math.max(0, driver.redline - step * 2);
  if (driver.redline > 0.8) driver.condition = Math.max(0, driver.condition - step * 3.2);
  const effectiveGearMax = maxSpeed * stats.gearRatios[driver.gear - 1];
  const ratio = driver.speed / effectiveGearMax;
  const torque = clamp(1.18 - Math.abs(ratio - 0.58) * 0.7, 0.25, 1.1);
  const wearFactor = 0.68 + driver.condition * 0.0032;
  const launchGrip = driver.speed < 8 ? Math.min(1, stats.grip * 1.03) : 1;
  const traction = stats.grip * 9;
  const demand = throttle * stats.acceleration * torque / (1 + driver.speed / 38);
  const acceleration = Math.min(traction, demand) * wearFactor * launchGrip * (isOpponent ? race.rival.skill : 1);
  const drag = 0.08 + 0.00085 * driver.speed * driver.speed;
  const braking = controls.brake * (7.8 + stats.grip * 2.5);
  driver.speed = clamp(driver.speed + (acceleration - drag - braking) * step, 0, effectiveGearMax * 1.055);
  driver.speed = Math.min(driver.speed, maxSpeed * (isOpponent ? 0.86 + race.rival.skill * 0.10 : 1));
  const speedRatio = driver.speed / Math.max(1, maxSpeed);
  // Steering authority grows with speed so a lane change at full speed is not sluggish.
  const steering = controls.steer * (0.55 + Math.min(1.1, driver.speed / 16)) * Math.min(1, driver.speed / 4);
  if (course.type === 'drag') {
    // Street-strip handling: wheelspin on the launch pulls the car to one
    // side and crosswind wanders it at speed. Both are seeded and bounded, so
    // a replayed race drifts the same way; the driver holds the lane.
    const wheelspin = clamp((demand - traction * 0.8) / (traction * 0.4), 0, 1);
    const gust = race.gusts[Math.floor(race.time / 3) % race.gusts.length];
    const target = gust * 0.2 * speedRatio * speedRatio * speedRatio + driver.pull * 0.1 * wheelspin * throttle;
    driver.drift += (target - driver.drift) * step * 1.8;
    driver.x = clamp(driver.x + (steering + driver.drift) * step, -1.02, 1.02);
    driver.offroad = Math.abs(driver.x) > 0.92;
    if (driver.offroad) {
      driver.speed *= 1 - step * 1.1;
      driver.condition = Math.max(0, driver.condition - step * (0.9 + driver.speed / 40));
      if (!driver.scraping && !isOpponent) event(race, 'Wall scrape! Steer away from the wall and ease off.');
    }
    driver.scraping = driver.offroad;
  } else {
    const push = curve * speedRatio * speedRatio * (0.82 / stats.grip);
    driver.x = clamp(driver.x + (steering - push) * step, -1.6, 1.6);
    driver.offroad = Math.abs(driver.x) > 0.92;
    if (driver.offroad) {
      driver.speed *= 1 - step * 0.85;
      driver.condition = Math.max(0, driver.condition - step * (0.65 + driver.speed / 45));
    }
    // At a tight bend, excess speed scrubs away even with a clean steering line.
    const safeSpeed = maxSpeed * (1 - Math.abs(curve) * 0.36 / stats.grip);
    if (driver.speed > safeSpeed) driver.speed -= (driver.speed - safeSpeed) * step * 1.5;
  }
  driver.distance = Math.min(course.length + 10, driver.distance + driver.speed * step);
  if (!isOpponent) for (const hazard of race.hazards) {
    if (!hazard.hit && oldDistance <= hazard.distance && driver.distance >= hazard.distance && Math.abs(driver.x - hazard.x) < 0.18) {
      hazard.hit = true; driver.speed *= 0.72; driver.condition = Math.max(0, driver.condition - 6);
      event(race, `${hazard.type === 'cone' ? 'Road marker' : 'Roadside barrier'} clipped. Keep a clean line.`);
    }
  }
  driver.fuel = Math.max(0, driver.fuel - step * (0.015 + throttle * 0.035 + driver.speed / 450));
  driver.condition = Math.max(0, driver.condition - step * throttle * 0.013);
  return oldDistance;
}

// Nearest obstacle (traffic car or the other driver) ahead of `distance` in
// the lane around `x`, within `range` metres. Infinity when the lane is clear.
export function gapAhead(race, driver, x, range) {
  let best = Infinity;
  const other = driver === race.player ? race.opponent : race.player;
  const consider = (ox, od, length) => {
    const d = od - driver.distance;
    if (d > -length && d < range && Math.abs(ox - x) < CAR_WIDTH + 0.06) best = Math.min(best, d);
  };
  for (const car of race.traffic) consider(car.x, car.distance, car.style === 'truck' ? 9 : 5);
  consider(other.x, other.distance, 5);
  return best;
}

function trafficContacts(race, driver, previous, isOpponent) {
  for (const car of race.traffic) {
    if (car.cooldown > 0) continue;
    const length = car.style === 'truck' ? 6.5 : 4.6;
    if (Math.abs(car.x - driver.x) >= CAR_WIDTH + 0.02 || !sweptContact(previous, driver.distance, car.previous, car.distance, length)) continue;
    const closing = driver.speed - car.speed;
    let damage;
    if (car.speed < 0) {
      // Head-on: both vehicles stop almost dead; the traffic car limps to the verge.
      damage = 14 + Math.min(16, closing / 4);
      driver.speed *= 0.3; car.speed = -2; car.x = -0.8;
      if (!isOpponent) event(race, 'Head-on with oncoming traffic! Hold the right lane until the road is clear.');
    } else if (previous <= car.previous) {
      // The racer ran into the back of traffic: drop in behind it at its pace.
      damage = 6 + Math.min(8, Math.max(0, closing) / 4);
      driver.speed = Math.min(driver.speed, car.speed * 0.8);
      driver.distance = Math.min(driver.distance, car.distance - length);
      car.speed = Math.min(car.speed + 2, 30);
      if (!isOpponent) event(race, `${car.style === 'truck' ? 'Truck' : 'Traffic'} clipped. Change lanes before the gap closes.`);
    } else {
      // Traffic ran into the back of the racer: the racer is shoved forward,
      // never backward through the car that hit it, and the traffic slows.
      damage = 4 + Math.min(6, Math.max(0, -closing) / 4);
      driver.speed = Math.max(driver.speed, Math.min(car.speed * 0.5, driver.speed + 4));
      car.speed = Math.min(car.speed, driver.speed * 0.8);
      car.distance = Math.min(car.distance, driver.distance - length);
      if (!isOpponent) event(race, `Rear-ended by ${car.style === 'truck' ? 'a truck' : 'traffic'}. Keep up with the flow or clear the lane.`);
    }
    driver.condition = Math.max(0, driver.condition - damage);
    driver.contacts++; car.cooldown = 60; car.hits++;
  }
}
function rivalContact(race, previousPlayer, previousOpponent) {
  if (race.contactCooldown > 0) { race.contactCooldown--; return; }
  const p = race.player, o = race.opponent;
  if (Math.abs(p.x - o.x) >= CAR_WIDTH || !sweptContact(previousPlayer, p.distance, previousOpponent, o.distance, 4.5)) return;
  const behind = p.distance < o.distance ? p : o, ahead = behind === p ? o : p;
  behind.speed *= 0.72; ahead.speed *= 0.9;
  p.condition = Math.max(0, p.condition - 2.5); o.condition = Math.max(0, o.condition - 2.5);
  const side = Math.sign(p.x - o.x) || (behind === p ? -1 : 1);
  const limit = race.course.type === 'drag' ? 1.02 : 1.6;
  p.x = clamp(p.x + side * 0.08, -limit, limit); o.x = clamp(o.x - side * 0.08, -limit, limit);
  p.contacts++; o.contacts++; race.contactCooldown = 45;
  event(race, `Traded paint with ${race.rival.name}. Give them room.`);
}

// Deterministic rival: holds a lane, takes the racing line through bends and
// avoids traffic by lane choice or braking. It never steers into the player
// deliberately; contact only happens when the lanes genuinely overlap.
function rivalControls(race) {
  const o = race.opponent, p = race.player, course = race.course;
  const curve = roadCurve(course, o.distance);
  const speedRatio = o.speed / (o.stats.topSpeed / 3.6);
  let target = course.type === 'drag' || !course.traffic ? (course.type === 'drag' ? o.lane : 0.3) : o.lane;
  let throttle = 1, brake = 0;
  if (course.traffic === 'oncoming') {
    const oncomingGap = gapAhead(race, o, ONCOMING_LANE, 140 + o.speed * 4);
    const playerAhead = p.distance - o.distance;
    const playerInRight = Math.abs(p.x - 0.35) < CAR_WIDTH + 0.1;
    const alongside = playerInRight && playerAhead > -8 && playerAhead < 10;
    const playerBlocks = playerInRight && playerAhead >= 10 && playerAhead < 45 && p.speed < o.speed + 2;
    if (o.lane < 0) {
      // Started in the oncoming lane: merge right once the player is not alongside.
      if (!alongside) o.lane = 0.35;
      else if (oncomingGap < 90) { throttle = 0; brake = 0.6; }
    }
    if (o.lane >= 0) {
      target = 0.35;
      if (playerBlocks) {
        if (oncomingGap === Infinity) target = -0.4;
        else if (playerAhead < 14) { throttle = 0; brake = 0.45; }
      }
      if (o.x < -0.05 && oncomingGap < 90) { target = 0.35; if (alongside) { throttle = 0; brake = 0.7; } }
    } else target = o.lane;
  } else if (course.traffic === 'flow') {
    const current = gapAhead(race, o, o.lane, 75);
    if (current < 75) {
      let bestLane = o.lane, bestGap = current;
      for (const lane of FLOW_LANES) {
        if (Math.abs(lane - o.lane) > 0.7 || lane === o.lane) continue;
        const gap = gapAhead(race, o, lane, 95);
        if (gap > bestGap + 20) { bestGap = gap; bestLane = lane; }
      }
      if (bestLane !== o.lane) o.lane = bestLane;
      else if (current < 28) { throttle = 0; brake = 0.5; }
    }
    target = o.lane;
  }
  const steer = clamp(curve * speedRatio * speedRatio * 0.82 / o.stats.grip / 1.5 + (target - o.x) * 1.2, -1, 1);
  return { throttle, brake, steer, shiftUp: false, shiftDown: false };
}

function tick(race, input) {
  race.ticks++;
  if (race.status === 'countdown') {
    race.countdown = Math.max(0, 3 - race.ticks * STEP);
    // Revving during the countdown is allowed; release the brake at green.
    race.player.rpm = 900 + input.throttle * 3900;
    if (race.countdown === 0) { race.status = 'running'; event(race, 'Green. Go!'); }
    return;
  }
  race.time += STEP;
  race.curvature = roadCurve(race.course, race.player.distance);
  for (const car of race.traffic) {
    car.previous = car.distance; car.distance += car.speed * STEP;
    if (car.cooldown > 0) car.cooldown--;
  }
  const aiInput = rivalControls(race);
  const previousPlayer = drive(race, race.player, input, false);
  const previousOpponent = drive(race, race.opponent, aiInput, true);
  // The finish is decided from the driven endpoints. A contact in the same
  // tick can still cost speed or condition, but it never rewinds a car that
  // has already crossed the line or changes the interpolated crossing time.
  const length = race.course.length;
  const playerFinished = race.player.distance >= length;
  const opponentFinished = race.opponent.distance >= length;
  if (playerFinished) race.finishTime = race.time - STEP + STEP * (length - previousPlayer) / Math.max(1e-12, race.player.distance - previousPlayer);
  if (opponentFinished) race.opponentFinishTime = race.time - STEP + STEP * (length - previousOpponent) / Math.max(1e-12, race.opponent.distance - previousOpponent);
  if (!playerFinished && !opponentFinished) rivalContact(race, previousPlayer, previousOpponent);
  if (race.traffic.length) {
    if (!playerFinished) trafficContacts(race, race.player, previousPlayer, false);
    if (!opponentFinished) trafficContacts(race, race.opponent, previousOpponent, true);
  }
  if (playerFinished || opponentFinished) {
    const won = playerFinished && (!opponentFinished || race.finishTime <= race.opponentFinishTime);
    finish(race, won ? 'player' : 'opponent', won ? 'First across the line.' : `${race.rival.name} crossed the line first.`);
  } else if (race.player.condition <= 0) finish(race, 'opponent', 'Mechanical failure. Return to the garage for repairs.');
  else if (race.player.fuel <= 0 && race.player.speed < 1) finish(race, 'opponent', 'Out of fuel. A workshop shift can cover the refill.');
  else if (race.time >= race.course.timeLimit) finish(race, 'opponent', 'Race time limit reached.');
}

export function stepRace(race, controls = {}, dt = STEP) {
  if (!race || race.status === 'finished' || race.paused) return race;
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0 || dt > 0.25) throw new RangeError('Frame time must be between 0 and 0.25 seconds.');
  const safeInput = key => typeof controls[key] === 'number' && Number.isFinite(controls[key]) ? controls[key] : 0;
  race.pendingShiftUp ||= controls.shiftUp === true && !race.shiftLatch;
  race.pendingShiftDown ||= controls.shiftDown === true && !race.downLatch;
  const input = { throttle: clamp(safeInput('throttle'), 0, 1), brake: clamp(safeInput('brake'), 0, 1),
    steer: clamp(safeInput('steer'), -1, 1), shiftUp: race.pendingShiftUp, shiftDown: race.pendingShiftDown };
  race.shiftLatch = controls.shiftUp === true; race.downLatch = controls.shiftDown === true;
  race.accumulator += dt;
  let ticks = 0;
  while (race.accumulator + 1e-12 >= STEP && race.status !== 'finished' && ticks++ < 15) {
    race.accumulator = Math.max(0, race.accumulator - STEP);
    tick(race, input);
    race.pendingShiftUp = false; race.pendingShiftDown = false;
    input.shiftUp = false; input.shiftDown = false;
  }
  return race;
}

export function settleRace(source, race) {
  let state;
  try { state = validateCareer(source); } catch (error) { return rejection(source, error.message); }
  if (!race || race.status !== 'finished' || !['player', 'opponent'].includes(race.winner)) return rejection(source, 'The race has not finished.');
  if (race.settled || state.lastRaceId === race.id || race.careerRevision !== state.revision) return rejection(source, 'This result is already settled or belongs to an earlier career state.');
  if (race.id !== `race-${state.seed}-${state.revision}-${state.races}`) return rejection(source, 'This race does not belong to the active career.');
  const car = state.cars.find(item => item.uid === race.player.car.uid);
  if (!car) return rejection(source, 'The race car is no longer in your garage.');
  const won = race.winner === 'player';
  let message;
  if (race.stake === 'practice') {
    message = won ? `Practice complete: ${race.finishTime.toFixed(2)} seconds. No stakes or wear.` : 'Practice complete. No stakes, wear or fuel cost.';
  } else {
    car.condition = clamp(race.player.condition, 0, 100); car.fuel = clamp(race.player.fuel, 0, 100);
    state.day++;
    if (won) {
      state.wins++;
      const firstWin = !state.defeated.includes(race.rival.id);
      const purse = firstWin ? race.rival.reward : Math.floor(race.rival.reward * 0.35);
      const gain = purse + (race.stake === 'cash' ? race.cashStake : 0);
      state.cash = Math.min(MONEY_LIMIT, state.cash + gain); race.reward = gain;
      if (firstWin) { state.defeated.push(race.rival.id); state.rep = Math.min(MAX_REVISION, state.rep + 10 + race.rival.stage * 2); }
      else state.rep = Math.min(MAX_REVISION, state.rep + 2);
      if (race.stake === 'pink') {
        if (state.cars.length >= GARAGE_LIMIT) return rejection(source, 'There is no bay available for the prize car.');
        const prize = clone(race.opponent.car); prize.uid = `car-${state.nextCarId++}`;
        prize.condition = Math.max(45, race.opponent.condition); prize.fuel = race.opponent.fuel;
        state.cars.push(prize);
      }
      if (race.rival.id === 'monarch') state.champion = true;
      message = `${won ? 'Won' : 'Lost'} against ${race.rival.name}. +$${gain}${race.stake === 'pink' ? ` and a ${race.opponent.model.name}` : ''}.${state.champion && firstWin ? ' The boulevard crown is yours. Free driving continues.' : ''}`;
    } else {
      state.losses++;
      if (race.stake === 'cash') state.cash = Math.max(0, state.cash - race.cashStake);
      if (race.stake === 'pink') {
        state.cars = state.cars.filter(item => item.uid !== car.uid);
        state.activeCarId = state.cars[0]?.uid || null;
      }
      message = `Lost against ${race.rival.name}.${race.stake === 'pink' ? ` Lost the ${modelFor(car).name}.` : ` Wager paid: $${race.cashStake}.`} Workshop shifts are always available.`;
    }
    if (won && race.finishTime && (!state.bestTimes[race.course.id] || race.finishTime < state.bestTimes[race.course.id])) state.bestTimes[race.course.id] = race.finishTime;
  }
  state.races++; state.lastRaceId = race.id;
  const result = success(state, message);
  race.settled = true;
  return result;
}
