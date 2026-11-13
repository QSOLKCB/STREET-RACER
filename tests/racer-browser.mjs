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
      assert.equal(await page.locator('#sector').textContent(),'1 / 16');
    }
    await page.locator('#start').click();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(850);
    const current=Number(await page.locator('#speed').textContent());
    assert.ok(current>0,'game did not accelerate: '+mode);
    // Actual keyboard input: steering must move the player laterally in
    // *both* directions, and the visible HUD must agree. A static-car chase
    // camera or an ineffective KeyA/KeyD binding will fail this test.
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(700);
    const left=Number(await page.locator('#steer').textContent());
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1100);
    const right=Number(await page.locator('#steer').textContent());
    await page.keyboard.up('KeyD');
    assert.ok(left<-.25,mode+' did not visibly steer left (A): '+left);
    assert.ok(right>left+.45,mode+' did not steer back right (D): '+right);
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

  // The editor is part of the actual packaged product, not a separate toy.
  const origin='http://127.0.0.1:'+server.address().port;
  const editor=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const editorErrors=[];
  editor.on('pageerror',e=>editorErrors.push(e.message));
  await editor.goto(origin+'/STREET-RACER/games/track-foundry/',{waitUntil:'networkidle'});
  assert.equal(await editor.locator('#track-preview').count(),1);
  await editor.locator('#track-preset').selectOption('silver-ridge');
  await editor.waitForFunction(()=>document.querySelector('#track-name').value==='Silver Ridge');
  await editor.locator('#track-target').selectOption('circuit');
  await editor.locator('#circuit-drive').click();
  await editor.keyboard.down('KeyW');
  await editor.waitForTimeout(950);
  await editor.keyboard.up('KeyW');
  assert.match(await editor.locator('#telemetry').textContent(),/SPEED [1-9][0-9]* KM\/H/);
  await editor.locator('#circuit-pause').click();
  const paused=await editor.locator('#telemetry').textContent();
  assert.match(paused,/SPEED [1-9][0-9]* KM\/H/);
  // Plain pause/resume must keep the current simulation state.
  await editor.locator('#circuit-drive').click();
  await editor.waitForTimeout(100);
  assert.match(await editor.locator('#telemetry').textContent(),
    /SPEED [1-9][0-9]* KM\/H/,'resume without edits must preserve speed');
  await editor.locator('#circuit-pause').click();
  // Editing while paused must invalidate the old circuit, not resume stale
  // gates/road widths behind the freshly drawn geometry.
  await editor.getByRole('spinbutton',{name:'Gate 2 X'}).fill('40');
  assert.equal(await editor.locator('#circuit-drive').textContent(),'DRIVE CIRCUIT');
  assert.match(await editor.locator('#telemetry').textContent(),/EDIT 8 GATES/);
  await editor.locator('#circuit-drive').click();
  await editor.waitForFunction(()=>document.querySelector('#telemetry')?.textContent
    .includes('SPEED 0 KM/H'));
  assert.equal(await editor.getByRole('spinbutton',{name:'Gate 2 X'}).inputValue(),'40');
  assert.match(await editor.locator('#drive-hint').textContent(),/NEXT GATE 2/);
  await editor.locator('#circuit-pause').click();
  await editor.getByRole('spinbutton',{name:'Section 1 WIDTH'}).fill('13.5');
  assert.equal(await editor.locator('#circuit-drive').textContent(),'DRIVE CIRCUIT');
  assert.match(await editor.locator('#telemetry').textContent(),/EDIT 8 GATES/);
  await editor.locator('#track-name').fill('Nightfall Endurance');
  await editor.locator('#track-environment').selectOption('night');
  await editor.locator('#track-target').selectOption('coast');
  assert.match(await editor.locator('#track-message').textContent(),/VALID/);
  const download=editor.waitForEvent('download');
  await editor.locator('#track-export').click();
  const file=await download;assert.match(file.suggestedFilename(),/track-v1\.json/);
  await editor.locator('#track-import').setInputFiles({
    name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"invalid":true}')
  });
  await editor.waitForFunction(()=>document.querySelector('#track-message').textContent.includes('Import rejected'));
  assert.equal(await editor.locator('#track-name').inputValue(),'Nightfall Endurance');
  await editor.screenshot({path:path.join(out,'track-foundry.png'),fullPage:true});
  await editor.locator('#track-apply').click();
  await editor.waitForURL('**/STREET-RACER/games/coast-run/');
  assert.equal(await editor.locator('#track-name-display').textContent(),'Nightfall Endurance');
  await editor.locator('#start').click();
  await editor.keyboard.down('KeyA');await editor.waitForTimeout(700);await editor.keyboard.up('KeyA');
  assert.ok(Number(await editor.locator('#steer').textContent())<-.25,
    'authored 19.2 km course must respond to A steering');
  assert.deepEqual(editorErrors,[],'Track Foundry runtime errors');
  await editor.close();
  findings.push({mode:'track-foundry',status:'PASS',receipt:'editor / authored circuit / JSON / custom road'});
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(findings,null,2)+'\n');
}
console.log('PASS: '+findings.length+' playable monorepo games at the GitHub Pages subpath.');
