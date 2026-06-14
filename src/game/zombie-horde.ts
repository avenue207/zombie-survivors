import { Scene, TransformNode, SceneLoader, AnimationGroup, AbstractMesh, Color3 } from '@babylonjs/core';
import '@babylonjs/loaders';
import { CONFIG } from './config';
import { SpatialGrid } from './spatial-grid';
import { Obstacle, resolveObstacles } from './obstacles';
import { BossHazards } from './boss-hazards';

interface ZombieType {
  path: string;
  hp: number;
  speed: number;
  /** Scale relative to a reference height */
  scale: number;
  /** Ranged shooter: keep distance and fire projectiles at the player */
  ranged?: boolean;
}

/** Ranged enemy: fire interval, fire distance, keep-distance, projectile damage */
const FIRE_INTERVAL = 2.2;
const FIRE_RANGE = 26;
const KEEP_DIST = 13;

const ZOMBIE_TYPES: ZombieType[] = [
  { path: '/models/zombie/zombie_basic.gltf', hp: 3, speed: 5.5, scale: 1 },
  { path: '/models/zombie/zombie_ribcage.gltf', hp: 2, speed: 8, scale: 0.95 }, // Fast
  { path: '/models/zombie/zombie_chubby.gltf', hp: 12, speed: 3.2, scale: 1.35 }, // Tank
  { path: '/models/zombie/zombie_arm.gltf', hp: 4, speed: 5, scale: 1 },
  { path: '/models/zombie/zombie_skeleton.gltf', hp: 4, speed: 6, scale: 1 }, // Undead skeleton
  { path: '/models/zombie/zombie_skeleton_headless.gltf', hp: 6, speed: 5, scale: 1, ranged: true }, // Headless skeleton (ranged)
];

/** Enemy bestiary info (for the menu) */
export const ZOMBIE_INFO = [
  { name: 'Basic Zombie', role: 'Minion', desc: 'The most common basic zombie with average HP — overwhelms you by sheer numbers.', model: '/models/zombie/zombie_basic.gltf' },
  { name: 'Ribcage', role: 'Fast', desc: 'Very fast, low HP, closes in quickly — deal with it first.', model: '/models/zombie/zombie_ribcage.gltf' },
  { name: 'Chubby Zombie', role: 'Tank', desc: 'A slow, high-HP tank that takes more firepower to bring down.', model: '/models/zombie/zombie_chubby.gltf' },
  { name: 'One-Armed Zombie', role: 'Normal', desc: 'A run-of-the-mill melee zombie with average speed and HP.', model: '/models/zombie/zombie_arm.gltf' },
  { name: 'Skeleton soldier', role: 'Undead', desc: 'Pirate skeletons: fairly fast, average HP, appearing in groups.', model: '/models/zombie/zombie_skeleton.gltf' },
  { name: 'Headless skeleton', role: 'Ranged', desc: 'An undead shooter that fires at you from range and backs off when you close in.', model: '/models/zombie/zombie_skeleton_headless.gltf' },
];

const BASE_HEIGHT = 2.4;
/** Pre-build each type instantiate counts (summing to the horde cap; 6 types × 9 = 54 ≥ director.maxCount) */
const PER_TYPE = 9;
/** Global enemy-HP multiplier */
const HP_SCALE = 0.75;
/** Hit white-flash duration (seconds) */
const FLASH_DUR = 0.16;
const WHITE = new Color3(1, 1, 1);

interface Entry {
  root: TransformNode;
  anim?: AnimationGroup;
  baseSpeed: number;
  /** The actually-rendered mesh, used for the hit white flash overlay */
  meshes: AbstractMesh[];
}

/**
 * Zombie horde: pre- instantiate A pool of skeletally animated zombies; the director uses setCount before enabling N .
 * UI aligns with the original EnemySystem(count/getX/getZ/isAlive/damage/update/insertAll/reset).
 */
export class ZombieHorde {
  count = 0;
  hpMul = 1;
  speedMul = 1;
  tier = 0;

