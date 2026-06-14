import { CONFIG } from './config';

/** Mutable per-run stats (modified by upgrades) */
export interface RunState {
  // Player
  moveSpeed: number;
  maxHp: number;
  /** Jump initial speed (higher = jump higher and hang longer) */
  jumpStrength: number;
  /** XP pickup range */
  pickupRadius: number;
  xpMultiplier: number;
  // Weapon
  damage: number;
  fireInterval: number;
  projectileCount: number;
  range: number;
  projectileSpeed: number;
  // Orbiting Satellites
  orbitalCount: number;
  orbitalDamage: number;
  orbitalRadius: number;
  orbitalSpeed: number;
  // Damage Aura
  auraRadius: number;
  auraDamage: number;
  // Chain Lightning
  lightningCount: number;
  lightningDamage: number;
  // Nova Blast
  novaRadius: number;
  novaDamage: number;
  // Boomerang
  boomerangCount: number;
  boomerangDamage: number;
  // Crowd control
  enemySpeedMul: number; // Time-slow: global enemy-speed multiplier
  slowRadius: number; // Slow-aura radius (0=)
  slowFactor: number; // Enemy-speed multiplier within range
  freezeChance: number; // On-hit freeze chance
  // Defense / sustain
  lifestealOnKill: number; // Heal on kill
  hpRegen: number; // HP per second
  damageReduction: number; // Damage mitigation (0~0.8)
  shieldInterval: number; // Shield regen interval in seconds (0=)
  // Offensive modifiers
  critChance: number;
  critMult: number;
  pierce: number; // Bullet pierce count
  explodeRadius: number; // Explosion radius (0=)
  explodeDamage: number;
}

export function createRunState(): RunState {
  return {
    moveSpeed: CONFIG.player.speed,
    maxHp: CONFIG.player.maxHp,
    jumpStrength: CONFIG.player.jump.strength,
    pickupRadius: 5,
    xpMultiplier: 1,
    damage: CONFIG.weapon.damage,
    fireInterval: CONFIG.weapon.fireInterval,
    projectileCount: 1,
    range: CONFIG.weapon.range,
    projectileSpeed: CONFIG.weapon.projectileSpeed,
    orbitalCount: 0,
    orbitalDamage: 2,
    orbitalRadius: 4,
    orbitalSpeed: 2.4,
    auraRadius: 0,
    auraDamage: 1,
    lightningCount: 0,
    lightningDamage: 3,
    novaRadius: 0,
    novaDamage: 4,
    boomerangCount: 0,
    boomerangDamage: 4,
    enemySpeedMul: 1,
    slowRadius: 0,
    slowFactor: 0.5,
    freezeChance: 0,
    lifestealOnKill: 0,
    hpRegen: 0,
    damageReduction: 0,
    shieldInterval: 0,
    critChance: 0,
    critMult: 2,
    pierce: 0,
    explodeRadius: 0,
    explodeDamage: 3,
  };
}

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  maxLevel: number;
  apply: (s: RunState) => void;
}

