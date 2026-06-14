import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
  TransformNode,
  Mesh,
  GlowLayer,
} from '@babylonjs/core';
import { loadModel, loadCharacter } from './model-loader';
import type { AnimationGroup } from '@babylonjs/core';
import { createTerrain } from './terrain';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { scatterGroundDecals, buildRoads } from './ground-decals';
import { CONFIG } from './config';
import { Input } from './input';
import { SpatialGrid } from './spatial-grid';
import { ZombieHorde } from './zombie-horde';
import { WeaponSystem } from './weapon-system';
import { ExtraWeapons } from './extra-weapons';
import { GemSystem } from './gem-system';
import { Boss, BOSS_COUNT, BOSS_INFO } from './boss';
import { BossHazards } from './boss-hazards';
import { BloodDecals } from './decals';
import { Obstacle, resolveObstacles } from './obstacles';
import { createRunState, rollChoices, xpForLevel, UPGRADES, type RunState, type Upgrade } from './upgrades';
import { levelUpBurst, bossDeathBurst, hurtBurst, enemyDeathBurst, spawnText, setGlowLayer } from './effects';
import { sound } from './sound';

export type GameState = 'running' | 'levelup' | 'dead' | 'paused' | 'won';

export interface ChoiceView {
  id: string;
  name: string;
  desc: string;
  emoji: string;
}

export interface GameStats {
  fps: number;
  enemies: number;
  kills: number;
  time: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  state: GameState;
  choices: ChoiceView[];
  bossActive: boolean;
  bossHp: number;
  bossMaxHp: number;
  /** Boss name and attack (shown on the boss bar) */
  bossName: string;
  bossSkill: string;
  /** Bosses defeated / total bosses */
  bossDefeated: number;
  bossTotal: number;
  goldEarned: number;
  /** Current background-music index (auto-switches with progress; mirrored in the dropdown) */
  musicTrack: number;
}

export interface RunResult {
  gold: number;
  kills: number;
  time: number;
  level: number;
  /** Whether the game is cleared (final boss beaten) */
  won: boolean;
}

export interface GameOptions {
  onStats?: (stats: GameStats) => void;
  onGameOver?: (result: RunResult) => void;
  /** Starting stats from character + permanent upgrades (template, copied each run) */
  startRunState?: RunState;
  /** Character body color (fallback for the shape) */
  characterColor?: [number, number, number];
  /** Character GLB Model path */
  characterModel?: string;
  /** Gold-bonus multiplier (Greed) */
  goldMultiplier?: number;
  /** Difficulty settings */
  difficulty?: Difficulty;
}

export interface GameHandle {
  dispose: () => void;
  setJoystick: (x: number, z: number) => void;
  chooseUpgrade: (index: number) => void;
  restart: () => void;
  togglePause: () => void;
  jump: () => void;
  setXpDebug: (on: boolean) => void;
  setMuted: (on: boolean) => void;
  setMusicTrack: (i: number) => void;
  getDebugParams: () => DebugParamView[];
  setDebugParam: (index: number, value: number) => void;
  getUpgradeStatus: () => UpgradeStatusView[];
  getBossNames: () => string[];
  summonBoss: (index: number) => void;
}

export interface UpgradeStatusView {
  name: string;
  emoji: string;
  level: number;
  maxLevel: number;
}

export interface DebugParamView {
  label: string;
  group: string;
  type: 'range' | 'bool';
  min: number;
  max: number;
  step: number;
  value: number;
}