  private scene: Scene;
  private ready = false;
  private pool: Entry[] = [];
  private posX: Float32Array;
  private posZ: Float32Array;
  private hp: Float32Array;
  /** Hit-feedback timer (>0 scale-bounce on trigger) */
  private hitFlash: Float32Array;
  /** Remaining freeze time (>0 frozen, immobile) */
  private freezeTimer: Float32Array;
  /** Ranged-fire timer */
  private fireTimer: Float32Array;
  private capacity = ZOMBIE_TYPES.length * PER_TYPE;
  /** Ranged-enemy projectile damage (scaled by difficulty) */
  rangedDamage = 7;
  private hazards?: BossHazards;
  /** Terrain-height query (for ground-snapping) */
  private heightAt: (x: number, z: number) => number = () => 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.posX = new Float32Array(this.capacity);
    this.posZ = new Float32Array(this.capacity);
    this.hp = new Float32Array(this.capacity);
    this.hitFlash = new Float32Array(this.capacity);
    this.freezeTimer = new Float32Array(this.capacity);
    this.fireTimer = new Float32Array(this.capacity);
    void this.init();
  }

  private async init() {
    const containers = await Promise.all(
      ZOMBIE_TYPES.map((t) => {
        const slash = t.path.lastIndexOf('/');
        return SceneLoader.LoadAssetContainerAsync(t.path.slice(0, slash + 1), t.path.slice(slash + 1), this.scene);
      }),
    );

    /** interleave types; before enabling N there's natural variety when there are many */
    for (let k = 0; k < PER_TYPE; k++) {
      for (let ti = 0; ti < ZOMBIE_TYPES.length; ti++) {
        const t = ZOMBIE_TYPES[ti];
        const inst = containers[ti].instantiateModelsToScene(undefined, false);
        const modelRoot = inst.rootNodes[0] as TransformNode;
        this.normalize(modelRoot, BASE_HEIGHT * t.scale);

        /** with its own holder wrap glTF root (which has rotationQuaternion, just set rotation.y disabled)
         *  then rotate holder to turn */
        const holder = new TransformNode('zombie', this.scene);
        modelRoot.parent = holder;
        holder.setEnabled(false);

        inst.animationGroups.forEach((a) => a.stop());
        const anim =
          inst.animationGroups.find((a) => /walk|run|move/i.test(a.name)) ??
          inst.animationGroups.find((a) => /idle/i.test(a.name)) ??
          inst.animationGroups[0];

        /** Get the actual mesh, white flash off by default overlay */
        const meshes = modelRoot.getChildMeshes(false);
        for (const m of meshes) {
          m.overlayColor = WHITE;
          m.overlayAlpha = 0;
          m.renderOverlay = false;
        }

        this.pool.push({ root: holder, anim, baseSpeed: t.speed, meshes });
      }
    }

    this.ready = true;
  }

  setHeightFn(fn: (x: number, z: number) => number) {
    this.heightAt = fn;
  }

  /** Hazard system providing projectiles for ranged enemies */
  setHazards(hazards: BossHazards) {
    this.hazards = hazards;
  }

  private normalize(root: TransformNode, targetHeight: number) {
    const { min, max } = root.getHierarchyBoundingVectors();
    const h = max.y - min.y || 1;
    const scale = targetHeight / h;
    root.scaling.x *= scale;
    root.scaling.y *= scale;
    root.scaling.z *= scale;
    root.position.y = -min.y * scale;
  }

  private spawn(i: number, playerX: number, playerZ: number) {
    const entry = this.pool[i];
    const angle = Math.random() * Math.PI * 2;
    const dist =
      CONFIG.enemy.spawnRingMin + Math.random() * (CONFIG.enemy.spawnRingMax - CONFIG.enemy.spawnRingMin);
    this.posX[i] = playerX + Math.cos(angle) * dist;
    this.posZ[i] = playerZ + Math.sin(angle) * dist;
    /** by index the matching type's HP (pool interleaved) */
    this.hp[i] = ZOMBIE_TYPES[i % ZOMBIE_TYPES.length].hp * HP_SCALE * this.hpMul;
    this.hitFlash[i] = 0;
    this.freezeTimer[i] = 0;
    this.fireTimer[i] = Math.random() * FIRE_INTERVAL;
    for (const m of entry.meshes) m.renderOverlay = false;
    entry.root.position.x = this.posX[i];
    entry.root.position.z = this.posZ[i];
    entry.root.position.y = this.heightAt(this.posX[i], this.posZ[i]);
    entry.root.setEnabled(true);
    entry.anim?.start(true, 0.8 + Math.random() * 0.4);
  }

  setCount(next: number, playerX: number, playerZ: number) {
    if (!this.ready) return;
    const clamped = Math.max(0, Math.min(this.capacity, Math.floor(next)));
    for (let i = this.count; i < clamped; i++) this.spawn(i, playerX, playerZ);
    for (let i = clamped; i < this.count; i++) {
      this.pool[i].root.setEnabled(false);
      this.pool[i].anim?.stop();
    }
    this.count = clamped;
  }

  reset(_playerX: number, _playerZ: number) {
    this.hpMul = 1;
    this.speedMul = 1;
    this.tier = 0;
    if (!this.ready) {
      this.count = 0;
      return;
    }
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].root.setEnabled(false);
      this.pool[i].anim?.stop();
    }
    this.count = 0;
  }

  insertAll(grid: SpatialGrid) {
    for (let i = 0; i < this.count; i++) grid.insert(i, this.posX[i], this.posZ[i]);
  }

  getX(i: number) {
    return this.posX[i];
  }
  getZ(i: number) {
    return this.posZ[i];
  }
  isAlive(i: number) {
    return i < this.count;
  }

  /** Freeze a given zombie for a while */
  freeze(i: number, dur: number) {
    if (i < this.count) this.freezeTimer[i] = Math.max(this.freezeTimer[i], dur);
  }

  damage(i: number, amount: number, playerX: number, playerZ: number): boolean {
    if (i >= this.count) return false;
    this.hp[i] -= amount;
    /** Trigger the hit white-flash on taking damage */
    this.hitFlash[i] = FLASH_DUR;
    if (this.hp[i] <= 0) {
      this.spawn(i, playerX, playerZ);
      return true;
    }
    return false;
  }

  update(
    dt: number,
    playerX: number,
    playerZ: number,
    grid: SpatialGrid,
    obstacles: Obstacle[],
    slowRadius = 0,
    slowFactor = 1,
  ) {
    if (!this.ready) return;
    const { separationRadius, separationForce, radius } = CONFIG.enemy;
    const sepR2 = separationRadius * separationRadius;
    const half = CONFIG.arenaHalf;
    const scratch = { x: 0, z: 0 };
    const slowR2 = slowRadius * slowRadius;

    for (let i = 0; i < this.count; i++) {
      const x = this.posX[i];
      const z = this.posZ[i];

      let dirX = playerX - x;
      let dirZ = playerZ - z;
      const dlen = Math.hypot(dirX, dirZ) || 1;
      dirX /= dlen;
      dirZ /= dlen;

      let sepX = 0;
      let sepZ = 0;
      grid.query(x, z, (j) => {
        if (j === i) return;
        const ox = x - this.posX[j];
        const oz = z - this.posZ[j];
        const d2 = ox * ox + oz * oz;
        if (d2 > 0 && d2 < sepR2) {
          const d = Math.sqrt(d2);
          const w = (separationRadius - d) / separationRadius;
          sepX += (ox / d) * w;
          sepZ += (oz / d) * w;
        }
      });

      let spd = this.pool[i].baseSpeed * this.speedMul;
      /** Freeze: fully immobilized; slow aura: reduced speed within range */
      if (this.freezeTimer[i] > 0) {
        this.freezeTimer[i] -= dt;
        spd = 0;
      } else if (slowR2 > 0) {
        const ddx = playerX - x;
        const ddz = playerZ - z;
        if (ddx * ddx + ddz * ddz < slowR2) spd *= slowFactor;
      }

      /** Ranged shooter: keep distance and fire (dlen is the distance to the player) */
      if (ZOMBIE_TYPES[i % ZOMBIE_TYPES.length].ranged && this.freezeTimer[i] <= 0) {
        if (dlen < KEEP_DIST) {
          dirX = -dirX; // Back off if too close
          dirZ = -dirZ;
        } else if (dlen <= FIRE_RANGE) {
          spd = 0; // Stand and shoot within range
        }
        this.fireTimer[i] -= dt;
        if (dlen <= FIRE_RANGE && this.fireTimer[i] <= 0 && this.hazards) {
          this.hazards.enemyShot(x, z, playerX, playerZ, this.rangedDamage);
          this.fireTimer[i] = FIRE_INTERVAL;
        }
      }

      let nx = x + (dirX * spd + sepX * separationForce) * dt;
      let nz = z + (dirZ * spd + sepZ * separationForce) * dt;
      if (nx > half) nx = half;
      else if (nx < -half) nx = -half;
      if (nz > half) nz = half;
      else if (nz < -half) nz = -half;

      /** Obstacle blocking */
      if (obstacles.length > 0) {
        resolveObstacles(obstacles, nx, nz, radius, scratch);
        nx = scratch.x;
        nz = scratch.z;
      }

      this.posX[i] = nx;
      this.posZ[i] = nz;

      const root = this.pool[i].root;
      root.position.x = nx;
      root.position.z = nz;
      root.position.y = this.heightAt(nx, nz);
      /** Face the player (model front is +Z) */
      root.rotation.y = Math.atan2(dirX, dirZ);

      /** Hit white-flash feedback: the whole zombie flashes white (per-mesh overlay, without affecting other zombies) */
      const meshes = this.pool[i].meshes;
      if (this.hitFlash[i] > 0) {
        this.hitFlash[i] = Math.max(0, this.hitFlash[i] - dt);
        const a = (this.hitFlash[i] / FLASH_DUR) * 0.9;
        for (let m = 0; m < meshes.length; m++) {
          meshes[m].renderOverlay = true;
          meshes[m].overlayAlpha = a;
        }
      } else if (meshes.length > 0 && meshes[0].renderOverlay) {
        for (let m = 0; m < meshes.length; m++) meshes[m].renderOverlay = false;
      }
    }
  }
}
