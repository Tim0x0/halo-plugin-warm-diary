<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import IconClose from '~icons/ri/close-line'

// 手帐样式的对话框。原生 dialog 负责焦点限制、Esc 关闭和置顶显示。
defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal?.())
onBeforeUnmount(() => dialog.value?.close?.())
// 站点里其它插件（如 Halo 搜索组件）可能全局拦截 Esc，浏览器自带的关闭就不会发生，所以自己处理。
function escape(event: KeyboardEvent) {
  event.preventDefault()
  emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="nb-dialog"
    :class="{ 'is-wide': wide }"
    aria-labelledby="nb-dialog-title"
    @keydown.esc="escape"
  >
    <header class="nb-dialog-head">
      <h2 id="nb-dialog-title">{{ title }}</h2>
      <button type="button" class="nb-icon-btn" aria-label="关闭" @click="emit('close')">
        <IconClose aria-hidden="true" />
      </button>
    </header>
    <div class="nb-dialog-body"><slot /></div>
    <footer class="nb-dialog-foot"><slot name="footer" /></footer>
  </dialog>
</template>
