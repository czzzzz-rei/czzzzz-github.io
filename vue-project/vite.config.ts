import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // GitHub Pages 项目页部署在 https://czzzzz-rei.github.io/czzzzz-github.io/ 子路径下，
  // 资源必须用相对该子路径的绝对前缀，否则 JS/CSS 404 白屏
  base: '/czzzzz-github.io/',
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
