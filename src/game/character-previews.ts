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

export interface PreviewHandle {
  dispose: () => void;
}

/**
 * at a given canvas build a live 3D character onD Preview (playing idle animated, slowly rotating).
 * One lightweight engine per card; call this when the menu unloads dispose release WebGL context. 
 */
export async function setupCharacterPreview(canvas: HTMLCanvasElement, modelPath: string): Promise<PreviewHandle | null> {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.1, 0.13, 0.22, 1);
  /** Initial angle faces the camera (keeps rotating) */
  const cam = new ArcRotateCamera('c', Math.PI / 2, Math.PI / 2.5, 4, new Vector3(0, 1, 0), scene);
  const hemi = new HemisphericLight('h', new Vector3(0.3, 1, 0.5), scene);
  hemi.intensity = 1.05;
  const dir = new DirectionalLight('d', new Vector3(-0.4, -1, -0.3), scene);
  dir.intensity = 0.7;

  try {
    const slash = modelPath.lastIndexOf('/');
    const res = await SceneLoader.ImportMeshAsync('', modelPath.slice(0, slash + 1), modelPath.slice(slash + 1), scene);
    const idle = res.animationGroups.find((g) => /idle/i.test(g.name)) ?? res.animationGroups[0];
    res.animationGroups.forEach((g) => g.stop());
    idle?.play(true);

    const root = res.meshes[0];
    /** Normalize to a uniform max size first, paired with a fixed camera distance → Every character looks the same size */
    const b1 = root.getHierarchyBoundingVectors();
    const size = Math.max(b1.max.x - b1.min.x, b1.max.y - b1.min.y, b1.max.z - b1.min.z, 0.5);
    root.scaling.scaleInPlace(2 / size);
    const b = root.getHierarchyBoundingVectors();
    cam.target = new Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    cam.radius = 2.7;

    scene.onBeforeRenderObservable.add(() => {
      cam.alpha += (engine.getDeltaTime() / 1000) * 0.3; // Slow rotation
    });
    engine.runRenderLoop(() => scene.render());
    return { dispose: () => engine.dispose() };
  } catch {
    engine.dispose();
    return null;
  }
}
