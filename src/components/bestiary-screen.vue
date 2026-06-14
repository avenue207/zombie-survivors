<template>
  <div class="absolute inset-0 overflow-auto text-white">
    <background-polygons />

    <div class="relative mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div class="flex items-center gap-3 pt-4">
        <button
          class="rounded-full bg-white/10 px-4 py-2 font-black backdrop-blur-md transition hover:bg-white/20 active:scale-95"
          @click="emit('back')"
        >
          ← Back
        </button>
        <h1 class="text-3xl font-black tracking-wider">🧟 Enemy Bestiary</h1>
      </div>

      <!-- Enemies -->
      <div>
        <div class="mb-2 text-lg font-black">Normal Zombie</div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="z in zombieInfo"
            :key="z.name"
            class="flex flex-col items-center gap-1 rounded-2xl bg-white/5 p-3 text-center ring-1 ring-white/10"
          >
            <img v-if="modelThumbs[z.model]" :src="modelThumbs[z.model]" class="h-24 w-24 rounded-xl" :alt="z.name" />
            <span v-else class="flex h-24 w-24 items-center justify-center text-5xl">🧟</span>
            <div class="font-black">{{ z.name }}</div>
            <div class="text-[0.72rem] font-bold text-emerald-300/80">{{ z.role }}</div>
            <div class="text-[0.68rem] leading-snug text-white/55">{{ z.desc }}</div>
          </div>
        </div>
      </div>

      <!-- Boss -->
      <div>
        <div class="mb-2 text-lg font-black">Zombie bosses (appear in order)</div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            v-for="(b, i) in bossInfo"
            :key="b.name"
            class="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
          >
            <img v-if="modelThumbs[b.model]" :src="modelThumbs[b.model]" class="h-20 w-20 shrink-0 rounded-xl" :alt="b.name" />
            <span v-else class="flex h-20 w-20 shrink-0 items-center justify-center text-4xl">🧟‍♂️</span>
            <div class="min-w-0">
              <div class="font-black">{{ i + 1 }}. {{ b.name }}</div>
              <div class="text-xs font-bold text-rose-300/80">Attack:{{ b.skill }}</div>
              <div class="text-[0.7rem] leading-snug text-white/55">{{ b.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BackgroundPolygons from './background-polygons.vue';
import { ZOMBIE_INFO } from '../game/zombie-horde';
import { BOSS_INFO } from '../game/boss';
import { renderModelThumbnails } from '../game/model-thumbs';

const emit = defineEmits<{ (e: 'back'): void }>();

const zombieInfo = ZOMBIE_INFO;
const bossInfo = BOSS_INFO;
const modelThumbs = ref<Record<string, string>>({});

onMounted(() => {
  const models = [...ZOMBIE_INFO.map((z) => z.model), ...BOSS_INFO.map((b) => b.model)];
  void renderModelThumbnails(models, (model, url) => {
    modelThumbs.value = { ...modelThumbs.value, [model]: url };
  });
});
</script>
