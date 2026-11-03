<script setup lang="ts">
// 打字练习：中文 / 英文 / 代码 三模式，WPM + 准确率 + 最佳纪录（localStorage）
import { ref, computed, watch, onUnmounted } from 'vue';
import Window from '../components/Window.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

type Mode = 'cn' | 'en' | 'code';

const MODES: Record<Mode, { name: string; unit: string; icon: string }> = {
  cn: { name: '中文文章', unit: '字/分钟', icon: 'fa fa-language' },
  en: { name: '英文段落', unit: '词/分钟', icon: 'fa fa-font' },
  code: { name: '代码片段', unit: '词/分钟', icon: 'fa fa-code' },
};

const TEXTS: Record<Mode, string[]> = {
  cn: [
    '把每一次失败当成通往成功的垫脚石，坚持自己的热爱，时间终会给你答案。',
    '代码如诗，简洁优雅的实现背后是无数次的重构与推敲，与其空想不如动手写。',
    '学习编程最大的捷径就是没有捷径，一行一行地敲，一个 bug 一个 bug 地修。',
  ],
  en: [
    'The quick brown fox jumps over the lazy dog while the developer drinks cold coffee.',
    'Talk is cheap. Show me the code. Programs must be written for people to read.',
    'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.',
  ],
  code: [
    'public static void main(String[] args) { System.out.println("Hello, World!"); }',
    'const sum = (a, b) => a + b; const total = [1, 2, 3].reduce((s, n) => s + n, 0);',
    "SELECT id, title FROM articles WHERE category = 'devops' ORDER BY date DESC LIMIT 10;",
  ],
};

const RECORD_KEY = 'typing-best';

interface Record0 { wpm: number; acc: number }
function loadBest(mode: Mode): Record0 {
  try {
    const all = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}');
    return all[mode] ?? { wpm: 0, acc: 0 };
  } catch { return { wpm: 0, acc: 0 }; }
}
function saveBest(mode: Mode, r: Record0): void {
  try {
    const all = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}');
    all[mode] = r;
    localStorage.setItem(RECORD_KEY, JSON.stringify(all));
  } catch { /* 忽略 */ }
}

const mode = ref<Mode>('cn');
const textIndex = ref(0);
const target = ref('');
const typed = ref('');
const startedAt = ref(0);
const finishedAt = ref(0);
const finished = ref(false);
const now = ref(Date.now());
const best = ref<Record0>(loadBest('cn'));
const newRecord = ref(false);
const nowTimer = setInterval(() => { now.value = Date.now(); }, 200);

function pickText(): void {
  const pool = TEXTS[mode.value];
  textIndex.value = Math.floor(Math.random() * pool.length);
  target.value = pool[textIndex.value];
  typed.value = '';
  startedAt.value = 0;
  finishedAt.value = 0;
  finished.value = false;
  newRecord.value = false;
}

watch(mode, () => {
  best.value = loadBest(mode.value);
  pickText();
});
pickText();

onUnmounted(() => clearInterval(nowTimer));

// 正确字符数（与目标逐位比较的前缀长度）
const correctLen = computed(() => {
  const t = typed.value;
  let n = 0;
  for (let i = 0; i < t.length && i < target.value.length; i++) {
    if (t[i] === target.value[i]) n++;
    else break;
  }
  return n;
});

const elapsedMin = computed(() => {
  if (!startedAt.value) return 0;
  const end = finished.value ? finishedAt.value : now.value;
  return Math.max(0.01, (end - startedAt.value) / 60000);
});

const wpm = computed(() => {
  const chars = correctLen.value;
  const base = mode.value === 'cn' ? chars : chars / 5;
  return Math.round(base / elapsedMin.value);
});

const acc = computed(() => {
  const typedLen = typed.value.length;
  if (!typedLen) return 100;
  return Math.round((correctLen.value / typedLen) * 100);
});

const progress = computed(() => Math.min(100, Math.round((correctLen.value / target.value.length) * 100)));

function onInput(e: Event): void {
  if (finished.value) return;
  typed.value = (e.target as HTMLTextAreaElement).value.slice(0, target.value.length + 20);
  if (!startedAt.value && typed.value.length > 0) startedAt.value = Date.now();
  if (typed.value.length >= target.value.length && correctLen.value >= target.value.length) {
    finishedAt.value = Date.now();
    finished.value = true;
    const r = { wpm: wpm.value, acc: acc.value };
    if (r.wpm > best.value.wpm || (r.wpm === best.value.wpm && r.acc > best.value.acc)) {
      best.value = r;
      saveBest(mode.value, r);
      newRecord.value = true;
    }
  }
}

function nextText(): void {
  pickText();
}

const charState = (i: number): 'ok' | 'bad' | 'cursor' | 'todo' => {
  if (i < correctLen.value) return 'ok';
  if (i < typed.value.length) return 'bad';
  if (i === typed.value.length) return 'cursor';
  return 'todo';
};

const fmtTime = computed(() => {
  const s = Math.floor((finished.value ? finishedAt.value : now.value) - startedAt.value) / 1000;
  if (!startedAt.value) return '0.0';
  return (Math.max(0, s)).toFixed(1);
});

