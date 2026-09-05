import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "/src/index.ts";
import { CaptureController } from "./capture-controller.js";
import { PROTOCOL, cameraPose, pendingWork, submitFrame } from "./protocol.js";
import { loadHouseplant } from "./public-scene.js";
import { fillSyntheticScene } from "./synthetic-scene.js";
const params = new URLSearchParams(location.search);
const button = document.querySelector("#capture");
const phaseText = document.querySelector("#phase");
const details = document.querySelector("#details");
const backend = params.get("backend") ?? "webgl";
const strategy = params.get("sort") ?? "gpu-sort";
const width = Number(params.get("width") ?? 1920);
const height = Number(params.get("height") ?? 1080);
const budget = params.get("budget") ?? "2500000";
if (
  !["webgl", "webgpu"].includes(backend) ||
  !["gpu-sort", "webgpu-readback"].includes(strategy) ||
  !["auto", "1500000", "2500000"].includes(budget)
)
  throw new Error("Invalid benchmark configuration");
const identity = await (await fetch("./identity.json")).json();
let lastHud = 0;
let lastCapacityCheck = 0;
let renderer;
let asset;
let mesh;
// biome-ignore lint/style/useConst: early loading errors can read the uninitialized controller.
let capture;
let state = "loading";
let busy = false;
let stableSince = null;
let started = 0;
let routeStarted = 0;
let restSettleMs = null;
let report = null;
let warmupDone = false;
let fixedPoseMs = null;
const failures = [];
function fail(reason) {
  if (!failures.includes(reason)) failures.push(reason);
  capture?.metrics.invalidate(reason);
  phaseText.textContent = reason;
}
window.addEventListener("error", (e) => fail(e.message));
window.addEventListener("unhandledrejection", (e) => fail(String(e.reason)));
if (backend === "webgpu") {
  const { WebGPURenderer } = await import("three/webgpu");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Native adapter unavailable");
  const maxBufferSize = Math.min(
    adapter.limits.maxBufferSize,
    1024 * 1024 * 1024,
  );
  renderer = new WebGPURenderer({
    antialias: false,
    requiredLimits: {
      maxBufferSize,
      maxStorageBufferBindingSize: Math.min(
        adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize,
      ),
    },
  });
  await renderer.init();
} else renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(width, height, false);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 1000);
const spark = new SparkRenderer({
  renderer,
  enableLod: params.get("lod") !== "off",
  behindFoveate: 1,
  coneFoveate: 1,
  coneFov0: 90,
  coneFov: 120,
  lodSplatScale: 1,
  lodRenderScale: 1,
});
if ("opacityQuadRadius" in spark) spark.opacityQuadRadius = false;
if ("lodSortStrategy" in spark) spark.lodSortStrategy = "gpu-readback";
if ("webgpuLodSortStrategy" in spark) spark.webgpuLodSortStrategy = strategy;
spark.debugCaptureEnabled = false;
spark.debugCaptureLimit = 100000;
spark.lodSplatCount = budget === "auto" ? undefined : Number(budget);
scene.add(spark);
const assetId = params.get("asset") ?? "synthetic";
if (!["synthetic", "houseplant"].includes(assetId))
  throw new Error("Unknown public asset");
const count =
  assetId === "houseplant" ? 113648 : Number(params.get("count") ?? 100000);
if (!Number.isInteger(count) || count < 1 || count > 10000000)
  throw new Error("Synthetic count must be 1..10000000");
if (assetId === "houseplant") {
  ({ mesh, asset } = await loadHouseplant(THREE, SplatMesh));
} else {
  mesh = new SplatMesh({
    constructSplats: (data) => {
      asset = fillSyntheticScene(data, THREE, { count });
      asset.label = "Seeded synthetic";
    },
  });
}
scene.add(mesh);
await mesh.initialized;
if (spark.enableLod) {
  phaseText.textContent = "Generating LoD";
  await mesh.packedSplats.createLodSplats();
  mesh.updateGenerator();
}
mesh.maxSh = 0;
mesh.updateGenerator();
const hash = async (data) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
asset.sourceSha256 = await hash(
  mesh.packedSplats.packedArray.subarray(0, mesh.packedSplats.numSplats * 4),
);
asset.lodSha256 = mesh.packedSplats.lodSplats
  ? await hash(
      mesh.packedSplats.lodSplats.packedArray.subarray(
        0,
        mesh.packedSplats.lodSplats.numSplats * 4,
      ),
    )
  : null;
asset.lodNodeCount = mesh.packedSplats.lodSplats?.numSplats ?? null;
const adapter =
  backend === "webgpu"
    ? { ...renderer.backend.device.adapterInfo }
    : (() => {
        const gl = renderer.getContext();
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return ext
          ? {
              vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
              device: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
            }
          : null;
      })();
