/** Difficulty settings: scale enemy/boss strength and rewards by multipliers. Easy = baseline (all ×1). */
export interface Difficulty {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  color: string;
  /** Enemy-HP multiplier */
  enemyHp: number;
  /** Enemy-speed multiplier */
  enemySpeed: number;
  /** Contact-damage multiplier (minions and boss) */
  enemyContact: number;
  /** Boss-HP multiplier */
  bossHp: number;
  /** Over-time ramp acceleration multiplier */
  growth: number;
  /** Gold-reward multiplier */
  goldReward: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', name: 'Easy', emoji: '😀', color: '#7ec850', desc: 'Standard experience, good for learning the controls', enemyHp: 1, enemySpeed: 1, enemyContact: 1, bossHp: 1, growth: 1, goldReward: 1 },
  { id: 'normal', name: 'Normal', emoji: '🙂', color: '#c6ff7a', desc: 'Enemies are tougher and hit harder', enemyHp: 1.5, enemySpeed: 1.1, enemyContact: 1.3, bossHp: 1.5, growth: 1.2, goldReward: 1.5 },
  { id: 'hard', name: 'Hard', emoji: '😬', color: '#ffd23f', desc: 'Noticeably tough — you will need a good build', enemyHp: 2.2, enemySpeed: 1.2, enemyContact: 1.6, bossHp: 2.2, growth: 1.5, goldReward: 2.2 },
  { id: 'nightmare', name: 'Nightmare', emoji: '😱', color: '#ff8a3d', desc: 'High-pressure, fast pace — tests your limits', enemyHp: 3.5, enemySpeed: 1.35, enemyContact: 2, bossHp: 3.5, growth: 1.8, goldReward: 3.5 },
  { id: 'hell', name: 'Hell', emoji: '💀', color: '#ff5a5a', desc: 'A cruel, ultimate challenge', enemyHp: 5, enemySpeed: 1.5, enemyContact: 2.6, bossHp: 5, growth: 2.2, goldReward: 5 },
];

export function getDifficulty(id: string): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0];
}
