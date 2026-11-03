<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Window from '../components/Window.vue';

const router = useRouter();

const textContent = ref('');
const fontSize = ref(14);
const saved = ref(true);

const textareaStyle = computed(() => ({
  fontSize: fontSize.value + 'px',
  fontFamily: "'Courier New', 'Consolas', 'SimHei', monospace",
  lineHeight: '1.5',
}));

const charCount = computed(() => textContent.value.length);
const lineCount = computed(() => {
  if (!textContent.value) return 0;
  return textContent.value.split('\n').length;
});

onMounted(() => {
  const saved_content = localStorage.getItem('notepad-content');
  if (saved_content) {
    textContent.value = saved_content;
    saved.value = true;
  }
});

function handleSave() {
  localStorage.setItem('notepad-content', textContent.value);
  saved.value = true;
}

function handleNew() {
  if (textContent.value && !saved.value) {
    if (!confirm('内容尚未保存，确定要新建吗？')) return;
  }
  textContent.value = '';
  localStorage.removeItem('notepad-content');
  saved.value = true;
}

function onInput() {
  saved.value = false;
}
</script>

<template>
  <Window
    title="记事本 - 未命名"
    icon="fa fa-pencil-square-o"
    :isOpen="true"
    :isActive="true"
    @close="router.push('/')"
  >
    <div class="flex flex-col h-full min-h-0 gap-0">
      <!-- Toolbar -->
      <div class="flex items-center gap-2 px-2 py-1.5 border-b border-black/5 shrink-0 flex-wrap">
        <span class="text-[11px] text-[#5d5d5d] shrink-0">字号:</span>
        <select
          v-model.number="fontSize"
          class="text-[12px] px-1.5 py-0.5 bg-white border border-black/15 rounded outline-none text-[#1a1a1a] cursor-pointer"
          style="font-family: 'Segoe UI', 'Microsoft YaHei UI', sans-serif;"
        >
          <option v-for="s in [10, 12, 14, 16, 18, 20, 24]" :key="s" :value="s">{{ s }}px</option>
        </select>
        <button
          @click="handleNew"
          class="text-[12px] px-3 py-1 rounded-md border border-black/10 bg-[#fdfdfd] text-[#1a1a1a] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer"
          style="font-family: 'Segoe UI', 'Microsoft YaHei UI', sans-serif;"
        >
          新建
        </button>
        <button
          @click="handleSave"
          class="text-[12px] px-3 py-1 rounded-md border border-black/10 bg-[#fdfdfd] text-[#1a1a1a] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer"
          style="font-family: 'Segoe UI', 'Microsoft YaHei UI', sans-serif;"
        >
          保存
        </button>
        <span v-if="!saved" class="text-[10px] text-[#c42b1c]">● 未保存</span>
        <span v-else class="text-[10px] text-[#0a7a0a]">已保存</span>
      </div>

      <!-- Textarea -->
      <textarea
        v-model="textContent"
        @input="onInput"
        class="flex-1 w-full resize-none outline-none p-2 bg-white text-[#1a1a1a] min-h-0 border-0"
        :style="textareaStyle"
        placeholder="在此输入..."
        spellcheck="false"
      ></textarea>

      <!-- Status -->
      <div class="flex px-2 py-1 text-[10px] text-[#8a8a8a] border-t border-black/5 shrink-0 select-none gap-3">
        <span>字符: {{ charCount }}</span>
        <span>行数: {{ lineCount }}</span>
      </div>
    </div>
  </Window>
</template>
