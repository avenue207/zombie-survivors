<template>
  <div class="absolute inset-0 overflow-auto text-white">
    <background-polygons />

    <div class="relative mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div class="flex items-center gap-3 pt-4">
        <button
          class="rounded-full bg-white/10 px-4 py-2 font-black backdrop-blur-md transition hover:bg-white/20 active:scale-95"
          @click="emit('back')"
        >
          ← Back
        </button>
        <h1 class="text-3xl font-black tracking-wider">🏆 Leaderboard</h1>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-black"
          :class="isGlobal ? 'bg-lime-400 text-black' : 'bg-white/15 text-white/70'"
        >
          {{ isGlobal ? 'Global' : 'Local' }}
        </span>
      </div>

      <!-- Difficulty tab -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="rounded-full px-3 py-1 text-sm font-black backdrop-blur-md transition active:scale-95"
          :class="selected === t.id ? 'bg-amber-400 text-black' : 'bg-black/40 text-white/70 hover:bg-black/60'"
          @click="selectTab(t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="records.length === 0" class="rounded-2xl bg-white/5 p-8 text-center text-white/60">
        No records on this difficulty yet — go set one!
      </div>

      <div v-else class="overflow-hidden rounded-2xl bg-black/40 backdrop-blur-md ring-1 ring-white/10">
        <div class="grid grid-cols-[2.5rem_1fr_4.5rem_3.5rem_3rem] gap-2 border-b border-white/10 px-4 py-2 text-xs font-black text-white/50">
          <span>#</span>
          <span>Player</span>
          <span class="text-right">Survive</span>
          <span class="text-right">Kills</span>
          <span class="text-right">Level</span>
        </div>
        <div
          v-for="(r, i) in records"
          :key="i"
          class="grid grid-cols-[2.5rem_1fr_4.5rem_3.5rem_3rem] items-center gap-2 px-4 py-2 text-sm"
          :class="i % 2 ? 'bg-white/0' : 'bg-white/5'"
        >
          <span class="font-black" :class="rankClass(i)">{{ i + 1 }}</span>
          <span class="min-w-0 truncate font-bold">
            {{ r.name || 'Player' }}
            <span class="text-[0.66rem] font-normal text-white/45">{{ r.character }}</span>
            <span v-if="selected === ''" class="ml-1 text-[0.62rem]" :style="{ color: diffColor(r.difficulty) }">
              {{ diffLabel(r.difficulty) }}
            </span>
            <span v-if="r.won" class="ml-1 rounded bg-amber-400/90 px-1 text-[0.6rem] font-black text-black">Clear</span>
          </span>
          <span class="text-right font-mono">{{ timeText(r.time) }}</span>
          <span class="text-right">{{ r.kills }}</span>
          <span class="text-right">{{ r.level }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BackgroundPolygons from './background-polygons.vue';
import { loadRecords, type RunRecord } from '../game/leaderboard';
import { fetchLeaderboard } from '../game/api';
import { DIFFICULTIES, getDifficulty } from '../game/difficulty';

const emit = defineEmits<{ (e: 'back'): void }>();

const tabs = [{ id: '', label: 'All' }, ...DIFFICULTIES.map((d) => ({ id: d.id, label: `${d.emoji} ${d.name}` }))];
const selected = ref('');
const records = ref<RunRecord[]>([]);
const isGlobal = ref(false);

async function refresh() {
  const diff = selected.value;
  /** Show local first (filtered by difficulty), override once the global board loads */
  records.value = loadRecords().filter((r) => !diff || r.difficulty === diff);
  isGlobal.value = false;
  const global = await fetchLeaderboard(10, diff || undefined);
  if (global) {
    records.value = global;
    isGlobal.value = true;
  }
}
function selectTab(id: string) {
  selected.value = id;
  void refresh();
}
onMounted(refresh);

function timeText(t: number) {
  const total = Math.floor(t);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}
function rankClass(i: number) {
  return ['text-amber-300', 'text-slate-200', 'text-orange-400'][i] ?? 'text-white/50';
}
function diffLabel(id: string) {
  const d = getDifficulty(id || 'easy');
  return `${d.emoji}${d.name}`;
}
function diffColor(id: string) {
  return getDifficulty(id || 'easy').color;
}
</script>
