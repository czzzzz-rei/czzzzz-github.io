<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  title: string;
  icon?: string;
  isOpen: boolean;
  isActive: boolean;
  defaultMaximized?: boolean;
  /** 固定尺寸窗口（如游戏）：禁止还原/最大化切换，杜绝小窗口下内容被遮挡 */
  fixedSize?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'minimize'): void;
  (e: 'maximize'): void;
  (e: 'focus'): void;
  (e: 'restore'): void;
}>();

const activeMenu = ref<string | null>(null);
const isMaximized = ref(false);
const isMinimized = ref(false);
const isSystemMenuOpen = ref(false);

// Draggable window state
const windowEl = ref<HTMLElement | null>(null);
const windowPos = ref<{ left: number; top: number } | null>(null);
const isDragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let dragOrigLeft = 0;
let dragOrigTop = 0;

watch(() => props.isActive, (active) => {
  if (active && isMinimized.value) {
    isMinimized.value = false;
    emit('restore');
  }
});

// 任务栏点击时 App.vue 会广播 win-restore：最小化的窗口弹回并通知内容层（如悬浮目录）
const onWinRestore = () => {
  if (isMinimized.value) {
    isMinimized.value = false;
    emit('restore');
  }
};

interface MenuItem {
  type?: 'separator';
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  action?: () => void;
}

const menus: { id: string; label: string; items: MenuItem[] }[] = [
  {
    id: 'file',
    label: '文件(<u>F</u>)',
    items: [
      { label: '新建(<u>N</u>)', shortcut: 'Ctrl+N', disabled: true },
      { label: '打开(<u>O</u>)...', shortcut: 'Ctrl+O', disabled: true },
      { type: 'separator' },
      { label: '保存(<u>S</u>)', shortcut: 'Ctrl+S', disabled: true },
      { label: '另存为(<u>A</u>)...', disabled: true },
      { type: 'separator' },
      { label: '页面设置(<u>U</u>)...', disabled: true },
      { label: '打印(<u>P</u>)...', shortcut: 'Ctrl+P', disabled: true },
      { type: 'separator' },
      { label: '关闭(<u>C</u>)', shortcut: 'Alt+F4', action: () => { closeMenu(); emit('close'); } },
    ]
  },
  {
    id: 'edit',
    label: '编辑(<u>E</u>)',
    items: [
      { label: '撤销(<u>U</u>)', shortcut: 'Ctrl+Z', disabled: true },
      { type: 'separator' },
      { label: '剪切(<u>T</u>)', shortcut: 'Ctrl+X', disabled: true },
      { label: '复制(<u>C</u>)', shortcut: 'Ctrl+C', disabled: true },
      { label: '粘贴(<u>P</u>)', shortcut: 'Ctrl+V', disabled: true },
      { type: 'separator' },
      { label: '全选(<u>A</u>)', shortcut: 'Ctrl+A', disabled: true },
    ]
  },
  {
    id: 'view',
    label: '查看(<u>V</u>)',
    items: [
      { label: '工具栏(<u>T</u>)', disabled: true, checked: true },
      { label: '状态栏(<u>S</u>)', checked: true, action: () => { closeMenu(); } },
      { type: 'separator' },
      { label: '大图标(<u>G</u>)', disabled: true },
      { label: '小图标(<u>M</u>)', disabled: true },
      { label: '列表(<u>L</u>)', disabled: true },
      { label: '详细资料(<u>D</u>)', disabled: true },
      { type: 'separator' },
      { label: '刷新(<u>R</u>)', shortcut: 'F5', action: () => { closeMenu(); window.location.reload(); } },
    ]
  },
  {
    id: 'help',
    label: '帮助(<u>H</u>)',
    items: [
      { label: '帮助主题(<u>H</u>)', disabled: true },
      { type: 'separator' },
      { label: '关于本程序(<u>A</u>)...', action: () => { closeMenu(); alert('CZ Blog v3.0\nWindows 11 Edition\n基于 Vue 3 + TypeScript + Vite\n\n© 2024 CZ. All rights reserved.'); } },
    ]
  },
];

const systemMenuItems = computed<MenuItem[]>(() => [
  { label: '还原(<u>R</u>)', disabled: !isMaximized.value || !!props.fixedSize, action: () => { closeSystemMenu(); isMaximized.value = false; } },
  { label: '移动(<u>M</u>)', disabled: true },
  { label: '大小(<u>S</u>)', disabled: true },
  { label: '最小化(<u>N</u>)', action: () => { closeSystemMenu(); emit('minimize'); } },
  { label: '最大化(<u>X</u>)', disabled: isMaximized.value || !!props.fixedSize, action: () => { closeSystemMenu(); isMaximized.value = true; } },
  { type: 'separator' as const },
  { label: '关闭(<u>C</u>)', shortcut: 'Alt+F4', action: () => { closeSystemMenu(); emit('close'); } },
]);

const toggleMenu = (menuId: string) => {
  if (activeMenu.value === menuId) {
    activeMenu.value = null;
  } else {
    activeMenu.value = menuId;
  }
};

