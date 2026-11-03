<script setup lang="ts">
// 桌宠：大肥鱼（DeepSeek 娘化形象）。
// 形象素材来自 DSH dsh-pet 插件包（assets/webm 动画 + memes 表情包），复制到 public/pet，
// 插件本体不受影响。webm 素材为 16:9（高 = 宽 × 9/16），角色默认朝左，scaleX(-1) 朝右。
// - 任务栏模式自主漫步/做小动作；拖到桌面任意处悬浮住下；双击悬浮的大肥鱼回家
// - 90 秒无互动打瞌睡（原地小憩沉眠循环）；位置/模式/心情/饱食 localStorage 持久化
// - 拖拽时播放"被鼠标拖拽悬空反馈"并循环
// - 拖拽甩手可抛掷：惯性飞行、撞墙弹地、摔狠了冒星星发晕；飞行中可接住
// - 可以骑在打开的窗口标题栏上；拖到回收站上会惊慌挣扎，松手逃回任务栏
// - 右键弹 Win11 菜单：喂零食/摸摸头/哄睡觉/回任务栏
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { asset } from '../assets-base';

// ============ 动画池（与 dsh-pet assets/config.jsonc 同源，文件均已复制） ============
const ANIM = {
  idle: ['待机呼吸休闲'],
  turn: ['东张西望'],
  drag: ['被鼠标拖拽悬空反馈'],
  sleep: ['原地小憩沉眠'],
  eat: ['大口吃零食', '吃Token', '吃白饭'],
  clicks: [
    '点击回应-开心跃动',
    '点击回应-害羞惊讶',
    '点击回应-傲娇生气',
    '点击回应-挠痒咯咯笑',
    '点击回应-元气挥手',
  ],
  dizzy: ['被吓一跳'],
};
// 移动动画（minDist/maxDist 以本桌宠实际宽度为基准自行调校）
const MOVE_ACTIONS: Array<{ name: string; min: number; max: number; lead: number; tail: number }> = [
  { name: '螃蟹走路', min: 50, max: 180, lead: 0.6, tail: 0.6 },
  { name: '原地漂浮踏步', min: 40, max: 110, lead: 0.5, tail: 0.8 },
  { name: '原地左转奔跑', min: 100, max: 260, lead: 0.6, tail: 1.2 },
];
// 随机动作分类池（带文字的动画镜像会颠倒文字 → 朝右时按素材原方向播）
const CATEGORIES: Array<{ weight: number; noMirror?: boolean; actions: string[] }> = [
  { weight: 24, actions: ['悠闲哼歌', '超大伸懒腰', '原地敲击桌面互动', '哈欠连天', '被吓一跳', '照镜子', '写代码', '摇扇纳凉'] },
  { weight: 26, actions: ['原地专心玩魔方', '原地蹲下玩玩具汽车', '鲸鱼吐泡泡特效', '玩游戏气急败坏', '玩水枪', '可爱宅舞', '吹气球', '放风筝', '拆礼物', '骑木马', '荡秋千', '撸猫'] },
  { weight: 18, actions: ['吃白饭', '大口吃零食', '吃Token', '吃早餐', '吃午餐', '吃晚餐', '吃冰淇淋融化', '吃西瓜', '涮火锅'] },
  { weight: 16, actions: ['堆雪人', '放烟花', '吃粽子', '收红包', '写福字', '放孔明灯', '装点圣诞树', '吃汤圆', '吃饺子'] },
  { weight: 10, noMirror: true, actions: ['是啊，吃什么', '深度思考碎碎念'] },
];
const NO_MIRROR = new Set<string>(CATEGORIES.filter(c => c.noMirror).flatMap(c => c.actions));

// 全量动画清单（含移动/事件动画）：挂载后全部预加载，任何动作触发都零等待
const ALL_ANIMS: string[] = Array.from(new Set([
  ...ANIM.idle, ...ANIM.turn, ...ANIM.drag, ...ANIM.sleep, ...ANIM.eat,
  ...ANIM.clicks, ...ANIM.dizzy,
  ...MOVE_ACTIONS.map(m => m.name),
  ...CATEGORIES.flatMap(c => c.actions),
]));

// ============ 台词库（大肥鱼语气） ============
const QUOTES = [
  '鱼片有资源吗？',
  '哦鲸鲸…',
  'Ciallo～(∠・ω< )⌒☆',
  '今天也要加油鸭！',
  '你有一条来自大肥鱼的消息',
  '省着点 token，钱包会感谢我',
  '别盯着我看啦，会害羞的',
  '摸鱼可耻，但大肥鱼可以',
  '我可是 DeepSeek 的看板娘！',
  '要来局飞机大战吗？',
];
const HAPPY_QUOTES = [
  '开心得尾巴都要摇起来啦！',
  '今天心情超好，鲸鲸你哦～',
  '啦啦啦～大肥鱼超厉害！',
];
const GRUMPY_QUOTES = [
  '哼，不理你了（转身摆尾）',
  '好无聊啊…',
  '压力一只大肥鱼…',
];
const HUNGRY_QUOTES = [
  '肚子咕咕叫了…有零食吗？',
  '闻到 Token 烤焦的味道了吗？',
  '再不喂我，我就吃白饭给你看！',
];
const FEED_OK_QUOTES = ['真好吃！', '嗝—，吃饱饱～', '再来一份嘛～', '就一碗！就一碗！'];
const FEED_FULL_QUOTES = ['撑死啦，吃不下啦…', '再吃就要变成鲸鱼了！'];
const PAT_CD_QUOTES = ['好啦好啦，摸够啦～', '鳞片都被你摸乱了啦'];
const RIDE_QUOTES = ['上面风景不错！', '驮着我走呀，真乖～', '这里归我啦', '！报！大肥鱼号已就位'];
const RIDE_OFF_QUOTES = ['哇啊啊——！', '呀！要掉下去啦！'];
const DIZZY_QUOTES = ['晕……', '哎呦……眼冒金星', '你看到几条我…'];
const CATCH_QUOTES = ['接住我了！', '呼——吓死鱼了'];
const BIN_PANIC_QUOTES = ['不要丢下我！！', '啊啊啊别把我格式化！'];
const BIN_ESCAPE_QUOTES = ['吓死我了…', '好险好险…', '回收站是大肥鱼一生的噩梦'];
const WAKE_QUOTES = ['唔……醒了醒了', '干嘛呀，人家睡着呢'];

// 情境感知台词
const APP_QUOTES: Array<[RegExp, string[]]> = [
  [/^\/airplane/, ['需要僚机吗？', '可别被打下来呀！', '人家也会飞哦～']],
  [/^\/survivors/, ['守住基地！我给你助威！', '怪物好多…你小心点']],
  [/^\/terminal/, ['在敲命令吗？懂哦懂哦', 'sudo 给我零食', '黑底白字，真酷']],
  [/^\/paint/, ['画我画我！我超好画的！', '把我画成壁纸好不好？']],
  [/^\/notepad/, ['在写东西？我安静陪你～', '稿子记得保存哦']],
  [/^\/calculator/, ['二加二等于四，我都知道', '算算还剩几包零食？']],
  [/^\/typing/, ['打快点呀，别比我游泳还慢', '小拇指又在偷懒了']],
  [/^\/computer/, ['我这台机器配置还不错吧？', 'C 盘又红了？该清理啦']],
  [/^\/all-notes|^\/notes/, ['在看文章？我小声点', '这篇是好文章，信我']],
  [/^\/categories/, ['有什么好玩的新设置吗？']],
];

