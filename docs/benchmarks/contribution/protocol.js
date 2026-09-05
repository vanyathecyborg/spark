export const PROTOCOL = Object.freeze({
  id: "spark-orbit-v2",
  warmupMs: 5000,
  movementMs: 30000,
  restMs: 10000,
  readinessTimeoutMs: 60000,
  stableMs: 500,
});
export function pendingWork(spark) {
  return !!(
    spark.sorting ||
    spark.sortDirty ||
    spark.lodDirty ||
    spark.lodWorker?.queue != null ||
    Object.keys(spark.lodWorker?.messages ?? {}).length ||
    spark.webgpuQueuedUpdate ||
    spark.webgpuQueuedRender ||
    spark.webgpuBackend?.pendingRenderSlot
  );
}
/** Pure time-based path; slower renderers visit the same route at the same speed. */
export function cameraPose(
  elapsedMs,
  { radius = 20, height = 3, target = [0, 0, 0] } = {},
) {
  const phase = Math.min(1, Math.max(0, elapsedMs / PROTOCOL.movementMs));
  const angle = Math.PI / 2 + phase * Math.PI * 2;
  return {
    position: [
      target[0] + Math.cos(angle) * radius,
      target[1] + height,
      target[2] + Math.sin(angle) * radius,
    ],
    target: [...target],
  };
}
export async function submitFrame({ camera, pose, render }) {
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  await render();
}
