<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { asset } from '../assets-base';

const isStartMenuOpen = ref(false);
const currentTime = ref('');
const todayStr = ref('');
const calendarOpen = ref(false);
const viewYear = ref(0);
const viewMonth = ref(0);   // 0-11

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 已固定应用网格（Win11 开始菜单；与桌面图标同源）
const pinnedApps = [
  { label: '我的电脑', to: '/computer', icon: asset('icons-win11/this-pc.png') },
  { label: '我的文档', to: '/all-notes', icon: asset('icons-win11/folder-docs.png') },
  { label: '控制面板', to: '/categories', icon: asset('icons-win11/settings.png') },
  { label: '记事本', to: '/notepad', icon: asset('icons-win11/notepad.png') },
  { label: '画图', to: '/paint', icon: asset('icons-win11/photo.png') },
  { label: '终端', to: '/terminal', icon: asset('icons-win11/terminal.png') },
  { label: '打字练习', to: '/typing', icon: asset('icons-win11/keyboard.png') },
  { label: '浏览器', to: 'https://github.com/czzzzz', icon: asset('icons-win11/globe.png') },
  { label: '计算器', to: '/calculator', icon: '' },
];

function fmtFullDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[d.getDay()]}`;
}

const updateClock = () => {
  const now = new Date();
  const t = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  if (t !== currentTime.value) currentTime.value = t;
  const full = fmtFullDate(now);
  if (full !== todayStr.value) todayStr.value = full;
};

const shortDate = computed(() => {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}`;
});

// ============ 日历 ============
interface CalendarCell { day: number; inMonth: boolean; isToday: boolean }

const calendarWeeks = computed<CalendarCell[][]>(() => {
  const y = viewYear.value, m = viewMonth.value;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();
  const now = new Date();
  const cells: CalendarCell[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, inMonth: false, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, isToday: d === now.getDate() && m === now.getMonth() && y === now.getFullYear() });
  }
  let nextLead = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({ day: nextLead++, inMonth: false, isToday: false });
  }
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
});

function prevMonth(): void {
  viewMonth.value--;
  if (viewMonth.value < 0) { viewMonth.value = 11; viewYear.value--; }
}

function nextMonth(): void {
  viewMonth.value++;
  if (viewMonth.value > 11) { viewMonth.value = 0; viewYear.value++; }
}

function toggleCalendar(): void {
  if (!calendarOpen.value) {
    const now = new Date();
    viewYear.value = now.getFullYear();
    viewMonth.value = now.getMonth();
  }
  calendarOpen.value = !calendarOpen.value;
}

let intervalId: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  updateClock();
  intervalId = setInterval(updateClock, 1000);
  document.addEventListener('click', closeStartMenuOutside);
});

onUnmounted(() => {
  clearInterval(intervalId);
  document.removeEventListener('click', closeStartMenuOutside);
});

const toggleStartMenu = (e: Event) => {
  e.stopPropagation();
  isStartMenuOpen.value = !isStartMenuOpen.value;
};

const handleMenuNavigate = (path: string) => {
  isStartMenuOpen.value = false;
  emit('navigate', path);
};

const handleFind = () => {
  isStartMenuOpen.value = false;
  emit('open-find');
};

const handlePinClick = (to: string) => {
  if (to.startsWith('http')) {
    isStartMenuOpen.value = false;
    emit('navigate', to);
  } else {
    handleMenuNavigate(to);
  }
};

const closeStartMenuOutside = (e: Event) => {
  const target = e.target as Node;
  const startMenu = document.getElementById('start-menu');
  const startBtn = document.getElementById('start-btn');
  if (startMenu && !startMenu.contains(target) && startBtn && !startBtn.contains(target)) {
    isStartMenuOpen.value = false;
  }
  const calendar = document.getElementById('taskbar-calendar');
  const clockBtn = document.getElementById('taskbar-clock');
  if (calendarOpen.value && calendar && !calendar.contains(target) && clockBtn && !clockBtn.contains(target)) {
    calendarOpen.value = false;
  }
};

const emit = defineEmits<{
  (e: 'activate-window', id: string): void;
  (e: 'navigate', path: string): void;
  (e: 'open-find'): void;
  (e: 'shutdown'): void;
}>();

defineProps<{
  openWindows: { id: string; title: string; icon: string; isActive: boolean }[];
}>();
</script>

