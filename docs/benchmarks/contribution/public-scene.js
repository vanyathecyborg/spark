/** CC BY 4.0 scanned fixture; see assets/houseplant.json for the pinned source. */
export async function loadHouseplant(THREE, SplatMesh) {
  const metadata = await (await fetch("./assets/houseplant.json")).json();
  const bytes = await (await fetch("./assets/houseplant.splat")).arrayBuffer();
  const sha = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (sha !== metadata.sha256 || bytes.byteLength !== metadata.bytes)
    throw new Error("Houseplant asset identity mismatch");
  const mesh = new SplatMesh({
    fileBytes: bytes,
    fileName: "houseplant.splat",
  });
  await mesh.initialized;
  if (mesh.numSplats !== metadata.splats)
    throw new Error("Houseplant decoded population mismatch");
  mesh.rotation.x = Math.PI;
  mesh.scale.setScalar(6);
  return {
    mesh,
    asset: {
      id: "houseplant",
      kind: "scanned-object",
      label: "Houseplant scan",
      count: metadata.splats,
      fileSha256: sha,
      license: metadata.license,
      attribution: metadata.attribution,
      sourceUrl: metadata.sourceUrl,
      metadataUrl: metadata.metadataUrl,
      transform: { rotationX: Math.PI, uniformScale: 6 },
    },
  };
}
