/* STREET-RACER — original Canvas2D vehicles, workshop and roadside scenery.
 * Rendering reads simulation state; it never advances or changes it. */
const PI = Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const paint = color => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#d36a3d';
const rgb = color => [1, 3, 5].map(i => parseInt(paint(color).slice(i, i + 2), 16));
const tint = (color, amount) => { const target = amount > 0 ? 255 : 0; return `rgb(${rgb(color).map(v => Math.round(v + (target - v) * Math.abs(amount))).join(',')})`; };

function poly(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(ctx, x, y, x2, y2, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function label(ctx, text, x, y, size = 16, color = '#e5d8c0', align = 'left') {
  ctx.fillStyle = color; ctx.font = `600 ${size}px ui-monospace, monospace`; ctx.textAlign = align; ctx.fillText(text, x, y);
}

/** Fit once per real size/DPR change. Pixel drawing always uses CSS coordinates. */
export function prepareCanvas(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  let ctx;
  try { ctx = canvas.getContext('2d', { alpha: false }); } catch { return null; }
  if (!ctx) return null;
  const bounds = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : {};
  const width = Math.max(1, finite(options.width, finite(bounds.width, finite(canvas.clientWidth, 900))) || 900);
  const height = Math.max(1, finite(options.height, finite(bounds.height, finite(canvas.clientHeight, 440))) || 440);
  const dpr = clamp(finite(options.dpr, finite(globalThis.devicePixelRatio, 1)), 1, 2);
  const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  ctx.globalAlpha = 1;
  return { ctx, width, height, dpr };
}

function wheel(ctx, x, y, radius, accent, rotation = 0) {
  ctx.save(); ctx.translate(x, y);
  const rubber = ctx.createRadialGradient(-8, -10, 4, 0, 0, radius);
  rubber.addColorStop(0, '#35383a'); rubber.addColorStop(.68, '#171a1d'); rubber.addColorStop(1, '#080a0c');
  ellipse(ctx, 0, 0, radius, radius, rubber, '#55595a', 2);
  ellipse(ctx, 0, 0, radius * .78, radius * .78, '#151719', '#535451', 3);
  ellipse(ctx, 0, 0, radius * .59, radius * .59, '#c0c6c2', '#e8e6d9', 3);
  ellipse(ctx, 0, 0, radius * .47, radius * .47, '#171e23', '#6c7476', 2);
  ctx.rotate(rotation);
  for (let i = 0; i < 5; i++) {
    ctx.save(); ctx.rotate(i * PI * 2 / 5);
    poly(ctx, [[-6,-7],[-12,-radius*.43],[-4,-radius*.5],[8,-radius*.44],[8,-7]], '#bec6c5', '#6c797a', 1);
    ctx.restore();
  }
  ellipse(ctx, 0, 0, radius * .17, radius * .17, accent, '#e9ece4', 2);
  ellipse(ctx, -radius*.27, -radius*.39, radius*.13, radius*.04, '#f1f1e7');
  ctx.restore();
}

const profiles = {
  coupe: { roof: [[272,223],[380,113],[583,108],[708,221]], rear: [[285,212],[390,126],[478,125],[480,213]], front: [[501,124],[577,123],[686,213],[504,213]], rearWheel: 232, frontWheel: 785 },
  muscle: { roof: [[255,224],[369,127],[577,123],[695,222]], rear: [[278,212],[379,140],[477,137],[479,212]], front: [[501,137],[572,138],[672,213],[504,213]], rearWheel: 223, frontWheel: 803 },
  fastback: { roof: [[170,229],[375,106],[590,105],[718,220]], rear: [[234,215],[383,120],[474,119],[477,211]], front: [[499,119],[583,120],[696,210],[501,211]], rearWheel: 227, frontWheel: 790 },
  roadster: { roof: [[365,223],[402,176],[566,176],[650,222]], rear: [[379,215],[409,184],[454,184],[454,215]], front: [[479,182],[560,182],[626,215],[479,215]], rearWheel: 240, frontWheel: 776 },
  sedan: { roof: [[237,226],[332,105],[626,105],[740,221]], rear: [[256,212],[343,121],[464,120],[466,212]], front: [[487,120],[617,120],[716,212],[491,212]], rearWheel: 217, frontWheel: 799 },
  pickup: { roof: [[425,222],[433,98],[622,98],[719,218]], rear: [[440,210],[448,114],[484,114],[485,211]], front: [[504,114],[614,114],[697,209],[504,211]], rearWheel: 233, frontWheel: 792 },
  wagon: { roof: [[142,224],[179,112],[618,108],[736,220]], rear: [[161,211],[190,126],[454,123],[456,212]], front: [[479,123],[612,123],[712,212],[482,212]], rearWheel: 225, frontWheel: 795 },
};

/** Original long-wheelbase profile, used for garage and classified illustrations. */
function sideCar(ctx, car = {}, options = {}) {
  const color = paint(car.color), profile = profiles[car.style] || profiles.coupe;
  const whitewall = car.style === 'roadster' || car.style === 'wagon';
  ctx.save();
  ellipse(ctx, 516, 352, 474, 27, 'rgba(0,0,0,.52)');
  // Far-side tyres and the turned front face give the profile a shallow 3/4 view.
  ellipse(ctx, 851, 310, 52, 63, '#0b0e12');
  poly(ctx, [[100,256],[884,244],[946,278],[943,319],[898,340],[111,335]], tint(color, -.6));
  const metal = ctx.createLinearGradient(0, 206, 0, 338);
  metal.addColorStop(0, tint(color, .4)); metal.addColorStop(.15, color); metal.addColorStop(.49, tint(color, -.13)); metal.addColorStop(.52, tint(color, .16)); metal.addColorStop(.68, tint(color, -.14)); metal.addColorStop(1, tint(color, -.55));
  ctx.beginPath(); ctx.moveTo(73, 283); ctx.quadraticCurveTo(71, 251, 108, 237);
  ctx.lineTo(275, 219); ctx.lineTo(712, 218); ctx.lineTo(897, 238); ctx.quadraticCurveTo(926, 244, 934, 276);
  ctx.lineTo(927, 322); ctx.lineTo(72, 322); ctx.closePath(); ctx.fillStyle = metal; ctx.fill();
  // Roof, windows, and real body-style variations.
  poly(ctx, profile.roof, color, tint(color, .6), 2);
  const glass = ctx.createLinearGradient(0, 114, 0, 218);
  glass.addColorStop(0, '#596c74'); glass.addColorStop(.45, '#253943'); glass.addColorStop(1, '#101d24');
  poly(ctx, profile.rear, glass, '#aeb6b1', 3);
  poly(ctx, profile.front, glass, '#d0d4c7', 3);
  ctx.save(); ctx.beginPath(); profile.front.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.clip();
  poly(ctx, [[480,115],[530,115],[660,220],[610,220]], 'rgba(216,229,222,.16)'); ctx.restore();
  if (car.style === 'wagon') { line(ctx, 320, 122, 321, 213, '#b3b9b0', 6); line(ctx, 170, 105, 606, 101, '#c9d0c4', 4); }
  if (car.style === 'roadster') {
    poly(ctx, [[300,223],[356,193],[485,194],[533,222]], '#171b1c', '#6d5b45', 3);
    poly(ctx, [[355,217],[369,184],[412,184],[424,219]], '#7b4c35');
    line(ctx, 562, 180, 622, 215, '#d7dad1', 5);
  }
  if (car.style === 'pickup') {
    poly(ctx, [[93,238],[412,219],[421,246],[97,265]], '#262b2a', '#a4aaa0', 2);
    for (let i=0;i<6;i++) line(ctx, 116 + i*46, 239 - i*2, 120 + i*46, 256 - i*2, '#555d56', 2);
    line(ctx, 419, 225, 419, 314, tint(color,-.62), 2);
  }
  if (car.id === 'morrow' || car.modelId === 'morrow') {
    poly(ctx, [[85,260],[81,225],[117,238],[247,249]], color, tint(color,.4), 2);
    line(ctx, 84, 228, 152, 243, '#d4d6c5', 3);
  }
  if (car.style === 'muscle' || finite(car.parts?.engine) >= 2) {
    poly(ctx, [[738,230],[749,216],[798,220],[814,238]], tint(color,-.3), tint(color,.4), 2);
    poly(ctx, [[753,218],[786,221],[782,228],[748,224]], '#1c262b');
  }
  // Long belt line catches the workshop light; a darker crease grounds the doors.
  line(ctx, 91, 259, 900, 260, 'rgba(250,244,216,.75)', 3);
  line(ctx, 93, 263, 900, 264, 'rgba(0,0,0,.24)', 2);
  line(ctx, 295, 290, 714, 290, tint(color,-.32), 2);
  line(ctx, 505, 222, 512, 313, tint(color,-.5), 2);
  if (car.style === 'sedan' || car.style === 'wagon') line(ctx, 340, 227, 344, 314, tint(color,-.5), 2);
  line(ctx, 520, 245, 551, 245, '#d1d4ca', 5);
  if (car.style === 'sedan' || car.style === 'wagon') line(ctx, 355, 245, 382, 245, '#d1d4ca', 5);
  // Wheel arches cut through the body before the tyres are drawn.
  for (const x of [profile.rearWheel, profile.frontWheel]) {
    ellipse(ctx, x, 318, 78, 76, '#090d10', tint(color,.25), 4);
    wheel(ctx, x, 321, 64, '#a5aca7', options.rotation || 0);
    if (whitewall) ellipse(ctx, x, 321, 53, 53, null, '#d8d3b6', 6);
  }
  poly(ctx, [[900,260],[950,282],[946,319],[926,322]], '#202729', '#6a7471', 2);
  for (let i=0;i<5;i++) line(ctx, 919, 269+i*7, 945, 283+i*7, '#aeb4a9', 2);
  ellipse(ctx, 905, 276, 13, 18, '#d9d8b4', '#e8e9d7', 3);
  ellipse(ctx, 947, 289, 7, 13, '#ddd9ad', '#adb4aa', 2);
  line(ctx, 884, 322, 949, 324, '#d4d8cc', 10); line(ctx, 884, 320, 949, 322, '#f1efe2', 2);
  line(ctx, 67, 319, 151, 319, '#bdc7c0', 9); line(ctx, 68, 315, 150, 315, '#edece2', 2);
  poly(ctx, [[81,270],[103,266],[103,282],[81,285]], '#c9452c', '#ec8864', 1);
  poly(ctx, [[706,232],[723,229],[735,237],[711,241]], '#b7c3be', '#e6eadf', 2);
  if (options.stripe !== false && (car.style === 'fastback' || car.style === 'coupe' || car.style === 'muscle')) {
    poly(ctx, [[743,226],[766,228],[907,246],[903,252],[767,234],[744,232]], '#e7ddbd');
    poly(ctx, [[773,230],[784,231],[909,247],[910,250],[784,234],[774,233]], '#20282c');
  }
  label(ctx, car.style === 'pickup' ? 'R / 8' : 'S / R', 644, 284, 14, '#d4ded3');
  // Fine pinstripe and sill are drawn last, avoiding overpainted wheels.
  line(ctx, 316, 319, 703, 319, '#8a9794', 5);
  line(ctx, 318, 316, 701, 316, '#d8d8c9', 1);
  ctx.restore();
}

export function drawCar(canvas, car = {}, options = {}) {
  const ready = prepareCanvas(canvas, options); if (!ready) return false;
  const {ctx, width, height} = ready;
  ctx.fillStyle = options.background || '#1b2529'; ctx.fillRect(0,0,width,height);
  const scale = Math.min(width / 1060, height / 425);
  ctx.save(); ctx.translate((width - 1000*scale)/2, (height - 390*scale)/2); ctx.scale(scale,scale);
  sideCar(ctx, car, options); ctx.restore(); return true;
}

/** Workshop art uses a fixed design space, letterboxed by the actual canvas aspect. */
export function drawGarage(canvas, car = {}, stats = {}, options = {}) {
  const ready = prepareCanvas(canvas, options); if (!ready) return false;
  const {ctx, width, height} = ready;
  const sx = width/1280, sy=height/620;
  ctx.save(); ctx.scale(sx,sy);
  const room = ctx.createLinearGradient(0,0,0,620);
  room.addColorStop(0,'#222b2c'); room.addColorStop(.68,'#343a35'); room.addColorStop(1,'#131c20');
  ctx.fillStyle=room; ctx.fillRect(0,0,1280,620);
  // Brickwork, subtly lit from the doorway on the right.
  for(let row=0;row<15;row++) {
    const y=row*27;
    line(ctx,0,y,1280,y,'rgba(9,15,16,.32)',2);
    for(let col=0;col<23;col++) line(ctx,col*64+(row%2)*32,y,col*64+(row%2)*32,y+27,'rgba(10,16,17,.3)',2);
  }
  const light=ctx.createRadialGradient(850,80,20,750,250,650); light.addColorStop(0,'rgba(233,197,121,.17)'); light.addColorStop(1,'rgba(233,197,121,0)');
  ctx.fillStyle=light; ctx.fillRect(0,0,1280,480);
  // Tall industrial window: evening outside, warm work lights inside.
  ctx.fillStyle='#0c151b'; ctx.fillRect(955,40,270,294);
  const sky=ctx.createLinearGradient(0,40,0,330); sky.addColorStop(0,'#354950');sky.addColorStop(.62,'#bd8e69');sky.addColorStop(1,'#e2b17c');
  ctx.fillStyle=sky;ctx.fillRect(967,52,246,270);
  for(let i=0;i<12;i++) { const bh=25+hash(i+40)*55;ctx.fillStyle=i%2?'#3f4744':'#2b383a';ctx.fillRect(969+i*22,322-bh,24,bh); }
  for(let x=960;x<1230;x+=86) line(ctx,x,40,x,333,'#111d21',9);
  for(let y=40;y<340;y+=97) line(ctx,954,y,1227,y,'#162125',8);
  // Hand-painted shop sign, mounted beside the pegboard.
  ctx.fillStyle='#d8cab1';ctx.fillRect(70,53,294,116);ctx.fillStyle='#1d2b2e';ctx.fillRect(77,60,280,102);
  label(ctx,'REDLINE COUNTY',217,98,23,'#efe1be','center');
  label(ctx,'MOTOR WORKS',217,133,24,'#e9804b','center');
  for(const x of [85,349])for(const y of [68,154])ellipse(ctx,x,y,2.8,2.8,'#98a29b');
  // Pegboard and silhouetted tools.
  ctx.fillStyle='#5d5948';ctx.fillRect(410,60,435,140);ctx.strokeStyle='#252d2b';ctx.lineWidth=5;ctx.strokeRect(410,60,435,140);
  for(let y=70;y<200;y+=14)for(let x=420;x<845;x+=14){ctx.fillStyle='#393d33';ctx.fillRect(x,y,2,2);}
  for(let i=0;i<8;i++){let x=438+i*48,y=86+(i%3)*10;line(ctx,x,y,x+4,y+73,'#bec1ad',7);ellipse(ctx,x,y,10,12,'#bac0ad');ellipse(ctx,x,y-3,5,7,'#474e43');ellipse(ctx,x+4,y+73,7,7,'#899685');}
  // Bench, bottles, and a red rolling cabinet behind the car.
  ctx.fillStyle='#6d4c33';ctx.fillRect(382,254,515,16);ctx.fillStyle='#181f20';ctx.fillRect(405,270,15,155);ctx.fillRect(857,270,15,155);
  for(let i=0;i<5;i++){ctx.fillStyle=['#b9a76e','#687d71','#9c6245'][i%3];ctx.fillRect(734+i*26,220-(i%2)*20,18,34+(i%2)*20);ctx.fillStyle='#c9c5a9';ctx.fillRect(739+i*26,214-(i%2)*20,8,7);}
  ctx.fillStyle='#843e31';ctx.fillRect(72,247,214,175);ctx.fillStyle='#a74f39';ctx.fillRect(67,238,224,18);
  for(let i=0;i<5;i++){line(ctx,80,270+i*27,277,270+i*27,'#482b27',3);line(ctx,139,259+i*27,217,259+i*27,'#afb2a2',4);}
  ellipse(ctx,96,431,13,13,'#0b1216');ellipse(ctx,264,431,13,13,'#0b1216');
  // Fluorescent fixtures and light shafts. No blur filters or offscreen surfaces.
  for(const x of [440,920]){line(ctx,x,0,x,29,'#0a1418',3);line(ctx,x+210,0,x+210,29,'#0a1418',3);ctx.fillStyle='#0f1b20';ctx.fillRect(x-9,22,230,18);ctx.fillStyle='#e8e4c5';ctx.fillRect(x,34,210,7);poly(ctx,[[x,42],[x+210,42],[x+335,440],[x-125,440]],'rgba(239,220,166,.025)');}
  // Concrete ground, expansion joints and an oil-darkened service bay.
  const floor=ctx.createLinearGradient(0,400,0,620);floor.addColorStop(0,'#515750');floor.addColorStop(1,'#242e30');ctx.fillStyle=floor;ctx.fillRect(0,422,1280,198);
  line(ctx,0,424,1280,424,'#192325',6);
  for(let i=-3;i<9;i++) line(ctx,640+i*135,424,640+i*290,620,'rgba(12,22,24,.3)',2);
  line(ctx,0,518,1280,518,'rgba(16,25,27,.3)',2);
  poly(ctx,[[113,475],[1090,475],[1222,606],[15,606]],'rgba(12,21,23,.25)');
  line(ctx,70,578,1210,578,'rgba(215,154,66,.34)',3);
  // Hero vehicle remains undistorted even in narrow canvases.
  const carScale=Math.min(.99, (height/width<.45? .88:1));
  const visualAspect = sx/sy;
  const carY= height/width> .65 ? 240 : 218;
  ctx.save();ctx.translate(102,carY);ctx.scale(carScale,carScale * visualAspect);sideCar(ctx,car,options);ctx.restore();
  // A dark vignette frames the bright bodywork without hiding controls.
  const vignette=ctx.createRadialGradient(650,350,170,640,310,820);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(2,11,15,.5)');ctx.fillStyle=vignette;ctx.fillRect(0,0,1280,620);
  label(ctx,'BAY 01',35,594,15,'#b2b7a7');
  label(ctx,`${Math.round(finite(stats.hp,car.hp||0))} HP  /  ${car.year||'1967'}`,1242,594,15,'#bec3af','right');
  ctx.restore();return true;
}

export function roadCurve(course, distance) {
  const d=finite(distance);
  return course?.type==='drag' ? 0 : finite(course?.curveScale,.7)*(Math.sin(d/170)*.55+Math.sin(d/370)*.45);
}

/** Perspective is finite even at the camera and on a one-pixel viewport. */
export function projectRoad(depth, offset, width, height, options = {}) {
  const w=Math.max(1,finite(width,1)),h=Math.max(1,finite(height,1));
  const scale=70/(70+Math.max(0,finite(depth,0))), horizon=h*clamp(finite(options.horizon,.37),.15,.65);
  return {x:w*.5+finite(offset,0)*w*.54*scale,y:horizon+(h-horizon)*scale,halfWidth:w*.65*scale,scale};
}

export function roadSegments(course, distance, count=64, length=18) {
  const safeCount=clamp(Math.floor(finite(count,64)),1,128),step=clamp(finite(length,18),1,100);
  const result=[];let heading=0,offset=0;
  for(let i=0;i<=safeCount;i++){const z=i*step,curve=roadCurve(course,finite(distance)+z);result.push({z,offset,curve,index:Math.floor((finite(distance)+z)/24)});heading+=curve*step*.0018;offset+=heading*step/110;}
  return result;
}

export const THEMES=Object.freeze({
  industrial:{sky:['#26383f','#92776d','#e5ae76'],ground:['#5b6655','#293b36'],pavement:['#303b3d','#333e40'],shoulder:['#c5bda2','#9d624b'],edge:'#a9b5a4',dash:'#cfb976',night:false},
  coast:{sky:['#334957','#92776d','#e5ae76'],ground:['#5b6655','#293b36'],pavement:['#303b3d','#333e40'],shoulder:['#c5bda2','#9d624b'],edge:'#a9b5a4',dash:'#cfb976',night:false},
  canyon:{sky:['#26383f','#92776d','#e5ae76'],ground:['#8a6950','#473b32'],pavement:['#303b3d','#333e40'],shoulder:['#c5bda2','#9d624b'],edge:'#a9b5a4',dash:'#cfb976',night:false},
  aqueduct:{sky:['#4d6676','#b09a86','#e9c08e'],ground:['#8c8d86','#5a5d5c'],pavement:['#6d706c','#727571'],shoulder:['#9a9890','#8d8b84'],edge:'#d8d6c8',dash:'#e8d99a',night:false,walls:true},
  salt:{sky:['#8fb0c8','#cfd9d7','#f3e4c8'],ground:['#ece8db','#b9b5a6'],pavement:['#d9d5c6','#d3cfbf'],shoulder:['#c8c3b1','#bdb7a4'],edge:'#8c5a3c',dash:'#3b3f45',night:false},
  night:{sky:['#05070f','#101a30','#2a2236'],ground:['#1a221e','#0b100f'],pavement:['#1f262b','#222a2f'],shoulder:['#3a3f3c','#2f3233'],edge:'#cfd3c4',dash:'#e3c96c',night:true},
  highway:{sky:['#2d3f55','#8b7584','#e0a375'],ground:['#44503f','#222c27'],pavement:['#3a4246','#3d4549'],shoulder:['#8a8f82','#6f746b'],edge:'#eceee4',dash:'#f0dc8c',night:false}
});
const palette=theme=>THEMES[theme]||THEMES.industrial;

function skyScene(ctx,w,h,theme,distance=0) {
  const horizon=h*.37,colors=palette(theme);
  const sky=ctx.createLinearGradient(0,0,0,horizon*1.3);
  sky.addColorStop(0,colors.sky[0]);sky.addColorStop(.52,colors.sky[1]);sky.addColorStop(1,colors.sky[2]);
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  if(colors.night){
    for(let i=0;i<70;i++){const x=hash(i+500)*w,y=hash(i+600)*horizon*.9;ellipse(ctx,x,y,.8+hash(i+700)*1.1,.8+hash(i+700)*1.1,`rgba(226,232,255,${.35+hash(i+800)*.5})`);}
    const moonX=w*.78,moonY=h*.14,moonR=Math.min(w,h)*.04;
    const glow=ctx.createRadialGradient(moonX,moonY,moonR*.4,moonX,moonY,moonR*5);glow.addColorStop(0,'rgba(214,224,255,.28)');glow.addColorStop(1,'rgba(214,224,255,0)');ctx.fillStyle=glow;ctx.fillRect(moonX-moonR*5,moonY-moonR*5,moonR*10,moonR*10);
    ellipse(ctx,moonX,moonY,moonR,moonR,'#e8ecf5');ellipse(ctx,moonX-moonR*.35,moonY-moonR*.1,moonR*.82,moonR*.82,colors.sky[0]);
    const city=ctx.createLinearGradient(0,horizon-h*.12,0,horizon);city.addColorStop(0,'rgba(255,170,90,0)');city.addColorStop(1,'rgba(255,170,90,.22)');ctx.fillStyle=city;ctx.fillRect(0,horizon-h*.12,w,h*.12);
  } else {
    const sunX=w*.72,sunY=h*.225,sunR=Math.min(w,h)*.067;
    const halo=ctx.createRadialGradient(sunX,sunY,sunR*.3,sunX,sunY,sunR*4);halo.addColorStop(0,'rgba(255,206,139,.4)');halo.addColorStop(1,'rgba(255,206,139,0)');ctx.fillStyle=halo;ctx.fillRect(sunX-sunR*4,sunY-sunR*4,sunR*8,sunR*8);
    ellipse(ctx,sunX,sunY,sunR,sunR,theme==='salt'?'#fff3d6':'#ebbf83');
  }
  const ridgeColors=colors.night?['#0e1320','#0b1019','#070b12']:theme==='salt'?['#b9b4ad','#a39d95','#8d877f']:theme==='aqueduct'?['#7e7d78','#6b6b67','#565854']:['#716d64','#5f645e','#465553'];
  for(let band=0;band<3;band++) {
    const y=horizon-(2-band)*h*.035;const points=[[0,y]];
    for(let i=0;i<=26;i++)points.push([i*w/26,y-hash(i+band*30)*h*(theme==='canyon'||theme==='night'?.18:theme==='salt'||theme==='highway'?.05:.08)]);
    points.push([w,h],[0,h]);poly(ctx,points,ridgeColors[band]);
  }
  if(theme==='industrial'||theme==='aqueduct'||theme==='highway') {
    const tall=theme==='aqueduct'?1.6:1;
    for(let i=0;i<25;i++){const x=i*w/24,buildingH=(12+hash(i+101)*70)*w/1100*tall;ctx.fillStyle=i%2?'#3a4848':'#354144';ctx.fillRect(x,horizon-buildingH,w/26,buildingH);for(let j=0;j<3;j++){ctx.fillStyle='rgba(232,174,100,.24)';ctx.fillRect(x+4+j*w/100,horizon-buildingH+8,3,4);}}
    if(theme==='industrial')for(let i=0;i<5;i++){const x=w*(.04+i*.19);ctx.fillStyle='#384748';ctx.fillRect(x,horizon-h*.14,w*.012,h*.14);line(ctx,x-2,horizon-h*.14,x+w*.015,horizon-h*.14,'#58675f',3);}
  }
  if(theme==='night'){
    for(let i=0;i<30;i++){const x=i*w/29,buildingH=(6+hash(i+131)*40)*w/1100;ctx.fillStyle='#0a0e18';ctx.fillRect(x,horizon-buildingH,w/30,buildingH);for(let j=0;j<4;j++)if(hash(i*7+j)>.45){ctx.fillStyle='rgba(255,214,140,.55)';ctx.fillRect(x+3+j*w/160,horizon-buildingH+6+hash(j+i)*buildingH*.5,2,3);}}
  }
  if(theme==='coast') {
    const ocean=ctx.createLinearGradient(0,horizon,0,h);ocean.addColorStop(0,'#65857e');ocean.addColorStop(1,'#293f45');ctx.fillStyle=ocean;ctx.fillRect(w*.58,horizon,w*.42,h*.63);
    for(let i=0;i<18;i++){const y=horizon+Math.pow(i/18,2)*h*.49;line(ctx,w*.6,y,w,y,'rgba(201,192,149,.12)',1+(i/18)*2);}
  }
  const ground=ctx.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,colors.ground[0]);ground.addColorStop(1,colors.ground[1]);ctx.fillStyle=ground;ctx.fillRect(0,horizon,w*(theme==='coast'?.64:1),h-horizon);
  if(theme==='salt')for(let i=0;i<14;i++){const y=horizon+Math.pow((i+1)/14,1.7)*(h-horizon);line(ctx,0,y,w,y,'rgba(120,112,98,.08)',1);}
  // Narrow clouds remain stable; world movement only affects foreground scenery.
  if(!colors.night)for(let i=0;i<8;i++) {const x=hash(i+200)*w,y=(.06+hash(i+300)*.16)*h;ellipse(ctx,x,y,w*(.03+hash(i+400)*.04),h*.005,'rgba(231,193,151,.12)');}
}

function rearCar(ctx,x,y,width,color,style='coupe',options={}) {
  const scale=width/220;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  if(options.tilt)ctx.rotate(options.tilt);
  ellipse(ctx,0,3,120,18,'rgba(0,0,0,.4)');
  ctx.fillStyle='#0a1116';ctx.fillRect(-103,-73,32,78);ctx.fillRect(71,-73,32,78);
  const roof=style==='pickup'? -140:style==='roadster'?-100:-137;
  const body=ctx.createLinearGradient(0,-145,0,0);body.addColorStop(0,tint(color,.25));body.addColorStop(.3,color);body.addColorStop(.7,tint(color,-.14));body.addColorStop(1,tint(color,-.5));
  poly(ctx,[[-102,-13],[-110,-68],[-80,-88],[-57,roof],[55,roof],[80,-88],[108,-67],[101,-13]],body,tint(color,.4),2);
  poly(ctx,[[-72,-88],[-49,roof+12],[47,roof+12],[70,-88]],'#263e46','#a8b9ac',2);
  poly(ctx,[[-62,-92],[-45,roof+17],[-22,roof+17],[5,-92]],'rgba(176,198,188,.12)');
  line(ctx,-94,-74,93,-74,tint(color,.45),3);
  if(style==='fastback'||style==='coupe'||style==='muscle'){poly(ctx,[[-19,-75],[-17,-39],[-8,-39],[-9,-75]],'#d7cfb3');poly(ctx,[[8,-75],[8,-39],[17,-39],[18,-75]],'#d7cfb3');}
  ctx.fillStyle='#141e22';ctx.fillRect(-82,-51,164,22);
  for(const side of [-1,1]){ctx.fillStyle=options.brake?'#ff714c':'#d34a2d';ctx.fillRect(side===-1?-80:48,-48,32,13);ctx.fillStyle='#f19e63';ctx.fillRect(side===-1?-80:73,-47,7,11);}
  ctx.fillStyle='#d3d1ba';ctx.fillRect(-24,-45,48,18);label(ctx,'SR-67',0,-32,10,'#263535','center');
  line(ctx,-103,-17,104,-17,'#a2b4ad',7);line(ctx,-102,-20,103,-20,'#dfe4d2',2);
  ellipse(ctx,-67,-4,7,5,'#0a1114','#8e9992',2);ellipse(ctx,67,-4,7,5,'#0a1114','#8e9992',2);
  if(options.flame){poly(ctx,[[-74,-3],[-68,23],[-60,-3]],'#eba950');poly(ctx,[[60,-3],[67,23],[74,-3]],'#eba950');}
  ctx.restore();
}

/** Oncoming traffic seen head-on: body, grille and two headlights. */
function frontCar(ctx,x,y,width,color,truck=false,night=false) {
  const scale=width/220;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ellipse(ctx,0,3,120,18,'rgba(0,0,0,.4)');
  ctx.fillStyle='#0a1116';ctx.fillRect(-103,-73,32,78);ctx.fillRect(71,-73,32,78);
  const roof=truck?-215:-137;
  const body=ctx.createLinearGradient(0,-145,0,0);body.addColorStop(0,tint(color,.2));body.addColorStop(.35,color);body.addColorStop(1,tint(color,-.5));
  if(truck){poly(ctx,[[-108,-13],[-110,-150],[-104,roof],[104,roof],[110,-150],[108,-13]],body,tint(color,.35),2);poly(ctx,[[-92,-205],[-92,-148],[92,-148],[92,-205]],'#1b2a31','#a8b9ac',2);ctx.fillStyle='#24292b';ctx.fillRect(-100,-140,200,36);}
  else{poly(ctx,[[-102,-13],[-110,-68],[-80,-88],[-57,roof],[55,roof],[80,-88],[108,-67],[101,-13]],body,tint(color,.4),2);poly(ctx,[[-72,-88],[-49,roof+12],[47,roof+12],[70,-88]],'#1b2a31','#a8b9ac',2);ctx.fillStyle='#1a2124';ctx.fillRect(-56,-62,112,20);}
  ctx.fillStyle='#d9d7c2';ctx.fillRect(-24,-45,48,16);
  line(ctx,-103,-17,104,-17,'#a2b4ad',7);
  for(const side of [-1,1]){const lx=side*74;ellipse(ctx,lx,-50,15,13,night?'#fff7dc':'#e6e2c7','#f8f2d4',2);if(night){const glow=ctx.createRadialGradient(lx,-50,4,lx,-50,52);glow.addColorStop(0,'rgba(255,245,210,.55)');glow.addColorStop(1,'rgba(255,245,210,0)');ctx.fillStyle=glow;ctx.fillRect(lx-52,-102,104,104);}}
  ctx.restore();
}
/** Same-direction traffic: a plain sedan or a boxy truck seen from behind. */
function truckRear(ctx,x,y,width,color,options={}) {
  const scale=width/220;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ellipse(ctx,0,3,126,18,'rgba(0,0,0,.45)');
  ctx.fillStyle='#0a1116';ctx.fillRect(-108,-60,34,66);ctx.fillRect(74,-60,34,66);
  const body=ctx.createLinearGradient(0,-230,0,0);body.addColorStop(0,tint(color,.25));body.addColorStop(.5,color);body.addColorStop(1,tint(color,-.5));
  poly(ctx,[[-112,-14],[-112,-225],[112,-225],[112,-14]],body,tint(color,.35),3);
  for(let i=0;i<5;i++)line(ctx,-108,-205+i*40,108,-205+i*40,tint(color,-.25),2);
  ctx.fillStyle='#1b2024';ctx.fillRect(-100,-54,200,22);
  for(const side of [-1,1]){ctx.fillStyle=options.night?'#ff7a56':'#d34a2d';ctx.fillRect(side===-1?-96:66,-50,30,14);}
  ctx.fillStyle='#d3d1ba';ctx.fillRect(-26,-46,52,16);
  line(ctx,-112,-18,112,-18,'#a2b4ad',7);
  ctx.restore();
}

function roadside(ctx,x,y,scale,type,side,theme) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  if(type==='pole') {
    line(ctx,0,0,0,-220,'#263336',8);line(ctx,0,-220,-side*80,-230,'#263336',6);line(ctx,-side*80,-230,-side*80,-210,'#263336',5);
    ellipse(ctx,-side*80,-210,18,4,'#ead4a2');
    poly(ctx,[[-side*96,-205],[-side*64,-205],[-side*25,-26],[-side*130,-26]],'rgba(229,194,132,.045)');
  } else if(type==='board') {
    line(ctx,-50,0,-50,-170,'#303a39',9);line(ctx,50,0,50,-170,'#303a39',9);
    ctx.fillStyle='#263b3d';ctx.fillRect(-100,-210,200,94);ctx.strokeStyle='#cd9469';ctx.lineWidth=3;ctx.strokeRect(-100,-210,200,94);
    label(ctx,theme==='coast'?'COAST ROAD':theme==='canyon'?'SWITCHBACK':theme==='aqueduct'?'AQUEDUCT':theme==='salt'?'DRY LAKE':theme==='night'?'RIDGELINE':theme==='highway'?'EXIT 67':'REDLINE COUNTY',0,-174,theme==='industrial'||theme==='aqueduct'?16:19,'#e5d5ad','center');label(ctx,theme==='salt'?'SPEED TRIALS':theme==='aqueduct'?'FLOOD CONTROL':'MOTOR CLUB',0,-141,16,'#dd8c60','center');
  } else if(type==='palm') {
    line(ctx,0,0,12,-185,'#4c493b',11);
    for(let i=0;i<7;i++){const a=i*PI/3.5;poly(ctx,[[12,-185],[12+Math.cos(a)*87,-185+Math.sin(a)*42],[12+Math.cos(a+.3)*56,-185+Math.sin(a+.3)*31]],'#2d4840');}
  } else if(type==='rock') {
    poly(ctx,[[-76,0],[-68,-55],[-21,-101],[35,-88],[69,-31],[85,0]],'#7c5e49');poly(ctx,[[-21,-101],[35,-88],[69,-31],[18,-53]],'#a4815e');
  } else if(type==='lamp') {
    line(ctx,0,0,0,-250,'#58605c',7);line(ctx,0,-250,-side*70,-262,'#58605c',5);
    ellipse(ctx,-side*70,-258,16,5,'#f2e4b4');
    const glow=ctx.createRadialGradient(-side*70,-258,6,-side*70,-258,90);glow.addColorStop(0,'rgba(255,230,160,.22)');glow.addColorStop(1,'rgba(255,230,160,0)');ctx.fillStyle=glow;ctx.fillRect(-side*70-90,-348,180,180);
  } else if(type==='sign') {
    line(ctx,-70,0,-70,-180,'#6b746f',9);line(ctx,70,0,70,-180,'#6b746f',9);
    ctx.fillStyle='#1f6b45';ctx.fillRect(-118,-236,236,94);ctx.strokeStyle='#e9eee6';ctx.lineWidth=4;ctx.strokeRect(-118,-236,236,94);
    label(ctx,'INTERSTATE 67',0,-200,19,'#f1f5ee','center');label(ctx,'REDLINE COUNTY  2 MI',0,-166,14,'#dfe8dc','center');
  } else if(type==='pier') {
    ctx.fillStyle='#8d8c84';ctx.fillRect(-30,-260,60,260);ctx.fillStyle='#6f6e67';ctx.fillRect(-side*120,-290,side*300,34);
  } else {
    line(ctx,0,0,0,-66,'#d3d1b5',9);ctx.fillStyle='#bc613f';ctx.fillRect(-6,-58,12,19);
  }
  ctx.restore();
}

