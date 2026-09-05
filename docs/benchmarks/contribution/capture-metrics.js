/** Additive metrics for Spark's existing {snapshot,events} capture format. */
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) =>
    sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
      : null;
  return {
    count: sorted.length,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: sorted.length ? sorted.at(-1) : null,
    mean: sorted.length
      ? sorted.reduce((a, b) => a + b, 0) / sorted.length
      : null,
    over50: sorted.filter((x) => x > 50).length,
    over100: sorted.filter((x) => x > 100).length,
  };
}

export class CaptureMetrics {
  constructor(emit, clock = () => performance.now()) {
    this.emit = emit;
    this.clock = clock;
    this.running = false;
  }
  start() {
    this.started = this.clock();
    this.ended = null;
    this.running = true;
    this.requested = 0;
    this.submittedCount = 0;
    this.failures = [];
    this.series = Object.fromEntries(
      ["raf", "submitted"].map((name) => [
        name,
        { last: null, values: [], pending: [], times: [] },
      ]),
    );
  }
  request() {
    if (this.running) this.requested++;
  }
  frame(kind, at = this.clock()) {
    if (!this.running) return;
    const series = this.series[kind];
    if (kind === "submitted") this.submittedCount++;
    if (series.last !== null) {
      const dt = at - series.last;
      if (!Number.isFinite(dt) || dt < 0)
        this.invalidate("non-monotonic-clock");
      else {
        series.values.push(dt);
        series.pending.push(dt);
        series.times.push(at - this.started);
        if (series.pending.length === 120) this.flush(kind);
      }
    }
    series.last = at;
  }
  flush(kind) {
    const s = this.series[kind];
    if (s.pending.length) {
      // Plain arrays <=128 entries survive the existing serializer intact.
      this.emit("capture-frame-samples", {
        kind,
        intervalsMs: s.pending,
        elapsedMs: s.times,
      });
      s.pending = [];
      s.times = [];
    }
  }
  invalidate(reason) {
    if (this.running && !this.failures.includes(reason))
      this.failures.push(reason);
  }
  stop() {
    if (this.running) {
      this.ended = this.clock();
      this.flush("raf");
      this.flush("submitted");
      this.running = false;
    }
    return this.snapshot();
  }
  snapshot() {
    return {
      version: 1,
      durationMs: (this.ended ?? this.clock()) - this.started,
      renderRequests: this.requested,
      submittedFrames: this.submittedCount,
      raf: summarize(this.series?.raf.values ?? []),
      submitted: summarize(this.series?.submitted.values ?? []),
      gpuCompletion: "unavailable",
      failures: [...(this.failures ?? [])],
      rawSamples:
        "capture-frame-samples events; intervals exclude the first observation",
    };
  }
}