// 玩法说明内容
const PET_TIPS = [
  { icon: 'fa fa-hand-pointer-o', title: '单击我', desc: '我会做出开心/害羞/生气等随机反应，还会跟你搭话。' },
  { icon: 'fa fa-arrows', title: '按住拖动', desc: '拎着我满桌面走，松手落在哪儿就住在哪儿（悬浮模式）；双击悬浮的我，送我回任务栏。' },
  { icon: 'fa fa-rocket', title: '快速甩出去', desc: '拖住我快速一甩 = 抛掷！惯性飞行、撞墙弹地，摔狠了会冒星星发晕；飞行途中点我一下能把我接住。' },
  { icon: 'fa fa-window-maximize', title: '骑在窗口上', desc: '把我悬到任意窗口标题栏附近松手，我会跳上去坐着；拖动窗口我会跟着走，甩得太猛会被甩下来。' },
  { icon: 'fa fa-trash-o', title: '离回收站远点', desc: '把我拖到回收站上方……我会拼命挣扎。松手后一溜烟逃回任务栏，吓死鱼了。' },
  { icon: 'fa fa-cutlery', title: '投喂与摸头', desc: '右键打开菜单：喂零食、摸摸头、哄睡觉。心情和饱食度会随时间下降，离线也会饿，记得常回来看看。' },
  { icon: 'fa fa-bed', title: '冷落我试试', desc: '90 秒没互动我就地打瞌睡；被吵醒还会嘀咕两句。' },
];

// ============ 常量 ============
const TASKBAR_H = 48;               // Win11 任务栏高度（与 Taskbar.vue h-12 对应）
const STATE_KEY = 'dafeiyu-pet-state';
const SLEEP_AFTER_MS = 90000;
const PET_W = 252;
const PET_H = Math.round(PET_W * 9 / 16); // 142，16:9（原 84 宽，放大 3 倍）

// 心情系统参数
const MOOD = {
  feedSatiety: 28,
  feedMood: 6,
  fullBelly: 92,
  patMood: 7,
  patCdMs: 4000,
  decaySatietyPerMin: 0.5,
  decayMoodCalm: 0.25,
  decayMoodHungry: 0.9,
  sleepFactor: 0.4,
  offlineSatietyPerHour: 7,
  offlineMoodPerHour: 9,
};

// 抛掷物理参数（px/s，bottom-up 坐标）
const PHYS = {
  gravity: 2300,
  flingMinSpeed: 520,
  maxSpeed: 2600,
  bounceGround: 0.42,
  bounceWall: 0.5,
  bounceTop: 0.35,
  stopSpeed: 10,
  rideShake: 950,
  dizzyImpact: 950,
};

const route = useRoute();

// ============ 基础状态 ============
const x = ref(80);
const restBottom = ref(TASKBAR_H);
const lift = ref(0);
const bottomOverride = ref<number | null>(null);
const dir = ref<'left' | 'right'>('left');   // 面向：素材默认朝左
const moving = ref(false);
const busy = ref(false);                      // 正在播一次性动画（点击回应等）
const bubble = ref<string | null>(null);
const dragging = ref(false);
const sleeping = ref(false);

// 抛掷 / 骑窗 / 发晕
const flying = ref(false);
const rot = ref(0);
const dizzy = ref(false);
const riding = ref(false);
const panicking = ref(false);

// 凑近歪头
const watching = ref(false);
const lean = ref(0);

// 心情 / 饱食
const satiety = ref(80);
const mood = ref(78);

// 菜单 / 动画小元素
const menuOpen = ref(false);
const menuPos = ref({ x: 0, y: 0 });
const snackVisible = ref(false);
const heartList = ref<number[]>([]);
const helpOpen = ref(false);

const petEl = ref<HTMLElement | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
let dizzyTimer: ReturnType<typeof setTimeout> | undefined;
let snackTimer: ReturnType<typeof setTimeout> | undefined;
let heartTimer: ReturnType<typeof setTimeout> | undefined;
let vitalsTimer: ReturnType<typeof setInterval> | undefined;
let animToken = 0;
let moveRAF = 0;
let vw = window.innerWidth;
let lastActive = Date.now();
let lastVitalAt = Date.now();
let lastPatAt = 0;
let hintLockUntil = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isFloating = (): boolean => restBottom.value > TASKBAR_H + 30;

const moodTier = computed<'great' | 'ok' | 'low'>(() =>
  mood.value >= 75 ? 'great' : mood.value >= 45 ? 'ok' : 'low'
);
const moodLabel = computed(() => {
  if (satiety.value < 25) return '饿肚子';
  if (mood.value >= 75) return '开心';
  if (mood.value >= 45) return '平静';
  return '小情绪';
});
const bubbleBelow = computed(() =>
  (bottomOverride.value ?? restBottom.value + lift.value) > window.innerHeight - 170
);
// 身体姿态：飞行旋转 / 被注视时轻微前倾
const bodyStyle = computed<Record<string, string> | undefined>(() => {
  if (flying.value) return { transform: `rotate(${rot.value.toFixed(1)}deg)` };
  if (watching.value && !moving.value && !dragging.value && !sleeping.value && !riding.value && !panicking.value) {
    return { transform: `rotate(${lean.value.toFixed(2)}deg)` };
  }
  return undefined;
});
// 镜像：素材默认朝左，朝右时翻转；noMirror 动画（带文字）按素材原方向播
const mirror = computed(() => {
  if (NO_MIRROR.has(currentAnim.value) && dir.value === 'right') return false;
  return dir.value === 'right';
});

// ============ 动画播放（webm 切换，双缓冲：新动画加载就位后才切显示，避免切换瞬间白帧/消失） ============
const currentAnim = ref('待机呼吸休闲');
const videoA = ref<HTMLVideoElement | null>(null);
const videoB = ref<HTMLVideoElement | null>(null);
const frontIsA = ref(true);
// 预加载缓存：已播过的动画再次播放零延迟
const animPreload = new Set<string>();
// 透明视频支持性：不支持（夸克等国产内核、旧浏览器）时降级为静态形象图，
// 否则整个桌宠会rendering成黑底长方块
const alphaOk = ref(true);

function detectAlphaSupport(): void {
  try {
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 2;
    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) { alphaOk.value = false; return; }
    // VP9-in-WebM 解码支持探测（iOS Safari < 16.4 / 老内核不支持）
    const canVp9 = gl.getExtension('WEBGL_compressed_texture_vp9')
      || document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== '';
    // 夸克/UC 等国内壳的 UA 特征 + canPlayType 通过但实际 alpha 渲染异常，无法纯 JS 检测，
    // 用保守策略：非主流内核 UA 检测（Quark/UC/QQ浏览器/百度）直接降级
    const ua = navigator.userAgent;
    const shell = /Quark|UCBrowser|MQQBrowser|Baidu| Hey|HeyTap|OppoBrowser|VivoBrowser/.test(ua);
    alphaOk.value = canVp9 && !shell;
  } catch {
    alphaOk.value = true; // 检测失败按支持处理，保持原体验
  }
}

function animUrl(name: string): string {
  return asset(`pet/webm/${encodeURIComponent(name)}.webm`);
}

function preloadAnim(name: string): void {
  if (animPreload.has(name)) return;
  animPreload.add(name);
  // 静默预热：让浏览器缓存该 webm（HTTP 缓存持久生效，不清空 src，避免二次播放重新下载）
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.src = animUrl(name);
  v.load();
}