export function createGame(canvas: HTMLCanvasElement, options: GameOptions = {}): GameHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
  sound.enable();
  /** Background music is segmented by boss-kill count: 0→Undertow, ≥2→The Hunt, ≥4→Grim March, ≥6→Frenzy (index maps to TRACKS) */
  const stageTrack = (defeated: number): number => (defeated >= 6 ? 2 : defeated >= 4 ? 3 : defeated >= 2 ? 1 : 0);
  let musicTrackIdx = 0;
  sound.setMusicTrack(musicTrackIdx);
  sound.startMusic();

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.07, 0.13, 1);
  /** Glow layer: makes emissive materials (bullets, satellites, lightning, sparks) bloom more vividly */
  const glow = new GlowLayer('glow', scene);
  glow.intensity = 0.8;
  setGlowLayer(glow);
  /** Linear fog adds depth in the distance */
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.05, 0.07, 0.13);
  scene.fogStart = 55;
  scene.fogEnd = 110;

  const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3.2, 50, Vector3.Zero(), scene);
  /** User-adjustable: drag to rotate, wheel/pinch to zoom (still auto-follows the player's target point) */
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 25; // nearest
  camera.upperRadiusLimit = 80; // farthest
  camera.lowerBetaLimit = 0.35; // Max pitch-down (avoid seeing the sky)
  camera.upperBetaLimit = Math.PI / 2.2; // Min pitch-down (avoid clipping underground)
  camera.wheelPrecision = 3; // Wheel-zoom sensitivity
  camera.pinchPrecision = 60; // Mobile pinch-zoom sensitivity
  camera.panningSensibility = 0; // Disable panning (lock to follow the player)
  const light = new HemisphericLight('light', new Vector3(0.4, 1, 0.3), scene);
  light.intensity = 0.85;
  light.groundColor = new Color3(0.25, 0.28, 0.4);
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3), scene);
  sun.intensity = 0.6;

  const { heightAt } = createTerrain(scene);
  void buildRoads(scene, heightAt);
  scatterGroundDecals(scene, heightAt);
  /** Solid obstacles (filled in gradually as props load asynchronously) */
  const obstacles: Obstacle[] = [];
  void scatterProps(scene, obstacles, heightAt);

  /** Player root node (move this; visuals are its children:GLB or fallback capsule) */
  const player = new TransformNode('player', scene);
  player.position.set(0, 0, 0);

  const fallbackBody = MeshBuilder.CreateCapsule(
    'player-body',
    { radius: CONFIG.player.radius, height: CONFIG.player.radius * 2.4 },
    scene,
  );
  fallbackBody.parent = player;
  fallbackBody.position.y = CONFIG.player.radius * 1.2;
  const playerMaterial = new StandardMaterial('player-material', scene);
  const pc = options.characterColor ?? [1, 0.95, 0.4];
  playerMaterial.diffuseColor = new Color3(pc[0], pc[1], pc[2]);
  playerMaterial.emissiveColor = new Color3(pc[0] * 0.3, pc[1] * 0.3, pc[2] * 0.3);
  playerMaterial.specularColor = Color3.Black();
  fallbackBody.material = playerMaterial;

  /** Character idle/walk animation groups (switch to walking while moving) */
  let playerWalk: AnimationGroup | undefined;
  let playerIdle: AnimationGroup | undefined;
  let playerMoving = false;

  /** Asynchronously load the character model and replace on success fallback(doesn't block game start) */
  if (options.characterModel) {
    void loadCharacter(scene, options.characterModel, 2.4).then((m) => {
      if (m) {
        m.root.parent = player;
        playerWalk = m.walk;
        playerIdle = m.idle;
        fallbackBody.setEnabled(false);
      }
    });
  }

  const goldMul = options.goldMultiplier ?? 1;
  const diff = options.difficulty ?? DIFFICULTIES[0];
  const runTemplate: RunState = options.startRunState ?? createRunState();

  const input = new Input();
  input.attach();

  const grid = new SpatialGrid(CONFIG.gridCellSize);
  const enemies = new ZombieHorde(scene);
  enemies.setHeightFn(heightAt);
  const weapon = new WeaponSystem(scene);
  const extras = new ExtraWeapons(scene);
  const gems = new GemSystem(scene);
  const boss = new Boss(scene);
  boss.setHeightFn(heightAt);
  boss.setHpScale(diff.bossHp);
  const hazards = new BossHazards(scene);
  enemies.setHazards(hazards);
  enemies.rangedDamage = 7 * diff.enemyContact;
  const bloodDecals = new BloodDecals(scene);

  /** Slow-aura visual: a blue ground disc */
  const slowField = MeshBuilder.CreateDisc('slow-field', { radius: 1, tessellation: 48 }, scene);
  slowField.rotation.x = Math.PI / 2;
  slowField.isPickable = false;
  const slowMat = new StandardMaterial('slow-mat', scene);
  slowMat.diffuseColor = new Color3(0.4, 0.7, 1);
  slowMat.emissiveColor = new Color3(0.2, 0.5, 0.9);
  slowMat.specularColor = Color3.Black();
  slowMat.disableLighting = true;
  slowMat.alpha = 0.18;
  slowMat.backFaceCulling = false;
  slowField.material = slowMat;
  slowField.setEnabled(false);

  /** Shield visual: a cyan glowing ring */
  const shieldRing = MeshBuilder.CreateTorus('shield-ring', { diameter: 2.4, thickness: 0.18, tessellation: 32 }, scene);
  const shieldMat = new StandardMaterial('shield-mat', scene);
  shieldMat.emissiveColor = new Color3(0.4, 0.9, 1);
  shieldMat.diffuseColor = new Color3(0, 0, 0);
  shieldMat.specularColor = Color3.Black();
  shieldMat.disableLighting = true;
  shieldRing.material = shieldMat;
  shieldRing.isPickable = false;
  shieldRing.setEnabled(false);

  /** Chest model template (loaded asynchronously,spawn clone on demand; fall back to a procedural box if not ready) */
  let chestTemplate: TransformNode | null = null;
  void loadModel(scene, `${import.meta.env.BASE_URL}models/zombie/item_chest.gltf`, 1.1).then((n) => {
    if (n) {
      n.setEnabled(false);
      /** Apply an emissive material so GlowLayer Bloom (gold) */
      const chestMat = new StandardMaterial('chest-glow', scene);
      chestMat.diffuseColor = new Color3(1, 0.8, 0.3);
      chestMat.emissiveColor = new Color3(1, 0.7, 0.2);
      chestMat.specularColor = Color3.Black();
      chestMat.disableLighting = true;
      n.getChildMeshes(false).forEach((m) => (m.material = chestMat));
      chestTemplate = n;
    }
  });
  let bossTimer = 0;
  /** Bosses spawned so far (up to BOSS_COUNT) */
  let bossCount = 0;
  /** Bosses defeated */
  let bossDefeated = 0;

  /** Run state */
  let run: RunState = { ...runTemplate };
  let levels: Record<string, number> = {};
  let level = 1;
  let xp = 0;
  let xpToNext = xpForLevel(level);
  let hp = run.maxHp;
  let kills = 0;
  let time = 0;
  let goldEarned = 0;
  let hurtTimer = 0;
  /** For damage floaters: HP lost accumulated between two feedback ticks */
  let dmgAccum = 0;
  let state: GameState = 'running';
  let choices: Upgrade[] = [];

  /** Jump state (jumpY is the airborne height, added on top of terrain height) */
  let vy = 0;
  let jumpY = 0;
  let grounded = true;
  let jumpRequested = false;

  /** debug: XP ×10, invincibility, boomerang visual size */
  let xpDebug = false;
  let invincible = false;
  let boomerangScale = 1;
  /** Shield state */
  let shieldReady = false;
  let shieldTimer = 0;
  function requestJump() {
    if (state === 'running') jumpRequested = true;
  }

  const contactRange = CONFIG.player.radius + CONFIG.enemy.radius + 0.2;
  const contactRange2 = contactRange * contactRange;
  /** Scratch buffer for obstacle push-out */
  const playerResolve = { x: 0, z: 0 };

  /** ===== Buffs (chests) and items ===== */
  type BuffType = 'rapid' | 'power' | 'speed' | 'magnet' | 'multishot';
  const BUFFS: { type: BuffType; name: string; color: string }[] = [
    { type: 'rapid', name: 'Rapid fire', color: '#fbbf24' },
    { type: 'power', name: 'Power up', color: '#f87171' },
    { type: 'speed', name: 'Speed up', color: '#34d399' },
    { type: 'magnet', name: 'Magnet', color: '#22d3ee' },
    { type: 'multishot', name: 'Multi-shot', color: '#a78bfa' },
  ];
  /** until Measured in game seconds */
  const activeBuffs: { type: BuffType; until: number }[] = [];

  function applyBuff(eff: RunState, type: BuffType) {
    if (type === 'rapid') eff.fireInterval *= 0.5;
    else if (type === 'power') {
      eff.damage *= 2;
      eff.orbitalDamage *= 2;
      eff.auraDamage *= 2;
      eff.lightningDamage *= 2;
      eff.novaDamage *= 2;
      eff.boomerangDamage *= 2;
    } else if (type === 'speed') eff.moveSpeed *= 1.5;
    else if (type === 'magnet') eff.pickupRadius *= 3;
    else if (type === 'multishot') eff.projectileCount += 2;
  }

  /** Get effective stats after buffs */
  function effectiveRun(): RunState {
    const eff: RunState = { ...run };
    for (const b of activeBuffs) applyBuff(eff, b.type);
    return eff;
  }

  interface WorldItem {
    /** holder node (rotate/float this; visuals are its children) */
    node: TransformNode;
    kind: 'chest' | 'heal';
    bornAt: number;
    baseY: number;
    healPct: number;
  }
  const itemList: WorldItem[] = [];
  let chestTimer = 0;
  let healTimer = 0;

  function spawnItem(kind: 'chest' | 'heal') {
    const range = CONFIG.arenaHalf - 4;
    const x = (Math.random() * 2 - 1) * range;
    const z = (Math.random() * 2 - 1) * range;
    const node = new TransformNode(`item-${kind}`, scene);
    if (kind === 'chest' && chestTemplate) {
      const vis = chestTemplate.clone('chest-vis', node);
      vis?.setEnabled(true);
    } else {
      const vis = kind === 'chest' ? createChestMesh(scene) : createHealMesh(scene);
      vis.parent = node;
    }
    const baseY = heightAt(x, z) + (kind === 'chest' ? 0.5 : 0.9);
    node.position.set(x, baseY, z);
    const healPct =
      kind === 'heal'
        ? CONFIG.items.healPercents[Math.floor(Math.random() * CONFIG.items.healPercents.length)]
        : 0;
    itemList.push({ node, kind, bornAt: time, baseY, healPct });
  }

  function triggerItem(item: WorldItem) {
    const pos = item.node.position;
    if (item.kind === 'chest') {
      const def = BUFFS[Math.floor(Math.random() * BUFFS.length)];
      const existing = activeBuffs.find((b) => b.type === def.type);
      if (existing) existing.until = time + CONFIG.items.buffDuration / 1000;
      else activeBuffs.push({ type: def.type, until: time + CONFIG.items.buffDuration / 1000 });
      spawnText(scene, pos, def.name, def.color, 5);
      sound.buff();
    } else {
      const amount = run.maxHp * item.healPct;
      hp = Math.min(run.maxHp, hp + amount);
      spawnText(scene, pos, `+${Math.round(item.healPct * 100)}% HP`, '#34d399');
      sound.heal();
    }
  }

  function updateItems(dt: number, px: number, pz: number) {
    const r = CONFIG.items.pickupRadius;
    const r2 = r * r;
    for (let i = itemList.length - 1; i >= 0; i--) {
      const item = itemList[i];
      item.node.rotation.y += dt * 1.6;
      item.node.position.y = item.baseY + Math.sin(time * 3 + i) * 0.18;

      if (time - item.bornAt > CONFIG.items.lifetimeSec) {
        item.node.dispose();
        itemList.splice(i, 1);
        continue;
      }
      const dx = item.node.position.x - px;
      const dz = item.node.position.z - pz;
      if (dx * dx + dz * dz <= r2) {
        triggerItem(item);
        item.node.dispose();
        itemList.splice(i, 1);
      }
    }
  }

  const stats: GameStats = {
    fps: 0,
    enemies: enemies.count,
    kills: 0,
    time: 0,
    hp,
    maxHp: run.maxHp,
    level,
    xp: 0,
    xpToNext,
    state,
    choices: [],
    bossActive: false,
    bossHp: 0,
    bossMaxHp: 0,
    bossName: '',
    bossSkill: '',
    bossDefeated: 0,
    bossTotal: BOSS_COUNT,
    goldEarned: 0,
    musicTrack: 0,
  };

  function pushStats() {
    stats.fps = Math.round(engine.getFps());
    stats.enemies = enemies.count;
    stats.kills = kills;
    stats.time = time;
    stats.hp = Math.max(0, Math.ceil(hp));
    stats.maxHp = run.maxHp;
    stats.level = level;
    stats.xp = Math.floor(xp);
    stats.xpToNext = xpToNext;
    stats.state = state;
    stats.choices = choices.map((c) => ({ id: c.id, name: c.name, desc: c.desc, emoji: c.emoji }));
    stats.bossActive = boss.active;
    stats.bossHp = Math.max(0, Math.ceil(boss.hp));
    stats.bossMaxHp = boss.maxHp;
    stats.bossName = boss.name;
    stats.bossSkill = boss.skillName;
    stats.bossDefeated = bossDefeated;
    stats.goldEarned = goldEarned;
    stats.musicTrack = musicTrackIdx;
    options.onStats?.(stats);
  }

  const clampArena = (v: number) => Math.max(-CONFIG.arenaHalf, Math.min(CONFIG.arenaHalf, v));

  function togglePause() {
    if (state === 'running') state = 'paused';
    else if (state === 'paused') state = 'running';
    else return;
    pushStats();
  }

  function enterLevelUp() {
    const rolled = rollChoices(levels);
    if (rolled.length === 0) return; // All maxed, skip the pause
    choices = rolled;
    state = 'levelup';
    levelUpBurst(scene, new Vector3(player.position.x, player.position.y + 1, player.position.z));
    sound.levelUp();
    pushStats();
  }

  function gameplay(dt: number) {
    const dir = input.getDirection();
    /** Clear expired buffs and compute effective stats after buffs */
    for (let i = activeBuffs.length - 1; i >= 0; i--) {
      if (time >= activeBuffs[i].until) activeBuffs.splice(i, 1);
    }
    const eff = effectiveRun();

    /** By the camera's horizontal angle (alpha) converts input into camera-relative direction:
     *  front (+z)= away from camera, right (+x)= the right side of the screen. Identity at the default angle. */
    const ca = Math.cos(camera.alpha);
    const sa = Math.sin(camera.alpha);
    const moveX = dir.x * -sa + dir.z * -ca;
    const moveZ = dir.x * ca + dir.z * -sa;

    player.position.x = clampArena(player.position.x + moveX * eff.moveSpeed * dt);
    player.position.z = clampArena(player.position.z + moveZ * eff.moveSpeed * dt);
    /** Obstacle blocking */
    if (obstacles.length > 0) {
      resolveObstacles(obstacles, player.position.x, player.position.z, CONFIG.player.radius, playerResolve);
      player.position.x = clampArena(playerResolve.x);
      player.position.z = clampArena(playerResolve.z);
    }

    /** Face the movement direction (model front is +Z), smooth turning */
    const moving = dir.x !== 0 || dir.z !== 0;
    if (moving) {
      const targetAngle = Math.atan2(moveX, moveZ);
      player.rotation.y = lerpAngle(player.rotation.y, targetAngle, 0.25);
    }
    /** Play the walk animation while moving, return to it when stopped idle(switch only when the state changes) */
    if (moving !== playerMoving) {
      playerMoving = moving;
      if (moving) {
        playerIdle?.stop();
        playerWalk?.start(true);
      } else {
        playerWalk?.stop();
        playerIdle?.start(true);
      }
    }

    /** Jump: a parabolic offset above ground height (jumpY is the airborne height) */
    if (jumpRequested && grounded) {
      vy = eff.jumpStrength;
      grounded = false;
    }
    jumpRequested = false;
    if (!grounded) {
      vy -= CONFIG.player.jump.gravity * dt;
      jumpY += vy * dt;
      if (jumpY <= 0) {
        jumpY = 0;
        vy = 0;
        grounded = true;
      }
    }
    const airborne = jumpY > CONFIG.player.jump.dodgeHeight;

    const px = player.position.x;
    const pz = player.position.z;
    /** Player ground height (terrain) + jump airborne height */
    const groundY = heightAt(px, pz);
    player.position.y = groundY + jumpY;
    camera.target.set(px, groundY + 1.2, pz);

    /** Spawn director: ramps up over time */
    enemies.hpMul = (1 + time * CONFIG.director.hpGrowthPerSec * diff.growth) * diff.enemyHp;
    /** Enemy speed includes the time-slow multiplier and difficulty */
    enemies.speedMul = (1 + time * CONFIG.director.speedGrowthPerSec * diff.growth) * eff.enemySpeedMul * diff.enemySpeed;
    enemies.tier = Math.min(1, time / 120);
    const target = Math.min(
      CONFIG.director.maxCount,
      CONFIG.director.baseCount + Math.floor(time / CONFIG.director.stepIntervalSec) * CONFIG.director.addPerStep,
    );
    enemies.setCount(target, px, pz);

    grid.clear();
    enemies.insertAll(grid);
    enemies.update(dt, px, pz, grid, obstacles, eff.slowRadius, eff.slowFactor);
    /** Slow-aura visual */
    if (eff.slowRadius > 0) {
      slowField.position.set(px, groundY + 0.06, pz);
      slowField.scaling.set(eff.slowRadius, eff.slowRadius, eff.slowRadius);
      if (!slowField.isEnabled()) slowField.setEnabled(true);
    } else if (slowField.isEnabled()) {
      slowField.setEnabled(false);
    }

    /** Bosses: appear in order (total BOSS_COUNT ) */
    bossTimer += dt;
    if (!boss.active && bossCount < BOSS_COUNT && bossTimer >= CONFIG.boss.intervalSec) {
      bossTimer = 0;
      boss.spawn(bossCount, px, pz);
      sound.bossSpawn();
      bossCount += 1;
    }

    /** Lifesteal accumulated this frame, settled below against a per-second cap (prevents infinite healing at high kill rates) */
    let lifestealAccrued = 0;
    const onKill = (x: number, z: number) => {
      gems.spawn(x, z);
      const y = heightAt(x, z);
      enemyDeathBurst(scene, new Vector3(x, y + CONFIG.enemy.y, z));
      bloodDecals.spawn(x, z, y + 0.03);
      /** Lifesteal: accumulate first, settle against the cap later */
      if (eff.lifestealOnKill > 0) lifestealAccrued += eff.lifestealOnKill;
      sound.hit();
    };
    kills += weapon.update(dt, px, pz, enemies, boss, grid, eff, onKill, groundY);
    kills += extras.update(dt, px, pz, enemies, boss, eff, onKill, groundY);
    /** Lifesteal settle: per-second heal cap = 1 + 1.6 × Heal per kill (decoupled from kill rate; capped no matter how fast you kill) */
    if (lifestealAccrued > 0 && hp > 0) {
      const capPerSec = 1 + 1.6 * eff.lifestealOnKill;
      hp = Math.min(run.maxHp, hp + Math.min(lifestealAccrued, capPerSec * dt));
    }

    /** Boss defeated: spray lots of XP + an explosion effect */
    if (boss.justDied) {
      boss.justDied = false;
      kills += 1;
      bossDefeated += 1;
      /** Auto-switch tracks by progress (manual dropdown can still override between milestones) */
      const nextTrack = stageTrack(bossDefeated);
      if (nextTrack !== musicTrackIdx) {
        musicTrackIdx = nextTrack;
        sound.setMusicTrack(musicTrackIdx);
      }
      bossDeathBurst(scene, new Vector3(boss.x, heightAt(boss.x, boss.z) + 1.5, boss.z));
      sound.bossDown();
      for (let n = 0; n < CONFIG.boss.xpGems; n++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 3;
        gems.spawn(boss.x + Math.cos(a) * d, boss.z + Math.sin(a) * d);
      }
      /** Defeat the final boss → Clear */
      if (bossDefeated >= BOSS_COUNT) {
        goldEarned = Math.floor((kills * 0.6 + time) * goldMul) + 500;
        state = 'won';
        sound.levelUp();
        hazards.reset();
        pushStats();
        options.onGameOver?.({ gold: goldEarned, kills, time, level, won: true });
        return;
      }
    }

    boss.update(dt, px, pz, obstacles, hazards);
    /** Boss-attack damage to the player (projectiles/shockwave/poison, ignores airborne) is resolved together below */
    const hazardDmg = hazards.update(dt, px, pz, groundY);

    /** Items: spawn a chest and a heal every 15s, and update pickups */
    chestTimer += dt;
    if (chestTimer >= CONFIG.items.chestInterval / 1000) {
      chestTimer = 0;
      spawnItem('chest');
    }
    healTimer += dt;
    if (healTimer >= CONFIG.items.healInterval / 1000) {
      healTimer = 0;
      spawnItem('heal');
    }
    updateItems(dt, px, pz);

    const collected = gems.update(dt, px, pz, eff.pickupRadius);
    if (collected > 0) {
      /** Base XP per gem (default 4) */
      xp += collected * 4 * eff.xpMultiplier * (xpDebug ? 10 : 1);
      if (xp >= xpToNext) {
        xp -= xpToNext;
        level += 1;
        xpToNext = xpForLevel(level);
        enterLevelUp();
      }
    }

    /** Contact damage (minions + boss) */
    let touching = false;
    grid.query(px, pz, (j) => {
      if (touching || !enemies.isAlive(j)) return;
      const dx = enemies.getX(j) - px;
      const dz = enemies.getZ(j) - pz;
      if (dx * dx + dz * dz <= contactRange2) touching = true;
    });
    const contactDps = CONFIG.player.contactDps * (1 + time * CONFIG.director.contactGrowthPerSec * diff.growth) * diff.enemyContact;
    const bossTouch = boss.contactsPlayer(px, pz, CONFIG.player.radius);

    /** Shield: regenerates periodically, blocks one hit */
    if (eff.shieldInterval > 0) {
      if (!shieldReady) {
        shieldTimer += dt;
        if (shieldTimer >= eff.shieldInterval) {
          shieldReady = true;
          shieldTimer = 0;
        }
      }
    } else {
      shieldReady = false;
    }

    /** Resolve this frame's damage together: contact (dodgeable while airborne) + boss attacks; apply mitigation and shields */
    let incoming = 0;
    if (!airborne) {
      if (touching) incoming += contactDps * dt;
      if (bossTouch) incoming += boss.contactDps * diff.enemyContact * dt;
    }
    incoming += hazardDmg;
    if (invincible) incoming = 0;
    incoming *= 1 - eff.damageReduction;
    if (incoming > 0 && shieldReady) {
      incoming = 0;
      shieldReady = false;
      shieldTimer = 0;
    }
    if (incoming > 0) {
      hp -= incoming;
      dmgAccum += incoming;
    }

    /** Shield visual */
    if (shieldReady) {
      shieldRing.position.set(px, groundY + 1.1, pz);
      if (!shieldRing.isEnabled()) shieldRing.setEnabled(true);
    } else if (shieldRing.isEnabled()) {
      shieldRing.setEnabled(false);
    }

    /** HP regen */
    if (eff.hpRegen > 0 && hp > 0) hp = Math.min(run.maxHp, hp + eff.hpRegen * dt);

    /** Hit feedback: intermittent sparks + floating damage numbers overhead */
    hurtTimer -= dt;
    if (incoming > 0 && hurtTimer <= 0) {
      hurtTimer = 0.35;
      hurtBurst(scene, new Vector3(px, groundY + 1, pz));
      sound.hurt();
      if (dmgAccum >= 1) spawnText(scene, new Vector3(px, groundY + 2.4, pz), `-${Math.round(dmgAccum)}`, '#ff1818', 3);
      dmgAccum = 0;
    }

    if (hp <= 0) {
      hp = 0;
      goldEarned = Math.floor((kills * 0.6 + time) * goldMul);
      state = 'dead';
      sound.playerDeath();
      pushStats();
      options.onGameOver?.({ gold: goldEarned, kills, time, level, won: false });
    }

    time += dt;
  }

  let throttle = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (state === 'running') gameplay(dt);
    scene.render();

    throttle += dt;
    if (throttle >= 0.1) {
      throttle = 0;
      pushStats();
    }
  });

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') togglePause();
    else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      requestJump();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  /** ===== Debug Tunable params ===== */
  interface DebugParam {
    label: string;
    group: string;
    type: 'range' | 'bool';
    min: number;
    max: number;
    step: number;
    get: () => number;
    set: (v: number) => void;
  }
  const cfgParam = (
    group: string,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
  ): DebugParam => ({ group, label, type: 'range', min, max, step, get, set });
  const boolParam = (group: string, label: string, get: () => boolean, set: (v: boolean) => void): DebugParam => ({
    group,
    label,
    type: 'bool',
    min: 0,
    max: 1,
    step: 1,
    get: () => (get() ? 1 : 0),
    set: (v) => set(v > 0.5),
  });

  const debugSpec: DebugParam[] = [
    boolParam('Player', 'Invincible', () => invincible, (v) => (invincible = v)),
    boolParam('Player', 'EXP×10', () => xpDebug, (v) => (xpDebug = v)),
    cfgParam('Player', 'Move speed', 0, 40, 0.5, () => run.moveSpeed, (v) => (run.moveSpeed = v)),
    cfgParam('Player', 'Max HP', 10, 1000, 10, () => run.maxHp, (v) => (run.maxHp = v)),
    cfgParam('Player', 'Contact damage/sec', 0, 100, 1, () => CONFIG.player.contactDps, (v) => (CONFIG.player.contactDps = v)),
    cfgParam('Player', 'Jump power', 0, 20, 0.5, () => CONFIG.player.jump.strength, (v) => (CONFIG.player.jump.strength = v)),

    cfgParam('Weapon', 'Damage', 1, 200, 1, () => run.damage, (v) => (run.damage = v)),
    cfgParam('Weapon', 'Fire interval', 0.05, 2, 0.05, () => run.fireInterval, (v) => (run.fireInterval = v)),
    cfgParam('Weapon', 'Projectile count', 1, 20, 1, () => run.projectileCount, (v) => (run.projectileCount = v)),
    cfgParam('Weapon', 'Range', 5, 120, 1, () => run.range, (v) => (run.range = v)),
    cfgParam('Weapon', 'Projectile speed', 5, 120, 1, () => run.projectileSpeed, (v) => (run.projectileSpeed = v)),

    cfgParam('Extra weapons', 'Orbiting-axe count', 0, 6, 1, () => run.orbitalCount, (v) => (run.orbitalCount = v)),
    cfgParam('Extra weapons', 'Axe damage', 0, 100, 1, () => run.orbitalDamage, (v) => (run.orbitalDamage = v)),
    cfgParam('Extra weapons', 'Axe radius', 1, 20, 0.5, () => run.orbitalRadius, (v) => (run.orbitalRadius = v)),
    cfgParam('Extra weapons', 'Aura radius', 0, 30, 1, () => run.auraRadius, (v) => (run.auraRadius = v)),
    cfgParam('Extra weapons', 'Aura damage', 0, 100, 1, () => run.auraDamage, (v) => (run.auraDamage = v)),
    cfgParam('Extra weapons', 'Lightning chain count', 0, 10, 1, () => run.lightningCount, (v) => (run.lightningCount = v)),
    cfgParam('Extra weapons', 'Lightning damage', 0, 100, 1, () => run.lightningDamage, (v) => (run.lightningDamage = v)),
    cfgParam('Extra weapons', 'Nova radius', 0, 30, 1, () => run.novaRadius, (v) => (run.novaRadius = v)),
    cfgParam('Extra weapons', 'Nova damage', 0, 100, 1, () => run.novaDamage, (v) => (run.novaDamage = v)),
    cfgParam('Extra weapons', 'Boomerang count', 0, 8, 1, () => run.boomerangCount, (v) => (run.boomerangCount = v)),
    cfgParam('Extra weapons', 'Boomerang damage', 0, 100, 1, () => run.boomerangDamage, (v) => (run.boomerangDamage = v)),
    cfgParam(
      'Extra weapons',
      'Spear size',
      0.2,
      6,
      0.1,
      () => boomerangScale,
      (v) => {
        boomerangScale = v;
        extras.setBoomerangScale(v);
      },
    ),

    cfgParam('Enemies', 'Count cap', 0, 52, 1, () => CONFIG.director.maxCount, (v) => (CONFIG.director.maxCount = v)),
    cfgParam('Enemies', 'Initial count', 0, 52, 1, () => CONFIG.director.baseCount, (v) => (CONFIG.director.baseCount = v)),
    cfgParam('Enemies', 'Increment per step', 0, 20, 1, () => CONFIG.director.addPerStep, (v) => (CONFIG.director.addPerStep = v)),
    cfgParam('Enemies', 'Ramp interval (seconds)', 1, 30, 1, () => CONFIG.director.stepIntervalSec, (v) => (CONFIG.director.stepIntervalSec = v)),
    cfgParam('Enemies', 'Separation force', 0, 30, 1, () => CONFIG.enemy.separationForce, (v) => (CONFIG.enemy.separationForce = v)),

    cfgParam('Bosses/Items', 'Boss interval (seconds)', 5, 120, 1, () => CONFIG.boss.intervalSec, (v) => (CONFIG.boss.intervalSec = v)),
    cfgParam('Bosses/Items', 'Boss base HP', 50, 5000, 50, () => CONFIG.boss.hpBase, (v) => (CONFIG.boss.hpBase = v)),
    cfgParam('Bosses/Items', 'Chest intervalms', 2000, 60000, 1000, () => CONFIG.items.chestInterval, (v) => (CONFIG.items.chestInterval = v)),
    cfgParam('Bosses/Items', 'Heal intervalms', 2000, 60000, 1000, () => CONFIG.items.healInterval, (v) => (CONFIG.items.healInterval = v)),

    cfgParam('Boss attack', 'Barrage damage', 0, 100, 1, () => hazards.projDamage, (v) => (hazards.projDamage = v)),
    cfgParam('Boss attack', 'Shockwave damage', 0, 100, 1, () => hazards.shockDamage, (v) => (hazards.shockDamage = v)),
    cfgParam('Boss attack', 'Poison damage/sec', 0, 100, 1, () => hazards.poisonDps, (v) => (hazards.poisonDps = v)),
  ];

  pushStats();

  return {
    dispose() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      input.detach();
      sound.stopMusic();
      engine.dispose();
    },
    setJoystick(x: number, z: number) {
      input.setJoystick(x, z);
    },
    chooseUpgrade(index: number) {
      if (state !== 'levelup') return;
      const upgrade = choices[index];
      if (!upgrade) return;
      upgrade.apply(run);
      levels[upgrade.id] = (levels[upgrade.id] ?? 0) + 1;
      /** Max-HP upgrades fully heal; other upgrades restore 30% of max HP */
      if (upgrade.id === 'maxhp') hp = run.maxHp;
      else hp = Math.min(run.maxHp, hp + run.maxHp * 0.3);
      choices = [];
      state = 'running';
      pushStats();
    },
    restart() {
      run = { ...runTemplate };
      levels = {};
      level = 1;
      xp = 0;
      xpToNext = xpForLevel(level);
      hp = run.maxHp;
      kills = 0;
      time = 0;
      goldEarned = 0;
      hurtTimer = 0;
      choices = [];
      state = 'running';
      vy = 0;
      jumpY = 0;
      grounded = true;
      jumpRequested = false;
      shieldReady = false;
      shieldTimer = 0;
      shieldRing.setEnabled(false);
      slowField.setEnabled(false);
      playerMoving = false;
      playerWalk?.stop();
      playerIdle?.start(true);
      player.position.set(0, heightAt(0, 0), 0);
      enemies.reset(0, 0);
      gems.reset();
      weapon.reset();
      extras.reset();
      boss.reset();
      hazards.reset();
      bloodDecals.reset();
      bossTimer = 0;
      bossCount = 0;
      bossDefeated = 0;
      activeBuffs.length = 0;
      for (const it of itemList) it.node.dispose();
      itemList.length = 0;
      chestTimer = 0;
      healTimer = 0;
      pushStats();
    },
    togglePause() {
      togglePause();
    },
    jump() {
      requestJump();
    },
    setXpDebug(on: boolean) {
      xpDebug = on;
    },
    setMuted(on: boolean) {
      sound.setMuted(on);
    },
    setMusicTrack(i: number) {
      musicTrackIdx = i;
      sound.setMusicTrack(i);
    },
    getDebugParams() {
      return debugSpec.map((p) => ({
        label: p.label,
        group: p.group,
        type: p.type,
        min: p.min,
        max: p.max,
        step: p.step,
        value: p.get(),
      }));
    },
    setDebugParam(index: number, value: number) {
      debugSpec[index]?.set(value);
    },
    getUpgradeStatus() {
      return UPGRADES.map((u) => ({
        name: u.name,
        emoji: u.emoji,
        level: levels[u.id] ?? 0,
        maxLevel: u.maxLevel,
      }));
    },
    getBossNames() {
      return BOSS_INFO.map((b) => b.name);
    },
    summonBoss(index: number) {
      if (index < 0 || index >= BOSS_COUNT) return;
      boss.spawn(index, player.position.x, player.position.z);
      bossTimer = 0;
    },
  };
}

