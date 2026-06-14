<template>
  <div class="absolute inset-0 overflow-hidden" :style="bgStyle">
    <div
      v-for="s in shapes"
      :key="s.id"
      class="absolute shape"
      :style="s.style"
    />
    <!-- Vignette, focusing the center -->
    <div class="absolute inset-0" style="background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)" />
  </div>
</template>

<script setup lang="ts">
interface ShapeData {
  id: number;
  style: Record<string, string>;
}

/** Apocalypse palette: zombie green, dark green, blood red, rust brown, dark slate */
const COLORS = ['#3f7a3a', '#5b8c3a', '#7a2b2b', '#9c5a2b', '#2b3a44', '#4a6b2e'];
const SHAPES = ['circle', 'square', 'triangle'] as const;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

const bgStyle = {
  background: 'linear-gradient(160deg, #0a0f0a 0%, #142016 45%, #0c1118 100%)',
};

const shapes: ShapeData[] = Array.from({ length: 22 }, (_, i) => {
  const size = rand(2, 11);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const base: Record<string, string> = {
    left: `${rand(-5, 100)}%`,
    top: `${rand(-5, 100)}%`,
    width: `${size}rem`,
    height: `${size}rem`,
    opacity: `${rand(0.12, 0.3)}`,
    background: shape === 'triangle' ? 'transparent' : color,
    transform: `rotate(${rand(0, 360)}deg)`,
    animationDuration: `${rand(14, 34)}s`,
    animationDelay: `${-rand(0, 20)}s`,
  };
  if (shape === 'circle') base.borderRadius = '9999px';
  else if (shape === 'square') base.borderRadius = '0.6rem';
  else {
    base.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
    base.background = color;
  }
  return { id: i, style: base };
});
</script>

<style scoped>
.shape {
  animation-name: drift;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform;
}
@keyframes drift {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  50% {
    transform: translate(-3rem, -4rem) rotate(40deg);
  }
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}
</style>
