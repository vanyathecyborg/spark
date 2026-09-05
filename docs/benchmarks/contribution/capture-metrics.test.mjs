import assert from 'node:assert/strict';
import { CaptureMetrics } from './capture-metrics.js';
let now=0;const events=[];const m=new CaptureMetrics((label,data)=>events.push({label,...data}),()=>now);
m.start();
for(let i=0;i<301;i++){now=i*10;m.frame('raf');m.request();m.frame('submitted');}
const report=m.stop();
assert.equal(report.raf.count,300);assert.equal(report.submitted.p95,10);
assert.equal(report.renderRequests,301);assert.equal(report.submittedFrames,301);
assert.equal(events.filter(x=>x.kind==='raf').flatMap(x=>x.intervalsMs).length,300);
assert.ok(events.every(e=>e.intervalsMs.length<=120));
m.start();now+=50;m.frame('raf');m.invalidate('hidden');m.stop();
assert.equal(m.snapshot().raf.count,0);assert.deepEqual(m.snapshot().failures,['hidden']);
console.log('Capture frame accounting, bounded raw chunks, and reset checks passed.');
