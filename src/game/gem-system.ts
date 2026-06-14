import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Quaternion,
  Matrix,
} from '@babylonjs/core';

const CAPACITY = 4000;
const GEM_Y = 0.6;
/** Within this distance, gems are drawn to the player */
const COLLECT_RADIUS = 1.1;
const MAGNET_SPEED = 26;

/** XP-gem system: dropped on enemy death, drawn in when the player nears. Using thin instances drawing. */
export class GemSystem {
  readonly mesh: Mesh;

  private px = new Float32Array(CAPACITY);
  private pz = new Float32Array(CAPACITY);
  private active = new Uint8Array(CAPACITY);
  private matrixBuffer = new Float32Array(CAPACITY * 16);
  private cursor = 0;

  private readonly scaleActive = new Vector3(1, 1, 1);
  private readonly scaleHidden = new Vector3(0, 0, 0);
  private readonly rotQ = Quaternion.Identity();
  private readonly posV = new Vector3();
  private readonly mat = new Matrix();

  constructor(scene: Scene) {
    const base = MeshBuilder.CreatePolyhedron('gem', { type: 1, size: 0.32 }, scene);
    const material = new StandardMaterial('gem-material', scene);
    material.diffuseColor = new Color3(0.4, 1, 0.85);
    material.emissiveColor = new Color3(0.2, 0.85, 0.7);
    material.specularColor = Color3.Black();
    base.material = material;
    this.mesh = base;

    for (let i = 0; i < CAPACITY; i++) this.writeMatrix(i);
    base.thinInstanceSetBuffer('matrix', this.matrixBuffer, 16, false);
    base.thinInstanceCount = CAPACITY;
    base.alwaysSelectAsActiveMesh = true;
  }

  private writeMatrix(i: number) {
    const scale = this.active[i] ? this.scaleActive : this.scaleHidden;
    this.posV.set(this.px[i], GEM_Y, this.pz[i]);
    Matrix.ComposeToRef(scale, this.rotQ, this.posV, this.mat);
    this.mat.copyToArray(this.matrixBuffer, i * 16);
  }

  spawn(x: number, z: number) {
    /** Ring-scan for a free slot (capacity is large enough that it rarely fills) */
    for (let n = 0; n < CAPACITY; n++) {
      const i = (this.cursor + n) % CAPACITY;
      if (!this.active[i]) {
        this.active[i] = 1;
        this.px[i] = x;
        this.pz[i] = z;
        this.cursor = (i + 1) % CAPACITY;
        /** Write the matrix immediately, otherwise distant gems (outside magnet range) stay hidden and invisible */
        this.writeMatrix(i);
        return;
      }
    }
  }

  /** Update each frame; return the number picked up this frame */
  update(dt: number, playerX: number, playerZ: number, magnetRadius: number): number {
    const magnet2 = magnetRadius * magnetRadius;
    const collect2 = COLLECT_RADIUS * COLLECT_RADIUS;
    let collected = 0;

    for (let i = 0; i < CAPACITY; i++) {
      if (!this.active[i]) continue;
      const dx = playerX - this.px[i];
      const dz = playerZ - this.pz[i];
      const d2 = dx * dx + dz * dz;

      if (d2 <= collect2) {
        this.active[i] = 0;
        collected++;
        this.writeMatrix(i);
        continue;
      }

      if (d2 <= magnet2) {
        const d = Math.sqrt(d2) || 1;
        this.px[i] += (dx / d) * MAGNET_SPEED * dt;
        this.pz[i] += (dz / d) * MAGNET_SPEED * dt;
        this.writeMatrix(i);
      }
    }

    this.mesh.thinInstanceBufferUpdated('matrix');
    return collected;
  }

  reset() {
    this.active.fill(0);
    this.cursor = 0;
    for (let i = 0; i < CAPACITY; i++) this.writeMatrix(i);
    this.mesh.thinInstanceBufferUpdated('matrix');
  }
}
