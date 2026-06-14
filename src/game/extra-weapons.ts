import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, LinesMesh, TransformNode, DynamicTexture } from '@babylonjs/core';
import { ZombieHorde } from './zombie-horde';
import { Boss } from './boss';
import { RunState } from './upgrades';
import { hitSpark } from './effects';
import { loadModel } from './model-loader';

/** Orbiting-satellite cap (RunState.orbitalCount not exceeding this number) */
const MAX_ORBS = 6;
/** Damage-tick interval for satellites and aura respectively (seconds) */
const ORBIT_HIT_INTERVAL = 0.25;
const AURA_TICK_INTERVAL = 0.5;
const ORB_RADIUS = 0.45;
const ORB_Y = 1.0;

/** Chain lightning: trigger interval, first-hit lock range, chain-jump range, flash fade time */
const LIGHTNING_INTERVAL = 1.4;
const LIGHTNING_RANGE2 = 30 * 30;
const CHAIN_RANGE2 = 12 * 12;
const LIGHTNING_FADE = 0.25;
const FX_Y = 1.1;
/** Nova blast: trigger interval, expanding-ring visual duration */
const NOVA_INTERVAL = 2.5;
const NOVA_FX_DUR = 0.45;

/** Boomerang: pool size, trigger interval, throw distance, round-trip time, hit radius, spin, flight height */
const MAX_BOOMERANGS = 8;
const BOOMERANG_INTERVAL = 2;
const BOOMERANG_DIST = 16;
const BOOMERANG_DUR = 1.4;
const BOOMERANG_HITR = 1.3;
const BOOMERANG_SPIN = 18;
const BOOMERANG_Y = 1;

/**
 * Extra weapons (Vampire Survivors style), all disabled by default (value 0), unlocked and upgraded via level-ups:
 *  - Orbiting satellites: energy orbs circle the player and damage enemies on contact
 *  - Damage aura: a continuous damage field around the player
 *  - Chain lightning: periodically zap the nearest enemy and chain outward
 *  - Nova blast: a periodic outward-expanding area explosion
 */
export class ExtraWeapons {
  /** Orbiting-weapon node (sphere first fallback, replaced once the axe model loads) */
  private orbs: TransformNode[] = [];
  private aura: Mesh;
  private angle = 0;
  private orbitTimer = 0;
  private auraTimer = 0;

  private lightningTimer = 0;
  private novaTimer = 0;
  private lightningFx: { mesh: LinesMesh; t: number }[] = [];
  private novaFx: { mesh: Mesh; t: number; r: number }[] = [];
  private scene: Scene;
  private novaMat: StandardMaterial;
  private auraMat!: StandardMaterial;
  private auraPhase = 0;

  private boomerangTimer = 0;
  private boomerangReady = false;
  /** Boomerang visual scale (debug tunable) */
  private boomerangScale = 1;
  /** Player terrain height (ground baseline for effects) */
  private baseY = 0;
  private boomerangs: {
    node: TransformNode;
    active: boolean;
    t: number;
    dirX: number;
    dirZ: number;
    bossHit: boolean;
    hit: Set<number>;
  }[] = [];