function playAnim(name: string, opts?: { loop?: boolean; onEnd?: () => void }): void {
  // 降级模式：不支持透明视频时只换台词/状态，形象保持静态图
  if (!alphaOk.value) { currentAnim.value = name; opts?.onEnd?.(); return; }
  // 双缓冲：写向"当前不在前台"的那个 video；单 video 兜底（理论上不会走到）
  const next = (frontIsA.value ? videoB.value : videoA.value) ?? videoA.value ?? videoB.value;
  if (!next) return;
  const my = ++animToken;
  currentAnim.value = name;
  next.loop = !!opts?.loop;
  const onEnded = () => {
    if (my !== animToken) return;
    next.removeEventListener('ended', onEnded);
    opts?.onEnd?.();
  };
  next.addEventListener('ended', onEnded);
  // 加载兜底：素材加载失败/卡住时释放 token，防止状态机永久挂起
  const loadGuard = () => {
    if (my !== animToken) return;
    next.removeEventListener('error', loadGuard);
    opts?.onEnd?.();
  };
  next.addEventListener('error', loadGuard);
  const onReady = () => {
    if (my !== animToken) { next.removeEventListener('loadeddata', onReady); return; }
    next.removeEventListener('loadeddata', onReady);
    next.removeEventListener('error', loadGuard);
    // 双缓冲就位切换：淡入新视频，旧视频暂停退场
    const old = videoA.value && videoB.value ? (frontIsA.value ? videoA.value : videoB.value) : null;
    if (old && old !== next) {
      old.pause();
      old.classList.remove('is-front');
    }
    next.classList.add('is-front');
    if (videoA.value && videoB.value) frontIsA.value = next === videoA.value;
    next.play().catch(() => { /* 自动播放被拦截时静默 */ });
  };
  next.addEventListener('loadeddata', onReady);
  // 若已在缓存中（秒回），loadeddata 可能不再触发——直接检查状态
  if (next.readyState >= 2) {
    next.removeEventListener('loadeddata', onReady);
    onReady();
  }
  next.src = animUrl(name);
  next.load();
  next.play().catch(() => { /* 等 loadeddata 后再播 */ });
}

function playIdle(): void {
  playAnim(pick(ANIM.idle), { loop: true });
}

// ============ 持久化 ============
function loadState(): void {
  let sat = 80;
  let md = 78;
  let lastSeen = 0;
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (s && typeof s.x === 'number' && typeof s.bottom === 'number') {
      x.value = Math.max(4, Math.min(vw - PET_W - 4, s.x));
      restBottom.value = Math.max(TASKBAR_H, Math.min(window.innerHeight - 120, s.bottom));
    }
    if (s && typeof s.satiety === 'number') sat = s.satiety;
    if (s && typeof s.mood === 'number') md = s.mood;
    if (s && typeof s.lastSeen === 'number') lastSeen = s.lastSeen;
  } catch { /* 忽略 */ }
  const awayMin = lastSeen > 0 ? (Date.now() - lastSeen) / 60000 : 0;
  if (awayMin > 3) {
    sat = Math.max(5, sat - Math.min(70, awayMin * (MOOD.offlineSatietyPerHour / 60)));
    md = Math.max(10, md - Math.min(70, awayMin * (MOOD.offlineMoodPerHour / 60)));
  }
  satiety.value = sat;
  mood.value = md;
  lastVitalAt = Date.now();
}

function saveState(): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      x: x.value,
      bottom: restBottom.value,
      satiety: Math.round(satiety.value),
      mood: Math.round(mood.value),
      lastSeen: Date.now(),
    }));
  } catch { /* 忽略 */ }
}

function updateVitals(): void {
  const now = Date.now();
  const dtMin = (now - lastVitalAt) / 60000;
  lastVitalAt = now;
  if (dtMin <= 0) return;
  if (dtMin > 2) {
    satiety.value = Math.max(5, satiety.value - Math.min(70, dtMin * (MOOD.offlineSatietyPerHour / 60)));
    mood.value = Math.max(10, mood.value - Math.min(70, dtMin * (MOOD.offlineMoodPerHour / 60)));
  } else {
    const f = sleeping.value ? MOOD.sleepFactor : 1;
    satiety.value = Math.max(0, satiety.value - MOOD.decaySatietyPerMin * dtMin * f);
    mood.value = Math.max(0, mood.value - (satiety.value < 25 ? MOOD.decayMoodHungry : MOOD.decayMoodCalm) * dtMin * f);
  }
  saveState();
}

// ============ 气泡 ============
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function say(text: string): void {
  bubble.value = text;
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.value = null; }, 2400);
}

function showBubble(): void {
  if (sleeping.value) return;
  if (Date.now() < hintLockUntil) return;
  const ctx = APP_QUOTES.find(([re]) => re.test(route.path));
  if (ctx && Math.random() < 0.6) { say(pick(ctx[1])); return; }
  if (satiety.value < 25 && Math.random() < 0.5) { say(pick(HUNGRY_QUOTES)); return; }
  const tier = moodTier.value;
  if (tier === 'great' && Math.random() < 0.35) { say(pick(HAPPY_QUOTES)); return; }
  if (tier === 'low' && Math.random() < 0.4) { say(pick(GRUMPY_QUOTES)); return; }
  say(pick(QUOTES));
}

function schedule(ms: number): void {
  timer = setTimeout(tick, ms);
}

// ============ 随机动作 ============
function rollCategoryAction(): { name: string; noMirror: boolean } | null {
  const total = CATEGORIES.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CATEGORIES) {
    r -= c.weight;
    if (r < 0) return { name: pick(c.actions), noMirror: !!c.noMirror };
  }
  return null;
}

// ============ 行为 AI（受心情影响） ============
function tick(): void {
  if (dragging.value || flying.value) { schedule(1200); return; }
  if (riding.value) {
    if (Math.random() < 0.22) { if (Math.random() < 0.5) say(pick(RIDE_QUOTES)); else showBubble(); }
    schedule(2600 + Math.random() * 2600);
    return;
  }
  // 90 秒无互动 → 打瞌睡
  if (!sleeping.value && Date.now() - lastActive > SLEEP_AFTER_MS) {
    sleeping.value = true;
    bubble.value = 'Zzz…';
    if (bubbleTimer) clearTimeout(bubbleTimer);
    playAnim(pick(ANIM.sleep), { loop: true });
    schedule(3000);
    return;
  }
  if (sleeping.value) {
    if (Math.random() < 0.15) playAnim(pick(ANIM.sleep), { loop: true });
    schedule(3000 + Math.random() * 2000);
    return;
  }
  if (busy.value) { schedule(800); return; }
  // 悬浮模式：原地不动，偶尔闲聊
  if (isFloating()) {
    if (Math.random() < 0.3) showBubble();
    schedule(2500 + Math.random() * 2500);
    return;
  }
  if (moving.value) {
    moving.value = false;
    if (Math.random() < 0.22) showBubble();
    schedule(1400 + Math.random() * 2600);
    return;
  }
  if (menuOpen.value) {
    if (Math.random() < 0.25) showBubble();
    schedule(1800);
    return;
  }
  if (satiety.value < 25 && Math.random() < 0.18) {
    say(pick(HUNGRY_QUOTES));
    schedule(2400 + Math.random() * 2000);
    return;
  }
  const tier = moodTier.value;
  const walkP = tier === 'great' ? 0.5 : tier === 'low' ? 0.3 : 0.42;
  const actP = tier === 'great' ? 0.3 : tier === 'low' ? 0.16 : 0.24;
  const r = Math.random();
  if (!reducedMotion && r < walkP) {
    startMove();
  } else if (!reducedMotion && r < walkP + actP) {
    startAction();
  } else {
    if (Math.random() < 0.4) showBubble();
    schedule(1600 + Math.random() * 2800);
  }
}

