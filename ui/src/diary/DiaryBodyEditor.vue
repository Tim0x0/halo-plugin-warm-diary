<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { ExtensionsKit, RichTextEditor, VueEditor } from '@halo-dev/richtext-editor'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editor = shallowRef<VueEditor>()
onMounted(() => {
  editor.value = new VueEditor({
    content: props.modelValue,
    extensions: [
      ExtensionsKit.configure({
        image: false,
        audio: false,
        video: false,
        upload: false,
        gallery: false,
        iframe: false,
        figure: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        color: false,
        fontSize: false,
        highlight: false,
        columns: false,
        details: false,
        link: false,
        strike: false,
        underline: false,
        subscript: false,
        superscript: false,
        table: false,
        taskList: false,
        textAlign: false,
        textStyle: false,
        indent: false,
        formatBrush: false,
        align: false,
        blockPosition: false,
        searchAndReplace: false,
        commandsMenu: false,
        paragraph: { getToolbarItems: () => [] },
        placeholder: { placeholder: '今天过得怎么样？' },
      }),
    ],
    editorProps: {
      attributes: { 'aria-label': '日记正文', 'aria-multiline': 'true', role: 'textbox' },
      handleDrop: (_view, event) => !!event.dataTransfer?.files.length,
      handlePaste: (_view, event) => !!event.clipboardData?.files.length,
    },
    onUpdate: ({ editor: current }) => emit('update:modelValue', current.getHTML()),
  })
})
watch(
  () => props.modelValue,
  (value) => {
    if (editor.value && editor.value.getHTML() !== value)
      editor.value.commands.setContent(value, { emitUpdate: false })
  },
)
onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="wd-richtext">
    <RichTextEditor v-if="editor" :editor="editor" locale="zh-CN" />
  </div>
</template>

<style>
.wd-richtext {
  border: 1px solid #eaecf0;
  border-radius: 4px;
  min-height: 240px;
}
/* 后台弹窗里正文占满标题以下的空间，不再在输入框下面留一块空白。 */
.wd-editor-modal .wd-richtext {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.wd-editor-modal .wd-richtext .halo-rich-text-editor,
.wd-editor-modal .wd-richtext .halo-rich-text-editor > .editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.wd-richtext .ProseMirror {
  min-height: 230px;
  padding: 20px 28px !important;
}
.wd-editor-modal .wd-richtext .ProseMirror {
  flex: 1;
}
.wd-richtext .editor-header {
  position: sticky;
  top: 0;
  z-index: 2;
  height: auto;
  min-height: 40px;
  overflow: visible;
  text-align: left;
}
.wd-richtext [role='toolbar'] {
  display: flex;
  height: auto;
  flex-wrap: wrap;
  gap: 2px;
}
/* Halo 工具栏媒体按钮的 aria-controls 以 editor-toolbox- 开头；日记关掉了对应扩展，用 :has 隐藏官方 DOM。 */
.wd-richtext [role='toolbar'] > .v-popper:has(button[aria-controls^='editor-toolbox-']),
.wd-richtext [role='toolbar'] > .v-popper:has(button[aria-controls^='editor-toolbox-']) + div,
.wd-richtext button[aria-controls^='editor-toolbox-'] {
  display: none;
}
@media (max-width: 480px) {
  .wd-richtext [role='toolbar'] {
    gap: 1px;
  }
}
</style>
