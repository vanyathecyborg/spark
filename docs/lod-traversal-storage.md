# Reuse LoD selection storage without changing emission order

`traverse_lod_trees` previously created new per-instance output vectors on each call. The selection core now retains those vectors between calls, alongside the existing reusable frontier/output scratch. The worker releases the pooled storage when its last LoD tree is disposed.

Best-first heap entries, tuple tie priorities, budget termination, per-instance output order and paging request order are unchanged. The existing `outputSize`, `frontierSize`, `leafCount` and `pixelLimit` definitions are unchanged. This change does not add an approximate queue, throttle, or quality policy.

The real core is exercised by native tests against a retained upstream reference at `722255799e26db7cc41c2649638b0aa5214624c6`. Tests include 2,304 seeded combinations, threshold/priority ties, multiple instances of shared trees, transformed views and foveation, extreme budgets, remapped/resident/missing chunks, grow/shrink reuse and release after final tree disposal. An equal-depth alpha fixture requires the exact upstream output order, not just the same selection set.

```sh
cargo test --manifest-path rust/spark-rs/Cargo.toml --lib
npm run build:wasm
node scripts/compare-lod-traversal.mjs --reference /path/to/upstream/rust/spark-rs/pkg --candidate rust/spark-rs/pkg
```

Build the reference WASM from the pinned upstream revision with the same Rust dependency resolution and toolchain. The worker script compares 448 deterministic cases against the actual compiled entry point, including row padding and duplicate checks. `--benchmark --output results.json` also runs five alternating repetitions at 1.5M and 2.5M requested budgets on an original seeded 4,000,001-node fixture. The latter selects 2,463,347 nodes, which is explicitly recorded.

A native benchmark is also available:

```sh
cargo test --release --manifest-path rust/spark-rs/Cargo.toml --lib benchmark_synthetic_traversal -- --ignored --nocapture
```

Allocation-reuse assertions demonstrate unchanged output storage pointers/capacities after warmup. Latency measurements on Apple M4 Max were approximately neutral; this change does not claim a substantial traversal or renderer FPS speedup. Retaining vector capacity trades allocator churn for high-water storage retention while LoD trees remain registered. Returning a scene to zero registered trees frees that storage for the WASM allocator; it does not promise that WebAssembly returns linear-memory pages to the operating system.

Early terminal emission or ascending bitset output must not be substituted without preserving the reference sequence. Equal-depth sorting retains input order, so changing that order can change alpha blending even when selected IDs match.