// 播放移动动画并同步位移（视频 lead/tail 秒原地，中间段线性走位）
function startMove(): void {
  const act = pick(MOVE_ACTIONS);
  if (x.value < vw * 0.18) dir.value = 'right';
  else if (x.value > vw * 0.82) dir.value = 'left';
  else dir.value = Math.random() < 0.5 ? 'left' : 'right';
  const dist = act.min + Math.random() * (act.max - act.min);
  const sgn = dir.value === 'right' ? 1 : -1;
  const target = Math.max(6, Math.min(vw - PET_W - 6, x.value + sgn * dist));
  const realDist = Math.abs(target - x.value);
  if (realDist < 24) { playIdle(); schedule(1600); return; }
  moving.value = true;
  const startX = x.value;
  const my = animToken;
  playAnim(act.name, {
    onEnd: () => {
      if (my !== animToken) return;
      cancelAnimationFrame(moveRAF);
      x.value = target;
      moving.value = false;
      saveState();
      schedule(1400 + Math.random() * 2400);
    },
  });
  const t0 = performance.now();
  const fallbackDur = 2600;
  const step = (): void => {
    if (my !== animToken || !moving.value) return;
    // 读当前前台视频的播放进度驱动位移（双缓冲下取 is-front 的那个）
    const v = frontIsA.value ? videoA.value : videoB.value;
    const dur = (v && Number.isFinite(v.duration) && v.duration > 0) ? v.duration * 1000 : fallbackDur;
    const t = v ? v.currentTime * 1000 : (performance.now() - t0);
    const span = Math.max(200, dur - (act.lead + act.tail) * 1000);
    const p = Math.max(0, Math.min(1, (t - act.lead * 1000) / span));
    x.value = Math.round(startX + (target - startX) * p);
    moveRAF = requestAnimationFrame(step);
  };
  moveRAF = requestAnimationFrame(step);
}

// 播放随机小动作（一次性）
function startAction(): void {
  const act = rollCategoryAction();
  if (!act) { playIdle(); schedule(2000); return; }
  busy.value = true;
  const my = animToken;
  playAnim(act.name, {
    onEnd: () => {
      if (my !== animToken) return;
      busy.value = false;
      if (Math.random() < 0.35) showBubble();
      schedule(1600 + Math.random() * 2600);
    },
  });
}

// 单击回应
function react(): void {
  if (busy.value || sleeping.value) return;
  busy.value = true;
  const my = animToken;
  playAnim(pick(ANIM.clicks), {
    onEnd: () => {
      if (my !== animToken) return;
      busy.value = false;
      schedule(1500 + Math.random() * 2000);
    },
  });
}

// 回到任务栏
function goHome(): void {
  if (riding.value) { hopOffRide(); return; }
  bottomOverride.value = null;
  restBottom.value = TASKBAR_H;
  lift.value = 0;
  saveState();
  showBubble();
  schedule(1600);
}

// ============ 抛掷物理 ============
const fling = { left: 0, bottom: 0, vx: 0, vy: 0, rot: 0, impact: 0 };
let flingRAF = 0;
let flingLast = 0;

function startFling(vx: number, vyUp: number): void {
  if (riding.value) detachRide();
  panicking.value = false;
  menuOpen.value = false;
  moving.value = false;
  cancelAnimationFrame(moveRAF);
  if (reducedMotion) {
    restBottom.value = TASKBAR_H;
    lift.value = 0;
    saveState();
    schedule(1200);
    return;
  }
  fling.vx = Math.max(-PHYS.maxSpeed, Math.min(PHYS.maxSpeed, vx));
  fling.vy = Math.max(-PHYS.maxSpeed, Math.min(PHYS.maxSpeed, vyUp));
  fling.left = x.value;
  fling.bottom = restBottom.value + lift.value;
  fling.rot = 0;
  fling.impact = 0;
  flying.value = true;
  bottomOverride.value = fling.bottom;
  // 空中姿势：循环播"被拎起来"
  playAnim(pick(ANIM.drag), { loop: true });
  flingLast = performance.now();
  cancelAnimationFrame(flingRAF);
  flingRAF = requestAnimationFrame(flingFrame);
}

function flingFrame(now: number): void {
  const dt = Math.min(0.033, (now - flingLast) / 1000);
  flingLast = now;
  if (!stepFling(dt)) flingRAF = requestAnimationFrame(flingFrame);
}

function stepFling(dt: number): boolean {
  fling.vx *= Math.max(0, 1 - 0.10 * dt);
  fling.vy -= PHYS.gravity * dt;
  fling.left += fling.vx * dt;
  fling.bottom += fling.vy * dt;
  fling.rot += fling.vx * 0.10 * dt;
  if (fling.left < 4) {
    fling.left = 4;
    fling.impact = Math.max(fling.impact, Math.abs(fling.vx));
    fling.vx = Math.abs(fling.vx) * PHYS.bounceWall;
  } else if (fling.left > vw - PET_W - 4) {
    fling.left = vw - PET_W - 4;
    fling.impact = Math.max(fling.impact, Math.abs(fling.vx));
    fling.vx = -Math.abs(fling.vx) * PHYS.bounceWall;
  }
  const ceil = window.innerHeight - PET_H - TASKBAR_H - 6;
  if (fling.bottom > ceil) {
    fling.bottom = ceil;
    fling.vy = -Math.abs(fling.vy) * PHYS.bounceTop;
  }
  if (fling.bottom <= TASKBAR_H) {
    fling.bottom = TASKBAR_H;
    const imp = Math.abs(fling.vy);
    fling.impact = Math.max(fling.impact, imp);
    if (imp > 70) {
      fling.vy = imp * PHYS.bounceGround;
      fling.vx *= 0.72;
    } else {
      fling.vy = 0;
      fling.vx *= Math.max(0, 1 - 6 * dt);
      if (Math.abs(fling.vx) < PHYS.stopSpeed) {
        settleFling();
        return true;
      }
    }
  }
  x.value = Math.round(fling.left);
  bottomOverride.value = fling.bottom;
  rot.value = fling.rot;
  return false;
}

function settleFling(): void {
  flying.value = false;
  rot.value = 0;
  bottomOverride.value = null;
  x.value = Math.round(Math.max(4, Math.min(vw - PET_W - 4, fling.left)));
  restBottom.value = fling.bottom <= TASKBAR_H + 30 ? TASKBAR_H : Math.min(fling.bottom, window.innerHeight - PET_H - 6);
  lift.value = 0;
  if (fling.impact > PHYS.dizzyImpact) {
    dizzy.value = true;
    mood.value = Math.max(0, mood.value - 2);
    say(pick(DIZZY_QUOTES));
    busy.value = true;
    const my = animToken;
    playAnim(pick(ANIM.dizzy), {
      onEnd: () => { if (my === animToken) busy.value = false; },
    });
    if (dizzyTimer) clearTimeout(dizzyTimer);
    dizzyTimer = setTimeout(() => { dizzy.value = false; }, 1800);
  } else if (Math.random() < 0.4) {
    showBubble();
  }
  saveState();
  schedule(1400);
}

