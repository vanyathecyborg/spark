# Social drafts — not ready to publish

These drafts must be finalized after the performance gate and PR review readiness are established. No maintainer approval or merge is implied. The historical private scene is not available for public footage.

## X draft

Working on Spark's LoD sorting: repeated sorts can reuse ordering buffers once the previous texture releases them. The patch preserves ordering and passes a real GPU texture-restoration check on Apple M4 Max.

[Contribution branch](https://github.com/vanyathecyborg/spark/tree/codex/webgl-ordering-buffers)

Follow-up, once the benchmark is qualified: attach the public normal-speed comparison video and link the complete run-level results. Use the demonstrated allocation reduction; add an FPS claim only if controlled repetitions support it. State the exact source/drawn counts, resolution, hardware and PR status.

## LinkedIn draft

I'm preparing a contribution to Spark, World Labs' open-source Gaussian splat renderer, focused on ordering-buffer ownership and allocation reuse.

A sorting worker transfers its output back to the renderer. That storage cannot be transferred again while a texture still owns it. The current patch keeps committed CPU ordering data current, then reuses the storage when its texture releases it. Real browser readback verifies that the ordering texture matches CPU data and restores the latest order after context loss.

The benchmark fixture is an original seeded synthetic scene with 3 million source splats. Upstream and the candidate generate identical LoD data and draw the same 2.5 million splats. Results are being checked at the run level on Apple M4 Max; the first repetitions showed substantial timing variability, so a renderer speedup is not established yet.

Credit to the Spark team for the renderer and to the existing texture-upload work in PR #420, whose lifecycle changes are separate from this allocation patch. The broader native GPU-sort experiments build on PlayCanvas' radix implementation and kishimisu's WebGPU-Radix-Sort work; their attribution and licenses remain in the renderer.

Before publication: replace this status paragraph with the completed benchmark result, exact PR URL/status, reproducible benchmark link and separately recorded normal-speed footage. Keep any remaining platform limitations explicit.
