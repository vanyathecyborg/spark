/** Original seeded fixture; MIT, copyright 2026 Ivan Kalinin. No external assets. */
export function fillSyntheticScene(
  data,
  THREE,
  { count = 100000, seed = 20260906 } = {},
) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Four undulating walls surround an open courtyard. Every point is generated,
    // not a replicated photograph or a claim about natural-scene complexity.
    const face = i % 4;
    const u = random() * 20 - 10;
    const v = random() * 10 - 5;
    const ripple = 0.4 * Math.sin(u * 0.7) * Math.cos(v * 0.9);
    if (face < 2) position.set(u, v, face === 0 ? -10 - ripple : 10 + ripple);
    else position.set(face === 2 ? -10 - ripple : 10 + ripple, v, u);
    scale.setScalar(
      Math.max(0.012, 10 / Math.sqrt(count)) * (0.6 + random() * 0.8),
    );
    color.setRGB(
      0.15 + (0.75 * (u + 10)) / 20,
      0.15 + (0.75 * (v + 5)) / 10,
      0.25 + 0.5 * (face / 3),
    );
    data.pushSplat(position, scale, rotation, 0.8, color);
  }
  return {
    id: "seeded-courtyard-v1",
    kind: "synthetic",
    seed,
    count,
    license: "MIT",
    attribution: "Ivan Kalinin",
    footageAndRedistribution: "permitted by original generator license",
  };
}
