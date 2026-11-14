// Original STREET-RACER vehicles and campaign. Apache-2.0.
export const CARS = Object.freeze([
  { id: 'sparrow', name: 'Kestrel Sparrow', year: 1954, price: 900, hp: 98, weight: 1190, grip: 0.76, topSpeed: 154, color: '#b9cab5', style: 'sedan', description: 'A light, honest little straight-six. Every legend starts somewhere.' },
  { id: 'morrow', name: 'Morrow Eight', year: 1957, price: 1500, hp: 142, weight: 1410, grip: 0.74, topSpeed: 173, color: '#da7953', style: 'sedan', description: 'Long fins, a lazy V8 and more potential than its classifieds price suggests.' },
  { id: 'comet', name: 'Vela Comet', year: 1959, price: 2600, hp: 183, weight: 1290, grip: 0.84, topSpeed: 192, color: '#e8d8b1', style: 'coupe', description: 'A nimble two-door that rewards a clean line through the hills.' },
  { id: 'raven', name: 'Rook Raven', year: 1961, price: 4000, hp: 218, weight: 1320, grip: 0.88, topSpeed: 209, color: '#628b9c', style: 'coupe', description: 'A balanced street coupe with a close-ratio box and a willing small block.' },
  { id: 'bison', name: 'Bison Stepside', year: 1956, price: 4300, hp: 262, weight: 1670, grip: 0.77, topSpeed: 201, color: '#d3aa4e', style: 'pickup', description: 'A work truck with a very different understanding of work.' },
  { id: 'meteor', name: 'Aster Meteor', year: 1964, price: 6500, hp: 292, weight: 1450, grip: 0.91, topSpeed: 229, color: '#ae5b55', style: 'muscle', description: 'Big displacement. Bigger confidence. Built for the strip.' },
  { id: 'phantom', name: 'Nocturne Phantom', year: 1965, price: 9200, hp: 334, weight: 1370, grip: 0.98, topSpeed: 247, color: '#8380ad', style: 'fastback', description: 'Low, lean and remarkably composed when the road stops being straight.' },
  { id: 'sovereign', name: 'Regent Sovereign', year: 1966, price: 13200, hp: 378, weight: 1510, grip: 0.96, topSpeed: 261, color: '#d3d6cf', style: 'fastback', description: 'The boulevard crown: a polished shell wrapped around a serious racing heart.' }
]);

const levels = (names, prices, values, key) => names.map((name, i) => ({ name, price: prices[i], [key]: values[i] }));
export const PARTS = Object.freeze([
  { id: 'engine', name: 'Engine', description: 'Displacement and compression. More power throughout the rev range.', levels: levels(['Factory block', 'Street rebuild', 'Club motor', 'Blueprint V8'], [0, 450, 1200, 2600], [1, 1.18, 1.38, 1.62], 'power') },
  { id: 'intake', name: 'Intake', description: 'Carburetion and breathing. A useful first step on a small budget.', levels: levels(['Single carb', 'Twin barrel', 'Four barrel', 'Triple induction'], [0, 180, 480, 950], [1, 1.07, 1.14, 1.22], 'power') },
  { id: 'exhaust', name: 'Exhaust', description: 'Freer flow with a little less weight.', levels: levels(['Factory pipes', 'Dual pipes', 'Long headers', 'Race headers'], [0, 160, 420, 880], [1, 1.06, 1.12, 1.19], 'power') },
  { id: 'gearbox', name: 'Transmission', description: 'Quicker shifts and closer ratios. Does not change your auto/manual preference.', levels: levels(['Road four-speed', 'Short-shift kit', 'Close-ratio box', 'Competition box'], [0, 240, 650, 1350], [1, 1.07, 1.14, 1.22], 'drive') },
  { id: 'tyres', name: 'Tyres', description: 'Better launches, more cornering grip and less off-road punishment.', levels: levels(['Cross-ply', 'Street radial', 'Sport radial', 'Competition compound'], [0, 200, 550, 1100], [0, 0.13, 0.27, 0.43], 'grip') },
  { id: 'suspension', name: 'Suspension', description: 'Keep the car composed through curves and under braking.', levels: levels(['Factory springs', 'Firm springs', 'Club dampers', 'Competition setup'], [0, 220, 600, 1250], [0, 0.10, 0.22, 0.36], 'grip') }
]);

