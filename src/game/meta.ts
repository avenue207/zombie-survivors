import { createRunState, type RunState } from './upgrades';
import { getCharacter } from './characters';

/** Permanent upgrades (roguelite meta, spend gold, applied to every run) */
export interface PermaUpgrade {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  maxLevel: number;
  costBase: number;
  costStep: number;
}

export const PERMA: PermaUpgrade[] = [
  { id: 'might', name: 'Power', emoji: '⚔️', desc: 'Starting damage +1 per level', maxLevel: 5, costBase: 100, costStep: 80 },
  { id: 'haste', name: 'Hyper', emoji: '⚡', desc: 'Starting attack speed +6% per level', maxLevel: 5, costBase: 120, costStep: 90 },
  { id: 'vigor', name: 'Vitality', emoji: '❤️', desc: 'Starting HP +20 per level', maxLevel: 5, costBase: 100, costStep: 80 },
  { id: 'swift', name: 'Agility', emoji: '👟', desc: 'Starting move speed +5% per level', maxLevel: 5, costBase: 100, costStep: 80 },
  { id: 'greed', name: 'Greed', emoji: '💰', desc: 'Gold gain +15% per level', maxLevel: 5, costBase: 150, costStep: 120 },
];

export function permaCost(p: PermaUpgrade, currentLevel: number): number {
  return p.costBase + p.costStep * currentLevel;
}

export interface MetaData {
  gold: number;
  unlocked: string[];
  perma: Record<string, number>;
}

const KEY = 'animal-survivors:meta:v2';

export function loadMeta(): MetaData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<MetaData>;
      return {
        gold: data.gold ?? 0,
        unlocked: data.unlocked ?? ['matt'],
        perma: data.perma ?? {},
      };
    }
  } catch {
    /* Ignore corrupted data */
  }
  return { gold: 0, unlocked: ['matt'], perma: {} };
}

export function saveMeta(meta: MetaData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* Ignore write failures */
  }
}

/** Compute a run's starting stats from character + permanent upgrades */
export function computeStartRunState(characterId: string, perma: Record<string, number>): RunState {
  const s = createRunState();
  getCharacter(characterId).apply(s);

  const might = perma.might ?? 0;
  const haste = perma.haste ?? 0;
  const vigor = perma.vigor ?? 0;
  const swift = perma.swift ?? 0;

  s.damage += might;
  s.fireInterval *= Math.pow(0.94, haste);
  s.maxHp += 20 * vigor;
  s.moveSpeed *= Math.pow(1.05, swift);
  return s;
}

/** Gold-bonus multiplier (Greed) */
export function goldMultiplier(perma: Record<string, number>): number {
  return 1 + 0.15 * (perma.greed ?? 0);
}
