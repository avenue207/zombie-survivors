import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, TransformNode, Vector3, AbstractMesh } from '@babylonjs/core';
import { CONFIG } from './config';
import { loadModel } from './model-loader';
import { Obstacle, resolveObstacles } from './obstacles';
import { BossHazards } from './boss-hazards';
import { hitSpark } from './effects';
import { sound } from './sound';

/** Boss attack types */
type BossSkill = 'charge' | 'aimed' | 'shockwave' | 'poison' | 'radial';

interface BossDef {
  name: string;
  model: string;
  radius: number;
  speed: number;
  contactDps: number;
  hpMul: number;
  skill: BossSkill;
  skillInterval: number;
  /** Attack description (shown on the boss bar) */
  skillName: string;
  /** Bestiary detail */
  desc: string;
}

/** 5 bosses appear in order; beat the 5th to clear the game */
const BOSS_DEFS: BossDef[] = [
  {
    name: 'Chubby Zombie',
    model: '/models/zombie/zombie_chubby.gltf',
    radius: 6,
    speed: 6,
    contactDps: 32,
    hpMul: 1,
    skill: 'charge',
    skillInterval: 5,
    skillName: 'Charge dash',
    desc: 'Boss 1. High-HP tank that briefly charges then dashes fast — keep your distance.',
  },
  {
    name: 'Frenzied Ribcage',
    model: '/models/zombie/zombie_ribcage.gltf',
    radius: 4.8,
    speed: 9,
    contactDps: 28,
    hpMul: 0.9,
    skill: 'aimed',
    skillInterval: 2.6,
    skillName: 'Bone-spike volley',
    desc: 'Boss 2. Extremely fast; rapid-fires bone-spike barrages at you — keep running and dodging.',
  },
  {
    name: 'One-Armed Brute',
    model: '/models/zombie/zombie_arm.gltf',
    radius: 6.4,
    speed: 5.5,
    contactDps: 34,
    hpMul: 1.3,
    skill: 'shockwave',
    skillInterval: 4,
    skillName: 'Ground Slam',
    desc: 'Boss 3. High HP; periodically slams the ground sending shockwaves outward — dodge the expanding rings.',
  },
  {
    name: 'Toxic Zombie',
    model: '/models/zombie/zombie_basic.gltf',
    radius: 6,
    speed: 7,
    contactDps: 30,
    hpMul: 1.2,
    skill: 'poison',
    skillInterval: 4.5,
    skillName: 'Poison Pool',
    desc: 'Boss 4. Spawns poison pools beneath you that drain HP if you linger — do not stand in the green.',
  },
  {
    name: 'Pirate Captain',
    model: '/models/zombie/boss_captain.gltf',
    radius: 6,
    speed: 7,
    contactDps: 34,
    hpMul: 1.3,
    skill: 'aimed',
    skillName: 'Pistol spray',
    skillInterval: 2.4,
    desc: 'An undead pirate captain who advances while strafing pistol fire at you.',
  },
  {
    name: 'Giant Shark',
    model: '/models/zombie/boss_shark.gltf',
    radius: 7,
    speed: 11,
    contactDps: 36,
    hpMul: 1.4,
    skill: 'charge',
    skillName: 'High-speed lunge bite',
    skillInterval: 4,
    desc: 'A giant shark gliding on land; charges then lunges to bite fast — time your dodge carefully.',
  },
  {
    name: 'Deep-Sea Tentacle',
    model: '/models/zombie/boss_tentacle.gltf',
    radius: 21,
    speed: 3,
    contactDps: 42,
    hpMul: 1.9,
    skill: 'radial',
    skillName: 'Deep-sea barrage',
    skillInterval: 1.5,
    desc: 'Final boss. The Kraken arm closes in slowly, firing omnidirectional ring barrages; defeat it to clear the game.',
  },
];

/** Total bosses (clear the game when all are beaten) */
export const BOSS_COUNT = BOSS_DEFS.length;

/** Boss bestiary info (for the menu) */
export const BOSS_INFO = BOSS_DEFS.map((d) => ({
  name: d.name,
  skill: d.skillName,
  desc: d.desc,
  model: d.model,
}));

/** Hit white-flash duration (seconds) */
const FLASH_DUR = 0.16;
const WHITE = new Color3(1, 1, 1);

/**
 * Bosses: 5 giant zombies that appear in order, each with a special attack.
 * The 5 models are preloaded at construction and the matching one is enabled on spawn.
 */