const bestText = computed(() =>
  best.value.wpm > 0 ? `${best.value.wpm} ${MODES[mode.value].unit} · ${best.value.acc}%` : '暂无纪录'
);
</script>

<template>
  <Window
    title="打字练习 - 金山打字通纪念版"
    icon="fa fa-keyboard-o"
    :isOpen="true"
    :isActive="true"
    :defaultMaximized="true"
    @close="router.push('/')"
  >
    <div class="p-3 select-none">
      <!-- 模式切换 -->
      <div class="flex items-center gap-2 mb-3">
        <button
          v-for="(m, id) in MODES"
          :key="id"
          @click="mode = id as Mode"
          class="px-3 py-1 text-[12px] rounded-md border transition-colors cursor-pointer"
          :class="mode === id
            ? 'bg-[#e8f1fb] border-[#0067c0] text-[#0067c0] font-semibold'
            : 'bg-[#fdfdfd] border-black/10 text-[#1a1a1a] hover:bg-[#f6f6f6]'"
        >
          <i :class="m.icon" class="mr-1"></i>{{ m.name }}
        </button>
        <div class="ml-auto text-[11px] text-[#5d5d5d]">
          最佳：<b class="text-[#0067c0]">{{ bestText }}</b>
        </div>
      </div>

      <!-- 实时统计 -->
      <div class="grid grid-cols-4 gap-2 mb-3 text-center text-[12px]">
        <div class="bg-white border border-[#e5e5e5] rounded-md py-2">
          <div class="text-lg font-semibold text-[#0067c0] leading-tight">{{ wpm }}</div>
          <div class="text-[10px] text-[#8a8a8a]">{{ MODES[mode].unit }}</div>
        </div>
        <div class="bg-white border border-[#e5e5e5] rounded-md py-2">
          <div class="text-lg font-semibold text-[#0067c0] leading-tight">{{ acc }}%</div>
          <div class="text-[10px] text-[#8a8a8a]">准确率</div>
        </div>
        <div class="bg-white border border-[#e5e5e5] rounded-md py-2">
          <div class="text-lg font-semibold text-[#0067c0] leading-tight">{{ fmtTime }}s</div>
          <div class="text-[10px] text-[#8a8a8a]">用时</div>
        </div>
        <div class="bg-white border border-[#e5e5e5] rounded-md py-2">
          <div class="text-lg font-semibold text-[#0067c0] leading-tight">{{ progress }}%</div>
          <div class="text-[10px] text-[#8a8a8a]">进度</div>
        </div>
      </div>

      <!-- 目标文本 -->
      <div class="bg-white border border-[#e5e5e5] rounded-md p-3 text-[15px] leading-[2] font-mono break-all min-h-[96px] text-[#1a1a1a]">
        <span
          v-for="(ch, i) in target"
          :key="i"
          :class="{
            'text-[#0a7a0a]': charState(i) === 'ok',
            'bg-[#c42b1c] text-white rounded-sm': charState(i) === 'bad',
            'bg-[#0067c0] text-white rounded-sm': charState(i) === 'cursor',
            'text-[#5d5d5d]': charState(i) === 'todo',
          }"
        >{{ ch }}</span>
      </div>

      <!-- 输入框 -->
      <textarea
        :value="typed"
        @input="onInput"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder="在此开始输入，计时从第一个字符开始……"
        class="w-full mt-2 h-[64px] bg-white border border-[#e5e5e5] rounded-md p-2 text-[13px] font-mono outline-none resize-none focus:border-[#0067c0] text-[#1a1a1a]"
      ></textarea>

      <!-- 结算面板 -->
      <div v-if="finished" class="fixed inset-0 z-20 bg-black/30 flex items-center justify-center">
        <div class="w-[340px] bg-[#f3f3f3] border border-black/10 rounded-lg shadow-[0_16px_48px_rgba(0,0,0,0.28)] overflow-hidden">
          <div class="h-10 flex items-center px-4 border-b border-black/[0.06]">
            <i class="fa fa-trophy text-[#0067c0] text-[13px] mr-2"></i>
            <span class="text-[#1a1a1a] text-[13px] font-semibold flex-1">打字成绩单</span>
          </div>
          <div class="p-5 text-center">
            <div v-if="newRecord" class="text-[#c42b1c] font-semibold text-[12px] mb-2">🏆 新纪录！</div>
            <div class="text-4xl font-semibold text-[#0067c0]">{{ wpm }} <span class="text-sm">{{ MODES[mode].unit }}</span></div>
            <div class="text-[12px] text-[#5d5d5d] mt-2">
              准确率 {{ acc }}% · 用时 {{ fmtTime }}s · {{ target.length }} 字符
            </div>
            <div class="text-[11px] text-[#8a8a8a] mt-1">本机最佳：{{ bestText }}</div>
            <div class="flex justify-center gap-2 mt-4">
              <button @click="nextText" class="win11-btn win11-btn-accent">再来一段</button>
            </div>
          </div>
        </div>
      </div>

      <div class="text-[10px] text-[#8a8a8a] mt-2">
        提示：从第一个字符起自动计时 · 退格可修正 · 输入法在中文模式下正常使用
      </div>
    </div>
  </Window>
</template>