function catchFling(): void {
  cancelAnimationFrame(flingRAF);
  flying.value = false;
  rot.value = 0;
  bottomOverride.value = null;
  x.value = Math.round(Math.max(4, Math.min(vw - PET_W - 4, fling.left)));
  restBottom.value = Math.max(TASKBAR_H, Math.min(window.innerHeight - PET_H - 6, fling.bottom));
  lift.value = 0;
  if (Math.random() < 0.6) say(pick(CATCH_QUOTES));
  playIdle();
  schedule(1400);
}

// ============ 骑窗口 ============
let rideEl: HTMLElement | null = null;
let rideRAF = 0;
let rideLast = 0;
let rideRel = 0;
let prevRect: DOMRect | null = null;
let hintWin: HTMLElement | null = null;

function findRideCandidate(feetY: number, centerX: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestDiff = 34;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.win-window'))) {
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 60) continue;
    const diff = Math.abs(feetY - r.top);
    if (diff < bestDiff && centerX > r.left - 14 && centerX < r.right + 14) {
      best = el;
      bestDiff = diff;
    }
  }
  return best;
}

function startRide(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  if (r.width < 80) return;
  riding.value = true;
  rideEl = el;
  rideRel = Math.max(2, Math.min(Math.max(2, r.width - PET_W), x.value - r.left));
  prevRect = r;
  rideLast = performance.now();
  x.value = Math.round(Math.max(4, Math.min(vw - PET_W - 4, r.left + rideRel)));
  bottomOverride.value = window.innerHeight - r.top;
  moving.value = false;
  say(pick(RIDE_QUOTES));
  playIdle();
  cancelAnimationFrame(rideRAF);
  rideRAF = requestAnimationFrame(rideFrame);
}

function rideFrame(now: number): void {
  if (!riding.value || !rideEl) return;
  const dt = Math.min(0.05, (now - rideLast) / 1000);
  rideLast = now;
  const r = rideEl.getBoundingClientRect();
  if (!rideEl.isConnected || r.width < 10) {
    detachRide();
    startFling(0, -60);
    return;
  }
  const vxw = prevRect && dt >= 0.004 ? (r.left - prevRect.left) / dt : 0;
  const vywDown = prevRect && dt >= 0.004 ? (r.top - prevRect.top) / dt : 0;
  prevRect = r;
  if (Math.hypot(vxw, vywDown) > PHYS.rideShake) {
    const vx = vxw;
    const vyUp = -vywDown + 160;
    detachRide();
    startFling(vx, vyUp);
    say(pick(RIDE_OFF_QUOTES));
    return;
  }
  rideRel = Math.max(2, Math.min(Math.max(2, r.width - PET_W), rideRel));
  x.value = Math.round(Math.max(4, Math.min(vw - PET_W - 4, r.left + rideRel)));
  bottomOverride.value = window.innerHeight - r.top;
  rideRAF = requestAnimationFrame(rideFrame);
}

function detachRide(): void {
  const b = bottomOverride.value;
  riding.value = false;
  rideEl = null;
  prevRect = null;
  bottomOverride.value = null;
  cancelAnimationFrame(rideRAF);
  if (b != null) restBottom.value = Math.max(TASKBAR_H, Math.min(window.innerHeight - PET_H - 6, b));
  lift.value = 0;
}

function hopOffRide(): void {
  detachRide();
  startFling((Math.random() < 0.5 ? -1 : 1) * 160, 320);
}

function clearRideHint(): void {
  if (hintWin) {
    const tb = hintWin.querySelector<HTMLElement>('.win-titlebar');
    if (tb) tb.style.outline = '';
    hintWin = null;
  }
}

// ============ 回收站彩蛋 ============
let binHot = false;

function setBinHot(on: boolean, bin: HTMLElement | null): void {
  if (on === binHot) return;
  binHot = on;
  if (!bin) return;
  bin.style.filter = on
    ? 'brightness(1.25) saturate(1.6) drop-shadow(0 0 6px rgba(255,40,40,.85))'
    : '';
}

function escapeHome(): void {
  panicking.value = false;
  const bin = document.querySelector<HTMLElement>('[data-icon="bin"]');
  setBinHot(false, bin);
  if (bin) {
    try {
      bin.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
        { duration: 280 }
      );
    } catch { /* 老浏览器无 WAAPI，忽略 */ }
  }
  moving.value = true;
  dir.value = 'left';
  restBottom.value = TASKBAR_H;
  lift.value = 0;
  bottomOverride.value = null;
  x.value = 8;
  say(pick(BIN_ESCAPE_QUOTES));
  mood.value = Math.max(0, mood.value - 3);
  saveState();
  playIdle();
  schedule(1800);
}

// ============ 心情交互（右键菜单） ============
function spawnHearts(n: number): void {
  heartList.value = Array.from({ length: n }, (_, i) => i);
  if (heartTimer) clearTimeout(heartTimer);
  heartTimer = setTimeout(() => { heartList.value = []; }, 1000);
}

function doFeed(): void {
  closeMenu();
  wake();
  if (snackVisible.value) return; // 吃零食期间不重复投喂
  if (satiety.value >= MOOD.fullBelly) {
    say(pick(FEED_FULL_QUOTES));
    react();
    return;
  }
  snackVisible.value = true;
  const my = animToken;
  playAnim(pick(ANIM.eat), {
    onEnd: () => {
      if (my !== animToken) return;
      snackVisible.value = false;
      satiety.value = Math.min(100, satiety.value + MOOD.feedSatiety);
      mood.value = Math.min(100, mood.value + MOOD.feedMood);
      say(pick(FEED_OK_QUOTES));
      if (mood.value >= 75) spawnHearts(1);
      playIdle();
      saveState();
      schedule(1600);
    },
  });
  if (snackTimer) clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { snackVisible.value = false; }, 5000); // 兜底收尾
}

function doPat(): void {
  closeMenu();
  wake();
  const now = Date.now();
  if (now - lastPatAt < MOOD.patCdMs) {
    say(pick(PAT_CD_QUOTES));
    mood.value = Math.min(100, mood.value + 1);
    saveState();
    return;
  }
  lastPatAt = now;
  mood.value = Math.min(100, mood.value + MOOD.patMood);
  spawnHearts(3);
  react();
  saveState();
}

function doSleep(): void {
  closeMenu();
  if (sleeping.value) {
    sleeping.value = false;
    if (bubble.value === 'Zzz…') bubble.value = null;
    say(pick(WAKE_QUOTES));
    playIdle();
    schedule(1500);
  } else {
    if (timer) clearTimeout(timer);
    moving.value = false;
    sleeping.value = true;
    bubble.value = 'Zzz…';
    playAnim(pick(ANIM.sleep), { loop: true });
    schedule(3000);
  }
  saveState();
}

function doGoHome(): void {
  closeMenu();
  wake();
  goHome();
}

