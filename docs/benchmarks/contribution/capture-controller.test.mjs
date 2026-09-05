import assert from 'node:assert/strict';
import { CaptureController } from './capture-controller.js';
function fixture({ capacity = Infinity, dropSamples = false } = {}) {
  let events = [], seq = 0;
  const saved = [];
  const spark = {
    debugCaptureEnabled: false,
    captureDebugEvent(label, data) { if (!this.debugCaptureEnabled) return; events.push({ seq: ++seq, label, ...data }); if (events.length > capacity) events.shift(); },
    clearDebugEvents() { events = []; seq = 0; },
    getDebugEvents() { return events; },
    getDebugReport(extra) { return JSON.stringify({ snapshot: { extra }, events: events.map(e => dropSamples && e.label === 'capture-frame-samples' ? { ...e, intervalsMs: { summarized: true } } : e) }); },
  };
  const capture = new CaptureController(spark, reason => ({ reason }), report => saved.push(JSON.parse(report)));
  capture.start();
  for (let i = 0; i < 241; i++) { capture.metrics.request(); capture.metrics.frame('raf', i * 16); capture.metrics.frame('submitted', i * 16); }
  const result = capture.stop();
  assert.equal(saved.length, 1);
  assert.equal(capture.stop(), null);
  assert.equal(saved.length, 1);
  assert.equal(capture.recording, false);
  assert.equal(spark.debugCaptureEnabled, false);
  return { result, capture, saved };
}
const complete = fixture();
assert.deepEqual(complete.result.snapshot.extra.captureMetrics.failures, []);
assert.equal(complete.result.snapshot.extra.captureMetrics.submitted.count, 240);
assert.equal(complete.result.events.filter(e => e.label === 'capture-frame-samples').length, 4);
const summarized = fixture({ dropSamples: true });
assert(summarized.result.snapshot.extra.captureMetrics.failures.some(f => f.startsWith('serialized-submitted-sample-count')));
const truncated = fixture({ capacity: 4 });
assert(truncated.result.snapshot.extra.captureMetrics.failures.includes('event-buffer-truncated'));
complete.capture.start();complete.capture.stop();assert.equal(complete.saved.length, 2);
console.log('Complete, summarized and truncated captures save exactly once and support restart.');
