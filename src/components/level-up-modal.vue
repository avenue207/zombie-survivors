<template>
  <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
    <div class="w-[min(92vw,40rem)] rounded-3xl bg-[#1a2236] p-6 text-white shadow-2xl ring-1 ring-white/10">
      <div class="mb-4 text-center">
        <div class="text-sm font-bold tracking-widest text-amber-300">Level up! LV {{ level }}</div>
        <div class="text-2xl font-black">Choose one upgrade</div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="(c, i) in choices"
          :key="c.id"
          class="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-5 text-center ring-1 ring-white/10 transition hover:scale-[1.03] hover:bg-white/10 hover:ring-amber-300/60 active:scale-95"
          @click="emit('choose', i)"
        >
          <span class="text-5xl">{{ c.emoji }}</span>
          <span class="text-lg font-black">{{ c.name }}</span>
          <span class="text-sm text-white/70">{{ c.desc }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChoiceView } from '../game/game';

defineProps<{ level: number; choices: ChoiceView[] }>();
const emit = defineEmits<{ (e: 'choose', index: number): void }>();
</script>
