<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  label: string;
  iconClass?: string;
  iconSrc?: string;
  color?: string;
  onClick?: () => void;
}>();

const isPressed = ref(false);
</script>

<template>
  <div
    class="group flex flex-col items-center gap-1 w-[88px] cursor-pointer select-none"
    @click="onClick"
    @mousedown="isPressed = true"
    @mouseup="isPressed = false"
    @mouseleave="isPressed = false"
  >
    <div
      class="w-12 h-12 text-[36px] flex justify-center items-center transition duration-100"
      :class="[
        color || 'text-white',
        isPressed ? 'scale-90 opacity-70' : 'group-hover:opacity-80'
      ]"
    >
      <img v-if="iconSrc" :src="iconSrc" class="w-full h-full object-contain" />
      <i v-else-if="iconClass" :class="iconClass"></i>
    </div>
    <span
      class="text-white text-xs px-1.5 py-0.5 max-w-full break-words text-center leading-tight rounded"
      style="text-shadow: 0 1px 2px rgba(0,0,0,0.85);"
      :class="isPressed
        ? 'bg-[#0067c0]/70'
        : 'bg-transparent group-hover:bg-[#0067c0]/45 group-hover:ring-1 group-hover:ring-white/30'"
    >
      {{ label }}
    </span>
  </div>
</template>