const hoverMenu = (menuId: string) => {
  if (activeMenu.value !== null) {
    activeMenu.value = menuId;
  }
};

const closeMenu = () => {
  activeMenu.value = null;
};

const closeSystemMenu = () => {
  isSystemMenuOpen.value = false;
};

const toggleSystemMenu = () => {
  isSystemMenuOpen.value = !isSystemMenuOpen.value;
};

const handleMaximize = () => {
  if (props.fixedSize) return;
  isMaximized.value = !isMaximized.value;
};

const handleMinimize = () => {
  isMinimized.value = true;
  emit('minimize');
};

const handleClose = () => {
  emit('close');
};

const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.win-menu-bar') && !target.closest('.win-dropdown') && !target.closest('.win-system-menu-trigger')) {
    closeMenu();
    closeSystemMenu();
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (activeMenu.value) closeMenu();
    else if (isSystemMenuOpen.value) closeSystemMenu();
  }
  if (e.altKey && e.key === 'F4') {
    e.preventDefault();
    handleClose();
  }
  if (e.altKey) {
    const keyMap: Record<string, string> = { f: 'file', e: 'edit', v: 'view', h: 'help' };
    const menuId = keyMap[e.key.toLowerCase()];
    if (menuId) {
      e.preventDefault();
      toggleMenu(menuId);
    }
  }
};

const windowStyle = computed(() => {
  if (isMaximized.value) {
    return {
      top: '0',
      left: '0',
      transform: 'none',
      width: '100%',
      maxWidth: '100%',
      height: 'calc(100% - 48px)',
      maxHeight: 'calc(100vh - 48px)',
      borderRadius: '0',
    };
  }
  if (windowPos.value) {
    return {
      top: windowPos.value.top + 'px',
      left: windowPos.value.left + 'px',
      transform: 'none',
      width: '95%',
      maxWidth: '42rem',
      height: 'auto',
      maxHeight: '80vh',
    };
  }
  return {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '95%',
    maxWidth: '42rem',
    height: 'auto',
    maxHeight: '80vh',
  };
});

const startDrag = (e: MouseEvent) => {
  if (isMaximized.value) return;
  const el = windowEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  windowPos.value = { left: rect.left, top: rect.top };
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragOrigLeft = rect.left;
  dragOrigTop = rect.top;
  isDragging.value = true;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const el = windowEl.value;
  if (!el) return;
  const left = Math.min(
    window.innerWidth - 60,
    Math.max(-(el.offsetWidth - 60), dragOrigLeft + (e.clientX - dragStartX))
  );
  const top = Math.min(
    window.innerHeight - 30,
    Math.max(0, dragOrigTop + (e.clientY - dragStartY))
  );
  windowPos.value = { left, top };
};

const endDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', endDrag);
};

onMounted(() => {
  if (props.defaultMaximized) {
    isMaximized.value = true;
  }
  document.addEventListener('click', handleClickOutside, true);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('win-restore', onWinRestore);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true);
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('win-restore', onWinRestore);
});
</script>