function hazard(ctx,x,y,width,type) {
  ctx.save();ctx.translate(x,y);ctx.scale(width/40,width/40);
  ellipse(ctx,0,2,28,7,'rgba(0,0,0,.35)');
  if(type==='barrel'){ctx.fillStyle='#9c5736';ctx.fillRect(-18,-48,36,48);ellipse(ctx,0,-48,18,6,'#d49758');line(ctx,-18,-35,18,-35,'#d8bd85',5);line(ctx,-18,-12,18,-12,'#3b3631',3);}
  else {poly(ctx,[[-21,0],[-4,-52],[5,-52],[21,0]],'#db713f','#f3b06d',1);poly(ctx,[[-13,-21],[-9,-32],[10,-32],[14,-21]],'#d9d4b5');ctx.fillStyle='#292f2c';ctx.fillRect(-26,-2,52,7);}
  ctx.restore();
}

export function drawRace(canvas,race={},options={}) {
  const ready=prepareCanvas(canvas,options);if(!ready)return false;
  const {ctx,width:w,height:h}=ready,player=race.player||{},opponent=race.opponent||{},course=race.course||{};
  const distance=finite(player.distance),playerX=clamp(finite(player.x),-1.8,1.8),theme=course.theme||'industrial',colors=palette(theme),night=colors.night;
  const lanes=course.lanes===3?3:2;
  skyScene(ctx,w,h,theme,distance);
  // Match the rendered wheel contact point to simulation x: ±1 meets the verge.
  const segments=roadSegments(course,distance), cameraOffset=-playerX*1.04;
  const projected=segments.map(s=>({...s,...projectRoad(s.z,s.offset+cameraOffset,w,h)}));
  // A continuous asphalt underlay prevents light subpixel gaps between strips.
  poly(ctx,[...projected.map(p=>[p.x-p.halfWidth,p.y]),...projected.slice().reverse().map(p=>[p.x+p.halfWidth,p.y])],colors.pavement[0]);
  for(let i=projected.length-2;i>=0;i--){
    const near=projected[i],far=projected[i+1];
    // Slight overlap removes antialias seams between contiguous asphalt strips.
    const fy=far.y-.7,ny=near.y+.7;
    const pavement=colors.pavement[near.index%2],shoulder=colors.shoulder[near.index%2];
    for(const side of [-1,1])poly(ctx,[[far.x+side*far.halfWidth,fy],[far.x+side*far.halfWidth*1.12,fy],[near.x+side*near.halfWidth*1.12,ny],[near.x+side*near.halfWidth,ny]],shoulder);
    poly(ctx,[[far.x-far.halfWidth,fy],[far.x+far.halfWidth,fy],[near.x+near.halfWidth,ny],[near.x-near.halfWidth,ny]],pavement);
    for(const edge of [-.96,.96]) poly(ctx,[[far.x+far.halfWidth*(edge-.008),far.y],[far.x+far.halfWidth*(edge+.008),far.y],[near.x+near.halfWidth*(edge+.008),near.y],[near.x+near.halfWidth*(edge-.008),near.y]],colors.edge);
    if(near.index%3!==0){
      // Two lanes share a centre line; the highway paints both lane boundaries.
      const marks=lanes===3?[-.306,.306]:[0];
      for(const mark of marks)for(const lane of [mark-.018,mark+.018])poly(ctx,[[far.x+far.halfWidth*(lane-.006),far.y],[far.x+far.halfWidth*(lane+.006),far.y],[near.x+near.halfWidth*(lane+.006),near.y],[near.x+near.halfWidth*(lane-.006),near.y]],colors.dash);
    }
    if(colors.walls){
      // Concrete channel walls rise from the shoulder; the inner face catches the light.
      for(const side of [-1,1]){
        const fx=far.x+side*far.halfWidth*1.12,nx=near.x+side*near.halfWidth*1.12,fh=far.halfWidth*.34,nh=near.halfWidth*.34;
        poly(ctx,[[fx,fy],[fx,fy-fh],[nx,ny-nh],[nx,ny]],side===-1?'#a6a49b':'#7d7c75');
        poly(ctx,[[fx,fy-fh],[fx+side*far.halfWidth*.06,fy-fh],[nx+side*near.halfWidth*.06,ny-nh],[nx,ny-nh]],'#c2c0b6');
      }
    }
  }
  const locate=(z,lateral=0)=>{
    const k=clamp(z/18,0,segments.length-1),index=Math.floor(k),t=k-index;
    const a=segments[index],b=segments[Math.min(index+1,segments.length-1)];
    return projectRoad(z,a.offset+(b.offset-a.offset)*t+cameraOffset+lateral*1.19,w,h);
  };
  const objects=[];
  for(let i=0;i<17;i++){
    const marker=Math.floor(distance/70)+i+1,z=marker*70-distance;
    for(const side of [-1,1]){
      const kind=marker%9===0?'board':theme==='industrial'?(marker%3===0?'pole':'post'):theme==='coast'?(side===-1&&marker%3===0?'palm':'post'):theme==='canyon'?(marker%3===0?'rock':'post'):theme==='aqueduct'?(marker%4===0?'pier':null):theme==='salt'?(marker%2===0?'post':null):theme==='night'?(marker%3===0?'lamp':'post'):theme==='highway'?(marker%4===0?(side===1?'sign':'lamp'):marker%2===0?'lamp':null):'post';
      if(kind)objects.push({z,type:'scenery',side,kind});
    }
  }
  for(const obstacle of (Array.isArray(race.hazards)?race.hazards:[])){
    const z=finite(obstacle.distance)-distance;
    if(z>0&&z<1100&&!obstacle.hit)objects.push({z,type:'hazard',obstacle});
  }
  for(const car of (Array.isArray(race.traffic)?race.traffic:[])){
    const z=finite(car.distance)-distance+30;
    if(z>2&&z<1100)objects.push({z,type:'traffic',car});
  }
  const rivalZ=finite(opponent.distance)-distance+30;
  if(rivalZ>2&&rivalZ<1100)objects.push({z:rivalZ,type:'opponent'});
  const finishZ=finite(course.length,1000)-distance;
  if(finishZ>0&&finishZ<1100)objects.push({z:finishZ,type:'finish'});
  objects.sort((a,b)=>b.z-a.z);
  const lights=[];
  for(const item of objects){
    if(item.type==='scenery'){const p=locate(item.z,item.side*1.13);roadside(ctx,p.x,p.y,p.scale*w/1000,item.kind,item.side,theme);}
    else if(item.type==='hazard'){const p=locate(item.z,finite(item.obstacle.x));hazard(ctx,p.x,p.y,44*p.scale*w/1000,item.obstacle.type);}
    else if(item.type==='traffic'){
      const car=item.car,p=locate(item.z,finite(car.x)),size=(car.style==='truck'?230:195)*p.scale*w/1000,color=paint(car.color||'#c9c2a8');
      if(finite(car.speed)<0){frontCar(ctx,p.x,p.y,size,color,car.style==='truck',night);if(night)for(const side of [-1,1])lights.push({x:p.x+side*size*.34,y:p.y-size*.23,r:size*.3});}
      else if(car.style==='truck')truckRear(ctx,p.x,p.y,size,color,{night});
      else rearCar(ctx,p.x,p.y,size,color,'sedan',{brake:night});
    }
    else if(item.type==='opponent'){const p=locate(item.z,finite(opponent.x,-.4));rearCar(ctx,p.x,p.y,200*p.scale*w/1000,paint(opponent.car?.color||opponent.model?.color||'#73a8a6'),opponent.model?.style||'coupe',{brake:night});}
    else if(item.type==='finish'){
      const p=locate(item.z),barY=p.y-235*p.scale*w/1000,left=p.x-p.halfWidth*.98,right=p.x+p.halfWidth*.98;
      line(ctx,left,p.y,left,barY,'#bfc7b5',Math.max(1,9*p.scale));line(ctx,right,p.y,right,barY,'#bfc7b5',Math.max(1,9*p.scale));
      for(let j=0;j<16;j++)for(let row=0;row<2;row++){ctx.fillStyle=(j+row)%2?'#293739':'#e4dfc7';ctx.fillRect(left+j*(right-left)/16,barY+row*15*p.scale,(right-left)/16+1,15*p.scale+1);}
      label(ctx,'FINISH',p.x,barY-9*p.scale,Math.max(5,23*p.scale),'#e7dbbc','center');
    }
  }
  // Motion marks stay attached to the asphalt; no camera shake in reduced-motion mode.
  const speed=finite(player.speed),curve=finite(race.curvature);
  const carX=w*.5+playerX*w*.08,carY=h*.94,carW=Math.min(w*.23,h*.47);
  if(night){
    // Headlights: the road ahead is lit, the rest of the county is not.
    ctx.fillStyle='rgba(4,7,16,.42)';ctx.fillRect(0,0,w,h);
    const far=locate(150,0);
    for(const side of [-1,1]){
      const beam=ctx.createLinearGradient(carX,carY-carW*.3,far.x,far.y);beam.addColorStop(0,'rgba(255,240,200,.26)');beam.addColorStop(1,'rgba(255,240,200,0)');
      poly(ctx,[[carX+side*carW*.3,carY-carW*.3],[far.x+side*far.halfWidth*.55,far.y],[far.x-side*far.halfWidth*.1,far.y]],beam);
    }
    for(const light of lights){const glow=ctx.createRadialGradient(light.x,light.y,1,light.x,light.y,Math.max(2,light.r));glow.addColorStop(0,'rgba(255,248,220,.9)');glow.addColorStop(.3,'rgba(255,240,200,.35)');glow.addColorStop(1,'rgba(255,240,200,0)');ctx.fillStyle=glow;ctx.fillRect(light.x-light.r,light.y-light.r,light.r*2,light.r*2);}
  }
  if(Math.abs(playerX)>.9&&speed>8){for(let i=0;i<7;i++){const jitter=hash(Math.floor(distance/4)+i);ellipse(ctx,carX+(jitter-.5)*carW*1.1,carY-i*6,carW*(.10+jitter*.09),carW*.04,colors.walls?'rgba(236,228,206,.2)':'rgba(196,163,117,.12)');}}
  rearCar(ctx,carX,carY,carW,paint(player.car?.color||player.model?.color||'#d36a3d'),player.model?.style||'coupe',{tilt:options.reducedMotion?0:clamp(curve*speed*.0007,-.035,.035),brake:!!options.braking||night,flame:finite(player.rpm)>6700&&speed>10});
  const vignette=ctx.createLinearGradient(0,h*.78,0,h);vignette.addColorStop(0,'rgba(5,16,20,0)');vignette.addColorStop(1,'rgba(5,16,20,.44)');ctx.fillStyle=vignette;ctx.fillRect(0,h*.78,w,h*.22);
  return true;
}
