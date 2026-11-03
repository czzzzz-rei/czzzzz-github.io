<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';

import Window from '../components/Window.vue';
import ReadComments from '../components/ReadComments.vue';
import { notes } from '../data/notes';
import { loadArticle } from '../data/articlesIndex';

const route = useRoute();
const router = useRouter();

const categoryNames: Record<string, string> = {
  java: 'Java',
  spring: 'Spring',
  database: 'Database',
  frontend: 'Frontend',
  devops: 'DevOps',
  vue: 'Vue',
  essay: '随笔',
};

const noteId = computed(() => route.params.id as string);
const note = computed(() => notes.find(n => n.id === noteId.value));

const noteContent = ref('');
const isLoading = ref(true);
const rootEl = ref<HTMLElement | null>(null);

const windowTitle = computed(() => note.value ? note.value.title : '文章未找到');

const currentIndex = computed(() => notes.findIndex(n => n.id === noteId.value));
const prevNote = computed(() => (currentIndex.value > 0 ? notes[currentIndex.value - 1] : null));
const nextNote = computed(() =>
  currentIndex.value >= 0 && currentIndex.value < notes.length - 1 ? notes[currentIndex.value + 1] : null
);

const charCount = computed(() => noteContent.value.replace(/<[^>]*>/g, '').replace(/\s/g, '').length);
const readMinutes = computed(() => Math.max(1, Math.round(charCount.value / 400)));

// ============ 阅读体验：复制按钮 / 目录 / 进度条 ============
interface TocItem { id: string; text: string; level: number }
const headings = ref<TocItem[]>([]);
const activeHeading = ref('');
const progress = ref(0);
// 目录默认收起：展开态会遮挡文章（尤其窗口最大化时），用户点标签自行展开；
// 切换文章时保持当前收起/展开选择，不做重置
const tocCollapsed = ref(true);
// 窗口最小化时把 Teleport 到 body 的悬浮目录/进度条一起藏起来，任务栏恢复时再显示
const overlayOn = ref(true);
let scrollerEl: HTMLElement | null = null;

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
    } catch (err) {
      reject(err as Error);
    } finally {
      ta.remove();
    }
  });
}

// 给每个代码块包一层并挂 Win98 风格"复制"按钮（v-html 重渲染后需重新装饰）
function decorateCode(): void {
  rootEl.value?.querySelectorAll('pre').forEach(pre => {
    const parent = pre.parentNode as HTMLElement | null;
    if (!parent || parent.classList.contains('code-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    parent.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = '复制';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      copyText(code).then(() => {
        btn.textContent = '已复制 ✓';
        btn.classList.add('ok');
        setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('ok'); }, 1600);
      }).catch(() => { btn.textContent = '复制失败'; });
    });
    wrap.appendChild(btn);
  });
}

// 从渲染后的 HTML 抽取 h2/h3 生成目录
function extractToc(): void {
  const article = rootEl.value?.querySelector('.note-article');
  const hs = article ? Array.from(article.querySelectorAll('h2, h3')) : [];
  headings.value = hs.map((h, i) => {
    if (!h.id) h.id = `sec-${noteId.value}-${i}`;
    return { id: h.id, text: (h.textContent ?? '').trim(), level: h.tagName === 'H3' ? 3 : 2 };
  }).filter(h => h.text.length > 0);
  // 默认收起（用户可自行展开）；切换文章时保留用户当前的收起/展开选择
}

function tocClick(h: TocItem): void {
  const el = document.getElementById(h.id);
  if (!el || !scrollerEl) return;
  const scRect = scrollerEl.getBoundingClientRect();
  const top = el.getBoundingClientRect().top - scRect.top + scrollerEl.scrollTop - 10;
  scrollerEl.scrollTo({ top, behavior: 'smooth' });
}

// 滚动容器（.win-content）：阅读进度 + 当前章节高亮
function updateScrollState(): void {
  const sc = scrollerEl;
  if (!sc) return;
  const max = sc.scrollHeight - sc.clientHeight;
  progress.value = max > 4 ? Math.min(1, Math.max(0, sc.scrollTop / max)) : 1;
  const scRect = sc.getBoundingClientRect();
  let cur = '';
  for (const h of headings.value) {
    const el = document.getElementById(h.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top - scRect.top < 96) cur = h.id;
    else break;
  }
  activeHeading.value = cur;
}

