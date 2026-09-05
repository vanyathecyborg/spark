import { CaptureMetrics } from "./capture-metrics.js";

/** Uses Spark's existing serializer, sequence, clocks and root {snapshot,events}. */
export class CaptureController {
  constructor(spark, extra, save, { verbose = false } = {}) {
    this.spark = spark;
    this.extra = extra;
    this.save = save;
    this.metrics = new CaptureMetrics((label, data) =>
      spark.captureDebugEvent(label, data),
    );
    this.recording = false;
    this.saved = false;
    this.verbose = verbose;
    this.requests = new Map();
    this.applied = null;
    this.orderingRequestAt = null;
    this.stateSamples = [];
    const original = spark.captureDebugEvent.bind(spark);
    const retained = new Set([
      "lod-traverse-start",
      "lod-traverse-complete",
      "lod-apply-decision",
      "sort-complete",
    ]);
    spark.captureDebugEvent = (label, data) => {
      if (!this.recording) return original(label, data);
      if (!verbose && !label.startsWith("capture-") && !retained.has(label))
        return null;
      const now = this.metrics.clock();
      if (label === "lod-traverse-start" && Number.isFinite(data.serial))
        this.requests.set(data.serial, now);
      if (
        label === "lod-apply-decision" &&
        data.decision === "apply" &&
        this.requests.has(data.serial)
      ) {
        this.applied = {
          generation: data.serial,
          requestedAt: this.requests.get(data.serial),
          appliedAt: now,
        };
        for (const serial of this.requests.keys())
          if (serial <= data.serial) this.requests.delete(serial);
      }
      if (label === "sort-complete" && Number.isFinite(data.timingsMs?.total))
        this.orderingRequestAt = now - data.timingsMs.total;
      const enabled = spark.debugCaptureEnabled;
      spark.debugCaptureEnabled = true;
      try {
        return original(label, data);
      } finally {
        spark.debugCaptureEnabled = enabled;
      }
    };
  }
  start() {
    if (this.recording) return;
    this.saved = false;
    this.requests.clear();
    this.applied = null;
    this.orderingRequestAt = null;
    this.stateSamples = [];
    this.spark.clearDebugEvents();
    this.spark.debugCaptureEnabled = this.verbose;
    this.recording = true;
    this.metrics.start();
    this.spark.captureDebugEvent("capture-start", this.extra("start"));
  }
  sampleState() {
    if (!this.recording) return;
    const now = this.metrics.clock();
    this.stateSamples.push({
      elapsedMs: now - this.metrics.started,
      drawn: this.spark.activeSplats,
      selected: Array.from(this.spark.lodInstances?.values?.() ?? []).reduce(
        (n, v) => n + v.numSplats,
        0,
      ),
      appliedGeneration: this.applied?.generation ?? null,
      selectionRequestAgeMs: this.applied
        ? now - this.applied.requestedAt
        : null,
      orderingRequestAgeMs:
        this.orderingRequestAt !== null ? now - this.orderingRequestAt : null,
    });
    if (this.stateSamples.length === 120) this.flushState();
  }
  flushState() {
    if (!this.stateSamples.length) return;
    const data = Object.fromEntries(
      Object.keys(this.stateSamples[0]).map((key) => [
        key,
        this.stateSamples.map((sample) => sample[key]),
      ]),
    );
    this.spark.captureDebugEvent("capture-state-samples", data);
    this.stateSamples = [];
  }
  stop(reason = "button-stop") {
    if (!this.recording || this.saved) return null;
    this.flushState();
    const metrics = this.metrics.stop();
    this.spark.captureDebugEvent("capture-stop", { reason });
    const extra = {
      ...this.extra(reason),
      captureMetrics: metrics,
    };
    let report = this.spark.getDebugReport(extra);
    let parsed = JSON.parse(report);
    const failures = [];
    if (
      parsed.events[0]?.label !== "capture-start" ||
      parsed.events[0]?.seq !== 1
    )
      failures.push("event-buffer-truncated");
    // Validate the real serializer output, not the objects before serialization.
    for (const kind of ["raf", "submitted"]) {
      const raw = parsed.events
        .filter((e) => e.label === "capture-frame-samples" && e.kind === kind)
        .flatMap((e) => (Array.isArray(e.intervalsMs) ? e.intervalsMs : []));
      if (raw.length !== metrics[kind].count)
        failures.push(
          `serialized-${kind}-sample-count:${raw.length}/${metrics[kind].count}`,
        );
    }
    if (failures.length) {
      // A failed capture is still evidence: save one JSON with explicit failure
      // metadata rather than throwing and losing the user's downloaded trace.
      metrics.failures = [...new Set([...metrics.failures, ...failures])];
      report = this.spark.getDebugReport(extra);
      parsed = JSON.parse(report);
    }
    this.spark.debugCaptureEnabled = false;
    this.recording = false;
    this.saved = true;
    this.save(report);
    return parsed;
  }
}
