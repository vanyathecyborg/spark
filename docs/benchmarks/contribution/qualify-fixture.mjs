import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.SPARK_PLAYWRIGHT_MODULE||'playwright');
const results=[];
for(const [variant,port] of [['upstream',5320],['ordering',5321]]){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}/examples/contribution-benchmark/?count=${process.argv[2]??500000}&budget=2500000&width=1920&height=1080`);
  await page.waitForFunction(()=>window.benchmark?.state==='ready'||window.benchmark?.state==='failed',null,{timeout:180000});
  results.push({variant,...await page.evaluate(()=>({state:window.benchmark.state,extra:window.benchmark.extra('fixture-qualification')})),errors});
 }finally{await browser.close();}
}
await writeFile(`production/results/fixture-qualification-${process.argv[2]??500000}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
