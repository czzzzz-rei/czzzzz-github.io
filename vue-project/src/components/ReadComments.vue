<script setup lang="ts">
// 文章评论面板：Giscus（基于本仓库的 GitHub Discussions），挂在文章页右侧
// （与悬浮目录同层：底部右侧，可展开，内部滚动）。
// - 按「文章 id」映射讨论（mapping=specific），避开 hash 路由下 pathname 全相同
//   导致的全站共用评论区问题
// - 首次展开才注入 giscus 脚本；切换文章时清空重建，评论各归各的文章
// - 监听 giscus 的 discussion 元数据消息，标题栏实时显示评论数
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{ articleId: string }>();

const open = ref(false);
const count = ref<number | null>(null);
const boxEl = ref<HTMLElement | null>(null);
const status = ref<'loading' | 'ready' | 'timeout' | 'error'>('loading');
const errMsg = ref('');
let injectedFor = '';   // 已为哪个文章 id 注入过脚本
let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

// giscus.app 生成的仓库配置（Announcements 分类：只有仓库维护者能创建讨论，
// 访客只能回复，天然防止乱开主题帖）
const GISCUS = {
  repo: 'czzzzz-rei/czzzzz-rei.github.io',
  repoId: 'R_kgDOOi0ljg',
  category: 'Announcements',
  categoryId: 'DIC_kwDOOi0ljs4DKS-Q',
};

function injectGiscus(): void {
  const box = boxEl.value;
  if (!box || injectedFor === props.articleId) return;
  injectedFor = props.articleId;
  box.innerHTML = '';
  status.value = 'loading';
  errMsg.value = '';
  // 记录来源文章：giscus 登录后回跳会丢 hash 路由，入口脚本靠这个回到原文页
  try { localStorage.setItem('giscus-return', `#/notes/${props.articleId}`); } catch { /* 忽略 */ }
  // 加载超时：giscus.app（Vercel）在部分地区不稳定，widget 挂起时给出重试入口
  if (timeoutTimer) clearTimeout(timeoutTimer);
  timeoutTimer = setTimeout(() => {
    if (status.value === 'loading') status.value = 'timeout';
  }, 10000);
  const s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  s.async = true;
  s.crossOrigin = 'anonymous';
  Object.assign(s.dataset, {
    repo: GISCUS.repo,
    repoId: GISCUS.repoId,
    category: GISCUS.category,
    categoryId: GISCUS.categoryId,
    mapping: 'specific',
    term: `notes/${props.articleId}`,
    strict: '1',
    reactionsEnabled: '1',
    emitMetadata: '1',
    inputPosition: 'bottom',
    theme: 'light',
    lang: 'zh-CN',
    loading: 'lazy',
  });
  box.appendChild(s);
  // Chrome 头像缺失修复：giscus 的头像走 avatars.githubusercontent.com，
  // 部分 Chrome（隐私设置/扩展拦截 Referer）下被防盗链拒绝。给 iframe 容器
  // 声明 referrer 政策无意义（跨域 iframe 内部请求），改在 inject 前给页面
  // 加 <meta name="referrer" content="no-referrer">，让站内所有请求都不带
  // Referer，绕过基于 Referer 的拦截。
  if (!document.querySelector('meta[name="referrer"]')) {
    const m = document.createElement('meta');
    m.name = 'referrer';
    m.content = 'no-referrer';
    document.head.appendChild(m);
  }
}

function retry(): void {
  injectedFor = '';
  injectGiscus();
}

// 换文章：清空容器与计数，展开状态下按新 id 重新注入
watch(() => props.articleId, () => {
  injectedFor = '';
  count.value = null;
  if (boxEl.value) boxEl.value.innerHTML = '';
  if (open.value) injectGiscus();
});