function attachScroller(): void {
  detachScroller();
  scrollerEl = (rootEl.value?.closest('.win-content') as HTMLElement | null) ?? null;
  scrollerEl?.addEventListener('scroll', updateScrollState, { passive: true });
  updateScrollState();
}

function detachScroller(): void {
  scrollerEl?.removeEventListener('scroll', updateScrollState);
  scrollerEl = null;
}

const scrollToTop = () => {
  scrollerEl?.scrollTo({ top: 0 });
};

// 连点上一篇/下一篇时旧的异步加载结果按序号丢弃
let loadSeq = 0;

const loadNote = async () => {
  const current = note.value;
  if (!current) {
    noteContent.value = '';
    isLoading.value = false;
    return;
  }
  const mySeq = ++loadSeq;
  isLoading.value = true;
  const html = await loadArticle(current.id);
  if (mySeq !== loadSeq) return; // 快速连点上一篇/下一篇时丢弃过期结果
  noteContent.value = html;
  isLoading.value = false;
  await nextTick();
  if (rootEl.value) {
    Prism.highlightAllUnder(rootEl.value);
    decorateCode();
    extractToc();
  }
  attachScroller();
  scrollToTop();
};

watch(noteId, loadNote, { immediate: true });
onMounted(attachScroller);
onUnmounted(detachScroller);

const goNote = (id?: string) => {
  if (id) router.push(`/notes/${id}`);
};
</script>

