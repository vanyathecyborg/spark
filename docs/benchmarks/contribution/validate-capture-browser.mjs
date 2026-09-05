import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.SPARK_PLAYWRIGHT_MODULE||'playwright');
const output=process.argv[2]??'results/capture-validation';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5310/examples/contribution-benchmark/?count=10000&lod=off&width=640&height=360');
 await page.waitForFunction(()=>window.benchmark?.state==='ready'||window.benchmark?.state==='failed',null,{timeout:120000});
 const initial=await page.evaluate(()=>({state:window.benchmark.state,extra:window.benchmark.extra('validation')}));assert.equal(initial.state,'ready',JSON.stringify(initial));
 const download=page.waitForEvent('download',{timeout:120000});await page.locator('#capture').click();
 const file=await download;await file.saveAs(`${output}/${file.suggestedFilename()}`);const capture=JSON.parse(await readFile(`${output}/${file.suggestedFilename()}`,'utf8'));
 assert.deepEqual(Object.keys(capture),['snapshot','events']);assert.equal(capture.events[0].label,'capture-start');assert.equal(capture.events.at(-1).label,'capture-stop');
 const m=capture.snapshot.extra.captureMetrics;
 for(const kind of ['raf','submitted']){
  const chunks=capture.events.filter(e=>e.label==='capture-frame-samples'&&e.kind===kind);
  assert(chunks.length>1);assert(chunks.every(e=>Array.isArray(e.intervalsMs)&&e.intervalsMs.length<=120));
  assert.equal(chunks.flatMap(e=>e.intervalsMs).length,m[kind].count);
  assert(m[kind].count>128,'raw capture exceeds serializer array summary threshold');
 }
 assert.deepEqual(m.failures,[]);assert(m.durationMs>=40000);assert.equal(capture.snapshot.extra.run.warmupDone,true);assert.deepEqual(errors,[]);
 const result={passed:true,browser:browser.version(),file:file.suggestedFilename(),metrics:m,errors};await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