function openHelp(): void {
  closeMenu();
  helpOpen.value = true;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function openMenuAt(clientX: number, clientY: number): void {
  const el = petEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const offX = vw - 190 - rect.left < -10
    ? -186
    : Math.max(-10, Math.min(clientX - rect.left, vw - 190 - rect.left));
  const offY = window.innerHeight - 250 - rect.top < -6
    ? -248
    : Math.max(-6, Math.min(clientY - rect.top, window.innerHeight - 250 - rect.top));
  menuPos.value = { x: offX, y: offY };
  menuOpen.value = true;
}

function onPetContext(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (flying.value) return;
  openMenuAt(e.clientX, e.clientY);
}

// ============ 拖拽 ============
let grabDx = 0;
let grabOffset = 0;
let downX = 0;
let downY = 0;
let downAt = 0;
let moved = false;
let lastClickAt = 0;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressFired = false;
const velBuf: Array<{ t: number; x: number; y: number }> = [];

function clearLongPress(): void {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = undefined;
}

function wake(): void {
  lastActive = Date.now();
  if (sleeping.value) {
    sleeping.value = false;
    if (bubble.value === 'Zzz…') bubble.value = null;
    playIdle();
  }
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  if (flying.value) catchFling();
  wake();
  dragging.value = true;
  panicking.value = false;
  moving.value = false;
  busy.value = false;
  cancelAnimationFrame(moveRAF);
  if (timer) clearTimeout(timer);
  menuOpen.value = false;
  const el = petEl.value;
  if (!el) return;
  try { el.setPointerCapture(e.pointerId); } catch { /* 合成事件无活动指针，忽略 */ }
  const rect = el.getBoundingClientRect();
  grabDx = e.clientX - rect.left;
  grabOffset = e.clientY - rect.bottom;
  downX = e.clientX;
  downY = e.clientY;
  downAt = Date.now();
  moved = false;
  velBuf.length = 0;
  velBuf.push({ t: performance.now(), x: e.clientX, y: e.clientY });
  playAnim(pick(ANIM.drag), { loop: true });
  longPressFired = false;
  clearLongPress();
  longPressTimer = setTimeout(() => {
    if (!dragging.value || moved || flying.value) return;
    longPressFired = true;
    openMenuAt(e.clientX, e.clientY);
  }, 550);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || !petEl.value) return;
  if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) {
    if (!moved) clearLongPress();
    if (!moved && riding.value) detachRide();
    if (!moved) menuOpen.value = false;
    moved = true;
  }
  x.value = Math.max(4, Math.min(vw - PET_W - 4, e.clientX - grabDx));
  const bottomNow = Math.max(0, Math.min(window.innerHeight - PET_H - 6, window.innerHeight - (e.clientY - grabOffset)));
  lift.value = bottomNow - restBottom.value;
  velBuf.push({ t: performance.now(), x: e.clientX, y: e.clientY });
  if (velBuf.length > 8) velBuf.shift();
  if (moved) updateDragAffordances(bottomNow);
}

function updateDragAffordances(bottomNow: number): void {
  const cx = x.value + PET_W / 2;
  const cy = window.innerHeight - bottomNow - PET_H / 2;
  const bin = document.querySelector<HTMLElement>('[data-icon="bin"]');
  const br = bin ? bin.getBoundingClientRect() : null;
  const over = !!(bin && br && cx > br.left - 8 && cx < br.right + 8 && cy > br.top - 10 && cy < br.bottom + 16);
  setBinHot(over, bin);
  if (over && !panicking.value) {
    panicking.value = true;
    say(pick(BIN_PANIC_QUOTES));
  } else if (!over && panicking.value) {
    panicking.value = false;
  }
  if (!over) {
    const cand = findRideCandidate(window.innerHeight - bottomNow, cx);
    if (cand !== hintWin) {
      clearRideHint();
      if (cand) {
        const tb = cand.querySelector<HTMLElement>('.win-titlebar');
        if (tb) tb.style.outline = '2px dashed rgba(0,103,192,.9)';
        hintWin = cand;
      }
    }
  } else {
    clearRideHint();
  }
}

function dragVelocity(): { x: number; y: number } {
  if (velBuf.length < 2) return { x: 0, y: 0 };
  const last = velBuf[velBuf.length - 1];
  let first = velBuf[0];
  for (const s of velBuf) {
    if (last.t - s.t >= 60) first = s;
    else break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.016) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  clearLongPress();
  try { petEl.value?.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
  clearRideHint();
  setBinHot(false, document.querySelector<HTMLElement>('[data-icon="bin"]'));
  const final = restBottom.value + lift.value;

  const v = dragVelocity();
  if (!reducedMotion && Math.hypot(v.x, v.y) > PHYS.flingMinSpeed) {
    startFling(v.x, -v.y);
    return;
  }
  if (panicking.value) {
    escapeHome();
    return;
  }
  const rideTarget = findRideCandidate(window.innerHeight - final, x.value + PET_W / 2);
  if (rideTarget) {
    startRide(rideTarget);
    return;
  }

  if (final < TASKBAR_H + 30) {
    restBottom.value = TASKBAR_H;
  } else {
    restBottom.value = Math.min(final, window.innerHeight - PET_H - 6);
  }
  lift.value = 0;
  const wasFloating = isFloating();
  saveState();
  playIdle();
  const quick = Date.now() - downAt < 350 && !moved;
  if (quick) {
    const now = Date.now();
    if (longPressFired) {
      longPressFired = false;
    } else if (riding.value && now - lastClickAt < 500) {
      hopOffRide();
      lastClickAt = 0;
      return;
    } else if (wasFloating && now - lastClickAt < 500) {
      goHome();
      lastClickAt = 0;
      return;
    } else {
      lastClickAt = now;
      react();
    }
  } else if (wasFloating) {
    showBubble();
  }
  schedule(1400);
}

// ============ 凑近歪头 ============
let mouseRaf = 0;
let lastMouseEvt: MouseEvent | null = null;

function onMouseMove(e: MouseEvent): void {
  if (reducedMotion) return;
  lastMouseEvt = e;
  if (mouseRaf) return;
  mouseRaf = requestAnimationFrame(() => {
    mouseRaf = 0;
    if (lastMouseEvt) processMouseMove(lastMouseEvt);
  });
}

function processMouseMove(e: MouseEvent): void {
  const el = petEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const ex = r.left + r.width / 2;
  const ey = r.top + r.height / 2;
  const dx = e.clientX - ex;
  const dy = e.clientY - ey;
  const dist = Math.hypot(dx, dy);
  watching.value = dist < 140 && !moving.value && !flying.value && !sleeping.value && !busy.value;
  lean.value = watching.value ? Math.max(-5, Math.min(5, dx * 0.04)) : 0;
}

// ============ 其他 ============
function onResize(): void {
  vw = window.innerWidth;
  x.value = Math.max(4, Math.min(vw - PET_W - 4, x.value));
  restBottom.value = Math.max(TASKBAR_H, Math.min(window.innerHeight - PET_H - 6, restBottom.value));
  menuOpen.value = false;
}

function onDocPointerDown(e: PointerEvent): void {
  if (menuOpen.value && !(e.target as Element | null)?.closest?.('.pet-menu')) {
    menuOpen.value = false;
  }
}

function onDocKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (helpOpen.value) { helpOpen.value = false; return; }
    closeMenu();
  }
}

function onVisChange(): void {
  if (!document.hidden) {
    updateVitals();
  }
}

function onSaveExit(): void {
  updateVitals();
  saveState();
}

function onGoHome(): void {
  wake();
  if (flying.value) return;
  goHome();
}

