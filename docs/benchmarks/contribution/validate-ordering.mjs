import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.SPARK_PLAYWRIGHT_MODULE || 'playwright');
const output=process.argv[2] || 'results/ordering-validation';await mkdir(output,{recursive:true});
const results=[];
// Run sequentially: concurrent hardware workloads would invalidate comparisons.
for(const [name,port] of [['pr420-unmodified',5314],['upstream-main',5313],['upstream-plus-pool',5311],['pr420-plus-pool',5312]]){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const warnings=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning'&&!warnings.includes(m.text()))warnings.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}/examples/ordering-validation/`);
  await page.waitForFunction(()=>window.__sparkValidation,null,{timeout:120000});
  const initial=await page.evaluate(()=>window.__sparkValidation);assert.equal(initial.ready,true,JSON.stringify(initial));
  const read=()=>page.evaluate(()=>{const {renderer}=window.validation;const gl=renderer.getContext();const errorBefore=gl.getError();const pixels=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let hash=2166136261;for(const byte of pixels)hash=Math.imul(hash^byte,16777619);return {hash:hash>>>0,errorBefore,error:gl.getError(),...window.validation.stats()};});
  const orderingBefore=await page.evaluate(()=>window.validation.readOrdering());
  const before=await read();await page.locator('canvas').screenshot({path:`${output}/${name}-before.png`});
  await page.evaluate(()=>window.validation.restore());
  const orderingAfter=await page.evaluate(()=>window.validation.readOrdering());
  const after=await read();await page.locator('canvas').screenshot({path:`${output}/${name}-restored.png`});
  await writeFile(`${output}/${name}-diagnostics.json`,JSON.stringify({initial,before,after,warnings,errors,internal:await page.evaluate(()=>window.validation.errors)},null,2));
  assert.equal(before.error,0);
  // Full accumulator restoration is measured here, not assumed to work.
  const restorationPassed=after.error===0&&after.hash===before.hash;
  assert.equal(after.cpuOrderingAttached,true);if(name.endsWith('plus-pool')){assert.equal(after.allocations,name==='pr420-plus-pool'?3:2,'bounded buffers suffice after warmup');assert(after.reuses>=10,'repeated sorts must reuse released buffers');}
  if(name.endsWith('plus-pool')){assert.deepEqual(orderingBefore.gpu,orderingBefore.cpu);assert.deepEqual(orderingAfter.gpu,orderingBefore.gpu);}
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.validation.errors),[]);
  const adapter=await page.evaluate(()=>{const gl=window.validation.renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;});
  results.push({name,before,after,orderingCpuMatchesGpu:JSON.stringify(orderingBefore.gpu)===JSON.stringify(orderingBefore.cpu),orderingRestored:JSON.stringify(orderingAfter.gpu)===JSON.stringify(orderingBefore.gpu),restorationPassed,warnings,adapter,browser:browser.version(),errors});
 }finally{await browser.close();}
}
await writeFile(`${output}/result.json`,JSON.stringify({recordedAt:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
