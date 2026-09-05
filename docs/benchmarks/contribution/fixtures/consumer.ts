import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { SparkRenderer, type SparkRendererOptions, getSparkRendererCapabilities } from '@sparkjsdev/spark';

// Compile against the packed public declarations, not the source checkout.
type IsAny<T> = 0 extends (1 & T) ? true : false;
const rendererTypeMustResolve: false = null as unknown as IsAny<typeof SparkRenderer>;
export function classicWebGL(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const options: SparkRendererOptions = { renderer };
  const spark: SparkRenderer = new SparkRenderer(options);
  const context: WebGLRenderingContext | WebGL2RenderingContext = spark.renderer.getContext();
  const sync: void = spark.render(scene, camera);
  const submitted: Promise<void> = spark.renderAsync(scene, camera);
  return { context, sync, submitted };
}
export function nativeWebGPU(renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const options: SparkRendererOptions<WebGPURenderer> = { renderer };
  const spark = new SparkRenderer(options);
  const native: WebGPURenderer = spark.renderer;
  const sync: void = spark.render(scene, camera);
  const submitted: Promise<void> = spark.renderAsync(scene, camera);
  // @ts-expect-error A native renderer must not be typed as classic WebGL.
  const incompatible: THREE.WebGLRenderer = spark.renderer;
  return { native, sync, submitted, capabilities: getSparkRendererCapabilities(renderer) };
}