<template>
  <!-- Start Menu：Win11 居中亚克力面板 -->
  <Transition name="start-menu">
    <div
      v-if="isStartMenuOpen"
      id="start-menu"
      class="absolute bottom-[56px] left-1/2 -translate-x-1/2 w-[560px] max-w-[94vw] rounded-lg border border-black/[0.06] bg-[rgba(243,243,243,0.97)] shadow-[0_16px_48px_rgba(0,0,0,0.28),0_2px_8px_rgba(0,0,0,0.14)] flex flex-col z-[60] max-h-[calc(100vh-70px)] overflow-y-auto"
    >
      <!-- 搜索框（点击唤出全局查找） -->
      <div class="px-6 pt-5 pb-3">
        <div
          class="h-8 rounded-full bg-white border border-black/10 flex items-center px-3 gap-2 text-[12px] text-gray-500 cursor-text hover:border-[#0067c0]"
          @click="handleFind"
        >
          <i class="fa fa-search text-[11px]"></i>
          <span>在这里输入你要查找的内容</span>
        </div>
      </div>
      <!-- 已固定应用网格 -->
      <div class="px-6 pb-2 flex items-center justify-between text-[12px] text-gray-700">
        <span class="font-semibold">已固定</span>
        <button class="text-[11px] px-2 py-0.5 rounded hover:bg-black/5" @click="handleFind">
          所有应用 <i class="fa fa-angle-right ml-0.5"></i>
        </button>
      </div>
      <div class="px-4 grid grid-cols-6 gap-1 pb-3">
        <div v-for="m in pinnedApps" :key="m.label"
          class="flex flex-col items-center gap-1.5 py-3 rounded-md hover:bg-black/[0.05] cursor-pointer"
          @click="m.to === '__find__' ? handleFind() : handlePinClick(m.to)"
        >
          <img v-if="m.icon" :src="m.icon" class="w-8 h-8 object-contain" :alt="m.label" />
          <i v-else class="fa fa-calculator text-[24px] text-[#0067c0] leading-none my-1"></i>
          <span class="text-[11px] text-gray-800 text-center leading-tight px-0.5">{{ m.label }}</span>
        </div>
      </div>
      <hr class="border-black/10 mx-6">
      <!-- 推荐 -->
      <div class="px-6 py-2 flex items-center justify-between text-[12px] text-gray-700">
        <span class="font-semibold">推荐的项目</span>
      </div>
      <div class="px-4 pb-2 grid grid-cols-2 gap-1">
        <div class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-black/[0.05] cursor-pointer" @click="handleMenuNavigate('/airplane')">
          <img :src="asset('icons-win11/star.png')" class="w-7 h-7 object-contain" alt="star">
          <div class="text-[12px]"><div>飞机大战</div><div class="text-[10px] text-gray-500">怀旧小游戏</div></div>
        </div>
        <div class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-black/[0.05] cursor-pointer" @click="handleMenuNavigate('/survivors')">
          <img :src="asset('icons-win11/shield.png')" class="w-7 h-7 object-contain" alt="shield">
          <div class="text-[12px]"><div>桌面保卫战</div><div class="text-[10px] text-gray-500">守一波基地</div></div>
        </div>
      </div>
      <!-- 底部：用户 + 关机 -->
      <div class="mt-auto flex items-center justify-between px-6 py-3 border-t border-black/10 bg-black/[0.02] rounded-b-lg">
        <div class="flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 cursor-pointer" @click="handlePinClick('https://github.com/czzzzz')">
          <img :src="asset('icons-win11/globe.png')" class="w-6 h-6 object-contain" alt="user">
          <span class="text-[12px] text-gray-800">CZ</span>
        </div>
        <button
          class="w-9 h-9 rounded-md hover:bg-black/5 active:bg-black/10 flex items-center justify-center"
          title="关机"
          @click="isStartMenuOpen = false; emit('shutdown')"
        >
          <i class="fa fa-power-off text-[14px] text-gray-700"></i>
        </button>
      </div>
    </div>
  </Transition>

  <!-- Taskbar：Win11 居中图标 + 毛玻璃 -->
  <footer class="h-12 bg-[rgba(243,243,243,0.85)] backdrop-blur-xl border-t border-white/40 flex items-center px-2 gap-1 z-50 fixed bottom-0 w-full select-none shadow-[0_-1px_8px_rgba(0,0,0,0.08)]">
    <!-- 左侧：桌面名号（装饰） -->
    <div class="hidden md:flex items-center gap-2 px-2 py-1 rounded-md hover:bg-black/5 cursor-default min-w-0">
      <i class="fa fa-cloud text-[15px] text-[#0067c0]"></i>
      <span class="text-[12px] text-gray-700 truncate">大肥鱼的桌面</span>
    </div>

    <!-- 中间：开始按钮 + 运行窗口 -->
    <div class="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 h-full">
      <button
        id="start-btn"
        @click="toggleStartMenu"
        class="w-10 h-10 rounded-md flex items-center justify-center hover:bg-black/[0.06] active:scale-90 transition-transform"
        :class="isStartMenuOpen ? 'bg-black/[0.08]' : ''"
        title="开始"
      >
        <img :src="asset('icons-win11/win11-logo.png')" class="w-6 h-6 object-contain" alt="win">
      </button>
      <div class="w-[1px] h-6 bg-black/10 mx-0.5"></div>
      <div class="flex items-center gap-1 overflow-hidden min-w-0">
        <button
          v-for="win in openWindows"
          :key="win.id"
          class="relative px-2 h-10 rounded-md flex items-center gap-1.5 min-w-0 max-w-[170px] cursor-pointer hover:bg-black/[0.06]"
          :class="win.isActive ? 'bg-black/[0.07]' : ''"
          :title="win.title"
          @click="emit('activate-window', win.id)"
        >
          <i :class="win.icon" class="shrink-0 text-[13px] text-[#0067c0]"></i>
          <span class="truncate text-[12px] text-gray-800">{{ win.title }}</span>
          <span
            class="absolute bottom-[3px] left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all"
            :class="win.isActive ? 'w-4 bg-[#0067c0]' : 'w-1.5 bg-gray-400'"
          ></span>
        </button>
      </div>
    </div>

    <!-- 右侧系统托盘：网络/音量/时钟（点击弹日历） -->
    <div class="ml-auto flex items-center h-full">
      <div class="flex items-center gap-2 px-2.5 h-9 rounded-md hover:bg-black/[0.06] cursor-default text-gray-700" title="网络 · 音量">
        <i class="fa fa-wifi text-[12px]"></i>
        <i class="fa fa-volume-up text-[12px]"></i>
      </div>
      <button
        id="taskbar-clock"
        @click.stop="toggleCalendar"
        :title="todayStr"
        class="px-2 h-9 rounded-md text-[12px] text-gray-800 cursor-pointer hover:bg-black/[0.06] leading-tight text-right"
        style="font-variant-numeric: tabular-nums;"
      >
        <div>{{ currentTime }}</div>
        <div class="text-[10px] text-gray-600">{{ shortDate }}</div>
      </button>
    </div>

    <!-- 日历弹窗：Win11 风格 -->
    <div
      v-if="calendarOpen"
      id="taskbar-calendar"
      class="absolute bottom-[56px] right-2 z-[60] w-[300px] rounded-lg border border-black/[0.06] bg-[rgba(243,243,243,0.97)] shadow-[0_16px_48px_rgba(0,0,0,0.28)] select-none"
      @click.stop
    >
      <div class="px-4 pt-3 pb-1 flex items-center justify-between">
        <span class="text-[13px] font-semibold text-gray-800">{{ viewYear }}年{{ viewMonth + 1 }}月</span>
        <div class="flex gap-1">
          <button @click="prevMonth" class="w-7 h-7 rounded hover:bg-black/[0.06] text-[11px] text-gray-700">▲</button>
          <button @click="nextMonth" class="w-7 h-7 rounded hover:bg-black/[0.06] text-[11px] text-gray-700">▼</button>
        </div>
      </div>
      <div class="px-4 pb-1 text-[11px] text-gray-500">{{ todayStr }}</div>
      <div class="p-3 pt-1">
        <div class="grid grid-cols-7 text-center text-[11px] text-gray-500 mb-1">
          <span v-for="d in WEEKDAYS" :key="d">{{ d }}</span>
        </div>
        <div class="grid grid-cols-7 text-center text-[12px]">
          <template v-for="(week, wi) in calendarWeeks" :key="wi">
            <span v-for="(cell, ci) in week" :key="wi + '-' + ci" class="py-[2px]">
              <span
                class="inline-flex w-7 h-7 items-center justify-center rounded-full cursor-default"
                :class="cell.isToday
                  ? 'bg-[#0067c0] text-white font-semibold'
                  : cell.inMonth ? 'text-gray-800 hover:bg-black/[0.06]' : 'text-gray-400'"
              >{{ cell.day }}</span>
            </span>
          </template>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.start-menu-enter-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.start-menu-leave-active {
  transition: opacity 0.1s ease-in, transform 0.1s ease-in;
}
.start-menu-enter-from {
  opacity: 0;
  transform: translate(-50%, 8px);
}
.start-menu-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