  constructor(scene: Scene) {
    this.scene = scene;

    const orbMat = new StandardMaterial('orb-mat', scene);
    orbMat.diffuseColor = new Color3(0.5, 0.9, 1);
    orbMat.emissiveColor = new Color3(0.3, 0.8, 1);
    orbMat.specularColor = Color3.Black();
    orbMat.disableLighting = true;

    for (let i = 0; i < MAX_ORBS; i++) {
      const orb = MeshBuilder.CreateSphere(`orb-${i}`, { diameter: ORB_RADIUS * 2, segments: 8 }, scene);
      orb.material = orbMat;
      orb.isPickable = false;
      orb.setEnabled(false);
      this.orbs.push(orb);
    }
    /** Load the axe model to replace the sphere (Vampire Survivors-style orbiting weapon) */
    void this.loadOrbWeapon(scene);
    /** Load the spear model as a boomerang */
    void this.loadBoomerangs(scene);

    /** Aura: a ground-level glowing energy field (procedural texture + GlowLayer bloom) */
    this.aura = MeshBuilder.CreateDisc('aura', { radius: 1, tessellation: 64 }, scene);
    this.aura.rotation.x = Math.PI / 2;
    this.aura.isPickable = false;

    const auraTex = new DynamicTexture('aura-tex', 256, scene, false);
    auraTex.hasAlpha = true;
    const ax = auraTex.getContext() as unknown as CanvasRenderingContext2D;
    ax.clearRect(0, 0, 256, 256);
    /** Radial: faint center, a bright ring near the edge, fading at the outermost */
    const grad = ax.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(70,255,140,0.05)');
    grad.addColorStop(0.55, 'rgba(60,230,120,0.14)');
    grad.addColorStop(0.82, 'rgba(150,255,170,0.55)');
    grad.addColorStop(0.95, 'rgba(120,255,150,0.32)');
    grad.addColorStop(1, 'rgba(120,255,150,0)');
    ax.fillStyle = grad;
    ax.beginPath();
    ax.arc(128, 128, 128, 0, Math.PI * 2);
    ax.fill();
    auraTex.update();

    this.auraMat = new StandardMaterial('aura-mat', scene);
    this.auraMat.emissiveTexture = auraTex;
    this.auraMat.opacityTexture = auraTex;
    this.auraMat.emissiveColor = Color3.White();
    this.auraMat.diffuseColor = Color3.Black();
    this.auraMat.specularColor = Color3.Black();
    this.auraMat.disableLighting = true;
    this.auraMat.backFaceCulling = false;
    this.aura.material = this.auraMat;
    this.aura.setEnabled(false);

    /** Nova blast: orange expanding ring (visual only) */
    this.novaMat = new StandardMaterial('nova-mat', scene);
    this.novaMat.diffuseColor = new Color3(1, 0.6, 0.3);
    this.novaMat.emissiveColor = new Color3(1, 0.5, 0.2);
    this.novaMat.specularColor = Color3.Black();
    this.novaMat.disableLighting = true;
  }

  /** Replace the sphere with the axe model orb(each wrapped holder so it can rotate) */
  private async loadOrbWeapon(scene: Scene) {
    const tmpl = await loadModel(scene, `${import.meta.env.BASE_URL}models/zombie/weapon_axe.gltf`, 0.2);
    if (!tmpl) return;
    tmpl.setEnabled(false);
    /** Apply an emissive material so GlowLayer Bloom (orange-red) */
    const axeMat = new StandardMaterial('axe-glow', scene);
    axeMat.diffuseColor = new Color3(1, 0.6, 0.25);
    axeMat.emissiveColor = new Color3(1, 0.5, 0.15);
    axeMat.specularColor = Color3.Black();
    axeMat.disableLighting = true;
    tmpl.getChildMeshes(false).forEach((m) => (m.material = axeMat));
    for (let i = 0; i < MAX_ORBS; i++) {
      const vis = i === 0 ? tmpl : tmpl.clone(`orb-axe-${i}`, null);
      if (!vis) continue;
      const holder = new TransformNode(`orb-h-${i}`, scene);
      vis.parent = holder;
      vis.position.y = -0.1; // so the axe holder as the center
      vis.setEnabled(true);
      const wasEnabled = this.orbs[i].isEnabled();
      this.orbs[i].dispose();
      holder.setEnabled(wasEnabled);
      this.orbs[i] = holder;
    }
  }

  /** Load the spear model and build the boomerang pool (use a box if loading fails) */
  private async loadBoomerangs(scene: Scene) {
    const tmpl = await loadModel(scene, `${import.meta.env.BASE_URL}models/zombie/weapon_spear.gltf`, 0.6);
    for (let i = 0; i < MAX_BOOMERANGS; i++) {
      const holder = new TransformNode(`boomerang-${i}`, scene);
      if (tmpl) {
        const vis = i === 0 ? tmpl : tmpl.clone(`spear-${i}`, null);
        if (vis) {
          vis.parent = holder;
          vis.position.y = -0.3;
          vis.rotation.z = Math.PI / 2; // Spear lies flat and spins
          vis.setEnabled(true);
        }
      } else {
        const box = MeshBuilder.CreateBox(`boomerang-box-${i}`, { width: 4, height: 0.5, depth: 0.5 }, scene);
        const m = new StandardMaterial(`boomerang-mat-${i}`, scene);
        m.diffuseColor = new Color3(0.6, 0.6, 0.65);
        m.specularColor = Color3.Black();
        box.material = m;
        box.parent = holder;
      }
      holder.scaling.setAll(this.boomerangScale);
      holder.setEnabled(false);
      this.boomerangs.push({ node: holder, active: false, t: 0, dirX: 0, dirZ: 1, bossHit: false, hit: new Set() });
    }
    this.boomerangReady = true;
  }