export class Boss {
  active = false;
  hp = 0;
  maxHp = 0;
  x = 0;
  z = 0;
  justDied = false;
  /** Index of the current boss (0-based); used to tell whether it's the final boss */
  index = 0;
  name = '';
  skillName = '';
  radius = BOSS_DEFS[0].radius;
  contactDps = BOSS_DEFS[0].contactDps;

  private scene: Scene;
  private root: TransformNode;
  private fallback: Mesh;
  private models: (TransformNode | null)[];
  /** Each boss model's actual mesh (white flash overlay use) */
  private modelMeshes: AbstractMesh[][];
  /** The currently displayed mesh */
  private currentMeshes: AbstractMesh[] = [];
  private readonly resolved = { x: 0, z: 0 };
  /** Hit white-flash timer */
  private hitFlash = 0;
  /** Terrain-height query (for ground-snapping) */
  private heightAt: (x: number, z: number) => number = () => 0;
  /** Difficulty HP multiplier */
  private hpScale = 1;

  private skill: BossSkill = 'charge';
  private skillInterval = 5;
  private speed = 6;
  private skillTimer = 0;

  /** Charge sub-state machine */
  private phase: 'chase' | 'windup' | 'dash' = 'chase';
  private phaseT = 0;
  private dashX = 0;
  private dashZ = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode('boss', scene);

    /** Unit sphere fallback(radius 1),spawn scaled to the boss's size */
    this.fallback = MeshBuilder.CreateSphere('boss-body', { diameter: 2, segments: 14 }, scene);
    this.fallback.parent = this.root;
    const material = new StandardMaterial('boss-material', scene);
    material.diffuseColor = new Color3(0.4, 0.55, 0.3);
    material.emissiveColor = new Color3(0.2, 0.4, 0.15);
    material.specularColor = Color3.Black();
    this.fallback.material = material;
    this.fallback.overlayColor = WHITE;
    this.fallback.renderOverlay = false;
    this.currentMeshes = [this.fallback];

    this.root.setEnabled(false);

