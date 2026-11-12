// SPDX-License-Identifier: Apache-2.0
// Real packaged-game UI/input checks. Observation uses copied __streetRacer
// snapshots; no test mutates live career, race, clock or simulation internals.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root=path.resolve(import.meta.dirname,'..'),stage=path.join(root,'_site'),out=path.join(root,'test-results/browser');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.txt':'text/plain'};
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/STREET-RACER/'))throw new Error('scope');
    const file=path.resolve(stage,decodeURIComponent(url.pathname.slice('/STREET-RACER/'.length))||'index.html');
    if(!file.startsWith(stage+path.sep))throw new Error('path');
    const bytes=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
const receipt={status:'RUNNING',environment:'isolated hosted/headless Chromium',checks:[],errors:[],httpFailures:[],externalRequests:[],screenshots:[],limits:'Browser clock advances genuine RAF and user-input processing. Touch is emulated; no physical-device, human-listening or hardware-speed claim.'};
let browser,context,page,url,origin,current='launch',racePicture,backup;
const action=(name,p=page)=>p.locator(`[data-action="${name}"]:visible`);
const nav=(name,p=page)=>p.locator(`#navigation [data-view="${name}"]`);
const snap=(p=page)=>p.evaluate(()=>globalThis.__streetRacer);
const resources=state=>JSON.stringify({cash:state.cash,rep:state.rep,cars:state.cars,wins:state.wins,losses:state.losses,day:state.day,defeated:state.defeated});
const observe=p=>{
  p.on('pageerror',e=>receipt.errors.push(e.message));
  p.on('response',r=>{if(r.status()>=400)receipt.httpFailures.push(`${r.status()} ${r.url()}`);});
  p.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))receipt.externalRequests.push(r.url());});
};
async function advance(ms,p=page){await p.clock.runFor(ms);}
async function picture(name,p=page){await advance(50,p);await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});receipt.screenshots.push(name+'.png');}
async function close(p=page){if(await p.locator('#dialog').evaluate(d=>d.open))await p.getByRole('button',{name:'Close dialog',exact:true}).click();}
async function check(name,fn){current=name;const started=performance.now();await fn();receipt.checks.push({name,status:'PASS',elapsedMs:Math.round(performance.now()-started)});await fs.writeFile(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');}
async function openPage(ctx,initialise){
  const p=await ctx.newPage();p.setDefaultTimeout(15000);observe(p);
  // The browser still runs the real application clock and input handlers.
  // runFor advances their timers/RAF; it never calls stepRace or changes state.
  await p.clock.install({time:new Date('2026-01-01T19:00:00Z')});
  if(initialise)await p.addInitScript(initialise);
  await p.goto(url);await p.waitForFunction(()=>globalThis.__streetRacer?.career&&document.querySelector('#garage-canvas'));
  await advance(60,p);return p;
}
async function buyStarter(p=page){await nav('garage',p).click();await p.locator('[data-action="buy"][data-model="sparrow"]').click();await p.waitForFunction(()=>__streetRacer.career.cars.length===1);}
async function practice(course='foundry',transmission='auto',p=page){
  await nav('meet',p).click();await p.locator(`input[name="course"][value="${course}"]`).check();
  await action('practice',p).click();await p.locator('#race-transmission').selectOption(transmission);
  await action('race-launch',p).click();await p.waitForFunction(()=>__streetRacer.race?.status==='countdown');
}
async function retire(p=page){
  if(!(await snap(p)).paused)await action('pause',p).click();
  await action('retire',p).click();await action('retire-confirm',p).click();
  await p.waitForFunction(()=>__streetRacer.race?.status==='finished');
  await action('race-exit',p).click();await p.waitForFunction(()=>!__streetRacer.race);
}
async function importCareer(text,p=page){
  await action('save-menu',p).first().click();
  await p.locator('#import-file').setInputFiles({name:'street-racer-test-backup.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await action('import-confirm',p).click();await p.waitForFunction(()=>!document.querySelector('#dialog').open);
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  url=`http://127.0.0.1:${server.address().port}/STREET-RACER/`;origin=new URL(url).origin;
  // SwiftShader keeps the WebGL side events testable on hosted runners without a GPU.
  // Canvas2D stays software-rasterized so repeated draws remain pixel-identical.
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-accelerated-2d-canvas']});
  receipt.browser=browser.version();
  context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.25,reducedMotion:'reduce',acceptDownloads:true});
  page=await openPage(context);

  await check('first-garage-and-read-only-observation',async()=>{
    const state=await snap();assert.equal(state.career.cars.length,0);assert.equal(state.career.cash,2400);assert.equal(state.audio.status,'locked');
    assert.equal(await page.evaluate(()=>{const copy=__streetRacer;copy.career.cash=0;return __streetRacer.career.cash;}),2400);
    const canvasGeometry=()=>page.locator('#garage-canvas').evaluate(c=>{
      const rect=c.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,devicePixelRatio));
      return {css:[rect.width,rect.height],deviceDpr:devicePixelRatio,effectiveDpr:dpr,backing:[c.width,c.height],expected:[Math.round(rect.width*dpr),Math.round(rect.height*dpr)]};
    });
    receipt.garageCanvas=await canvasGeometry();
    // Layout dimensions can be fractional. clientWidth/clientHeight round them
    // to CSS integers and are not the renderer's backing-store contract.
    await page.waitForFunction(()=>{
      const c=document.querySelector('#garage-canvas'),r=c.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,devicePixelRatio));
      return r.width>0&&r.height>0&&c.width===Math.round(r.width*dpr)&&c.height===Math.round(r.height*dpr);
    });
    receipt.garageCanvas=await canvasGeometry();
    assert.deepEqual(receipt.garageCanvas.backing,receipt.garageCanvas.expected);
    await picture('garage-first-project');
  });
  await check('eight-classifieds-buy-first-car-and-all-navigation',async()=>{
    await nav('classifieds').click();assert.equal(await page.locator('.listing').count(),8);await picture('car-catalogue');
    await page.locator('[data-action="buy"][data-model="sparrow"]').click();
    const state=(await snap()).career;assert.equal(state.cars.length,1);assert.equal(state.cars[0].modelId,'sparrow');assert.equal(state.cash,1500);
    for(const view of ['parts','meet','logbook','classifieds','garage']){await nav(view).click();assert.equal((await snap()).view,view);assert.equal(await nav(view).getAttribute('aria-current'),'page');}
    await picture('garage-desktop');
  });
  await check('parts-have-effects-tuning-paint-and-local-save',async()=>{
    await nav('parts').click();
    for(const slot of ['engine','intake','tyres'])await page.locator(`[data-action="upgrade"][data-slot="${slot}"]`).click();
    await page.locator('#tune-range').press('Home');for(let i=0;i<27;i++)await page.locator('#tune-range').press('ArrowRight');await page.locator('#tune-form button[type="submit"]').click();
    await page.getByRole('button',{name:'Paint Petrol for $60',exact:true}).click();
    const state=(await snap()).career,car=state.cars[0];
    assert.equal(car.parts.engine,1);assert.equal(car.parts.intake,1);assert.equal(car.parts.tyres,1);assert.equal(car.tune,.35);assert.equal(car.color,'#628b9c');assert.equal(state.cash,610);
    await picture('parts-and-tuning');await page.reload();await page.waitForFunction(()=>__streetRacer?.career?.cars[0]?.color==='#628b9c');
    assert.deepEqual((await snap()).career,state);
  });
  await check('preferences-and-user-gesture-web-audio',async()=>{
    await page.getByRole('button',{name:'Open settings',exact:true}).click();
    await page.locator('#setting-contrast').check();await page.locator('#setting-volume').press('Home');for(let i=0;i<5;i++)await page.locator('#setting-volume').press('ArrowRight');await page.locator('#setting-transmission').selectOption('manual');await close();
    assert.equal(await page.locator('html').getAttribute('data-contrast'),'high');
    await action('sound').click();await page.waitForFunction(()=>__streetRacer.audio.enabled&&__streetRacer.audio.status==='running');
    await advance(250);const audio=(await snap()).audio;assert.equal(audio.unlocked,true);assert.ok(audio.voices>0);assert.ok(audio.bufferCount>0);receipt.audio={status:audio.status,voices:audio.voices,cachedInstrumentPitches:audio.bufferCount};
    await action('sound').click();await page.waitForFunction(()=>!__streetRacer.audio.enabled&&__streetRacer.audio.status==='suspended');
    await page.reload();await page.waitForFunction(()=>__streetRacer?.preferences.transmission==='manual');
    assert.equal((await snap()).preferences.volume,.25);assert.equal(await page.locator('html').getAttribute('data-contrast'),'high');
    await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.locator('#setting-contrast').uncheck();await page.locator('#setting-transmission').selectOption('auto');await close();
  });
  await check('cash-drag-played-through-keyboard-to-finish',async()=>{
    await nav('meet').click();await picture('night-meet');
    await page.locator('[data-action="challenge"][data-rival="mags"]').click();await page.locator('input[name="stake"][value="cash"]').check();await action('race-launch').click();
    const before=(await snap()).career;await page.keyboard.down('w');
    for(let i=0;i<30&&(await snap()).race.status!=='finished';i++)await advance(2000);
    await page.keyboard.up('w');const state=await snap();
    assert.equal(state.race.status,'finished');assert.equal(state.race.winner,'player');assert.equal(state.career.wins,before.wins+1);assert.equal(state.career.cash,before.cash+355);assert.ok(state.career.defeated.includes('mags'));assert.ok(state.race.player.distance>=402);
    racePicture=state.race;receipt.firstRace={winner:state.race.winner,time:state.race.finishTime,distance:state.race.player.distance,gear:state.race.player.gear,cashGain:state.career.cash-before.cash};
    await picture('race-results');
  });
  await check('result-is-settled-once-and-service-restores-car',async()=>{
    const state=(await snap()).career;await advance(2500);assert.deepEqual((await snap()).career,state);
    await action('race-exit').click();await page.keyboard.press('Escape');await advance(100);assert.deepEqual((await snap()).career,state);
    assert.ok(state.cars[0].fuel<100&&state.cars[0].condition<100);
    await action('service').click();await action('refuel').click();
    const serviced=(await snap()).career;assert.equal(serviced.cars[0].condition,100);assert.equal(serviced.cars[0].fuel,100);assert.ok(serviced.cash<state.cash);
  });
  await check('export-invalid-import-cancel-and-confirmed-restore',async()=>{
    await action('save-menu').first().click();
    const downloaded=page.waitForEvent('download');await action('export').click();const file=await downloaded;
    await file.saveAs(path.join(out,'career-export.json'));backup=await fs.readFile(path.join(out,'career-export.json'),'utf8');const exported=(await snap()).career;
    await close();await nav('logbook').click();await action('work').click();assert.equal((await snap()).career.cash,exported.cash+180);
    const before=JSON.stringify((await snap()).career);await action('save-menu').first().click();
    for(const content of ['{"schema":1,"cash":-1}', 'x'.repeat(65537)]){
      await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(content)});
      await page.waitForFunction(()=>!document.querySelector('#toast').hidden&&/unchanged|not changed/i.test(document.querySelector('#toast').textContent));
      assert.equal(JSON.stringify((await snap()).career),before);
    }
    await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
    await action('import-confirm').waitFor({state:'visible'});assert.equal(JSON.stringify((await snap()).career),before);await close();assert.equal(JSON.stringify((await snap()).career),before);
    await importCareer(backup);assert.deepEqual((await snap()).career,exported);
  });
  await check('manual-shifting-pause-release-restart-and-practice-retire',async()=>{
    const before=resources((await snap()).career);await practice('foundry','manual');
    await page.keyboard.down('w');await advance(4700);assert.ok((await snap()).race.player.speed>0);
    await page.keyboard.press('e');await advance(200);assert.equal((await snap()).race.player.gear,2);
    await page.keyboard.press('Escape');const paused=await snap();assert.equal(paused.paused,true);assert.equal(paused.input.throttle,0);
    await advance(2000);assert.deepEqual((await snap()).race,paused.race);
    await page.keyboard.up('w');await action('resume').click();await advance(300);assert.equal((await snap()).input.throttle,0);
    await action('fullscreen').click();await advance(100);
    assert.ok(await page.evaluate(()=>Boolean(document.fullscreenElement)||/fullscreen/i.test(document.querySelector('#toast').textContent)));
    if((await snap()).paused)await action('resume').click();
    await page.keyboard.press('r');assert.equal((await snap()).race.status,'countdown');assert.equal((await snap()).race.player.distance,0);
    await retire();assert.equal(resources((await snap()).career),before);
  });
  await check('road-routes-steering-braking-and-focus-loss-pause',async()=>{
    receipt.roads=[];
    for(const course of ['coast','canyon']){
      const before=resources((await snap()).career);await practice(course);await page.keyboard.down('w');await advance(6500);
      const x=(await snap()).race.player.x;await page.keyboard.down('d');await advance(300);await page.keyboard.up('d');assert.ok((await snap()).race.player.x>x);
      await page.keyboard.up('w');const speed=(await snap()).race.player.speed;await page.keyboard.down('s');await advance(300);await page.keyboard.up('s');assert.ok((await snap()).race.player.speed<speed);
      receipt.roads.push({course,distance:(await snap()).race.player.distance,steeringObserved:true,brakingObserved:true});
      await picture('road-race-'+course);
      // A genuine window blur uses the same browser event path as switching apps.
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const paused=await snap();assert.equal(paused.paused,true);
      await advance(1500);assert.deepEqual((await snap()).race,paused.race);await retire();assert.equal(resources((await snap()).career),before);
    }
  });
  await check('arcade-five-side-events-drive-pause-export-and-career-isolation',async()=>{
    const before=resources((await snap()).career);receipt.arcade=[];
    await nav('arcade').click();await page.waitForSelector('[data-action="arcade-launch"][data-mode="stunt"]');
    for(const mode of ['retro','circuit','derby','ball','stunt']){
      await page.locator(`[data-action="arcade-launch"][data-mode="${mode}"]`).click();
      await page.waitForFunction(m=>__streetRacer.arcade?.mode===m&&!__streetRacer.arcadePaused,mode);
      const launched=await snap();assert.equal(launched.arcadeFailure,'',mode);if(mode!=='retro')assert.equal(launched.arcadeScene,true,`${mode} creates a WebGL scene`);
      await page.keyboard.down('w');await advance(2500);
      const moving=(await snap()).arcade;assert.ok(Math.abs(moving.player.speed)>5,`${mode} accelerates`);assert.ok(moving.tick>60);
      await page.keyboard.down('d');await advance(250);await page.keyboard.up('d');await page.keyboard.up('w');
      if(mode==='retro'){
        assert.ok((await snap()).arcade.player.x>0,'retro steering moves the car right');
        const drawn=await page.locator('#arcade-retro').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=40)if(d[i]+d[i+1]+d[i+2]>120)n++;return n;});
        assert.ok(drawn>100,'retro canvas has drawn pixels');
      }else assert.ok(await page.locator('#arcade-three').evaluate(c=>c.width>1&&c.height>1&&!!c.getContext('webgl')),`${mode} allocates a WebGL canvas`);
      await picture('arcade-'+mode);
      // Focus loss pauses a side event through the same path as a career race.
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const paused=await snap();assert.equal(paused.arcadePaused,true,`${mode} pauses on blur`);
      await advance(1000);assert.equal((await snap()).arcade.tick,paused.arcade.tick,'a paused side event does not advance');
      if(mode==='circuit'){
        const [download]=await Promise.all([page.waitForEvent('download'),action('arcade-export').click()]);
        const run=JSON.parse(await fs.readFile(await download.path(),'utf8'));
        assert.equal(run.format,'street-racer-arcade-run');assert.equal(run.mode,'circuit');assert.equal(run.step,1/60);assert.ok(run.inputs.length>60);
        receipt.arcade.push({mode,ticks:run.observation.tick,recordedInputs:run.inputs.length});
      }else receipt.arcade.push({mode,ticks:paused.arcade.tick});
      await action('resume').click();await page.waitForFunction(()=>!__streetRacer.arcadePaused);
      await page.keyboard.press('Escape');await page.waitForFunction(()=>__streetRacer.arcadePaused);
      await action('arcade-exit').click();await page.waitForFunction(()=>!__streetRacer.arcade);
    }
    assert.equal(resources((await snap()).career),before,'side events never change the career');
    assert.equal((await snap()).view,'arcade');
  });
  await check('pink-slip-consent-loss-and-workshop-recovery',async()=>{
    await nav('meet').click();await page.locator('input[name="course"][value="foundry"]').check();
    await page.locator('[data-action="challenge"][data-rival="mags"]').click();await page.locator('input[name="stake"][value="pink"]').check();
    const before=(await snap()).career;await action('race-launch').click();assert.equal((await snap()).race,null);assert.deepEqual((await snap()).career,before);
    assert.match(await page.locator('#dialog-body').innerText(),/lose|losing/i);await action('pink-back').click();assert.equal((await snap()).race,null);
    await page.locator('input[name="stake"][value="pink"]').check();await action('race-launch').click();await action('pink-confirm').click();
    await retire();const lost=(await snap()).career;assert.equal(lost.cars.length,0);assert.equal(lost.cash,before.cash);assert.equal(lost.losses,before.losses+1);
    await nav('classifieds').click();await action('work').click();assert.equal((await snap()).career.cash,lost.cash+180);
    await page.locator('[data-action="buy"][data-model="sparrow"]').click();assert.equal((await snap()).career.cars.length,1);
  });
  await check('browser-fractional-dpr-render-repeat-reference-parity',async()=>{
    receipt.pixels=await page.evaluate(async race=>{
      const {drawGarage,drawRace}=await import('./js/render.js'),{CARS}=await import('./js/catalog.js'),result=[];
      for(const kind of ['garage','race'])for(const [width,height]of [[601,421],[900,520]]){
        const a=document.createElement('canvas'),b=document.createElement('canvas'),options={width,height,dpr:1.25};
        const draw=c=>kind==='garage'?drawGarage(c,CARS[5],{hp:292},options):drawRace(c,race,options);
        draw(a);const first=a.getContext('2d').getImageData(0,0,a.width,a.height).data;draw(a);draw(b);
        if(a.width!==Math.round(width*1.25)||a.height!==Math.round(height*1.25)||b.width!==a.width||b.height!==a.height)throw new Error('Renderer backing dimensions do not match the requested CSS size and DPR');
        const next=a.getContext('2d').getImageData(0,0,a.width,a.height).data,reference=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
        if(first.length!==next.length||first.length!==reference.length||first.some((v,i)=>v!==next[i]||v!==reference[i]))throw new Error('Renderer repeat/fresh pixel mismatch');
        result.push({kind,width,height,dpr:1.25,backing:[a.width,a.height],rgba:'identical'});
      }return result;
    },racePicture);
  });
  await check('320-and-390-layout-navigation-and-dialogs',async()=>{
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      for(const view of ['garage','classifieds','parts','meet','logbook']){
        await nav(view).click();await advance(30);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px ${view} overflows horizontally`);
      }
      await nav('garage').click();await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.locator('#dialog [data-action="help"]').click();
      assert.ok(await page.locator('#dialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
      await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
      await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.locator('#dialog [data-action="save-menu"]').click();assert.equal(await action('export').isVisible(),true);await close();await picture('garage-'+width);
    }
    await page.setViewportSize({width:1440,height:1000});
  });
  await check('offline-service-worker-reload-career-and-driving',async()=>{
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:30000});
    const before=(await snap()).career;await context.setOffline(true);await page.reload();await page.waitForFunction(()=>__streetRacer?.career?.cars.length===1);
    assert.deepEqual((await snap()).career,before);await practice();await page.keyboard.down('w');await advance(5000);await page.keyboard.up('w');assert.ok((await snap()).race.player.speed>0);await retire();
    await picture('offline-garage');await context.setOffline(false);
  });
  await check('emulated-touch-hold-release-and-pause',async()=>{
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
    const p=await openPage(ctx);await buyStarter(p);await practice('coast','auto',p);
    const touch=await ctx.newCDPSession(p),bounds=await p.locator('[data-control="throttle"]').boundingBox();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,id:1}]});await advance(5300,p);assert.ok((await snap(p)).race.player.speed>0);assert.equal((await snap(p)).input.throttle,1);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(100,p);assert.equal((await snap(p)).input.throttle,0);
    await p.getByRole('button',{name:'Pause race',exact:true}).tap();const paused=await snap(p);assert.equal(paused.paused,true);await advance(1000,p);assert.deepEqual((await snap(p)).race,paused.race);
    await picture('touch-race-paused',p);await touch.detach();await ctx.close();
  });
  await check('disabled-storage-still-plays-and-exports',async()=>{
    const ctx=await browser.newContext({viewport:{width:1100,height:850},acceptDownloads:true});
    const p=await openPage(ctx,()=>{for(const method of ['getItem','setItem'])Storage.prototype[method]=()=>{throw new DOMException('Storage disabled for this check','SecurityError');};});
    assert.equal((await snap(p)).storageOK,false);await buyStarter(p);assert.equal((await snap(p)).career.cars.length,1);
    await action('save-menu',p).first().click();const waiting=p.waitForEvent('download');await action('export',p).click();const file=await waiting;await file.saveAs(path.join(out,'storage-disabled-export.json'));
    assert.ok((await fs.readFile(path.join(out,'storage-disabled-export.json'),'utf8')).includes('sparrow'));await ctx.close();
  });
  await check('malformed-stored-career-is-preserved-for-recovery',async()=>{
    const ctx=await browser.newContext({viewport:{width:1100,height:850},acceptDownloads:true});
    const p=await openPage(ctx,()=>{if(localStorage.getItem('street-racer.test-seeded')!=='1'){localStorage.setItem('street-racer.career.v1','{"broken":true}');localStorage.setItem('street-racer.test-seeded','1');}});
    assert.equal((await snap(p)).career.cars.length,0);assert.equal((await snap(p)).career.cash,2400);assert.match(await p.locator('.notice').innerText(),/could not be opened/);
    assert.equal(await p.evaluate(()=>localStorage.getItem('street-racer.rejected.v1')),'{"broken":true}');
    await buyStarter(p);await p.reload();await p.waitForFunction(()=>__streetRacer?.career?.cars.length===1);
    assert.equal(await p.evaluate(()=>localStorage.getItem('street-racer.rejected.v1')),'{"broken":true}');
    await action('save-menu',p).first().click();const waiting=p.waitForEvent('download');await action('export-rejected',p).click();const file=await waiting;await file.saveAs(path.join(out,'rejected-save.json'));assert.equal(await fs.readFile(path.join(out,'rejected-save.json'),'utf8'),'{"broken":true}');await ctx.close();
  });
  await check('canvas-unavailable-retains-garage-and-race-controls',async()=>{
    const ctx=await browser.newContext({viewport:{width:1100,height:850}});
    const p=await openPage(ctx,()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='2d'?null:original.call(this,type,...args);};});
    assert.match(await p.locator('#garage-canvas').getAttribute('aria-label'),/unavailable/);await buyStarter(p);await practice('foundry','auto',p);await p.keyboard.down('w');await advance(5000,p);await p.keyboard.up('w');assert.ok((await snap(p)).race.player.speed>0);assert.match(await p.locator('#drive-hint').innerText(),/CANVAS UNAVAILABLE/);await retire(p);await ctx.close();
  });
  assert.deepEqual(receipt.errors,[],'page errors');assert.deepEqual(receipt.httpFailures,[],'HTTP failures');assert.deepEqual(receipt.externalRequests,[],'external runtime requests');
  receipt.sourceHashes={};
  for(const file of ['index.html','style.css','js/app.js','js/core.js','js/catalog.js','js/render.js','js/audio.js','js/ui.js','js/arcade.js','js/arcade-geometry.js','js/arcade-render.js','sw.js'])receipt.sourceHashes[file]=createHash('sha256').update(await fs.readFile(path.join(stage,file))).digest('hex');
  receipt.status='PASS';receipt.completedChecks=receipt.checks.length;console.log(`PASS: ${receipt.checks.length} STREET-RACER browser checks.`);
}catch(error){
  receipt.status='FAIL';receipt.failedCheck=current;receipt.failure=error.stack||String(error);console.error(error);
  if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});
  process.exitCode=1;
}finally{
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