onMounted(() => {
  vw = window.innerWidth;
  detectAlphaSupport();
  loadState();
  // 待机动画设 loop 且懒加载：首帧尽快出现（playAnim 内部会等 loadeddata 再淡入）
  playIdle();
  if (isFloating()) showBubble();
  schedule(1800);
  vitalsTimer = setInterval(updateVitals, 20000);
  // 全量预热：所有动画后台依次下载（浏览器 HTTP 缓存持久保存，
  // 下载完断网也能播；带宽被首屏任务抢占时自动让路）
  const warmup = (): void => {
    ALL_ANIMS.forEach((name, i) => {
      setTimeout(() => preloadAnim(name), i * 400);   // 间隔 400ms 排队，避免挤爆连接
    });
  };
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(warmup);
  } else {
    setTimeout(warmup, 4000);
  }
  try {
    if (!localStorage.getItem('pet-hint-shown')) {
      localStorage.setItem('pet-hint-shown', '1');
      setTimeout(() => {
        hintLockUntil = Date.now() + 3400;
        say('我是大肥鱼～右键我打开菜单，藏着全部隐藏玩法哦！');
      }, 2600);
    }
  } catch { /* 忽略 */ }
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('pet-go-home', onGoHome);
  window.addEventListener('beforeunload', onSaveExit);
  document.addEventListener('visibilitychange', onVisChange);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onDocKeydown);
});

onUnmounted(() => {
  animToken++;
  if (timer) clearTimeout(timer);
  if (bubbleTimer) clearTimeout(bubbleTimer);
  if (dizzyTimer) clearTimeout(dizzyTimer);
  if (snackTimer) clearTimeout(snackTimer);
  if (heartTimer) clearTimeout(heartTimer);
  if (vitalsTimer) clearInterval(vitalsTimer);
  clearLongPress();
  cancelAnimationFrame(flingRAF);
  cancelAnimationFrame(rideRAF);
  cancelAnimationFrame(moveRAF);
  cancelAnimationFrame(mouseRaf);
  clearRideHint();
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('pet-go-home', onGoHome);
  window.removeEventListener('beforeunload', onSaveExit);
  document.removeEventListener('visibilitychange', onVisChange);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onDocKeydown);
});
</script>

<template>
  <div
    ref="petEl"
    class="dafeiyu fixed z-[55] select-none"
    :class="{ moving: moving && !dragging, dragging, sleeping, flying, riding, dizzy, panicking, eating: snackVisible }"
    :style="{
      left: x + 'px',
      bottom: (bottomOverride ?? (restBottom + lift)) + 'px',
      width: PET_W + 'px',
      height: PET_H + 'px',
      transitionDuration: (flying || riding) ? '0ms' : '260ms',
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @contextmenu="onPetContext"
  >
    <!-- 气泡：Win11 深色 tooltip 风格 -->
    <div v-if="bubble" class="pet-bubble" :class="{ 'bubble-below': bubbleBelow }">{{ bubble }}</div>

    <!-- 发晕星星 -->
    <template v-if="dizzy">
      <span class="pet-star" style="left:0;top:-8px;">✦</span>
      <span class="pet-star" style="left:90px;top:-30px;animation-delay:.18s;">✦</span>
      <span class="pet-star" style="left:180px;top:-4px;animation-delay:.36s;">✦</span>
    </template>

    <!-- 摸头爱心 -->
    <span
      v-for="h in heartList"
      :key="h"
      class="pet-heart"
      :style="{ left: (h * 46 - 20) + 'px', animationDelay: (h * 0.12) + 's' }"
    >♥</span>

    <!-- 阴影 -->
    <div class="pet-shadow" :style="{ opacity: flying ? 0 : (dragging ? 0.15 : 0.3), transform: `scaleX(${dragging ? 0.7 : 1})` }"></div>

    <!-- 大肥鱼本体：webm 动画，双缓冲交叉淡入（素材朝左，朝右时镜像）；不支持透明视频时显示静态形象 -->
    <div class="pet-mirror" :class="{ mirrored: mirror }" :style="bodyStyle">
      <img
        v-if="!alphaOk"
        class="pet-body pet-fallback"
        :width="PET_W"
        :height="PET_H"
        :src="asset('pet/fallback.png')"
        alt="大肥鱼"
      />
      <template v-else>
        <video
          ref="videoA"
          class="pet-body"
          :width="PET_W"
          :height="PET_H"
          muted
          playsinline
          autoplay
          loop
          disablepictureinpicture
        ></video>
        <video
          ref="videoB"
          class="pet-body"
          :width="PET_W"
          :height="PET_H"
          muted
          playsinline
          autoplay
          loop
          disablepictureinpicture
        ></video>
      </template>
    </div>

    <!-- 喂零食：小饼干滑到嘴边被吃掉 -->
    <svg v-if="snackVisible" class="pet-snack" viewBox="0 0 26 26" width="34" height="34" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="#d9a05b" />
      <circle cx="9" cy="10" r="1.6" fill="#7a4a21" />
      <circle cx="16" cy="14" r="1.6" fill="#7a4a21" />
      <circle cx="12" cy="18" r="1.6" fill="#7a4a21" />
    </svg>

    <!-- 右键菜单（Win11 风格） -->
    <div
      v-if="menuOpen"
      class="pet-menu"
      :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
      @pointerdown.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <div class="pet-menu-head">
        <span class="pet-menu-ava">🐟</span>
        <span>大肥鱼 · {{ moodLabel }}</span>
      </div>
      <div class="pet-menu-stat">
        <span class="pet-menu-stat-label"><i class="fa fa-heart"></i>心情</span>
        <div class="pet-bar"><div class="pet-bar-fill" :style="{ width: mood + '%' }"></div></div>
        <b class="pet-menu-val">{{ Math.round(mood) }}</b>
      </div>
      <div class="pet-menu-stat">
        <span class="pet-menu-stat-label"><i class="fa fa-cutlery"></i>饱食</span>
        <div class="pet-bar"><div class="pet-bar-fill" :style="{ width: satiety + '%' }"></div></div>
        <b class="pet-menu-val">{{ Math.round(satiety) }}</b>
      </div>
      <hr class="pet-menu-sep">
      <div class="pet-menu-item" @click="doFeed"><i class="fa fa-cutlery"></i>喂零食</div>
      <div class="pet-menu-item" @click="doPat"><i class="fa fa-thumbs-o-up"></i>摸摸头</div>
      <div class="pet-menu-item" @click="doSleep"><i class="fa fa-bed"></i>{{ sleeping ? '叫醒' : '哄睡觉' }}</div>
      <div v-if="isFloating()" class="pet-menu-item" @click="doGoHome"><i class="fa fa-home"></i>回任务栏</div>
      <hr class="pet-menu-sep">
      <div class="pet-menu-item" @click="openHelp"><i class="fa fa-question-circle"></i>玩法说明</div>
    </div>
  </div>

  <!-- 玩法说明对话框 -->
  <Teleport to="body">
    <div v-if="helpOpen" class="pet-help-mask" @click.self="helpOpen = false">
      <div class="pet-help">
        <div class="pet-help-bar">
          <i class="fa fa-question-circle"></i>
          <span class="flex-1">大肥鱼 · 隐藏玩法说明</span>
          <button type="button" class="pet-help-close" title="关闭" @click="helpOpen = false">✕</button>
        </div>
        <div class="pet-help-body">
          <div class="pet-help-row" v-for="tip in PET_TIPS" :key="tip.icon">
            <span class="pet-help-ico"><i :class="tip.icon"></i></span>
            <div class="pet-help-text">
              <b>{{ tip.title }}</b>
              <span>{{ tip.desc }}</span>
            </div>
          </div>
        </div>
        <div class="pet-help-foot">
          <span class="pet-help-note">线索越多，乐趣越多 —— 剩下的彩蛋自己发掘</span>
          <button type="button" class="pet-help-ok" @click="helpOpen = false">知道了</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dafeiyu {
  cursor: grab;
  transition: left linear, bottom 0.26s cubic-bezier(0.34, 1.56, 0.64, 1);
  touch-action: none;
}
.dafeiyu.dragging { cursor: grabbing; }