export const COURSES = Object.freeze([
  { id: 'foundry', name: 'Foundry Quarter', type: 'drag', length: 402, timeLimit: 120, theme: 'industrial', curveScale: 0, lanes: 2, traffic: null, label: 'Drag strip', description: 'A quarter-mile under the foundry lights. Launch clean, hold your lane and watch the tach.', recordLabel: 'Quarter mile' },
  { id: 'aqueduct', name: 'Aqueduct Half', type: 'drag', length: 805, timeLimit: 150, theme: 'aqueduct', curveScale: 0, lanes: 2, traffic: null, label: 'Drag strip', description: 'Half a mile down the dry concrete channel. Torque steer and the wind pull at the wheel; stay off the walls.', recordLabel: 'Half mile' },
  { id: 'saltflat', name: 'Saltflat Mile', type: 'drag', length: 1609, timeLimit: 200, theme: 'salt', curveScale: 0, lanes: 2, traffic: null, label: 'Drag strip', description: 'A full mile across the dry lake. Long gearing, top speed and a steady hand past 200 km/h.', recordLabel: 'Standing mile' },
  { id: 'coast', name: 'Saltline Run', type: 'road', length: 4800, timeLimit: 420, theme: 'coast', curveScale: 0.60, lanes: 2, traffic: null, label: 'Road sprint', description: 'The long coast road at sunset. Sweeping corners, a clear view to the next bend and plenty of road to make up time.', recordLabel: 'Coast sprint' },
  { id: 'ridge', name: 'Ridgeline Drive', type: 'road', length: 5600, timeLimit: 480, theme: 'night', curveScale: 0.85, lanes: 2, traffic: 'oncoming', label: 'Night road race', description: 'Two lanes over the ridge after dark. Oncoming headlights own the left lane; pull out to pass only when the road ahead is clear.', recordLabel: 'Ridge road race' },
  { id: 'canyon', name: 'Blackridge Pass', type: 'road', length: 6400, timeLimit: 600, theme: 'canyon', curveScale: 1.0, lanes: 2, traffic: null, label: 'Road sprint', description: 'A demanding hill road over the ridge. Lift for the tighter bends; grip and fuel matter as much as horsepower.', recordLabel: 'Pass sprint' },
  { id: 'interstate', name: 'Interstate 67', type: 'road', length: 8000, timeLimit: 540, theme: 'highway', curveScale: 0.28, lanes: 3, traffic: 'flow', label: 'Highway run', description: 'Three lanes of Saturday-night traffic. Thread the gaps, keep the speed up and stay out of the trucks’ mirrors.', recordLabel: 'Interstate run' }
]);

export const RIVALS = Object.freeze([
  { id: 'mags', name: 'Mags', nickname: 'The Regular', carId: 'sparrow', rep: 0, skill: 0.78, stage: 0, reward: 280, wager: 75, upgrades: 0, color: '#d9b46a', courseId: 'foundry', quote: 'Everybody gets a first run. Make yours a good one.' },
  { id: 'patch', name: 'Patch', nickname: 'Night Shift', carId: 'morrow', rep: 10, skill: 0.80, stage: 1, reward: 450, wager: 125, upgrades: 0, color: '#78aab0', courseId: 'aqueduct', quote: 'Finished the shift. Time to see what this motor can do.' },
  { id: 'june', name: 'June', nickname: 'Coastline', carId: 'comet', rep: 22, skill: 0.82, stage: 2, reward: 700, wager: 200, upgrades: 0, color: '#cc7553', courseId: 'coast', quote: 'The sea is a good audience. It never tells you to slow down.' },
  { id: 'wren', name: 'Wren', nickname: 'Switchback', carId: 'raven', rep: 36, skill: 0.84, stage: 3, reward: 1000, wager: 300, upgrades: 0, color: '#a4b782', courseId: 'canyon', quote: 'Power is easy. Bring something that turns.' },
  { id: 'sol', name: 'Sol', nickname: 'Heavy Weather', carId: 'bison', rep: 52, skill: 0.85, stage: 4, reward: 1450, wager: 450, upgrades: 1, color: '#dcb24b', courseId: 'interstate', quote: 'Yes, it is still a truck. No, that does not make it slow.' },
  { id: 'val', name: 'Val', nickname: 'After Hours', carId: 'meteor', rep: 70, skill: 0.87, stage: 5, reward: 2000, wager: 600, upgrades: 1, color: '#c05759', courseId: 'saltflat', quote: 'I hear you have been making a name for yourself.' },
  { id: 'kit', name: 'Kit', nickname: 'Ghost Line', carId: 'phantom', rep: 90, skill: 0.89, stage: 6, reward: 2800, wager: 800, upgrades: 1, color: '#9292c3', courseId: 'ridge', quote: 'One clean run. That is all I ever ask of a car.' },
  { id: 'monarch', name: 'The Monarch', nickname: 'Boulevard Crown', carId: 'sovereign', rep: 112, skill: 0.91, stage: 7, reward: 4200, wager: 1000, upgrades: 2, color: '#e7d8aa', courseId: 'canyon', quote: 'You have earned the invitation. Now earn the crown.' }
]);

export const PAINTS = Object.freeze([
  { name: 'Ivory', color: '#e8d8b1' }, { name: 'Petrol', color: '#628b9c' },
  { name: 'Oxide', color: '#ae5b55' }, { name: 'Sage', color: '#b9cab5' },
  { name: 'Saffron', color: '#d3aa4e' }, { name: 'Violet', color: '#8380ad' },
  { name: 'Midnight', color: '#353f4c' }, { name: 'Silver', color: '#d3d6cf' }
]);

export const SLOT_IDS = Object.freeze(PARTS.map(part => part.id));
export const CAR_BY_ID = Object.freeze(Object.fromEntries(CARS.map(car => [car.id, car])));
export const COURSE_BY_ID = Object.freeze(Object.fromEntries(COURSES.map(course => [course.id, course])));
export const RIVAL_BY_ID = Object.freeze(Object.fromEntries(RIVALS.map(rival => [rival.id, rival])));