<template>
  <Window
    :title="windowTitle"
    icon="fa fa-file-text-o"
    isOpen
    isActive
    @close="router.push('/all-notes')"
    @minimize="overlayOn = false"
    @restore="overlayOn = true"
  >
    <div ref="rootEl">
      <!-- 文章未找到 -->
      <div v-if="!note" class="text-center py-12 px-4 text-sm">
        <p class="text-4xl mb-4">📄</p>
        <h2 class="text-base font-bold text-[#000080] mb-2">文章不存在</h2>
        <p class="text-gray-600 mb-1">没有找到文章「{{ noteId }}」，链接可能已失效。</p>
        <router-link to="/all-notes" class="inline-block mt-3 font-bold text-[#000080] hover:bg-[#000080] hover:text-white px-1">← 返回我的文档</router-link>
      </div>

      <template v-else>
        <!-- 文章信息头 -->
        <header class="bg-[#f0f0f0] shadow-win95-inset p-3 mb-4 flex items-start gap-3">
          <div class="w-10 h-10 bg-white shadow-win95-inset flex items-center justify-center shrink-0">
            <i :class="note.icon" class="text-xl text-[#000080]"></i>
          </div>
          <div class="min-w-0">
            <h2 class="text-base font-bold text-[#000080] leading-snug break-words">{{ note.title }}</h2>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600 mt-1">
              <span title="发布日期"><i class="fa fa-calendar-o mr-1"></i>{{ note.date }}</span>
              <span v-if="note.category" title="分类"><i class="fa fa-folder-open-o mr-1"></i>{{ categoryNames[note.category] }}</span>
              <span title="不含代码的正文长度" v-if="!isLoading"><i class="fa fa-file-text-o mr-1"></i>约 {{ charCount }} 字 · 预计 {{ readMinutes }} 分钟读完</span>
            </div>
          </div>
        </header>

        <!-- 正文 -->
        <div v-if="isLoading" class="text-gray-500 text-sm py-10 text-center">
          <i class="fa fa-hourglass-half mr-1"></i>正在打开文档...
        </div>
        <article v-else class="note-article" v-html="noteContent"></article>

        <!-- 上一篇 / 下一篇 -->
        <footer v-if="!isLoading" class="mt-10 pt-3 border-t border-black/10">
          <div class="flex flex-col sm:flex-row gap-2">
            <button
              :disabled="!prevNote"
              @click="goNote(prevNote?.id)"
              class="flex-1 min-w-0 text-left px-3 py-2 text-xs rounded-md border border-black/10 bg-[#fdfdfd] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
              :title="prevNote ? prevNote.title : '已经是第一篇'"
            >
              <span class="text-[11px] text-[#0067c0] block">← 上一篇</span>
              <span class="block truncate font-semibold text-[#1a1a1a]">{{ prevNote ? prevNote.title : '没有更多文章' }}</span>
            </button>
            <button
              :disabled="!nextNote"
              @click="goNote(nextNote?.id)"
              class="flex-1 min-w-0 text-right px-3 py-2 text-xs rounded-md border border-black/10 bg-[#fdfdfd] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
              :title="nextNote ? nextNote.title : '已经是最后一篇'"
            >
              <span class="text-[11px] text-[#0067c0] block">下一篇 →</span>
              <span class="block truncate font-semibold text-[#1a1a1a]">{{ nextNote ? nextNote.title : '没有更多文章' }}</span>
            </button>
          </div>
          <div class="mt-3 text-center">
            <button
              @click="router.push('/all-notes')"
              class="px-4 py-1.5 text-xs rounded-md border border-black/10 bg-[#fdfdfd] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#f6f6f6] active:bg-[#f0f0f0] transition-colors cursor-pointer text-[#1a1a1a]"
            >
              <i class="fa fa-arrow-up mr-1 text-[#0067c0]"></i>返回我的文档
            </button>
          </div>
        </footer>
      </template>
    </div>
  </Window>

  <!-- 阅读进度条 + 悬浮目录：Teleport 到 body（Window 自带 translate transform 会劫持 fixed 定位）。
       注意：Teleport 使本组件变为多根组件，App.vue 路由层的 pointer-events-auto 不再透传——
       该类已在 Window.vue 根元素上内置，勿移除，否则整个文章窗口会点击穿透。 -->
  <Teleport to="body">
    <div v-if="overlayOn && note && !isLoading" class="read-progress" aria-hidden="true">
      <div class="read-progress-fill" :style="{ width: (progress * 100).toFixed(1) + '%' }"></div>
    </div>
    <div
      v-if="overlayOn && note && !isLoading && headings.length >= 3"
      class="read-toc"
      :class="{ collapsed: tocCollapsed }"
    >
      <button type="button" class="read-toc-head" @click="tocCollapsed = !tocCollapsed">
        <i class="fa fa-list-ul"></i>
        <span>目录</span>
        <span class="read-toc-count">{{ headings.length }}</span>
        <i class="fa fa-caret-square-o-right toggle"></i>
      </button>
      <ul v-show="!tocCollapsed">
        <li
          v-for="h in headings"
          :key="h.id"
          :class="[h.level === 3 ? 'sub' : '', { active: activeHeading === h.id }]"
        >
          <button type="button" @click="tocClick(h)">{{ h.text }}</button>
        </li>
      </ul>
    </div>
    <!-- 评论面板：Giscus（GitHub Discussions），右侧浮动、可展开滚动 -->
    <ReadComments v-if="overlayOn && note && !isLoading" :article-id="note?.id ?? ''" />
  </Teleport>
</template>

