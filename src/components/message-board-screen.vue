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
        <h1 class="text-3xl font-black tracking-wider">💬 Message Board</h1>
      </div>

      <!-- Post a message -->
      <div class="flex flex-col gap-2 rounded-2xl bg-black/40 p-4 backdrop-blur-md ring-1 ring-white/10">
        <input
          v-model="name"
          maxlength="16"
          placeholder="Nickname"
          class="rounded-full bg-black/40 px-4 py-2 text-sm font-bold text-white outline-none ring-1 ring-white/10 placeholder:text-white/40"
        />
        <textarea
          v-model="text"
          maxlength="200"
          rows="2"
          placeholder="Leave a message for everyone…"
          class="resize-none rounded-2xl bg-black/40 px-4 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/40"
        ></textarea>
        <div class="flex items-center justify-between">
          <span class="text-xs text-white/40">{{ text.length }}/200</span>
          <button
            class="rounded-full bg-lime-500 px-5 py-1.5 text-sm font-black text-black transition hover:bg-lime-400 active:scale-95 disabled:opacity-40"
            :disabled="!canSend || sending"
            @click="onSend"
          >
            {{ sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
        <p v-if="error" class="text-xs text-rose-300/80">{{ error }}</p>
      </div>

      <div v-if="loading" class="rounded-2xl bg-white/5 p-8 text-center text-white/50">Loading…</div>
      <div v-else-if="messages.length === 0" class="rounded-2xl bg-white/5 p-8 text-center text-white/60">
        No messages yet — be the first!
      </div>

      <div v-else class="flex flex-col gap-2">
        <div
          v-for="m in messages"
          :key="m.id"
          class="rounded-2xl bg-black/40 p-3 backdrop-blur-md ring-1 ring-white/10"
        >
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate font-black text-lime-300">{{ m.name || 'Anonymous' }}</span>
            <span class="shrink-0 text-[0.66rem] text-white/40">{{ timeText(m.at) }}</span>
          </div>
          <p class="mt-1 whitespace-pre-wrap break-words text-sm text-white/85">{{ m.text }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BackgroundPolygons from './background-polygons.vue';
import { fetchMessages, postMessage, type Message } from '../game/api';
import { getPlayerName, setPlayerName } from '../game/leaderboard';

const emit = defineEmits<{ (e: 'back'): void }>();

const name = ref(getPlayerName());
const text = ref('');
const messages = ref<Message[]>([]);
const loading = ref(true);
const sending = ref(false);
const error = ref('');

const canSend = computed(() => name.value.trim().length > 0 && text.value.trim().length > 0);

async function refresh() {
  const list = await fetchMessages();
  if (list) messages.value = list;
  loading.value = false;
}
onMounted(refresh);

async function onSend() {
  if (!canSend.value || sending.value) return;
  sending.value = true;
  error.value = '';
  setPlayerName(name.value); // Remember the nickname, shared with the leaderboard
  const ok = await postMessage(name.value.trim(), text.value.trim());
  sending.value = false;
  if (ok) {
    text.value = '';
    await refresh();
  } else {
    error.value = 'Send failed, please try again later';
  }
}

function timeText(at: number) {
  const d = new Date(at);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>