export const UPGRADES: Upgrade[] = [
  { id: 'damage', name: 'Attack', desc: 'Weapon damage +1', emoji: '⚔️', maxLevel: 8, apply: (s) => (s.damage += 1) },
  { id: 'firerate', name: 'Attack speed', desc: 'Fire interval −12%', emoji: '⚡', maxLevel: 8, apply: (s) => (s.fireInterval *= 0.88) },
  { id: 'multishot', name: 'Multi-shot', desc: 'Projectiles +1', emoji: '🎯', maxLevel: 4, apply: (s) => (s.projectileCount += 1) },
  { id: 'range', name: 'Range', desc: 'Lock-on range +20%', emoji: '🔭', maxLevel: 5, apply: (s) => (s.range *= 1.2) },
  { id: 'projspeed', name: 'Projectile speed', desc: 'Projectile speed +20%', emoji: '💨', maxLevel: 5, apply: (s) => (s.projectileSpeed *= 1.2) },
  { id: 'movespeed', name: 'Move speed', desc: 'Move speed +10%', emoji: '👟', maxLevel: 5, apply: (s) => (s.moveSpeed *= 1.1) },
  {
    id: 'jump',
    name: 'Jump upgrade',
    desc: 'Jump higher and hang longer (airborne dodges contact damage)',
    emoji: '🦘',
    maxLevel: 4,
    apply: (s) => (s.jumpStrength += 2),
  },
  { id: 'maxhp', name: 'Max HP', desc: 'Max HP +20 and fully heal', emoji: '❤️', maxLevel: 5, apply: (s) => (s.maxHp += 20) },
  { id: 'magnet', name: 'Pickup range', desc: 'XP pickup range +30%', emoji: '🧲', maxLevel: 5, apply: (s) => (s.pickupRadius *= 1.3) },
  { id: 'xpgain', name: 'XP bonus', desc: 'XP gain +15%', emoji: '⭐', maxLevel: 5, apply: (s) => (s.xpMultiplier *= 1.15) },
  {
    id: 'orbital',
    name: 'Orbiting Axe',
    desc: 'Summon spinning axes that orbit you and damage enemies on contact; if owned, +1 axe and a wider orbit',
    emoji: '🪓',
    maxLevel: 10,
    apply: (s) => {
      s.orbitalCount += 1;
      s.orbitalDamage += 1;
      s.orbitalRadius += 1.4;
    },
  },
  {
    id: 'aura',
    name: 'Damage Aura',
    desc: 'Open a continuous damage aura that auto-burns nearby enemies; if owned, larger and more damage',
    emoji: '🌀',
    maxLevel: 10,
    apply: (s) => {
      s.auraRadius = s.auraRadius === 0 ? 4 : s.auraRadius + 1.6;
      s.auraDamage += 1;
    },
  },
  {
    id: 'lightning',
    name: 'Chain Lightning',
    desc: 'Periodically zap the nearest enemy and chain to those around it; if owned, +1 chain and more damage',
    emoji: '⚡',
    maxLevel: 10,
    apply: (s) => {
      s.lightningCount += 1;
      s.lightningDamage += 1;
    },
  },
  {
    id: 'nova',
    name: 'Nova Blast',
    desc: 'Periodically release an expanding shockwave that blasts all nearby enemies; if owned, larger and more damage',
    emoji: '💥',
    maxLevel: 10,
    apply: (s) => {
      s.novaRadius = s.novaRadius === 0 ? 6 : s.novaRadius + 1;
      s.novaDamage += 2;
    },
  },
  {
    id: 'boomerang',
    name: 'Boomerang',
    desc: 'Periodically throw a spear that flies out and returns, piercing enemies along the way; if owned, +1 spear and more damage',
    emoji: '🪃',
    maxLevel: 10,
    apply: (s) => {
      s.boomerangCount += 1;
      s.boomerangDamage += 1;
    },
  },
  // ===== Crowd control =====
  {
    id: 'slowfield',
    name: 'Slow Aura',
    desc: 'Zombies in a ring around you move slower; if owned, widen the area',
    emoji: '❄️',
    maxLevel: 5,
    apply: (s) => {
      s.slowRadius = s.slowRadius === 0 ? 7 : s.slowRadius + 1.5;
      s.slowFactor = Math.max(0.3, s.slowFactor - 0.05);
    },
  },
  {
    id: 'timeslow',
    name: 'Time-slow',
    desc: 'All zombies permanently slowed 8%',
    emoji: '🐌',
    maxLevel: 5,
    apply: (s) => (s.enemySpeedMul *= 0.92),
  },
  {
    id: 'freeze',
    name: 'Freeze Shot',
    desc: 'Bullet hits have a chance to briefly freeze zombies; if owned, raise the chance',
    emoji: '🧊',
    maxLevel: 5,
    apply: (s) => (s.freezeChance = Math.min(0.5, s.freezeChance + 0.08)),
  },
  // ===== Defense / sustain =====
  {
    id: 'lifesteal',
    name: 'Lifesteal',
    desc: 'Heal on zombie kill (per-second heal is capped); if owned, raise the cap',
    emoji: '🩸',
    maxLevel: 5,
    apply: (s) => (s.lifestealOnKill += 0.35),
  },
  {
    id: 'regen',
    name: 'HP regen',
    desc: 'Restore HP per second; if owned, restore more',
    emoji: '❤️‍🩹',
    maxLevel: 5,
    apply: (s) => (s.hpRegen += 0.7),
  },
  {
    id: 'armor',
    name: 'Armor',
    desc: 'Reduces damage taken by 10% (up to 70%)',
    emoji: '🛡️',
    maxLevel: 5,
    apply: (s) => (s.damageReduction = Math.min(0.7, s.damageReduction + 0.1)),
  },
  {
    id: 'shield',
    name: 'Energy Shield',
    desc: 'Periodically generate a shield that blocks one hit; if owned, regenerate faster',
    emoji: '🔆',
    maxLevel: 5,
    apply: (s) => (s.shieldInterval = s.shieldInterval === 0 ? 12 : Math.max(4, s.shieldInterval - 2)),
  },
  // ===== Offensive modifiers =====
  {
    id: 'crit',
    name: 'Crit',
    desc: 'Bullets have a chance to deal 2× damage; if owned, raise the chance',
    emoji: '💥',
    maxLevel: 5,
    apply: (s) => (s.critChance = Math.min(0.6, s.critChance + 0.1)),
  },
  {
    id: 'pierce',
    name: 'Pierce',
    desc: 'Bullets pierce +1 more zombie without vanishing',
    emoji: '🎯',
    maxLevel: 4,
    apply: (s) => (s.pierce += 1),
  },
  {
    id: 'explode',
    name: 'Explosive Shot',
    desc: 'Bullet hits create an area explosion; if owned, larger and more damage',
    emoji: '🧨',
    maxLevel: 5,
    apply: (s) => {
      s.explodeRadius = s.explodeRadius === 0 ? 3 : s.explodeRadius + 0.8;
      s.explodeDamage += 2;
    },
  },
];

/** Randomly draw n choices from not-yet-maxed upgrades */
export function rollChoices(levels: Record<string, number>, n = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.maxLevel);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** XP required to reach a given level */
export function xpForLevel(level: number): number {
  return 5 + level * 4;
}
