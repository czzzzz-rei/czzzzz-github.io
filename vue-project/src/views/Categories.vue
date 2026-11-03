<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Window from '../components/Window.vue';
import { desktopTheme, setTheme, THEMES, type DesktopTheme } from '../settings';

const router = useRouter();

const categories = ref([
  { id: 'java', title: 'Java', icon: 'fa fa-coffee', color: 'text-orange-500' },
  { id: 'spring', title: 'Spring', icon: 'fa fa-leaf', color: 'text-green-500' },
  { id: 'database', title: 'Database', icon: 'fa fa-database', color: 'text-blue-500' },
  { id: 'frontend', title: 'Frontend', icon: 'fa fa-code', color: 'text-pink-500' },
  { id: 'vue', title: 'Vue', icon: 'fa fa-diamond', color: 'text-emerald-400' },
  { id: 'devops', title: 'DevOps', icon: 'fa fa-server', color: 'text-purple-500' },
  { id: 'essay', title: '随笔', icon: 'fa fa-pencil', color: 'text-sky-300' },
]);

const navigateTo = (path: string) => {
  if (path.startsWith('http')) {
    window.open(path, '_blank');
  } else {
    router.push(path);
  }
};

function pickTheme(t: DesktopTheme): void {
  setTheme(t);
}

function petGoHome(): void {
  window.dispatchEvent(new CustomEvent('pet-go-home'));
}

function openSysProps(): void {
  window.dispatchEvent(new CustomEvent('open-sysprops'));
}

// 恢复默认设置：清空主题/图标布局/桌宠位置等本机自定义，回到出厂状态
function resetSettings(): void {
  if (!window.confirm('确定恢复所有桌面设置为默认吗？（主题、图标布局、桌宠位置将被重置）')) return;
  for (const k of ['desktop-theme', 'icon-layout', 'qq-pet-state', 'screensaver-ms']) {
    try { localStorage.removeItem(k); } catch { /* 忽略 */ }
  }
  location.reload();
}
</script>

<template>
    <Window
      title="控制面板"
      icon="fa fa-cog"
      :isOpen="true"
      :isActive="true"
      @close="router.push('/')"
    >
      <!-- Address Bar -->
      <div class="flex items-center gap-2 px-2 py-1 border-b border-black/5 mb-2">
        <span class="text-xs text-[#5d5d5d]">地址(D)</span>
        <div class="flex-1 bg-white border border-[#e5e5e5] rounded-md px-2 py-1 text-sm flex items-center gap-2 text-[#1a1a1a]">
            <i class="fa fa-folder-open text-yellow-400"></i>
            C:\控制面板\分类
        </div>
      </div>

      <div class="grid grid-cols-4 md:grid-cols-6 gap-4">
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="flex flex-col items-center gap-1 cursor-pointer group w-20"
          @click="navigateTo('/all-notes?category=' + cat.id)"
        >
          <div class="w-12 h-12 flex justify-center items-center text-[40px] group-hover:scale-110 transition-transform" :class="cat.color" style="filter: drop-shadow(1px 1px 0 rgba(0,0,0,0.2));">
            <i :class="cat.icon"></i>
          </div>
          <span class="text-xs text-center group-hover:bg-navy group-hover:text-white px-1 border border-transparent group-hover:border-dotted group-hover:border-white w-full rounded-sm">
            {{ cat.title }}
          </span>
        </div>
      </div>

      <!-- 系统设置 -->
      <div class="mt-4 pt-3 border-t border-black/10">
        <div class="text-xs text-[#5d5d5d] font-semibold mb-2">
          <i class="fa fa-sliders mr-1 text-[#0067c0]"></i>系统设置
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span class="text-[#5d5d5d]">显示属性：</span>
          <button
            v-for="(t, id) in THEMES"
            :key="id"
            @click="pickTheme(id as DesktopTheme)"
            class="px-2.5 py-1 rounded-md border transition-colors cursor-pointer"
            :class="desktopTheme === id
              ? 'bg-[#e8f1fb] border-[#0067c0] text-[#0067c0] font-semibold'
              : 'bg-[#fdfdfd] border-black/10 text-[#1a1a1a] hover:bg-[#f6f6f6]'"
          >
            <span v-if="t.bg" class="inline-block w-2.5 h-2.5 mr-1 align-middle rounded-sm border border-black/20" :style="{ background: t.bg }"></span>
            {{ t.name }}
          </button>
          <span class="w-full"></span>
          <button
            @click="petGoHome"
            class="px-2.5 py-1 rounded-md border border-black/10 bg-[#fdfdfd] text-[#1a1a1a] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer"
          >
            <i class="fa fa-home mr-1 text-[#0067c0]"></i>桌宠回任务栏
          </button>
          <button
            @click="openSysProps"
            class="px-2.5 py-1 rounded-md border border-black/10 bg-[#fdfdfd] text-[#1a1a1a] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer"
          >
            <i class="fa fa-info-circle mr-1 text-[#0067c0]"></i>系统属性
          </button>
          <button
            @click="resetSettings"
            class="px-2.5 py-1 rounded-md border border-black/10 bg-[#fdfdfd] text-[#1a1a1a] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer"
          >
            <i class="fa fa-undo mr-1 text-[#0067c0]"></i>恢复默认设置
          </button>
        </div>
      </div>

      <div class="mt-3 pt-2 text-xs text-[#8a8a8a] border-t border-black/5">
        {{ categories.length }} 个分类
      </div>
    </Window>
</template>
