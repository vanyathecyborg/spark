import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,appendFile,readdir} from 'node:fs/promises';
import {loadavg,platform,arch,cpus} from 'node:os';
const {chromium}=await import(process.env.SPARK_PLAYWRIGHT_MODULE||'playwright');
const output=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'results/ordering-primary';
try { if ((await readdir(output)).length) throw new Error('Use a new empty output directory; existing evidence will not be overwritten.'); } catch (error) { if(error.code!=='ENOENT')throw error; }
await mkdir(output,{recursive:true});
const configurations=process.argv.includes('--full')?[[2500000,1920,1080],[1500000,1920,1080],[2500000,2990,1478],[1500000,2990,1478]]:[[2500000,1920,1080]];
const headless=!process.argv.includes('--visible');
const repetitions=Number(process.argv.find(arg=>arg.startsWith('--repetitions='))?.split('=')[1]??5);
const variants=[{name:'upstream',port:5320},{name:'ordering',port:5321}];
let assetIdentity=null;const runs=[];
const manifest={protocol:'spark-orbit-v2',count:3000000,repetitions,cleanup:'GPU finish, Spark/renderer disposal, forced WebGL context loss and 5-second cooldown; one persistent browser process',configurations,variants,headless,hardware:{platform:platform(),arch:arch(),cpu:cpus()[0].model},startedAt:new Date().toISOString(),timing:'rAF and draw-submission intervals; GPU completion unavailable',instrumentation:'bounded benchmark events',otherApplications:'Existing user applications were left unchanged. Only one benchmark browser runs at a time.'};
await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2));
const browser=await chromium.launch({channel:'chrome',headless});
try{
for(const [budget,width,height] of configurations){
 for(let repetition=1;repetition<=repetitions;repetition++){
  const order=repetition%2?variants:[...variants].reverse();
  for(const variant of order){
   const id=`${variant.name}-${budget}-${width}x${height}-r${repetition}`;
   console.log(JSON.stringify({phase:'start',id,time:new Date().toISOString()}));
   let page;let record={id,variant:variant.name,budget,width,height,repetition,loadBefore:loadavg(),browser:browser.version(),valid:false};
   try{
    page=await browser.newPage({viewport:{width:Math.min(width,1600),height:Math.min(height+180,1100)}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${variant.port}/examples/contribution-benchmark/?count=3000000&budget=${budget}&width=${width}&height=${height}`);
    await page.waitForFunction(()=>window.benchmark?.state==='ready'||window.benchmark?.state==='failed',null,{timeout:180000});
    const initial=await page.evaluate(()=>({state:window.benchmark.state,extra:window.benchmark.extra('matrix-start')}));assert.equal(initial.state,'ready',JSON.stringify(initial));
    const asset=initial.extra.asset;const assetKey=JSON.stringify([asset.sourceSha256,asset.lodSha256,asset.lodNodeCount]);assetIdentity??=assetKey;assert.equal(assetKey,assetIdentity,'identical source and LoD asset required');
    assert(initial.extra.run.selected>=budget*.99,'fixture must exercise requested budget');
    const download=page.waitForEvent('download',{timeout:150000});await page.locator('#capture').click();
    const file=await download;const filename=`${id}-${file.suggestedFilename()}`;await file.saveAs(`${output}/${filename}`);
    const capture=JSON.parse(await readFile(`${output}/${filename}`,'utf8'));const metrics=capture.snapshot.extra.captureMetrics;
    assert.deepEqual(metrics.failures,[]);assert.deepEqual(errors,[]);assert(metrics.durationMs>=40000);assert.equal(capture.snapshot.extra.run.warmupDone,true);
    assert.equal(capture.events[0].label,'capture-start');assert.equal(capture.events.at(-1).label,'capture-stop');
    for(const kind of ['raf','submitted'])assert.equal(capture.events.filter(e=>e.label==='capture-frame-samples'&&e.kind===kind).flatMap(e=>e.intervalsMs).length,metrics[kind].count);
    const states=capture.events.filter(e=>e.label==='capture-state-samples');assert.equal(states.flatMap(e=>e.elapsedMs).length,metrics.submittedFrames);
    const selected=states.flatMap(e=>e.selected);assert(Math.max(...selected)>=budget*.99);assert(selected.every(n=>n<=budget));
    record={...record,valid:true,file:filename,metrics,restSettleMs:capture.snapshot.extra.run.restSettleMs,asset,identity:capture.snapshot.extra.identity,environment:capture.snapshot.extra.environment,loadAfter:loadavg(),errors};
   }catch(error){record.failure=String(error);}
   finally{
    if(page){
      await page.evaluate(()=>{const v=window.benchmark;if(v){v.renderer.getContext().finish();v.spark.dispose();v.renderer.dispose();v.renderer.forceContextLoss();}}).catch(()=>{});
      await page.close();
    }
    await new Promise(resolve=>setTimeout(resolve,5000));
   }
   runs.push(record);await appendFile(`${output}/runs.jsonl`,JSON.stringify(record)+'\n');console.log(JSON.stringify({phase:'complete',id,valid:record.valid,p50:record.metrics?.submitted.p50,p95:record.metrics?.submitted.p95,failure:record.failure}));
   if(!record.valid)throw new Error(`Matrix stopped after invalid run ${id}: ${record.failure}`);
  }
 }
}
}finally{await browser.close();}
await writeFile(`${output}/summary.json`,JSON.stringify({manifest,runs},null,2));
