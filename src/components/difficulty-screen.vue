<template>
  <div class="absolute inset-0 flex flex-col items-center justify-center overflow-auto text-white">
    <background-polygons />

    <div class="relative flex w-full max-w-3xl flex-col gap-5 p-6">
      <div class="flex items-center gap-3">
        <button
          class="rounded-full bg-white/10 px-4 py-2 font-black backdrop-blur-md transition hover:bg-white/20 active:scale-95"
          @click="emit('back')"
        >
          ← Back
        </button>
        <h1 class="text-3xl font-black tracking-wider">Choose difficulty</h1>
      </div>

      <div class="flex flex-col gap-3">
        <button
          v-for="d in difficulties"
          :key="d.id"
          class="flex items-center gap-4 rounded-2xl p-4 text-left ring-1 ring-white/10 transition hover:scale-[1.02]"
          :style="{ background: `linear-gradient(90deg, ${d.color}22, rgba(255,255,255,0.05))` }"
          @click="emit('select', d.id)"
        >
          <span class="text-4xl">{{ d.emoji }}</span>
          <div class="flex-1">
            <div class="text-xl font-black" :style="{ color: d.color }">{{ d.name }}</div>
            <div class="text-sm text-white/60">{{ d.desc }}</div>
          </div>
          <div class="text-right text-xs text-white/55">
            <div>Enemies ×{{ d.enemyHp }} blood</div>
            <div>Gold ×{{ d.goldReward }}</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BackgroundPolygons from './background-polygons.vue';
import { DIFFICULTIES } from '../game/difficulty';

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'back'): void;
}>();

const difficulties = DIFFICULTIES;
</script>