function extra(reason) {
  return {
    reason,
    protocol: {
      ...PROTOCOL,
      workload: fixedPoseMs === null ? "motion-route" : "fixed-pose",
      fixedPoseMs,
    },
    identity,
    asset,
    environment: {
      userAgent: navigator.userAgent,
      browserHardware: adapter,
      threeRevision: THREE.REVISION,
      width,
      height,
      pixelRatio: 1,
    },
    quality: {
      requestedBudget: budget,
      effectiveBudget: spark.lodSplatCount ?? spark.defaultSplatTarget(),
      opacityQuadRadius: false,
      sh: 0,
      backend,
      strategy: backend === "webgpu" ? strategy : "gpu-readback",
      lod: spark.enableLod,
    },
    run: {
      state,
      warmupDone,
      restSettleMs,
      failures: [...failures],
      selected: Array.from(spark.lodInstances?.values?.() ?? []).reduce(
        (n, v) => n + v.numSplats,
        0,
      ),
      drawn: spark.activeSplats,
    },
    instrumentation: {
      mode: params.has("verbose")
        ? "verbose-diagnostics"
        : "bounded-benchmark-events",
      internalGuardedEvents:
        "may be unavailable when verbose diagnostics are off",
      freshness:
        "Age of the request whose result was last applied; null until its request/apply events are observed",
    },
    timingCoverage: {
      gpuCompletion: "unavailable",
      gpuPasses:
        "unavailable; timestamp feature is not requested by this configuration",
    },
  };
}
function download(text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `spark-${backend}-lod-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
capture = new CaptureController(spark, extra, download, {
  verbose: params.has("verbose"),
});
function stop(reason) {
  if (!capture.recording) return;
  if (performance.now() - routeStarted < PROTOCOL.movementMs + PROTOCOL.restMs)
    capture.metrics.invalidate("controlled-route-incomplete");
  state = "complete";
  report = capture.stop(reason);
  button.textContent = "Start capture";
  button.disabled = false;
}
button.onclick = () => {
  if (capture.recording) {
    stop("button-stop");
    return;
  }
  if (state === "warmup") return;
  state = "warmup";
  started = performance.now();
  warmupDone = false;
  stableSince = null;
  button.disabled = true;
  phaseText.textContent = "Warmup: at least five seconds";
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    fail("page-hidden");
    if (capture.recording) stop("page-hidden");
  }
});
state = "settling";
started = performance.now();
const render = () =>
  backend === "webgpu"
    ? spark.renderAsync(scene, camera)
    : renderer.render(scene, camera);
async function tick(time) {
  requestAnimationFrame(tick);
  capture.metrics.frame("raf", time);
  if (busy || document.hidden || state === "complete" || state === "failed")
    return;
  busy = true;
  try {
    const elapsed = capture.recording ? performance.now() - routeStarted : 0;
    capture.metrics.request();
    await submitFrame({
      camera,
      pose: cameraPose(fixedPoseMs ?? elapsed, { radius: 7, height: 0 }),
      render,
    });
    capture.metrics.frame("submitted");
    capture.sampleState();
    const now = performance.now();
    const ready = spark.activeSplats > 0 && !pendingWork(spark);
    if (ready) stableSince ??= now;
    else stableSince = null;
    if (state === "settling" || state === "warmup") {
      if (now - started > PROTOCOL.readinessTimeoutMs) {
        state = "failed";
        fail("readiness-timeout");
        return;
      }
      if (stableSince !== null && now - stableSince >= PROTOCOL.stableMs) {
        if (state === "settling") {
          state = "ready";
          button.disabled = false;
          phaseText.textContent = "Ready";
        } else if (now - started >= PROTOCOL.warmupMs) {
          warmupDone = true;
          state = "movement";
          routeStarted = now;
          restSettleMs = null;
          capture.start();
          button.disabled = false;
          button.textContent = "Stop & save capture";
        }
      }
    }
    if (capture.recording) {
      const age = now - routeStarted;
      state = age < PROTOCOL.movementMs ? "movement" : "rest";
      if (state === "rest" && ready && restSettleMs === null)
        restSettleMs = age - PROTOCOL.movementMs;
      phaseText.textContent = `${state} ${(age / 1000).toFixed(1)} s`;
      if (age >= PROTOCOL.movementMs + PROTOCOL.restMs) stop("route-complete");
      if (now - lastCapacityCheck > 1000) {
        lastCapacityCheck = now;
        if (spark.getDebugEvents().length > spark.debugCaptureLimit - 256) {
          capture.metrics.invalidate("event-buffer-capacity");
          stop("buffer-limit");
        }
      }
    }
    if (now - lastHud > 500) {
      lastHud = now;
      details.textContent = `${identity.revision} · ${backend} · ${width} × ${height}\n${asset.label} ${count.toLocaleString()} source splats · requested ${budget} · drawn ${spark.activeSplats.toLocaleString()}`;
    }
  } catch (error) {
    state = "failed";
    fail(String(error));
    if (capture.recording) stop("render-failed");
  } finally {
    busy = false;
  }
}
requestAnimationFrame(tick);
window.benchmark = {
  spark,
  renderer,
  mesh,
  camera,
  extra,
  get state() {
    return state;
  },
  get report() {
    return report;
  },
  setFixedPose: (ms) => {
    if (capture.recording)
      throw new Error("Cannot change workload during capture");
    if (
      ms !== null &&
      (!Number.isFinite(ms) || ms < 0 || ms > PROTOCOL.movementMs)
    )
      throw new Error("Invalid fixed pose time");
    fixedPoseMs = ms;
    stableSince = null;
    started = performance.now();
    state = "settling";
  },
  start: () => button.click(),
  stop: () => stop("api-stop"),
};
