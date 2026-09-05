# Spark contribution evidence

This package contains correctness checks, controlled capture tooling and every retained timing run. **The current timing cohorts are not qualified for a speedup claim.** A separate application was using the same GPU, and run-to-run variance was large. Read each cohort's `qualification.json` before using its charts or tables. `STATUS.md` records the remaining gates.

## Setup and identity

Install Node.js and Python 3, then run `npm ci`. The browser runners use an installed Chrome and Playwright 1.62.1. Install Chrome through your normal system setup. A software adapter is not hardware-performance evidence. `SPARK_PLAYWRIGHT_MODULE` and `SPARK_PNG_MODULE` optionally select existing compatible installations.

Build the source checkouts separately: `npm ci --ignore-scripts`, `npm run build:wasm`, `npm run build`. Pin the same Rust dependency resolution/toolchain and Three.js version for a comparison. Current reference main is `722255799e26db7cc41c2649638b0aa5214624c6`; ordering candidate is `82d463a0ffe012134782699bfbb4854ca86c6bd5`; exact-order traversal candidate is `8adc6be`.

For upstream and scoped ordering builds, apply `upstream-observation.patch` to a separate benchmark checkout with `git apply /absolute/path/to/upstream-observation.patch`. This is the same observation patch in both variants. Do not mix it into the contribution PR.

Run `python3 install-harness.py /absolute/path/to/checkout` after any source, WASM, dependency or harness change. It copies the identical harness and public asset and writes revision/source/WASM/dependency/harness hashes. Never change an installed harness while a cohort is running. Historical cohorts retain their original captures and hashes when the harness evolves.

Run Vite in the benchmark checkouts on loopback ports 5320 and 5321. The user's original development server remains on 8080; historical comparison servers are separate. Example: `npx vite --host 127.0.0.1 --port 5320 --strictPort`.

## Manual capture

Open `/examples/contribution-benchmark/`. Use **Start capture → Stop & save**; a completed controlled route saves automatically. Exactly one JSON uses Spark's existing `{snapshot, events}` report and serializer. Additional metadata lives under `snapshot.extra`; frame/state samples use bounded event batches. Failed or truncated captures still download, with explicit failure metadata. Starting again resets the series.

The page waits for a stable initial selection and no pending traversal/sort work, warms up for at least five seconds, then moves for thirty seconds and rests for ten. Readiness has a timeout. Camera advancement awaits native `renderAsync` update/submission. Requested renders, submitted renders and GPU completion are distinct; missing GPU timing remains unavailable.

Examples of query parameters:

- `?count=3000000&budget=2500000&width=1920&height=1080`: original seeded synthetic scaling workload. It produces 4,400,790 LoD nodes and exercises the 2.5M selection budget.
- `?asset=houseplant&width=1920&height=1080`: licensed scanned object, 113,648 original splats. This does **not** exercise a multi-million budget. Attribution and file identity are in `assets/houseplant.json` and `NOTICE`.
- `?backend=webgpu&sort=webgpu-readback`: native reference sorting, on the hardening preview only. `sort=gpu-sort` selects radix. Unsupported features are rejected; this is not full native Spark compatibility.
- `budget=1500000`, `budget=auto`, `width=2990&height=1478`, and `verbose` select the corresponding explicit configuration. Auto is a separate compatibility workload.

`window.benchmark.setFixedPose(ms)` selects the identical route pose at 0–30000 ms without recording. Passing `null` restores the moving workload. Capture metadata distinguishes fixed poses. Fixed-pose image tests still need bounded settling checks after a pose change.

## Run and analyze

```sh
npm test
node validate-capture-browser.mjs results/capture-validation-new
node run-matrix.mjs results/ordering-isolated-new --full
python3 analyze-matrix.py results/ordering-isolated-new
```

`--full` selects both budgets and resolutions, five alternating repetitions per configuration. Each run retains the downloaded JSON, build/asset identity, browser/hardware fields and validity checks. Use a **new output directory** for each experiment. The current runner targets upstream and ordering on 5320/5321; traversal, combined WebGL and both native strategies still need explicit matrix configurations. GPU completion before teardown, disposal/context loss and a five-second cooldown separate runs.

Do not run other GPU workloads or record video during timing runs. Instrumentation overhead remains a required experiment. Frame p50/p95/p99, slow-frame counts, traversal/sort/upload costs, selection/order age, known-sample coverage and rest-settle time are computed per run. Aggregation uses the median of run-level statistics, not one pooled percentile. Keep every valid repetition and investigate repeatable regressions above 5%.

## Correctness and packaging

- `validate-native-browser.mjs URL OUTPUT`: fixture `fixtures/native-composite.html` must be installed as an HTML page in the native checkout. Tests opaque occlusion, linear/final color, transparent alpha, tone mapping, resize, callbacks enabling unsupported transforms, disposal and forceWebGL rejection on a real GPU. These tests do not imply full native coverage.
- `test-package-consumer.mjs CHECKOUT`: packs the built hardening package and checks actual ESM/CommonJS exports and public WebGL/native TypeScript APIs with Three.js 0.180.0 and pinned 0.185.1. The type fixture rejects unresolved `any`; TypeScript uses browser bundler resolution. NodeNext declaration compatibility is not claimed.
- The scoped ordering branch carries its transfer/pool unit tests and `scripts/test-ordering-buffer-browser.mjs`. `results/ordering-validation` includes the four-way current-main/PR420 differential evidence and the preexisting full-image context-restoration defect.
- The traversal branch carries the original reference algorithm, exact-order Rust/WASM differential tests and its standalone synthetic benchmark. The early-terminal/bitset experiment is excluded because emission order changes blending.

Historical private capture summaries are in `historical-analysis.json`. Raw private captures/assets and their footage are excluded. Public comparison videos and final performance plots/posts remain pending qualified runs; `POSTS-DRAFT.md` is a working draft, not a publication.

`plot-run-variance.py` (install `requirements-plots.txt`) generates the diagnostic figure in `results/plots`. It shows every run and explicitly marks the timing as unqualified. The figure is evidence of variance, not a before/after speedup result.