// giscus 通过 postMessage 上报数据：{ giscus: { resizeHeight } } / { giscus: { error } }
// / { giscus: { discussion: { totalCommentCount, ... } } }（需 emitMetadata=1）。
// "Discussion not found"（首条评论前）会伴随正常渲染出现，不打扰用户；
// 只有渲染都没开始就报错/超时才提示。
function onMessage(e: MessageEvent): void {
  if (e.origin !== 'https://giscus.app') return;
  const d = (e.data as { giscus?: { resizeHeight?: number; error?: string | null; discussion?: { totalCommentCount?: number } } } | null)?.giscus;
  if (!d) return;
  if (typeof d.resizeHeight === 'number') {
    status.value = 'ready';
    if (timeoutTimer) clearTimeout(timeoutTimer);
    // Edge 抖动修复：giscus 高频上报 resizeHeight（头像懒加载等），逐条套用导致
    // iframe 高度抖动。节流 300ms 且只增不减（减小时平滑收紧），面板高度稳定。
    const h = Math.round(d.resizeHeight);
    if (lastResize === null || Math.abs(h - lastResize) > 8) {
      lastResize = h;
      applyHeight(h);
    } else {
      if (resizeThrottle) clearTimeout(resizeThrottle);
      resizeThrottle = setTimeout(() => { lastResize = h; applyHeight(h); }, 300);
    }
  } else if (d.error) {
    if (status.value === 'loading') {
      errMsg.value = d.error;
      status.value = 'error';
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
  }
  const n = d.discussion?.totalCommentCount;
  if (typeof n === 'number') count.value = n;
}

// iframe 高度应用：设置 min-height 而非 height，只增不减，杜绝视觉抖动
let lastResize: number | null = null;
let resizeThrottle: ReturnType<typeof setTimeout> | undefined;
function applyHeight(h: number): void {
  const box = boxEl.value;
  if (!box) return;
  box.style.minHeight = '';
  const iframe = box.querySelector('iframe.giscus-frame') as HTMLIFrameElement | null;
  if (iframe) {
    // 只增不减：新高度比当前矮时保留较大值，避免反复伸缩
    const cur = parseFloat(iframe.style.height || '0');
    iframe.style.height = `${Math.max(h, cur * 0.98)}px`;
  }
}

// 登录弹窗关闭时通过 opener 通知到这里：重新注入 widget 立刻带上登录态
function onSessionReady(): void {
  if (!open.value || !boxEl.value) return;
  injectedFor = '';
  injectGiscus();
}

onMounted(() => {
  window.addEventListener('message', onMessage);
  window.addEventListener('giscus-session-ready', onSessionReady);
  // 从登录回跳而来：自动展开面板展示登录态
  try {
    if (sessionStorage.getItem('giscus-just-logged-in')) {
      sessionStorage.removeItem('giscus-just-logged-in');
      open.value = true;
      injectGiscus();
    }
  } catch { /* 忽略 */ }
});
onUnmounted(() => {
  window.removeEventListener('message', onMessage);
  window.removeEventListener('giscus-session-ready', onSessionReady);
  if (timeoutTimer) clearTimeout(timeoutTimer);
});

function toggle(): void {
  open.value = !open.value;
  if (open.value) injectGiscus();
}
</script>

<template>
  <div class="read-comments" :class="{ open }">
    <button type="button" class="read-comments-head" @click="toggle">
      <i class="fa fa-comments-o"></i>
      <span>评论</span>
      <span v-if="count !== null" class="read-comments-count">{{ count }}</span>
      <i class="fa fa-angle-double-down toggle"></i>
    </button>
    <div v-show="open" class="read-comments-body">
      <p class="read-comments-tip">
        <i class="fa fa-github"></i>
        评论基于 GitHub Discussions：登录 GitHub 后发表，内容同步保存在本站仓库；首次评论会自动创建对应讨论。
      </p>
      <div v-if="status === 'timeout' || status === 'error'" class="read-comments-fail">
        <span>{{ status === 'timeout' ? '评论服务加载超时（giscus.app 网络不畅?）' : `评论服务错误：${errMsg}` }}</span>
        <button type="button" @click="retry">重试</button>
      </div>
      <div ref="boxEl" class="read-comments-box"></div>
    </div>
  </div>
</template>

<style scoped>
.read-comments {
  position: fixed;
  right: 10px;
  bottom: 56px;               /* 任务栏上方 */
  width: min(344px, calc(100vw - 20px));
  display: flex;
  flex-direction: column;
  background: rgba(243, 243, 243, 0.97);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.19), 0 2px 6px rgba(0, 0, 0, 0.12);
  z-index: 46;                /* 展开后盖在目录之上，避免互相顶住 */
  font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}
.read-comments-head {
  display: flex;
  align-items: center;
  gap: 6px;
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
.read-comments-head:hover { background: rgba(0, 0, 0, 0.03); }
.read-comments-head i { color: #0067c0; }
.read-comments.open .read-comments-head { border-bottom-color: #e5e5e5; }
.read-comments-head .read-comments-count {
  min-width: 18px;
  padding: 0 6px;
  font-weight: 600;
  color: #fff;
  font-size: 10px;
  background: #0067c0;
  border-radius: 9px;
  text-align: center;
}
.read-comments-head .toggle {
  margin-left: auto;
  color: #8a8a8a;
  font-size: 12px;
  transition: transform 0.15s;
}
.read-comments.open .toggle { transform: rotate(180deg); }
.read-comments-body {
  display: flex;
  flex-direction: column;
  max-height: min(52vh, 470px);
  padding: 8px;
}
.read-comments-tip {
  margin: 0 0 6px;
  padding: 6px 8px;
  font-size: 10px;
  line-height: 1.5;
  color: #5d5d5d;
  background: #f6f6f6;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
}
.read-comments-tip i { margin-right: 3px; }
.read-comments-fail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 6px;
  padding: 6px 8px;
  font-size: 10px;
  line-height: 1.5;
  color: #a00;
  background: #fdf3f3;
  border: 1px solid #f0d0d0;
  border-radius: 4px;
}
.read-comments-fail button {
  flex-shrink: 0;
  padding: 3px 12px;
  font-size: 10px;
  background: #fdfdfd;
  color: #1a1a1a;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  font-family: inherit;
}
.read-comments-fail button:hover { background: #f6f6f6; }
.read-comments-box {
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  min-height: 120px;
}
/* giscus iframe 撑满容器宽度 */
.read-comments-box :deep(iframe.giscus-frame) { width: 100%; border: none; }
/* 移动端不再隐藏：面板默认收起，展开后接近全屏、可随时收起，手机也能评论 */
@media (max-width: 899px) {
  .read-comments {
    width: calc(100vw - 16px);
    right: 8px;
    bottom: 52px;
  }
  .read-comments-body { max-height: 70vh; }
}
</style>
