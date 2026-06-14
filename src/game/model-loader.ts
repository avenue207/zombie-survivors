import { Scene, SceneLoader, TransformNode, AnimationGroup } from '@babylonjs/core';
import '@babylonjs/loaders';

/**
 * Load GLB the model and normalize its size: scale to a target height, align the bottom y=0, disable picking, play idle/walk animation.
 * On failure return null; the caller can fall back to a procedural shape.
 */
export async function loadModel(
  scene: Scene,
  path: string,
  targetHeight: number,
  preferWalk = false,
): Promise<TransformNode | null> {
  try {
    const slash = path.lastIndexOf('/');
    const rootUrl = path.slice(0, slash + 1);
    const file = path.slice(slash + 1);

    const result = await SceneLoader.ImportMeshAsync('', rootUrl, file, scene);
    const root = result.meshes[0];

    result.animationGroups.forEach((g) => g.stop());
    const groups = result.animationGroups;
    const walk = groups.find((g) => /walk|run|move/i.test(g.name));
    const idle = groups.find((g) => /idle/i.test(g.name));
    const anim = preferWalk ? (walk ?? idle ?? groups[0]) : (idle ?? walk ?? groups[0]);
    anim?.play(true);

    /** Normalize scale by world bounding-box height, aligning the bottom to the ground */
    const { min, max } = root.getHierarchyBoundingVectors();
    const height = max.y - min.y || 1;
    const scale = targetHeight / height;
    root.scaling.x *= scale;
    root.scaling.y *= scale;
    root.scaling.z *= scale;
    root.position.y = -min.y * scale;

    result.meshes.forEach((m) => (m.isPickable = false));
    return root;
  } catch (error) {
    console.warn('[loadModel] Load failed, falling back to a procedural shape:', path, error);
    return null;
  }
}

export interface AnimatedModel {
  root: TransformNode;
  idle?: AnimationGroup;
  walk?: AnimationGroup;
}

/**
 * Load the character and return idle/walk animation groups so the caller can switch by movement state (legs move while walking).
 * Also normalizes size and aligns the bottom to the ground; plays by default idle. 
 */
export async function loadCharacter(
  scene: Scene,
  path: string,
  targetHeight: number,
): Promise<AnimatedModel | null> {
  try {
    const slash = path.lastIndexOf('/');
    const result = await SceneLoader.ImportMeshAsync('', path.slice(0, slash + 1), path.slice(slash + 1), scene);
    const root = result.meshes[0];

    const groups = result.animationGroups;
    groups.forEach((g) => g.stop());
    const walk = groups.find((g) => /walk|run|move|sprint/i.test(g.name));
    const idle = groups.find((g) => /idle/i.test(g.name)) ?? groups[0];
    idle?.start(true);

    const { min, max } = root.getHierarchyBoundingVectors();
    const height = max.y - min.y || 1;
    const scale = targetHeight / height;
    root.scaling.x *= scale;
    root.scaling.y *= scale;
    root.scaling.z *= scale;
    root.position.y = -min.y * scale;

    result.meshes.forEach((m) => (m.isPickable = false));
    return { root, idle, walk };
  } catch (error) {
    console.warn('[loadCharacter] Load failed, falling back to a procedural shape:', path, error);
    return null;
  }
}
