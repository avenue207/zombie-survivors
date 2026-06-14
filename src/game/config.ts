/** Milestone 1 (performance prototype) tunable params */
export const CONFIG = {
  /** Arena radius (player play area and enemy boundary) */
  arenaHalf: 70,

  player: {
    speed: 16,
    radius: 0.9,
    maxHp: 100,
    /** Damage taken per second when touching an enemy */
    contactDps: 12,
    /** Jump: initial speed, gravity; above this height counts as airborne (dodges contact damage) */
    jump: { strength: 9, gravity: 26, dodgeHeight: 0.7 },
  },

  enemy: {
    /** Capacity cap (thin instance buffer size) */
    capacity: 3000,
    radius: 0.6,
    /** Visual and standing height */
    y: 0.7,
    /** Mutual separation radius and force */
    separationRadius: 1.3,
    separationForce: 9,
    /** Spawn distance in a ring around the player */
    spawnRingMin: 38,
    spawnRingMax: 60,
  },

  /** Spawn director: enemy count and strength ramp up over time (fully animated zombies, lower count cap) */
  director: {
    baseCount: 10,
    addPerStep: 4,
    stepIntervalSec: 6,
    maxCount: 50,
    /** Per-second HP-multiplier growth (hpMul = 1 + elapsed * hpGrowthPerSec) */
    hpGrowthPerSec: 1 / 45,
    /** Per-second speed-multiplier growth */
    speedGrowthPerSec: 1 / 220,
    /** Per-second contact-damage growth */
    contactGrowthPerSec: 1 / 80,
  },

  /** Boss: a giant enemy appearing on a timer */
  boss: {
    intervalSec: 30,
    hpBase: 350,
    hpPerSpawn: 280,
    speed: 6,
    radius: 3,
    contactDps: 32,
    /** Number of XP gems sprayed on defeat */
    xpGems: 40,
  },

  weapon: {
    /** Auto-fire interval (seconds) */
    fireInterval: 0.45,
    projectileSpeed: 34,
    projectileRadius: 0.6,
    damage: 1,
    /** Lock-on range */
    range: 45,
    maxProjectiles: 300,
    lifetime: 1.4,
  },

  /** Map items */
  items: {
    /** Spawn interval for chests and heals respectively (ms) */
    chestInterval: 15000,
    healInterval: 15000,
    /** Buff duration (ms) */
    buffDuration: 10000,
    /** Pickup distance */
    pickupRadius: 2.4,
    /** Lifetime if not picked up (ms converted to seconds) */
    lifetimeSec: 20,
    /** Heal percentage (one chosen at random) */
    healPercents: [0.15, 0.3, 0.5],
  },

  /** Spatial grid cell size (roughly the scale of the enemy separation radius) */
  gridCellSize: 3,
};

/** Enemy type table */
export interface EnemyType {
  hp: number;
  speed: number;
  scale: number;
  color: [number, number, number];
}
export const ENEMY_TYPES: Record<'basic' | 'fast' | 'tank', EnemyType> = {
  basic: { hp: 3, speed: 5.5, scale: 1, color: [0.98, 0.45, 0.3] },
  fast: { hp: 2, speed: 9, scale: 0.78, color: [1, 0.85, 0.2] },
  tank: { hp: 12, speed: 3.2, scale: 1.7, color: [0.55, 0.35, 0.9] },
};
