import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: 'notebook',
  base: '/plugins/warm-diary/assets/notebook/',
  plugins: [vue(), Icons({ compiler: 'vue3' })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: '../build/notebook',
    emptyOutDir: true,
    // 写日记时才加载的编辑器块（Halo 富文本编辑器 + tiptap）约 1.5 MB，是预期体积，不按默认 500 KB 警告。
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        entryFileNames: 'notebook.js',
        chunkFileNames: 'chunks/[name].js',
        // 入口 index.html 的样式即手帐样式，模板按 notebook.css 引用；
        // 写日记时才加载的编辑器样式进 chunks/。
        assetFileNames: (asset) =>
          asset.names?.includes('index.css') ? 'notebook.css' : 'chunks/[name][extname]',
      },
    },
  },
})
