import type { RunState } from './upgrades';

export interface Character {
  id: string;
  name: string;
  emoji: string;
  /** Gold needed to unlock; 0 means unlocked by default */
  cost: number;
  /** One-line trait (label) */
  trait: string;
  /** Detailed description (stats and starting-attack mechanics) */
  desc: string;
  /** Body color (procedural shape fallback use) */
  bodyColor: [number, number, number];
  /** GLB Model path (procedural shape if none) */
  model?: string;
  /** Apply to starting RunState the character's differences */
  apply: (s: RunState) => void;
}

export const CHARACTERS: Character[] = [
  {
    id: 'matt',
    name: 'Matt',
    emoji: '🔫',
    cost: 0,
    trait: 'Balanced | Starting attack: Enhanced single shot',
    desc: 'Standard stats, no weaknesses, great for beginners. Starting damage +1, steady single shots; freely build any playstyle through upgrades.',
    bodyColor: [0.3, 0.45, 0.6],
    model: '/models/zombie/survivor_matt_armed.gltf',
    apply: (s) => {
      s.damage += 1;
    },
  },
  {
    id: 'lis',
    name: 'Lis',
    emoji: '👟',
    cost: 300,
    trait: 'Fast & Fragile | Starting attack: Triple-shot spread',
    desc: 'Move speed +20%, HP −25. Fires a three-shot fan spread from the start; strong up close, but fragile so keep moving.',
    bodyColor: [0.8, 0.4, 0.5],
    model: '/models/zombie/survivor_lis_armed.gltf',
    apply: (s) => {
      s.moveSpeed *= 1.2;
      s.maxHp -= 25;
      s.projectileCount = 3;
    },
  },
  {
    id: 'sam',
    name: 'Sam',
    emoji: '⚡',
    cost: 300,
    trait: 'Burst DPS | Starting attack: Hyper rapid-fire',
    desc: 'Fire interval −45%, HP −15. Rains bullets at extreme fire rate; explosive single-target DPS, brutal once you stack damage.',
    bodyColor: [0.85, 0.7, 0.3],
    model: '/models/zombie/survivor_sam_armed.gltf',
    apply: (s) => {
      s.fireInterval *= 0.55;
      s.maxHp -= 15;
    },
  },
  {
    id: 'shaun',
    name: 'Shaun',
    emoji: '🧲',
    cost: 200,
    trait: 'Wide Pickup | Starting attack: Orbiting axe',
    desc: 'Pickup range +70%, XP +20%, fastest leveling. Starts with an orbiting spinning axe for close protection.',
    bodyColor: [0.5, 0.6, 0.45],
    model: '/models/zombie/survivor_shaun_armed.gltf',
    apply: (s) => {
      s.pickupRadius *= 1.7;
      s.xpMultiplier *= 1.2;
      s.orbitalCount = 1;
    },
  },
  {
    id: 'shepherd',
    name: 'German Shepherd',
    emoji: '🐕',
    cost: 400,
    trait: 'Mobile Hound | Starting attack: Chain lightning',
    desc: 'Move speed +15%, range +15%, a mobile kiting build. Periodically casts chain lightning that auto-zaps and jumps between enemies.',
    bodyColor: [0.5, 0.35, 0.2],
    model: '/models/zombie/char_shepherd.gltf',
    apply: (s) => {
      s.moveSpeed *= 1.15;
      s.range *= 1.15;
      s.lightningCount = 1;
    },
  },
  {
    id: 'pug',
    name: 'Pug',
    emoji: '🐶',
    cost: 350,
    trait: 'Tank | Starting attack: Damage aura',
    desc: 'HP +40, move speed −10%, extremely tanky. Projects a damage aura that burns nearby zombies; great for diving into the horde.',
    bodyColor: [0.8, 0.7, 0.5],
    model: '/models/zombie/char_pug.gltf',
    apply: (s) => {
      s.maxHp += 40;
      s.moveSpeed *= 0.9;
      s.auraRadius = 4;
    },
  },
  {
    id: 'anne',
    name: 'Gunner Annie',
    emoji: '💥',
    cost: 400,
    trait: 'Area Bomber | Starting attack: Nova blast',
    desc: 'Starts with a periodic outward-expanding nova blast; excellent crowd clear, perfect for blowing up packs from the center.',
    bodyColor: [0.8, 0.35, 0.4],
    model: '/models/zombie/char_anne.gltf',
    apply: (s) => {
      s.novaRadius = 6;
      s.novaDamage += 2;
    },
  },
  {
    id: 'mako',
    name: 'Shark-Tooth Mako',
    emoji: '🦈',
    cost: 450,
    trait: 'Crit Burst | Starting attack: High crit',
    desc: '30% crit chance from the start; bullets often deal 2× damage. Vicious single-target burst, even scarier once you stack damage.',
    bodyColor: [0.4, 0.55, 0.7],
    model: '/models/zombie/char_mako.gltf',
    apply: (s) => {
      s.critChance = 0.3;
      s.damage += 1;
    },
  },
];

export function getCharacter(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