/** Angle interpolation (handles ±π orbit), used for smooth turning */
function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

/** Chest: a golden glowing box */
function createChestMesh(scene: Scene): Mesh {
  const box = MeshBuilder.CreateBox('chest', { width: 1.2, height: 0.9, depth: 0.9 }, scene);
  const m = new StandardMaterial('chest-mat', scene);
  m.diffuseColor = new Color3(0.9, 0.7, 0.2);
  m.emissiveColor = new Color3(0.5, 0.35, 0.05);
  m.specularColor = Color3.Black();
  box.material = m;
  box.isPickable = false;
  return box;
}

/** Heal: a green cross (medkit) */
function createHealMesh(scene: Scene): Mesh {
  const mat = new StandardMaterial('heal-mat', scene);
  mat.diffuseColor = new Color3(0.2, 0.85, 0.4);
  mat.emissiveColor = new Color3(0.15, 0.7, 0.3);
  mat.specularColor = Color3.Black();
  const v = MeshBuilder.CreateBox('heal', { width: 0.36, height: 1, depth: 0.36 }, scene);
  v.material = mat;
  v.isPickable = false;
  const h = MeshBuilder.CreateBox('heal-cross', { width: 1, height: 0.36, depth: 0.36 }, scene);
  h.parent = v;
  h.material = mat;
  h.isPickable = false;
  return v;
}

