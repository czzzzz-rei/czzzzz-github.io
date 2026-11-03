// 桌面主题设置（控制面板 → 显示属性）：响应式 + localStorage 持久化
import { ref } from 'vue';

export type DesktopTheme = 'wallpaper' | 'fish' | 'teal' | 'blue' | 'dark';

const KEY = 'desktop-theme';

export const THEMES: Record<DesktopTheme, { name: string; bg: string | null }> = {
  wallpaper: { name: 'Win11 光晕壁纸', bg: null },
  fish: { name: '大肥鱼壁纸', bg: null },
  teal: { name: '深邃蓝绿', bg: '#0f3a52' },
  blue: { name: 'Win11 蓝', bg: '#0067c0' },
  dark: { name: '深夜黑', bg: '#14141a' },
};

function load(): DesktopTheme {
  const v = localStorage.getItem(KEY) as DesktopTheme | null;
  // 默认壁纸 = 大肥鱼壁纸（老访客已保存的旧主题值不受影响，仅无记录时用 fish）
  if (v && v in THEMES) return v;
  try { localStorage.setItem(KEY, 'fish'); } catch { /* 忽略 */ }
  return 'fish';
}

export const desktopTheme = ref<DesktopTheme>(load());

export function setTheme(t: DesktopTheme): void {
  desktopTheme.value = t;
  try { localStorage.setItem(KEY, t); } catch { /* 忽略 */ }
}
