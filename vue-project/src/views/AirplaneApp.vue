<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Window from '../components/Window.vue';
import { AirplaneGame } from '../game/engine';
import { G } from '../game/state';

const router = useRouter();
const canvasRef = ref<HTMLCanvasElement | null>(null);

// 游戏本体状态在 game/ 模块里是非响应式的，这里镜像一份供按钮渲染
const bombCount = ref(G.bombCount);
const cheatInvincible = ref(G.cheatInvincible);
const gameState = ref(G.gameState);

let game: AirplaneGame | null = null;
let syncTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (!canvasRef.value) return;
  game = new AirplaneGame(canvasRef.value, {
    onStateChange: (s) => { gameState.value = s; },
  });
  game.start();
  syncTimer = setInterval(() => {
    bombCount.value = G.bombCount;
    cheatInvincible.value = G.cheatInvincible;
    gameState.value = G.gameState;
  }, 300);
});

onUnmounted(() => {
  game?.destroy();
  game = null;
  if (syncTimer) clearInterval(syncTimer);
});

const onBomb = () => { game?.useBomb(); bombCount.value = G.bombCount; };
const onInvincible = () => { G.cheatInvincible = !G.cheatInvincible; cheatInvincible.value = G.cheatInvincible; };
const onPause = () => { game?.togglePause(); };
const onPointerMove = (e: PointerEvent) => { game?.handlePointerMove(e); };
const onPointerDown = (e: PointerEvent) => { game?.canvasTap(); game?.handlePointerMove(e); };
</script>

<template>
  <Window
    title="飞机大战"
    icon="fa fa-fighter-jet"
    :isOpen="true"
    :isActive="true"
    :defaultMaximized="true"
    fixedSize
    @close="router.push('/')"
  >
    <!-- 画布始终居中；控制台大屏悬浮左侧（不挤占居中），小屏在画布下方横排 -->
    <div class="relative flex flex-col items-center justify-center gap-2 w-full min-h-0">
      <canvas
        ref="canvasRef"
        class="shadow-win95-inset outline-none block shrink-0"
        tabindex="0"
        style="image-rendering: auto; touch-action: none;"
        @pointermove="onPointerMove"
        @pointerdown="onPointerDown"
      ></canvas>

      <div class="gm-console">
        <div class="gm-title">控制台</div>
        <button class="gm-btn" :style="{ backgroundColor: bombCount > 0 ? '#fff3e0' : '#fdfdfd' }" @click="onBomb">
          <span class="gm-ico">💣</span>
          <span class="gm-label">炸弹 <b :class="bombCount > 0 ? 'text-[#c42b1c]' : 'text-[#8a8a8a]'">×{{ bombCount }}</b></span>
          <span class="gm-key">X</span>
        </button>
        <button class="gm-btn" :style="{ backgroundColor: gameState === 'paused' ? '#e8f1fb' : '#fdfdfd' }" @click="onPause">
          <span class="gm-ico">{{ gameState === 'paused' ? '▶' : '⏸' }}</span>
          <span class="gm-label">{{ gameState === 'paused' ? '继续游戏' : '暂停游戏' }}</span>
          <span class="gm-key">P</span>
        </button>
        <button class="gm-btn" :style="{ backgroundColor: cheatInvincible ? '#f6ecfb' : '#fdfdfd' }" @click="onInvincible">
          <span class="gm-ico">★</span>
          <span class="gm-label">无敌{{ cheatInvincible ? '开' : '关' }}</span>
          <span class="gm-key">I</span>
        </button>
        <div class="gm-hint">
          方向键 / WASD 移动<br>火力全自动<br>把鼠标放画布上即可操控
        </div>
      </div>
    </div>
  </Window>
</template>

<style scoped>
/* 控制台：小屏=画布下方横排；≥1024px=悬浮画布左侧竖排（画布保持窗口居中） */
.gm-console {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  margin-top: 2px;
}
.gm-title {
  display: none;
  font-size: 10px;
  font-weight: 600;
  color: #5d5d5d;
  padding: 0 2px 3px;
  border-bottom: 1px solid #e5e5e5;
}
.gm-btn {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  font-family: 'Segoe UI', 'Microsoft YaHei UI', sans-serif;
  background: #fdfdfd;
  color: #1a1a1a;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: background 0.1s;
}
.gm-btn:hover { background: #f6f6f6; }
.gm-btn:active { background: #f0f0f0; color: #5d5d5d; box-shadow: none; }
.gm-ico { display: none; font-size: 15px; line-height: 1.1; color: #0067c0; }
.gm-label { font-size: 11px; font-weight: 600; color: #1a1a1a; line-height: 1.2; white-space: nowrap; }
.gm-key {
  font-size: 9px;
  color: #5d5d5d;
  line-height: 1.1;
  margin-left: auto;
  padding: 1px 5px;
  background: #f6f6f6;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
}
.gm-hint {
  display: none;
  font-size: 9px;
  line-height: 1.7;
  color: #8a8a8a;
  padding: 6px 2px 0;
  margin-top: 2px;
  border-top: 1px solid #e5e5e5;
}
@media (min-width: 1024px) {
  .gm-console {
    position: absolute;
    left: 8px;
    top: 6px;
    width: 118px;
    flex-direction: column;
    justify-content: flex-start;
    gap: 4px;
    margin: 0;
  }
  .gm-title { display: block; }
  .gm-btn { flex-direction: column; align-items: center; gap: 1px; padding: 5px 6px 4px; text-align: center; }
  .gm-ico { display: block; }
  .gm-key { margin-left: 0; }
  .gm-hint { display: block; }
}
</style>
