import { defineConfig } from '@rsbuild/core'
import { pluginVue } from '@rsbuild/plugin-vue'
import Icons from 'unplugin-icons/rspack'

// 手帐前台的独立构建：入口产物固定为 notebook.js 与 notebook.css，diary.html 直接引用这两个文件名；
// 写日记时才加载的编辑器分块走 chunks/ 目录。目录由 distPath 控制，filename 只是相对文件名。
export default defineConfig({
  plugins: [pluginVue()],
  source: {
    entry: {
      index: './notebook/main.ts',
    },
  },
  html: {
    template: './notebook/index.html',
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  output: {
    distPath: {
      root: 'build/notebook',
      js: '.',
      css: '.',
      jsAsync: 'chunks',
      cssAsync: 'chunks',
      svg: 'chunks',
      font: 'chunks',
      image: 'chunks',
      media: 'chunks',
      assets: 'chunks',
    },
    cleanDistPath: true,
    assetPrefix: '/plugins/warm-diary/assets/notebook/',
    filename: {
      js: 'notebook.js',
      css: 'notebook.css',
    },
    chunkFilename: {
      js: '[name].js',
      css: '[name].css',
    },
  },
  splitChunks: false,
  tools: {
    rspack: {
      optimization: {
        runtimeChunk: false,
      },
      plugins: [Icons({ compiler: 'vue3' })],
    },
  },
})
