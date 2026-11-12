// SPDX-License-Identifier: Apache-2.0
// Black-box smoke checks on the built Pages subpath. The game runs its own RAF.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');
const stage=path.join(root,'_site'),out=path.join(root,'test-results/monorepo');
await fs.mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(!url.pathname.startsWith('/STREET-RACER/'))throw Error('scope');
    const relative=decodeURIComponent(url.pathname.slice('/STREET-RACER/'.length));
    const target=path.resolve(stage,relative||'index.html',relative.endsWith('/')?'index.html':'');
    if(!target.startsWith(stage+path.sep))throw Error('traversal');
    const data=await fs.readFile(target);res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end('not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const findings=[];
try{
  browser=await chromium.launch({headless:true});
  for(const mode of ['supercar-circuit','coast-run','outland-road','coastal-sprint']){
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[],offsite=[];
    page.on('pageerror',e=>errors.push(e.message));
    const origin='http://127.0.0.1:'+server.address().port;
    page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))offsite.push(r.url())});
    const url=origin+'/STREET-RACER/games/'+mode+'/';
    await page.goto(url,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#race-canvas').count(),1);
    assert.equal(await page.locator('#start').isVisible(),true);
    if(mode==='coastal-sprint'){
      const supported=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl'));
      if(supported){
        assert.equal(await page.locator('#webgl-view').isVisible(),true,'3D view must display');
        const bounds=await page.locator('#webgl-view').evaluate(canvas=>{
          const stage=canvas.closest('.stage'),s=stage.getBoundingClientRect();
          const c=canvas.getBoundingClientRect(),style=getComputedStyle(canvas);
          return {position:style.position,width:c.width,height:c.height,
            dx:c.left-s.left,dy:c.top-s.top,stageWidth:s.width,stageHeight:s.height,
            hasGL:!!canvas.getContext('webgl')&&canvas.width>1};
        });
        assert.equal(bounds.position,'absolute','WebGL must not flow beneath the 2D canvas');
        assert.ok(bounds.hasGL,'actual native WebGL context is required');
        assert.ok(bounds.width>100&&bounds.height>100);
        assert.ok(Math.abs(bounds.dx)<=2&&Math.abs(bounds.dy)<=2,
          'WebGL top-left must be over the 2D race viewport');
        assert.ok(Math.abs(bounds.width-bounds.stageWidth)<=3&&
          Math.abs(bounds.height-bounds.stageHeight)<=3,
          'WebGL viewport must fill the visible race stage');
      }else assert.equal(await page.locator('#race-canvas').isVisible(),true,'Canvas fallback required');
    }
    if(mode==='coast-run'){
      assert.equal(await page.locator('#route').textContent(),'CHOOSE');
      assert.equal(await page.locator('#sector').textContent(),'1 / 4');
    }
    await page.locator('#start').click();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(850);
    const current=Number(await page.locator('#speed').textContent());
    assert.ok(current>0,'game did not accelerate: '+mode);
    await page.locator('#pause').click();
    const stopped=await page.locator('#speed').textContent();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#speed').textContent(),stopped,'pause drift: '+mode);
    assert.equal(await page.locator('#overlay').isVisible(),true);
    await page.locator('#start').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#overlay').isVisible(),false);
    if(mode==='supercar-circuit'){
      // Synthetic persisted navigation deterministically tests the BFCache path,
      // including browsers where headless Chromium elects not to cache pages.
      await page.keyboard.up('ArrowUp');
      await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
      assert.equal(await page.locator('#overlay').isVisible(),true);
      await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await page.locator('#start').click();
      const preRestoreSpeed=Number(await page.locator('#speed').textContent());
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(700);
      assert.ok(Number(await page.locator('#speed').textContent())>preRestoreSpeed,
        'race must advance after BFCache pageshow and Resume');
      await page.keyboard.up('ArrowUp');
    }
    await page.screenshot({path:path.join(out,mode+'.png'),fullPage:true});
    if(mode==='coastal-sprint'&&await page.locator('#webgl-view').isVisible()){
      // The loss handler must uncover a usable, repainted 2D fallback.
      await page.locator('#webgl-view').evaluate(canvas=>
        canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
      assert.equal(await page.locator('#webgl-view').isVisible(),false,
        'lost WebGL context must hide the overlay');
      await page.waitForFunction(()=>{
        const canvas=document.querySelector('#race-canvas'),context=canvas.getContext('2d');
        return context.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3]===255;
      });
    }
    // Exercise a genuine offline deep-link reload after this game registers
    // and the root worker has populated its own deterministic asset cache.
    await page.waitForFunction(()=>navigator.serviceWorker?.controller!==null&&navigator.serviceWorker?.controller!==undefined,{timeout:20000});
    await page.context().setOffline(true);
    await page.reload({waitUntil:'load'});
    assert.equal(await page.locator('#start').isVisible(),true,'offline game entrypoint: '+mode);
    await page.context().setOffline(false);
    if(mode==='supercar-circuit'){
      // Real Back navigation: the run must work whether Chromium restores the
      // same document from BFCache or creates a fresh one.
      await page.locator('#start').click();
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(250);
      await page.keyboard.up('ArrowUp');
      await page.locator('a.logo').click();
      await page.goBack({waitUntil:'load'});
      assert.equal(await page.locator('#start').isVisible(),true);
      await page.locator('#start').click();
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(700);
      assert.ok(Number(await page.locator('#speed').textContent())>0,'Back navigation must restore playable controls');
      await page.keyboard.up('ArrowUp');
    }
    assert.deepEqual(errors,[],'browser errors: '+mode);
    assert.deepEqual(offsite,[],'external network requests: '+mode);
    findings.push({mode,speedKph:current,status:'PASS'});
    await page.close();
  }
  // RACING-003: drive a validated source-pinned pack through actual browser
  // authoring, export, reload/deep-link and both Canvas/WebGL consumers.
  {
    const origin='http://127.0.0.1:'+server.address().port;
    const page=await browser.newPage({viewport:{width:1200,height:900},acceptDownloads:true});
    const errors=[],offsite=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith(origin)&&
      !r.url().startsWith('data:')&&!r.url().startsWith('blob:'))offsite.push(r.url());});
    const editorUrl=origin+'/STREET-RACER/games/track-foundry/';
    await page.goto(editorUrl,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#track-name').inputValue(),'The Long Way Home');
    assert.equal(await page.locator('#course-preview').evaluate(c=>
      c.getContext('2d').getImageData(100,100,1,1).data[3]>0),true);
    await page.locator('#track-name').fill('Morning Junction');
    await page.locator('#environment').selectOption('forest');
    const curve=page.locator('#section-editor [data-section="0"][data-key="curve"]');
    await curve.fill('0.85');await curve.press('Tab');
    const filePromise=page.waitForEvent('download');
    await page.locator('#export-track').click();
    const download=await filePromise,pack=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(pack.name,'Morning Junction');
    assert.equal(pack.environment,'forest');
    assert.equal(pack.sections[0].curve,.85);
    await page.locator('#import-track').setInputFiles({name:'bad.json',
      mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});
    await page.waitForFunction(()=>document.querySelector('#foundry-status').textContent.includes('Import rejected'));
    assert.equal(await page.locator('#track-name').inputValue(),'Morning Junction');
    // Source-authored 4.8km track must flow into playable native WebGL.
    await page.locator('#target-mode').selectOption('sprint');
    await page.locator('#apply-track').click();
    await page.waitForURL('**/games/coastal-sprint/');
    assert.equal(await page.locator('#track').inputValue(),'foundry');
    assert.match(await page.locator('#objective').textContent(),/TRACK FOUNDRY/);
    assert.match(await page.locator('#distance').textContent(),/4800 m/);
    assert.equal(await page.locator('#webgl-view').isVisible(),true);
    await page.locator('#start').click();
    await page.keyboard.down('ArrowUp');await page.waitForTimeout(700);
    assert.ok(Number(await page.locator('#speed').textContent())>0);
    await page.keyboard.up('ArrowUp');
    await page.screenshot({path:path.join(out,'racing-003-authored-sprint.png'),fullPage:true});
    // Offline deep-link after the root-scoped content-addressed worker installs.
    await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:20000});
    await page.context().setOffline(true);
    await page.reload({waitUntil:'load'});
    assert.equal(await page.locator('#track').inputValue(),'foundry');
    await page.context().setOffline(false);
    await page.goto(editorUrl,{waitUntil:'networkidle'});
    await page.locator('#target-mode').selectOption('coast');
    await page.locator('#import-track').setInputFiles({name:'original.json',
      mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
    await page.waitForFunction(()=>document.querySelector('#track-name').value==='Morning Junction');
    await page.locator('#apply-track').click();
    await page.waitForURL('**/games/coast-run/');
    assert.equal(await page.locator('#track').inputValue(),'foundry');
    assert.match(await page.locator('#distance').textContent(),/4800 m/);
    await page.goto(editorUrl,{waitUntil:'networkidle'});
    await page.locator('#target-mode').selectOption('supercar');
    await page.locator('#apply-track').click();
    await page.waitForURL('**/games/supercar-circuit/');
    assert.equal(await page.locator('#track').inputValue(),'foundry');
    assert.match(await page.locator('#objective').textContent(),/8 edited gates/);
    await page.screenshot({path:path.join(out,'racing-003-authored-circuit.png'),fullPage:true});
    await page.goto(editorUrl,{waitUntil:'networkidle'});
    await page.locator('#clear-track').click();
    await page.goto(origin+'/STREET-RACER/games/coast-run/');
    assert.notEqual(await page.locator('#track').inputValue(),'foundry');
    await page.setViewportSize({width:390,height:844});
    await page.goto(editorUrl);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
      'Track Foundry must fit a 390px mobile viewport');
    await page.screenshot({path:path.join(out,'racing-003-foundry-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    assert.deepEqual(offsite,[]);
    findings.push({mode:'track-foundry',status:'PASS',pack:pack.name});
    await page.close();
  }
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(findings,null,2)+'\n');
}
console.log('PASS: four playable monorepo racing games plus the RACING-003 Track Foundry integration at the Pages subpath.');