/**
 * Scatter zombie-town props (barrels, containers, cones, water towers) for movement reference and atmosphere.
 * solid are registered as obstacles (with radius) that block the player and enemies; cones are purely decorative.
 */
async function scatterProps(scene: Scene, obstacles: Obstacle[], heightAt: (x: number, z: number) => number) {
  const half = CONFIG.arenaHalf;
  const props: { path: string; height: number; count: number; solid?: number }[] = [
    { path: `${import.meta.env.BASE_URL}models/zombie/barrel.gltf`, height: 2.2, count: 10, solid: 1 },
    { path: `${import.meta.env.BASE_URL}models/zombie/container.gltf`, height: 4, count: 4, solid: 2.8 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_container_red.gltf`, height: 4, count: 3, solid: 2.8 },
    { path: `${import.meta.env.BASE_URL}models/zombie/cone.gltf`, height: 1.5, count: 10 },
    { path: `${import.meta.env.BASE_URL}models/zombie/watertower.gltf`, height: 10, count: 2, solid: 2.2 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_truck.gltf`, height: 4.5, count: 3, solid: 4 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_couch.gltf`, height: 1.8, count: 5, solid: 2 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_hydrant.gltf`, height: 1.8, count: 6, solid: 0.8 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_barrier.gltf`, height: 1.6, count: 7, solid: 1.5 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_wheels.gltf`, height: 1.6, count: 5, solid: 1 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_pallet.gltf`, height: 0.9, count: 8 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_trashbag.gltf`, height: 1.4, count: 10 },
    { path: `${import.meta.env.BASE_URL}models/zombie/prop_cinderblock.gltf`, height: 0.9, count: 8 },
  ];

  for (const p of props) {
    const base = await loadModel(scene, p.path, p.height);
    if (!base) continue;
    const place = (node: { position: { x: number; y: number; z: number }; rotation: { y: number } }) => {
      let x = 0;
      let z = 0;
      /** Avoid the player's spawn (within radius 10), retrying a few times */
      for (let tries = 0; tries < 8; tries++) {
        x = (Math.random() * 2 - 1) * half;
        z = (Math.random() * 2 - 1) * half;
        if (x * x + z * z > 100) break;
      }
      node.position.x = x;
      node.position.z = z;
      node.position.y = heightAt(x, z);
      node.rotation.y = Math.random() * Math.PI * 2;
      if (p.solid) obstacles.push({ x, z, radius: p.solid });
    };
    place(base);
    for (let i = 1; i < p.count; i++) {
      const clone = base.clone(`${p.path}-${i}`, null);
      if (clone) place(clone);
    }
  }
}
