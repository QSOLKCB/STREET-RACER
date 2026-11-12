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
  for(const mode of ['supercar-circuit','coast-run','outland-road']){
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[],offsite=[];
    page.on('pageerror',e=>errors.push(e.message));
    const origin='http://127.0.0.1:'+server.address().port;
    page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))offsite.push(r.url())});
    const url=origin+'/STREET-RACER/games/'+mode+'/';
    await page.goto(url,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#race-canvas').count(),1);
    assert.equal(await page.locator('#start').isVisible(),true);
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
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(findings,null,2)+'\n');
}
console.log('PASS: '+findings.length+' playable monorepo games at the GitHub Pages subpath.');