  /** Set the boomerang visual size (debug) */
  setBoomerangScale(s: number) {
    this.boomerangScale = s;
    for (const b of this.boomerangs) b.node.scaling.setAll(s);
  }

  /** Throw boomerangs in multiple directions */
  private throwBoomerangs(count: number) {
    const base = this.angle; // Reuse the accumulated rotation as the start angle, avoiding randomness
    let assigned = 0;
    for (const b of this.boomerangs) {
      if (assigned >= count) break;
      if (b.active) continue;
      const a = base + (assigned / count) * Math.PI * 2;
      b.dirX = Math.cos(a);
      b.dirZ = Math.sin(a);
      b.t = 0;
      b.active = true;
      b.bossHit = false;
      b.hit.clear();
      b.node.setEnabled(true);
      assigned++;
    }
  }

  reset() {
    this.angle = 0;
    this.orbitTimer = 0;
    this.auraTimer = 0;
    this.lightningTimer = 0;
    this.novaTimer = 0;
    this.boomerangTimer = 0;
    for (const orb of this.orbs) orb.setEnabled(false);
    this.aura.setEnabled(false);
    for (const f of this.lightningFx) f.mesh.dispose();
    for (const f of this.novaFx) f.mesh.dispose();
    this.lightningFx.length = 0;
    this.novaFx.length = 0;
    for (const b of this.boomerangs) {
      b.active = false;
      b.node.setEnabled(false);
    }
  }

