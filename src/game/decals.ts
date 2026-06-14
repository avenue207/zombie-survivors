import { Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders';

/** Blood decal models (ground stains on zombie death) */
const BLOOD_PATHS = [
  `${import.meta.env.BASE_URL}models/zombie/blood_1.gltf`,
  `${import.meta.env.BASE_URL}models/zombie/blood_2.gltf`,
  `${import.meta.env.BASE_URL}models/zombie/blood_3.gltf`,
];
/** Number of pre-cloned copies per blood type; total pool size = type count × this value (ring-buffer overwrite) */
const POOL_PER = 10;
/** Blood-decal target width (meters) */
const TARGET_WIDTH = 2.2;

/**
 * Blood-decal pool: drops a random blood stain on the ground when a zombie dies.
 * Reuse a fixed number of nodes via a ring buffer, avoiding memory allocation on every kill.
 * Each blood decal wrapped in its own holder(glTF root with rotationQuaternion, needs rotation holder).
 */
export class BloodDecals {
  private pool: TransformNode[] = [];
  private cursor = 0;
  private ready = false;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    void this.init();
  }

  private wrap(visual: TransformNode): TransformNode {
    const holder = new TransformNode('blood', this.scene);
    visual.parent = holder;
    holder.setEnabled(false);
    return holder;
  }

  private async init() {
    for (const path of BLOOD_PATHS) {
      const slash = path.lastIndexOf('/');
      try {
        const result = await SceneLoader.ImportMeshAsync('', path.slice(0, slash + 1), path.slice(slash + 1), this.scene);
        const root = result.meshes[0] as TransformNode;
        result.animationGroups.forEach((g) => g.stop());
        /** Normalize by horizontal width (blood is a flat model and can't be height-normalized) */
        const { min, max } = root.getHierarchyBoundingVectors();
        const w = Math.max(max.x - min.x, max.z - min.z) || 1;
        root.scaling.scaleInPlace(TARGET_WIDTH / w);
        result.meshes.forEach((m) => (m.isPickable = false));
        this.pool.push(this.wrap(root));
        for (let i = 1; i < POOL_PER; i++) {
          const clone = root.clone(`blood-${i}`, null);
          if (clone) this.pool.push(this.wrap(clone));
        }
      } catch {
        /* Skip this blood type if loading fails */
      }
    }
    this.ready = this.pool.length > 0;
  }

  spawn(x: number, z: number, y = 0.03) {
    if (!this.ready) return;
    const node = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    node.position.set(x, y, z);
    node.rotation.y = Math.random() * Math.PI * 2;
    node.setEnabled(true);
  }

  reset() {
    for (const n of this.pool) n.setEnabled(false);
    this.cursor = 0;
  }
}
