import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
  SceneLoader,
} from '@babylonjs/core';
import '@babylonjs/loaders';

/**
 * Render a set of models off-screen into static thumbnails (dataURL), generated in sequence with a temporary engine then released,
 * doesn't use persistent WebGL context(good for many items, like the enemy/boss bestiary).
 * with model path is key; overlapping paths are rendered only once.
 */
export async function renderModelThumbnails(
  models: string[],
  onThumb: (model: string, dataUrl: string) => void,
  size = 256,
): Promise<void> {
  const unique = [...new Set(models)];
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });

  for (const model of unique) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.09, 0.11, 0.18, 1);
    const cam = new ArcRotateCamera('c', Math.PI / 2, Math.PI / 2.5, 4, new Vector3(0, 1, 0), scene);
    const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 1.05;
    const dir = new DirectionalLight('d', new Vector3(-0.4, -1, -0.3), scene);
    dir.intensity = 0.7;

    try {
      const slash = model.lastIndexOf('/');
      const res = await SceneLoader.ImportMeshAsync('', model.slice(0, slash + 1), model.slice(slash + 1), scene);
      res.animationGroups.forEach((g) => g.stop());
      const root = res.meshes[0];
      const b1 = root.getHierarchyBoundingVectors();
      const dim = Math.max(b1.max.x - b1.min.x, b1.max.y - b1.min.y, b1.max.z - b1.min.z, 0.5);
      root.scaling.scaleInPlace(2 / dim);
      const b = root.getHierarchyBoundingVectors();
      cam.target = new Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      cam.radius = 2.7;
      await scene.whenReadyAsync();
      scene.render();
      scene.render();
      const data = canvas.toDataURL('image/png');
      if (data && data.length > 100) onThumb(model, data);
    } catch {
      /* Skip ones that fail to load */
    }
    scene.dispose();
  }

  engine.dispose();
}