  /** Update each frame; on a killing hit, call with the death coordinates onKill. Return this frame's kill count. */
  update(
    dt: number,
    px: number,
    pz: number,
    enemies: ZombieHorde,
    boss: Boss,
    run: RunState,
    onKill: (x: number, z: number) => void,
    baseY: number,
  ): number {
    this.baseY = baseY;
    let kills = 0;

    /** ===== Orbiting Satellites ===== */
    const n = Math.min(MAX_ORBS, run.orbitalCount);
    this.angle += dt * run.orbitalSpeed;
    for (let i = 0; i < MAX_ORBS; i++) {
      const orb = this.orbs[i];
      if (i >= n) {
        if (orb.isEnabled()) orb.setEnabled(false);
        continue;
      }
      const a = this.angle + (i / n) * Math.PI * 2;
      orb.position.set(px + Math.cos(a) * run.orbitalRadius, baseY + ORB_Y, pz + Math.sin(a) * run.orbitalRadius);
      orb.rotation.y += dt * 10; // Weapon spin
      if (!orb.isEnabled()) orb.setEnabled(true);
    }

    if (n > 0) {
      this.orbitTimer += dt;
      if (this.orbitTimer >= ORBIT_HIT_INTERVAL) {
        this.orbitTimer = 0;
        const hitR = ORB_RADIUS + 0.6;
        const hitR2 = hitR * hitR;
        for (let i = 0; i < n; i++) {
          const ox = this.orbs[i].position.x;
          const oz = this.orbs[i].position.z;
          let orbHit = false;
          for (let j = 0; j < enemies.count; j++) {
            if (!enemies.isAlive(j)) continue;
            const dx = enemies.getX(j) - ox;
            const dz = enemies.getZ(j) - oz;
            if (dx * dx + dz * dz <= hitR2) {
              const ex = enemies.getX(j);
              const ez = enemies.getZ(j);
              orbHit = true;
              if (enemies.damage(j, run.orbitalDamage, px, pz)) {
                kills++;
                onKill(ex, ez);
              }
            }
          }
          /** Each orb emits at most one spark per tick to avoid excess */
          if (orbHit) hitSpark(this.scene, new Vector3(ox, baseY + ORB_Y, oz));
          boss.hitTest(ox, oz, ORB_RADIUS, run.orbitalDamage);
        }
      }
    }

    /** ===== Damage Aura ===== */
    if (run.auraRadius > 0) {
      this.auraPhase += dt;
      const pulse = 1 + 0.05 * Math.sin(this.auraPhase * 5);
      const r = run.auraRadius * pulse;
      this.aura.position.set(px, baseY + 0.08, pz);
      this.aura.scaling.set(r, r, r);
      this.auraMat.alpha = 0.7 + 0.3 * Math.sin(this.auraPhase * 5);
      if (!this.aura.isEnabled()) this.aura.setEnabled(true);

      this.auraTimer += dt;
      if (this.auraTimer >= AURA_TICK_INTERVAL) {
        this.auraTimer = 0;
        const r2 = run.auraRadius * run.auraRadius;
        for (let j = 0; j < enemies.count; j++) {
          if (!enemies.isAlive(j)) continue;
          const dx = enemies.getX(j) - px;
          const dz = enemies.getZ(j) - pz;
          if (dx * dx + dz * dz <= r2) {
            const ex = enemies.getX(j);
            const ez = enemies.getZ(j);
            if (enemies.damage(j, run.auraDamage, px, pz)) {
              kills++;
              onKill(ex, ez);
            }
          }
        }
        boss.hitTest(px, pz, run.auraRadius, run.auraDamage);
      }
    } else if (this.aura.isEnabled()) {
      this.aura.setEnabled(false);
    }

    /** ===== Chain Lightning ===== */
    if (run.lightningCount > 0) {
      this.lightningTimer += dt;
      if (this.lightningTimer >= LIGHTNING_INTERVAL) {
        this.lightningTimer = 0;
        kills += this.fireLightning(px, pz, enemies, boss, run, onKill);
      }
    }

    /** ===== Nova Blast ===== */
    if (run.novaRadius > 0) {
      this.novaTimer += dt;
      if (this.novaTimer >= NOVA_INTERVAL) {
        this.novaTimer = 0;
        const r2 = run.novaRadius * run.novaRadius;
        for (let j = 0; j < enemies.count; j++) {
          if (!enemies.isAlive(j)) continue;
          const dx = enemies.getX(j) - px;
          const dz = enemies.getZ(j) - pz;
          if (dx * dx + dz * dz <= r2) {
            const ex = enemies.getX(j);
            const ez = enemies.getZ(j);
            if (enemies.damage(j, run.novaDamage, px, pz)) {
              kills++;
              onKill(ex, ez);
            }
          }
        }
        boss.hitTest(px, pz, run.novaRadius, run.novaDamage);
        /** Visual: expanding ring */
        const ring = MeshBuilder.CreateTorus('nova', { diameter: 2, thickness: 0.5, tessellation: 40 }, this.scene);
        ring.material = this.novaMat;
        ring.isPickable = false;
        ring.position.set(px, baseY + 0.3, pz);
        this.novaFx.push({ mesh: ring, t: 0, r: run.novaRadius });
      }
    }

    /** ===== Boomerang ===== */
    if (this.boomerangReady) {
      if (run.boomerangCount > 0) {
        this.boomerangTimer += dt;
        if (this.boomerangTimer >= BOOMERANG_INTERVAL) {
          this.boomerangTimer = 0;
          this.throwBoomerangs(run.boomerangCount);
        }
      }
      const hr2 = BOOMERANG_HITR * BOOMERANG_HITR;
      for (const b of this.boomerangs) {
        if (!b.active) continue;
        b.t += dt;
        const frac = b.t / BOOMERANG_DUR;
        if (frac >= 1) {
          b.active = false;
          b.node.setEnabled(false);
          continue;
        }
        /** sin Parabola: 0 → maxDist → 0, returning to the player's current position */
        const dist = Math.sin(frac * Math.PI) * BOOMERANG_DIST;
        const bx = px + b.dirX * dist;
        const bz = pz + b.dirZ * dist;
        b.node.position.set(bx, baseY + BOOMERANG_Y, bz);
        b.node.rotation.y += dt * BOOMERANG_SPIN;

        let any = false;
        for (let j = 0; j < enemies.count; j++) {
          if (b.hit.has(j) || !enemies.isAlive(j)) continue;
          const dx = enemies.getX(j) - bx;
          const dz = enemies.getZ(j) - bz;
          if (dx * dx + dz * dz <= hr2) {
            b.hit.add(j);
            any = true;
            const ex = enemies.getX(j);
            const ez = enemies.getZ(j);
            if (enemies.damage(j, run.boomerangDamage, px, pz)) {
              kills++;
              onKill(ex, ez);
            }
          }
        }
        if (any) hitSpark(this.scene, new Vector3(bx, baseY + BOOMERANG_Y, bz));
        if (!b.bossHit && boss.hitTest(bx, bz, BOOMERANG_HITR, run.boomerangDamage)) b.bossHit = true;
      }
    }

    this.updateFx(dt);
    return kills;
  }

