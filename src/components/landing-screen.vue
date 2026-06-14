<template>
  <div class="absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-white">
    <background-polygons />

    <div class="relative flex flex-col items-center gap-8 px-6">
      <!-- Title -->
      <div class="text-center">
        <h1
          class="text-6xl font-black tracking-widest sm:text-8xl"
          style="color: #c6ff7a; paint-order: stroke fill; -webkit-text-stroke: 6px #14210f; text-shadow: 0 6px 0 rgba(0,0,0,0.35)"
        >
          Zombie Survivors
        </h1>
        <p class="mt-3 text-base font-bold tracking-wide text-white/70 sm:text-lg">
          Survive the endless zombie horde・3D survivors-like roguelite
        </p>
        <!-- Live online count -->
        <div
          v-if="online !== null"
          class="mt-4 inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-1.5 text-sm font-bold backdrop-blur-md ring-1 ring-lime-400/20"
        >
          <span class="relative flex h-2.5 w-2.5">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime-400"></span>
          </span>
          <span class="text-lime-300">{{ online }}</span>
          <span class="text-white/60">playing now</span>
        </div>
      </div>

      <!-- Nickname (required to start) -->
      <div class="w-full max-w-xs">
        <input
          v-model="name"
          maxlength="16"
          placeholder="Enter a nickname to start"
          class="w-full rounded-full bg-black/30 px-5 py-2 text-center font-bold text-white outline-none ring-1 backdrop-blur-md placeholder:text-white/40"
          :class="canStart ? 'ring-white/15' : 'ring-rose-400/50'"
          @change="saveName"
          @blur="saveName"
        />
        <p v-if="!canStart" class="mt-1 text-center text-xs text-rose-300/80">Please enter a nickname first</p>
      </div>

      <!-- Buttons -->
      <div class="flex w-full max-w-xs flex-col gap-4">
        <button
          class="portal-btn portal-btn--play"
          :class="{ 'portal-btn--disabled': !canStart }"
          :disabled="!canStart"
          @click="onStart"
        >
          ▶ Game start
        </button>
        <button class="portal-btn" @click="emit('leaderboard')">🏆 Leaderboard</button>
        <button class="portal-btn" @click="emit('bestiary')">🧟 Enemy Bestiary</button>
        <button class="portal-btn" @click="emit('messages')">💬 Message Board</button>
      </div>

      <!-- Cumulative stats (local) -->
      <div class="flex gap-3 sm:gap-6">
        <div class="rounded-2xl bg-black/30 px-4 py-2 text-center backdrop-blur-md sm:px-6">
          <div class="text-2xl font-black text-lime-300 sm:text-3xl">{{ stats.plays }}</div>
          <div class="text-xs text-white/55">Games played</div>
        </div>
        <div class="rounded-2xl bg-black/30 px-4 py-2 text-center backdrop-blur-md sm:px-6">
          <div class="text-2xl font-black text-lime-300 sm:text-3xl">{{ timeText }}</div>
          <div class="text-xs text-white/55">Accumulated time</div>
        </div>
        <div class="rounded-2xl bg-black/30 px-4 py-2 text-center backdrop-blur-md sm:px-6">
          <div class="text-2xl font-black text-lime-300 sm:text-3xl">{{ stats.totalKills }}</div>
          <div class="text-xs text-white/55">Total kills</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import BackgroundPolygons from './background-polygons.vue';
import { loadStats, getPlayerName, setPlayerName, type GlobalStats } from '../game/leaderboard';
import { fetchStats, fetchOnline } from '../game/api';

const emit = defineEmits<{
  (e: 'start'): void;
  (e: 'leaderboard'): void;
  (e: 'bestiary'): void;
  (e: 'messages'): void;
}>();

const name = ref(getPlayerName());
const canStart = computed(() => name.value.trim().length > 0);
function saveName() {
  setPlayerName(name.value);
  name.value = getPlayerName();
}
function onStart() {
  if (!canStart.value) return;
  saveName();
  emit('start');
}

/** Show local stats first, override once global loads */
const stats = reactive<GlobalStats>(loadStats());

/** Current player count (polled every 20s; on failure keep the last value/hidden) */
const online = ref<number | null>(null);
let onlineTimer: number | undefined;
async function refreshOnline() {
  const n = await fetchOnline();
  if (n !== null) online.value = n;
}

onMounted(async () => {
  void refreshOnline();
  onlineTimer = window.setInterval(refreshOnline, 20000);
  const global = await fetchStats();
  if (global) Object.assign(stats, global);
});
onBeforeUnmount(() => {
  if (onlineTimer !== undefined) clearInterval(onlineTimer);
});

const timeText = computed(() => {
  const total = Math.floor(stats.totalTime);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
});
</script>

<style scoped>
.portal-btn {
  padding: 1rem 1.5rem;
  border-radius: 9999px;
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: white;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(6px);
  border: 2px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0, 1.65, 1, 1.65), background 0.18s;
}
.portal-btn:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: scale(1.04);
}
.portal-btn:active {
  transform: scale(0.97) rotate(-1deg);
}
.portal-btn--play {
  background: linear-gradient(180deg, #7ec850, #4a9c2e);
  border-color: rgba(198, 255, 122, 0.5);
  color: #08210a;
}
.portal-btn--play:hover {
  background: linear-gradient(180deg, #8fdc5e, #58b237);
}
.portal-btn--disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.5);
}
.portal-btn--disabled:hover {
  transform: none;
  background: linear-gradient(180deg, #7ec850, #4a9c2e);
}
</style>
