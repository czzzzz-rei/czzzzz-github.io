<script setup lang="ts">
// 全局搜索「查找：全部文件」—— 复刻 Win98 查找对话框。
// Ctrl+K / 开始菜单唤出；标题/分类即时过滤，正文全文检索（首次自动预热索引），
// 双击或回车直达文章。可拖拽，Esc 关闭。
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { articleMetas, searchArticles, loadAllArticles, highlightTitle, type SearchHit } from '../data/articlesIndex';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'navigate', path: string): void }>();

const nameQ = ref('');
const textQ = ref('');
const catQ = ref('');
const hits = ref<SearchHit[]>([]);
const searching = ref(false);
const selectedId = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

const cats = computed(() => {
  const map = new Map<string, string>();
  for (const m of articleMetas()) if (m.category) map.set(m.category, m.categoryName);
  return Array.from(map.entries());
});

// ============ 拖拽 ============
const pos = ref({ x: 60, y: 60 });
let dragging = false;
let dragDx = 0;
let dragDy = 0;

function onTitlebarDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  dragging = true;
  dragDx = e.clientX - pos.value.x;
  dragDy = e.clientY - pos.value.y;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', onDragEnd);
}

function onDrag(e: MouseEvent): void {
  if (!dragging) return;
  const el = document.getElementById('find-dialog');
  const w = el?.offsetWidth ?? 580;
  pos.value = {
    x: Math.max(-w + 90, Math.min(window.innerWidth - 90, e.clientX - dragDx)),
    y: Math.max(0, Math.min(window.innerHeight - 56, e.clientY - dragDy)),
  };
}

function onDragEnd(): void {
  dragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', onDragEnd);
}

// ============ 搜索 ============
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

async function runSearch(): Promise<void> {
  const mySeq = ++seq;
  searching.value = true;
  const res = await searchArticles({ name: nameQ.value, content: textQ.value, category: catQ.value });
  if (mySeq !== seq) return; // 过期结果丢弃
  hits.value = res.hits;
  searching.value = false;
  if (!res.hits.some(h => h.id === selectedId.value)) selectedId.value = '';
  if (!res.indexed) {
    // 用到正文搜索但索引未热：后台预热后重跑一次（loadAll 内部并发去重，只加载一次）
    void loadAllArticles().then(() => {
      if (props.open) void runSearch();
    });
  }
}

watch([nameQ, textQ, catQ], () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, 180);
});

watch(() => props.open, (o) => {
  if (!o) return;
  // 居中定位 + 聚焦 + 首次列出全部文件并后台建立全文索引
  nextTick(() => {
    const el = document.getElementById('find-dialog');
    const w = el?.offsetWidth ?? 580;
    const h = el?.offsetHeight ?? 400;
    pos.value = {
      x: Math.max(8, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - h) / 2) - 24),
    };
  });
  nameInput.value?.focus();
  // 只搜元数据（0 下载）；正文索引推迟到用户真的用"包含文字"时才预热
  void runSearch();
});

function resetSearch(): void {
  nameQ.value = '';
  textQ.value = '';
  catQ.value = '';
  selectedId.value = '';
  void runSearch();
}

function openHit(h: SearchHit): void {
  emit('navigate', h.path);
  emit('close');
}

function openSelected(): void {
  const target = hits.value.find(h => h.id === selectedId.value) ?? hits.value[0];
  if (target) openHit(target);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'Enter') {
    openSelected();
  }
}

// Esc 关闭不依赖焦点在对话框内（挂在 window 上，打开期间才生效）
function onWinKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  }
}

watch(() => props.open, (o) => {
  if (o) window.addEventListener('keydown', onWinKeydown, true);
  else window.removeEventListener('keydown', onWinKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onWinKeydown, true);
});
</script>

