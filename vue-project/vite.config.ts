import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/',
  plugins: [vue()],
  server: {
    // Windows 下编辑器原子替换（临时文件+改名）会让 chokidar 抛 EBUSY 崩掉 dev server，
    // 轮询模式规避此问题（只影响 dev，不影响构建）
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  build: {
    target: 'es2015',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router'],
        },
      },
    },
  },
})