    /** Preload the 5 boss models, each size-normalized and disabled */
    this.models = new Array(BOSS_DEFS.length).fill(null);
    this.modelMeshes = new Array(BOSS_DEFS.length).fill(null).map(() => []);
    BOSS_DEFS.forEach((def, i) => {
      void loadModel(scene, def.model, def.radius * 2.2, true).then((node) => {
        if (!node) return;
        node.parent = this.root;
        node.setEnabled(false);
        this.models[i] = node;
        const ms = node.getChildMeshes(false);
        for (const m of ms) {
          m.overlayColor = WHITE;
          m.renderOverlay = false;
        }
        this.modelMeshes[i] = ms;
      });
    });
  }

  setHeightFn(fn: (x: number, z: number) => number) {
    this.heightAt = fn;
  }

  /** Set the difficulty HP multiplier */
  setHpScale(s: number) {
    this.hpScale = s;
  }

  spawn(index: number, playerX: number, playerZ: number) {
    const def = BOSS_DEFS[index];
    this.index = index;
    this.name = def.name;
    this.skillName = def.skillName;
    this.skill = def.skill;
    this.skillInterval = def.skillInterval;
    this.speed = def.speed;
    this.radius = def.radius;
    this.contactDps = def.contactDps;

    const hp = (CONFIG.boss.hpBase + CONFIG.boss.hpPerSpawn * index) * def.hpMul * this.hpScale;
    this.hp = hp;
    this.maxHp = hp;

    const angle = Math.random() * Math.PI * 2;
    const dist = 42;
    this.x = playerX + Math.cos(angle) * dist;
    this.z = playerZ + Math.sin(angle) * dist;

    this.skillTimer = 0;
    this.phase = 'chase';
    this.phaseT = 0;
    this.hitFlash = 0;
    this.active = true;
    this.justDied = false;

    /** Visual: enable the matching model, otherwise fall back to fallback */
    const hasModel = !!this.models[index];
    for (let i = 0; i < this.models.length; i++) this.models[i]?.setEnabled(i === index);
    this.fallback.setEnabled(!hasModel);
    this.fallback.scaling.set(this.radius, this.radius, this.radius);
    this.fallback.position.y = this.radius;

    /** white flash overlay Target: the currently displayed mesh */
    this.currentMeshes = hasModel && this.modelMeshes[index].length ? this.modelMeshes[index] : [this.fallback];
    for (const m of this.currentMeshes) m.renderOverlay = false;

    this.root.position.set(this.x, this.heightAt(this.x, this.z), this.z);
    this.root.setEnabled(true);
  }

  update(dt: number, playerX: number, playerZ: number, obstacles: Obstacle[], hazards: BossHazards) {
    if (!this.active) return;
    this.skillTimer += dt;

    if (this.skill === 'charge') {
      this.updateCharge(dt, playerX, playerZ, obstacles);
    } else {
      this.moveToward(dt, playerX, playerZ, this.speed, obstacles);
      if (this.skillTimer >= this.skillInterval) {
        this.skillTimer = 0;
        this.fireSkill(playerX, playerZ, hazards);
      }
    }

    /** Hit white-flash feedback */
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const a = (this.hitFlash / FLASH_DUR) * 0.9;
      for (const m of this.currentMeshes) {
        m.renderOverlay = true;
        m.overlayAlpha = a;
      }
    } else if (this.currentMeshes.length && this.currentMeshes[0].renderOverlay) {
      for (const m of this.currentMeshes) m.renderOverlay = false;
    }
  }

  /** Step toward the target, apply obstacle blocking, and face the movement direction */
  private moveToward(dt: number, tx: number, tz: number, speed: number, obstacles: Obstacle[]) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const len = Math.hypot(dx, dz) || 1;
    this.x += (dx / len) * speed * dt;
    this.z += (dz / len) * speed * dt;
    resolveObstacles(obstacles, this.x, this.z, this.radius, this.resolved);
    this.x = this.resolved.x;
    this.z = this.resolved.z;
    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.root.position.y = this.heightAt(this.x, this.z);
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  /** Charge: pursue → Charging (stationary) → High-speed dash */
  private updateCharge(dt: number, px: number, pz: number, obstacles: Obstacle[]) {
    if (this.phase === 'chase') {
      this.moveToward(dt, px, pz, this.speed, obstacles);
      if (this.skillTimer >= this.skillInterval) {
        this.skillTimer = 0;
        this.phase = 'windup';
        this.phaseT = 0;
      }
    } else if (this.phase === 'windup') {
      this.phaseT += dt;
      this.root.rotation.y = Math.atan2(px - this.x, pz - this.z);
      if (this.phaseT >= 0.7) {
        const dx = px - this.x;
        const dz = pz - this.z;
        const len = Math.hypot(dx, dz) || 1;
        this.dashX = dx / len;
        this.dashZ = dz / len;
        this.phase = 'dash';
        this.phaseT = 0;
        sound.bossSkill(); // Charge wind-up

      }
    } else {
      this.phaseT += dt;
      this.x += this.dashX * this.speed * 8 * dt;
      this.z += this.dashZ * this.speed * 8 * dt;
      resolveObstacles(obstacles, this.x, this.z, this.radius, this.resolved);
      this.x = this.resolved.x;
      this.z = this.resolved.z;
      this.root.position.x = this.x;
      this.root.position.z = this.z;
      this.root.position.y = this.heightAt(this.x, this.z);
      this.root.rotation.y = Math.atan2(this.dashX, this.dashZ);
      if (this.phaseT >= 1) this.phase = 'chase';
    }
  }

  private fireSkill(px: number, pz: number, hazards: BossHazards) {
    sound.bossSkill();
    switch (this.skill) {
      case 'aimed':
        hazards.aimedBarrage(this.x, this.z, px, pz, 4);
        break;
      case 'shockwave':
        hazards.shockwave(this.x, this.z);
        break;
      case 'poison':
        hazards.poison(px, pz);
        break;
      case 'radial':
        hazards.radialBarrage(this.x, this.z, 14);
        break;
    }
  }

  hitTest(px: number, pz: number, hitRadius: number, amount: number): boolean {
    if (!this.active) return false;
    const dx = px - this.x;
    const dz = pz - this.z;
    const r = this.radius + hitRadius;
    if (dx * dx + dz * dz > r * r) return false;
    this.hp -= amount;
    /** Hit feedback: sparks + white flash */
    this.hitFlash = FLASH_DUR;
    hitSpark(this.scene, new Vector3(px, this.radius * 0.7, pz));
    if (this.hp <= 0) {
      this.active = false;
      this.root.setEnabled(false);
      this.justDied = true;
    }
    return true;
  }

  contactsPlayer(px: number, pz: number, playerRadius: number): boolean {
    if (!this.active) return false;
    const dx = px - this.x;
    const dz = pz - this.z;
    const r = this.radius + playerRadius;
    return dx * dx + dz * dz <= r * r;
  }

  reset() {
    this.active = false;
    this.justDied = false;
    this.skillTimer = 0;
    this.phase = 'chase';
    this.root.setEnabled(false);
  }
}