<template>
  <div
    v-if="open"
    id="find-dialog"
    class="find-dialog"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @keydown="onKey"
  >
    <div class="find-titlebar" @mousedown="onTitlebarDown">
      <i class="fa fa-search"></i>
      <span class="flex-1">查找：全部文件</span>
      <button class="find-close" title="关闭" @click="emit('close')" @mousedown.stop>✕</button>
    </div>

    <div class="find-body">
      <div class="find-form">
        <div class="find-row">
          <label class="find-label">要搜索的文件名：</label>
          <input ref="nameInput" v-model="nameQ" class="find-input" placeholder="如：Java、Redis、Docker…" spellcheck="false">
        </div>
        <div class="find-row">
          <label class="find-label">包含文字：</label>
          <input v-model="textQ" class="find-input" placeholder="全文检索正文关键词" spellcheck="false">
        </div>
        <div class="find-row">
          <label class="find-label">搜索范围：</label>
          <select v-model="catQ" class="find-input find-select">
            <option value="">全部分类</option>
            <option v-for="[c, n] in cats" :key="c" :value="c">{{ n }}</option>
          </select>
        </div>
        <div class="find-btns">
          <button class="win-btn shadow-win95-outset px-3 py-1 text-[11px]" @click="runSearch"><i class="fa fa-search mr-1"></i>开始查找</button>
          <button class="win-btn shadow-win95-outset px-3 py-1 text-[11px]" @click="resetSearch">新搜索</button>
        </div>
      </div>

      <div class="find-results" @dblclick="openSelected">
        <div
          v-for="h in hits"
          :key="h.id"
          class="find-item"
          :class="{ sel: selectedId === h.id }"
          @click="selectedId = h.id"
          @dblclick="openHit(h)"
        >
          <i :class="h.icon" class="find-ico"></i>
          <div class="find-item-main">
            <div class="find-item-title" v-html="highlightTitle(h.title, nameQ)"></div>
            <div class="find-item-sub">
              {{ h.categoryName }} · {{ h.date }}<template v-if="h.minutes"> · 约 {{ h.minutes }} 分钟</template><template v-if="h.contentMatches"> · {{ h.contentMatches }} 处命中</template>
            </div>
            <div v-if="h.snippet" class="find-item-snippet" v-html="h.snippet"></div>
          </div>
        </div>
        <div v-if="!hits.length && !searching" class="find-empty">没有找到匹配的文件，换个关键词试试。</div>
      </div>

      <div class="find-status">
        <span v-if="searching"><i class="fa fa-hourglass-half mr-1"></i>正在搜索…</span>
        <span v-else>找到 {{ hits.length }} 个文件 · 双击或回车打开 · Ctrl+K 随时唤出</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.find-dialog {
  position: fixed;
  z-index: 85;
  width: min(580px, 94vw);
  background: #f3f3f3;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.14);
  font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif;
  color: #1a1a1a;
  overflow: hidden;
}
.find-titlebar {
  height: 36px;
  background: #f3f3f3;
  color: #1a1a1a;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 14px;
  cursor: move;
  user-select: none;
  border-bottom: 1px solid #e5e5e5;
}
.find-titlebar i { color: #0067c0; }
.find-titlebar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.find-close {
  width: 32px;
  height: 28px;
  font-size: 11px;
  background: transparent;
  color: #1a1a1a;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.find-close:hover { background: rgba(0, 0, 0, 0.06); }
.find-body { padding: 12px; }

.find-form {
  position: relative;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  background: #fff;
  padding: 12px 12px 10px;
}
.find-tab {
  position: absolute;
  top: -11px;
  left: 8px;
  background: #f3f3f3;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  padding: 2px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #5d5d5d;
}
.find-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.find-row:last-of-type { margin-bottom: 0; }
.find-label { width: 104px; flex-shrink: 0; font-size: 12px; color: #5d5d5d; }
.find-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-bottom-color: rgba(0, 0, 0, 0.36);
  border-radius: 4px;
  padding: 0 8px;
  font-size: 12px;
  color: #1a1a1a;
  outline: none;
  font-family: inherit;
}
.find-input:focus { border-color: #0067c0; border-bottom-width: 2px; padding-bottom: 0; }
.find-select { appearance: auto; height: 28px; }
.find-btns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.find-results {
  height: 220px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  margin-top: 10px;
}
.find-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}
.find-item:last-child { border-bottom: none; }
.find-item:hover { background: #f5f5f5; }
.find-item.sel { background: #e8f1fb; }
.find-item.sel .find-item-title { color: #0067c0; }
.find-ico { width: 18px; text-align: center; font-size: 13px; margin-top: 2px; flex-shrink: 0; color: #0067c0; }
.find-item-main { flex: 1; min-width: 0; }
.find-item-title { font-size: 12px; font-weight: 600; }
.find-item-sub { font-size: 10px; color: #8a8a8a; margin-top: 1px; }
.find-item.sel .find-item-sub { color: #5d5d5d; }
.find-item-snippet {
  font-size: 11px;
  color: #5d5d5d;
  margin-top: 3px;
  line-height: 1.45;
  word-break: break-all;
}
.find-item.sel .find-item-snippet { color: #333; }
.find-item :deep(mark) {
  background: #ffe9a8;
  color: #1a1a1a;
  padding: 0 1px;
  border-radius: 2px;
}
.find-empty { padding: 24px 12px; text-align: center; color: #8a8a8a; font-size: 11px; }

.find-status {
  margin-top: 8px;
  padding: 5px 10px;
  font-size: 10px;
  color: #8a8a8a;
  border-top: 1px solid #e5e5e5;
}
</style>