<template>
  <div
    v-if="isOpen && !isMinimized"
    ref="windowEl"
    class="win-window fixed bg-[#f3f3f3] flex flex-col z-20 pointer-events-auto overflow-hidden"
    :style="windowStyle"
    @mousedown="emit('focus')"
  >
    <!-- Title Bar：Win11 白底细字，右侧扁平按钮 -->
    <div
      class="win-titlebar flex items-center select-none shrink-0 h-9 pl-3 gap-2 bg-[#f3f3f3]"
      @mousedown="startDrag"
      @dblclick="handleMaximize"
    >
      <!-- Window Icon (System Menu trigger) -->
      <button
        class="win-system-menu-trigger w-6 h-6 flex items-center justify-center shrink-0 rounded hover:bg-black/[0.06] cursor-pointer bg-transparent border-none p-0"
        @click.stop="toggleSystemMenu"
        @mousedown.stop
      >
        <i v-if="icon" :class="icon" class="text-[#0067c0] text-[13px]"></i>
      </button>

      <!-- Title -->
      <span
        class="flex-1 text-[12px] truncate leading-none select-none"
        :class="isActive ? 'text-[#1a1a1a]' : 'text-[#8a8a8a]'"
      >
        {{ title }}
      </span>

      <!-- Window Controls：Win11 扁平按钮（关闭悬停变红） -->
      <div class="flex shrink-0 self-stretch" @mousedown.stop @dblclick.stop>
        <!-- Minimize -->
        <button
          @click.stop="handleMinimize"
          class="w-[46px] flex items-center justify-center hover:bg-black/[0.06] active:bg-black/[0.03] cursor-pointer border-none bg-transparent"
          title="最小化"
        >
          <div class="w-[10px] h-[1px] bg-[#1a1a1a]"></div>
        </button>

        <!-- Maximize / Restore（固定尺寸窗口不显示） -->
        <button
          v-if="!fixedSize"
          @click.stop="handleMaximize"
          class="w-[46px] flex items-center justify-center hover:bg-black/[0.06] active:bg-black/[0.03] cursor-pointer border-none bg-transparent"
          :title="isMaximized ? '还原' : '最大化'"
        >
          <template v-if="isMaximized">
            <div class="relative w-[10px] h-[10px]">
              <div class="absolute top-0 right-0 w-[7px] h-[7px] border border-[#1a1a1a]"></div>
              <div class="absolute bottom-0 left-0 w-[7px] h-[7px] bg-[#f3f3f3] border border-[#1a1a1a]"></div>
            </div>
          </template>
          <template v-else>
            <div class="w-[10px] h-[10px] border border-[#1a1a1a] rounded-[1px]"></div>
          </template>
        </button>

        <!-- Close -->
        <button
          @click.stop="handleClose"
          class="w-[46px] flex items-center justify-center hover:bg-[#c42b1c] group/close cursor-pointer border-none bg-transparent"
          title="关闭"
        >
          <svg viewBox="0 0 10 10" class="w-[10px] h-[10px]">
            <line x1="1" y1="1" x2="9" y2="9" class="stroke-[#1a1a1a] group-hover/close:stroke-white" stroke-width="1.1"/>
            <line x1="9" y1="1" x2="1" y2="9" class="stroke-[#1a1a1a] group-hover/close:stroke-white" stroke-width="1.1"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- System Menu Dropdown：Win11 风格 -->
    <div v-if="isSystemMenuOpen" class="win-dropdown absolute top-[36px] left-[6px] z-50 bg-[rgba(243,243,243,0.97)] border border-black/[0.06] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.19)] py-1 min-w-[180px] text-[12px] text-[#1a1a1a]">
      <template v-for="(item, idx) in systemMenuItems" :key="idx">
        <hr v-if="item.type === 'separator'" class="border-black/10 mx-2 my-1">
        <div
          v-else
          class="win-menu-item px-3 py-[6px] flex items-center justify-between cursor-pointer whitespace-nowrap rounded-[4px] mx-1"
          :class="item.disabled ? 'text-[#8a8a8a] cursor-default' : 'hover:bg-black/[0.055]'"
          @click.stop="item.disabled ? null : item.action?.()"
        >
          <span class="text-[12px]" v-html="item.label"></span>
          <span v-if="item.shortcut" class="ml-[24px] text-[11px] text-[#8a8a8a]">{{ item.shortcut }}</span>
        </div>
      </template>
    </div>

    <!-- Menu Bar -->
    <div class="win-menu-bar flex px-2 py-[2px] text-[12px] select-none bg-[#f3f3f3] gap-0 shrink-0">
      <div
        v-for="menu in menus"
        :key="menu.id"
        class="win-menu-header px-[8px] py-[3px] cursor-pointer relative whitespace-nowrap text-[#1a1a1a] rounded"
        :class="activeMenu === menu.id ? 'bg-black/[0.07]' : 'hover:bg-black/[0.05]'"
        @click.stop="toggleMenu(menu.id)"
        @mouseenter="hoverMenu(menu.id)"
      >
        <span v-html="menu.label"></span>
        <!-- Dropdown -->
        <div
          v-if="activeMenu === menu.id"
          class="win-dropdown absolute top-full left-0 z-50 bg-[rgba(243,243,243,0.97)] border border-black/[0.06] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.19)] py-1 min-w-[200px]"
        >
          <template v-for="(item, idx) in menu.items" :key="idx">
            <hr v-if="item.type === 'separator'" class="border-black/10 mx-2 my-1">
            <div
              v-else
              class="win-menu-item px-3 py-[6px] flex items-center cursor-pointer whitespace-nowrap rounded-[4px] mx-1"
              :class="item.disabled ? 'text-[#8a8a8a] cursor-default' : 'hover:bg-black/[0.055]'"
              @click.stop="item.disabled ? null : item.action?.()"
            >
              <!-- Checkmark area -->
              <span class="w-[16px] shrink-0 text-[11px]">
                <span v-if="item.checked">&#x2713;</span>
              </span>
              <!-- Label -->
              <span class="flex-1 text-[12px]" v-html="item.label"></span>
              <!-- Shortcut -->
              <span v-if="item.shortcut" class="ml-[24px] text-[11px] text-[#8a8a8a]">{{ item.shortcut }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Content Area：白色圆角内容区 -->
    <div class="win-content flex-1 bg-white border border-[#e5e5e5] rounded-md mx-[6px] mb-[6px] p-[6px] overflow-y-auto text-[#1a1a1a] min-h-0">
      <slot></slot>
    </div>

    <!-- Status Bar -->
    <div class="flex px-3 py-[5px] text-[11px] text-[#5d5d5d] bg-[#f3f3f3] shrink-0 select-none gap-[8px] border-t border-black/[0.06]">
      <span class="flex-1">就绪</span>
      <span class="text-[11px]">| 100%</span>
    </div>
  </div>
</template>

<style scoped>
.win-window {
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.28),
    0 2px 8px rgba(0, 0, 0, 0.14);
}

.win-menu-header u {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.win-menu-item {
  font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif;
}
</style>