<style>
.note-article {
  font-family: 'MS Sans Serif', 'Tahoma', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  line-height: 1.75;
  color: #1a1a1a;
  word-break: break-word;
}
.note-article h1 {
  font-size: 1.45em;
  font-weight: bold;
  color: #000080;
  line-height: 1.4;
  margin: 4px 0 14px;
  padding: 0 0 8px;
  border-bottom: 2px solid #000080;
}
.note-article h2 {
  font-size: 1.2em;
  font-weight: bold;
  color: #000080;
  margin: 1.8em 0 0.7em;
  padding: 3px 8px;
  border-left: 4px solid #000080;
  background: #e8ecf3;
}
.note-article h3 {
  font-size: 1.08em;
  font-weight: bold;
  color: #333;
  margin: 1.4em 0 0.5em;
}
.note-article p { margin: 0 0 1em; }
.note-article ul { margin: 0 0 1em; padding-left: 1.8em; list-style-type: disc; }
.note-article ol { margin: 0 0 1em; padding-left: 1.8em; list-style-type: decimal; }
.note-article li { margin-bottom: 0.45em; }
.note-article a {
  color: #000080;
  text-decoration: underline;
}
.note-article a:hover {
  color: #0067c0;
  text-decoration: underline;
}
.note-article code {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 0.92em;
  background: #f6f6f6;
  border: 1px solid #e5e5e5;
  border-radius: 3px;
  padding: 0 4px;
}
.note-article pre {
  overflow-x: auto;
}
.note-article pre code {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 13px;
}
.note-article table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1em;
  background: #ffffff;
  font-size: 12px;
}
.note-article th {
  background: #f0f6fc;
  border: 1px solid #e0e0e0;
  padding: 6px 8px;
  text-align: left;
  font-weight: 600;
  vertical-align: top;
}
.note-article td {
  border: 1px solid #e5e5e5;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.note-article tbody tr:nth-child(even) td {
  background: #fafafa;
}
.note-article blockquote {
  margin: 0 0 1em;
  padding: 8px 12px;
  background: #f6f9fc;
  border-left: 3px solid #0067c0;
  border-radius: 0 4px 4px 0;
}
.note-article hr {
  border: none;
  border-top: 1px solid #e5e5e5;
  margin: 1.5em 0;
}

/* ============ 阅读体验：复制按钮 / 目录 / 进度条（Teleport 到 body，全局样式） ============ */
/* 顶部阅读进度条：Win11 蓝色细条 */
.read-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: transparent;
  z-index: 45;
  pointer-events: none;
}
.read-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0067c0, #3d8fd6);
  border-radius: 0 2px 2px 0;
  transition: width 0.12s linear;
}

/* 悬浮目录：右侧迷你 Win11 面板 */
.read-toc {
  position: fixed;
  top: 66px;
  right: 10px;
  width: 216px;
  max-height: 64vh;
  display: flex;
  flex-direction: column;
  background: rgba(243, 243, 243, 0.97);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.19), 0 2px 6px rgba(0, 0, 0, 0.12);
  z-index: 45;
  font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}
.read-toc.collapsed { max-height: none; }
.read-toc-head {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #1a1a1a;
  cursor: pointer;
  text-align: left;
  border-bottom: 1px solid #e5e5e5;
}
.read-toc-head:hover { background: rgba(0, 0, 0, 0.03); }
.read-toc-head i { color: #0067c0; }
.read-toc.collapsed .read-toc-head { border-bottom-color: transparent; }
.read-toc-head .read-toc-count {
  margin-left: auto;
  font-weight: 600;
  color: #fff;
  font-size: 10px;
  background: #0067c0;
  border-radius: 9px;
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
}
.read-toc-head .toggle { color: #8a8a8a; transition: transform 0.15s; }
.read-toc.collapsed .toggle { transform: rotate(180deg); }
.read-toc ul {
  list-style: none;
  margin: 6px;
  padding: 3px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
}
.read-toc li button {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 11px;
  color: #1a1a1a;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.read-toc li.sub button { padding-left: 20px; color: #5d5d5d; }
.read-toc li button:hover { background: #e8f1fb; color: #0067c0; }
.read-toc li.active button {
  background: #e8f1fb;
  color: #0067c0;
  font-weight: 600;
}
@media (max-width: 899px) {
  .read-toc { display: none; }
}

/* 代码块：相对容器 + 复制按钮（悬停浮现，触屏常显） */
.note-article .code-wrap,
.note-article pre.code-wrap {
  position: relative;
}
.note-article .code-wrap pre { margin: 0 0 1em; }
.code-copy {
  position: absolute;
  top: 5px;
  right: 5px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  background: #fdfdfd;
  color: #1a1a1a;
  font: 11px 'Segoe UI', 'Microsoft YaHei UI', sans-serif;
  padding: 2px 8px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.1s;
  z-index: 2;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.code-copy:hover { background: #f6f6f6; }
.code-copy:focus-visible { opacity: 1; }
.code-copy:active {
  background: #f0f0f0;
  color: #5d5d5d;
}
.code-copy.ok { color: #0a7a0a; font-weight: 600; }
@media (hover: none) {
  .code-copy { opacity: 1; }
}
</style>