.pet-mirror { width: 100%; height: 100%; transform-origin: 50% 100%; position: relative; }
.pet-mirror.mirrored { transform: scaleX(-1); }
.pet-body {
  display: block;
  object-fit: contain;
  position: absolute;
  inset: 0;
  /* 手机浏览器对 VP9 alpha 解码不一致：不给任何背景，用双缓冲交叉淡入遮切换 */
  background: transparent;
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}
.pet-body.is-front { opacity: 1; }
/* 降级静态形象：object-fit cover 让立绘撑满（原素材 1:1，容器 16:9，contain 会左右留空） */
.pet-body.pet-fallback { object-fit: contain; opacity: 1; }

/* 骑窗口：轻轻上下浮动 */
.dafeiyu.riding .pet-mirror { animation: rideBob 1.8s ease-in-out infinite; }
@keyframes rideBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* 睡觉：轻微歪斜（保留镜像翻转） */
.dafeiyu.sleeping .pet-mirror:not(.mirrored) { transform: rotate(3deg); }
.dafeiyu.sleeping .pet-mirror.mirrored { transform: scaleX(-1) rotate(3deg); }

/* 拖拽时轻微晃动 */
.dafeiyu.dragging .pet-mirror { animation: dangle 0.5s ease-in-out infinite; }
@keyframes dangle {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

/* 悬在回收站上：惊慌挣扎 */
.dafeiyu.panicking .pet-mirror { animation: tremble 0.12s linear infinite; }
@keyframes tremble {
  0%, 100% { transform: translateX(-1.5px); }
  50% { transform: translateX(1.5px); }
}

/* 零食滑到嘴边被吃掉 */
.pet-snack {
  position: absolute;
  right: -20px;
  bottom: 80px;
  animation: snackIn 0.9s ease-in forwards;
  z-index: 3;
  pointer-events: none;
}
@keyframes snackIn {
  0% { transform: translate(24px, 8px) rotate(-20deg); opacity: 0; }
  15% { opacity: 1; }
  55% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  80% { transform: translate(2px, -2px) scale(0.7); opacity: 0.95; }
  100% { transform: translate(3px, -3px) scale(0.15); opacity: 0; }
}

/* 摸头爱心上浮 */
.pet-heart {
  position: absolute;
  top: -10px;
  color: #ff5a6e;
  font-size: 20px;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
  animation: heartUp 0.9s ease-out forwards;
  opacity: 0;
  z-index: 3;
  pointer-events: none;
}
@keyframes heartUp {
  0% { opacity: 0; transform: translateY(2px) scale(0.6); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-30px) scale(1.15); }
}

/* 发晕星星绕头 */
.pet-star {
  position: absolute;
  color: #ffd34d;
  font-size: 12px;
  line-height: 1;
  text-shadow: 0 0 3px rgba(168, 110, 0, 0.9);
  animation: starSpin 1.1s linear infinite;
  z-index: 3;
  pointer-events: none;
}
@keyframes starSpin {
  0% { transform: rotate(0deg) translateY(0); opacity: 1; }
  50% { transform: rotate(180deg) translateY(-4px); opacity: 0.6; }
  100% { transform: rotate(360deg) translateY(0); opacity: 1; }
}

/* 阴影贴在任务栏上 */
.pet-shadow {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 170px;
  height: 12px;
  margin-left: -85px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 50%;
  transition: opacity 0.26s, transform 0.26s;
  pointer-events: none;
}

/* Win11 深色气泡提示 */
.pet-bubble {
  position: absolute;
  bottom: 150px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(43, 43, 43, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  color: #fff;
  font: 12px/1.5 "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
  padding: 5px 10px;
  white-space: nowrap;
  z-index: 2;
  animation: pop 0.18s ease-out;
}
.pet-bubble::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  margin-left: -4px;
  border: 4px solid transparent;
  border-top-color: rgba(43, 43, 43, 0.92);
}
.pet-bubble.bubble-below { bottom: auto; top: 150px; }
.pet-bubble.bubble-below::after {
  bottom: auto;
  top: -5px;
  border-top-color: transparent;
  border-bottom-color: rgba(43, 43, 43, 0.92);
}
@keyframes pop {
  from { transform: translateX(-50%) scale(0.7); opacity: 0; }
  to { transform: translateX(-50%) scale(1); opacity: 1; }
}

/* ============ Win11 右键菜单 ============ */
.pet-menu {
  position: absolute;
  z-index: 90;
  min-width: 182px;
  background: rgba(243, 243, 243, 0.97);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.19), 0 2px 6px rgba(0, 0, 0, 0.12);
  padding: 4px;
  font: 12px "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
  color: #1a1a1a;
  text-align: left;
  cursor: default;
}
.pet-menu-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  padding: 6px 10px 6px;
  white-space: nowrap;
}
.pet-menu-ava { font-size: 14px; }
.pet-menu-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 3px;
  white-space: nowrap;
}
.pet-menu-stat-label { width: 46px; color: #5d5d5d; }
.pet-menu-stat-label i { margin-right: 3px; }
.pet-bar {
  flex: 1;
  height: 6px;
  background: #e5e5e5;
  border-radius: 3px;
  overflow: hidden;
}
.pet-bar-fill {
  height: 100%;
  background: #0067c0;
  border-radius: 3px;
  transition: width 0.35s;
}
.pet-menu-val { width: 22px; text-align: right; font-weight: 600; }
.pet-menu-sep {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 4px 6px;
}
.pet-menu-item {
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.pet-menu-item:hover { background: rgba(0, 0, 0, 0.055); }
.pet-menu-item:active { background: rgba(0, 0, 0, 0.03); color: #5d5d5d; }
.pet-menu-item i { width: 16px; margin-right: 6px; text-align: center; color: #0067c0; }

/* ============ 玩法说明对话框（Win11 风格） ============ */
.pet-help-mask {
  position: fixed;
  inset: 0;
  z-index: 75;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pet-help {
  width: min(440px, 94vw);
  background: #f3f3f3;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  font: 12px "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
  color: #1a1a1a;
}
.pet-help-bar {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 14px;
  user-select: none;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid #e5e5e5;
}
.pet-help-bar i { color: #0067c0; }
.pet-help-close {
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
.pet-help-close:hover { background: rgba(0, 0, 0, 0.06); }
.pet-help-body {
  padding: 12px 14px;
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pet-help-row { display: flex; gap: 10px; align-items: flex-start; }
.pet-help-ico {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8f1fb;
  border-radius: 6px;
  font-size: 13px;
  color: #0067c0;
}
.pet-help-text { display: flex; flex-direction: column; gap: 1px; line-height: 1.55; min-width: 0; }
.pet-help-text b { font-size: 12.5px; color: #1a1a1a; }
.pet-help-text span { font-size: 11.5px; color: #5d5d5d; }
.pet-help-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 14px;
}
.pet-help-note { font-size: 10.5px; color: #8a8a8a; }
.pet-help-ok {
  min-width: 80px;
  padding: 6px 14px;
  font-size: 12px;
  background: #0067c0;
  color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
.pet-help-ok:hover { background: #1975c5; }
.pet-help-ok:active { background: #005ba1; color: rgba(255, 255, 255, 0.8); }

@media (prefers-reduced-motion: reduce) {
  .pet-mirror { animation: none; }
}
</style>