  /** Chain-zap starting from the nearest enemy, returning kill count */
  private fireLightning(
    px: number,
    pz: number,
    enemies: ZombieHorde,
    boss: Boss,
    run: RunState,
    onKill: (x: number, z: number) => void,
  ): number {
    let kills = 0;
    const fxY = this.baseY + FX_Y;
    const hit = new Set<number>();
    const points: Vector3[] = [new Vector3(px, fxY, pz)];
    let fromX = px;
    let fromZ = pz;

    for (let c = 0; c < run.lightningCount; c++) {
      let best = -1;
      let bestD = c === 0 ? LIGHTNING_RANGE2 : CHAIN_RANGE2;
      for (let j = 0; j < enemies.count; j++) {
        if (hit.has(j) || !enemies.isAlive(j)) continue;
        const dx = enemies.getX(j) - fromX;
        const dz = enemies.getZ(j) - fromZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) {
          bestD = d2;
          best = j;
        }
      }
      if (best < 0) break;
      hit.add(best);
      const ex = enemies.getX(best);
      const ez = enemies.getZ(best);
      points.push(new Vector3(ex, fxY, ez));
      hitSpark(this.scene, new Vector3(ex, fxY, ez));
      if (enemies.damage(best, run.lightningDamage, px, pz)) {
        kills++;
        onKill(ex, ez);
      }
      fromX = ex;
      fromZ = ez;
    }

    /** The boss also takes a hit up close */
    boss.hitTest(px, pz, 2, run.lightningDamage);

    if (points.length > 1) {
      const bolt = MeshBuilder.CreateLines('bolt', { points: jaggedPath(points, fxY) }, this.scene);
      bolt.color = new Color3(0.75, 0.95, 1);
      bolt.isPickable = false;
      this.lightningFx.push({ mesh: bolt, t: 0 });
    }
    return kills;
  }

  /** Update and recycle one-shot visuals (lightning flashes, nova rings) */
  private updateFx(dt: number) {
    for (let i = this.lightningFx.length - 1; i >= 0; i--) {
      const f = this.lightningFx[i];
      f.t += dt;
      if (f.t >= LIGHTNING_FADE) {
        f.mesh.dispose();
        this.lightningFx.splice(i, 1);
      } else {
        f.mesh.alpha = 1 - f.t / LIGHTNING_FADE;
      }
    }
    for (let i = this.novaFx.length - 1; i >= 0; i--) {
      const f = this.novaFx[i];
      f.t += dt;
      if (f.t >= NOVA_FX_DUR) {
        f.mesh.dispose();
        this.novaFx.splice(i, 1);
      } else {
        const s = (f.t / NOVA_FX_DUR) * f.r;
        f.mesh.scaling.set(s, 1, s);
        f.mesh.visibility = 1 - f.t / NOVA_FX_DUR;
      }
    }
  }
}

/** Insert jagged waypoints between chain nodes to make the lightning look more electric */
function jaggedPath(anchors: Vector3[], fxY: number): Vector3[] {
  const out: Vector3[] = [anchors[0]];
  const SEGS = 3;
  for (let k = 1; k < anchors.length; k++) {
    const a = anchors[k - 1];
    const b = anchors[k];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    for (let s = 1; s <= SEGS; s++) {
      const f = s / SEGS;
      if (s < SEGS) {
        const off = (Math.random() - 0.5) * 1.4;
        out.push(new Vector3(a.x + dx * f + nx * off, fxY + Math.random() * 0.6, a.z + dz * f + nz * off));
      } else {
        out.push(new Vector3(b.x, b.y, b.z));
      }
    }
  }
  return out;
}
