<script setup lang="ts">
import { IconClose, VAlert, VButton, VModal, VSpace } from '@halo-dev/components'
import { onBeforeRouteLeave } from 'vue-router'
import { onMounted, onBeforeUnmount } from 'vue'
import DiaryBodyEditor from '../diary/DiaryBodyEditor.vue'
import { contentMeta, draftHint, moods, weathers, type Entry } from '../diary/api'
import { useDiaryWriter } from '../diary/useDiaryWriter'

const props = defineProps<{ entry?: Entry; today: string }>()
const emit = defineEmits<{ close: []; saved: [entry: Entry] }>()
const {
  draft,
  saving,
  error,
  conflict,
  latest,
  status,
  save,
  loadLatest,
  backup,
  canLeave,
  leaving,
  close,
  done,
  saveCopy,
} = useDiaryWriter(
  props.entry,
  props.today,
  (e) => emit('saved', e),
  () => emit('close'),
)
let escapeFromPopup = false
function rememberEscapeTarget(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  // Halo's menus may close on keydown and return focus before the modal sees keyup.
  escapeFromPopup = Array.from(
    document.querySelectorAll(
      '.wd-editor-modal [aria-expanded="true"], [role="menu"], [role="listbox"]',
    ),
  ).some((element) => element.getClientRects().length > 0)
}
function handleEscape() {
  if (!escapeFromPopup) void close()
  escapeFromPopup = false
}
onMounted(() => document.addEventListener('keydown', rememberEscapeTarget, true))
onBeforeUnmount(() => document.removeEventListener('keydown', rememberEscapeTarget, true))
onBeforeRouteLeave(canLeave)
</script>

<template>
  <div>
    <VModal
      mount-to-body
      class="wd-editor-modal"
      :width="900"
      height="min(850px, 92vh)"
      @keyup.esc.capture.stop="handleEscape"
    >
      <template #header>
        <span class="modal-header-title">{{ props.entry ? '编辑日记' : '写日记' }}</span>
        <VButton size="sm" aria-label="关闭编辑" :disabled="leaving" @click="close"
          ><IconClose
        /></VButton>
      </template>
      <div class="wd-editor-fields">
        <FormKit v-model="draft.date" type="date" label="日期" validation="required" />
        <FormKit
          v-model="draft.mood"
          type="select"
          label="心情"
          :options="[{ label: '不填写', value: '' }, ...moods.map((v) => ({ label: v, value: v }))]"
        />
        <FormKit
          v-model="draft.weather"
          type="select"
          label="天气"
          :options="[
            { label: '不填写', value: '' },
            ...weathers.map((v) => ({ label: v, value: v })),
          ]"
        />
      </div>
      <FormKit
        v-model="draft.title"
        type="text"
        label="标题"
        placeholder="标题（可留空）"
        :maxlength="120"
      />
      <p class="wd-hint">{{ draftHint(props.entry) }}</p>
      <DiaryBodyEditor v-model="draft.html" />
      <VAlert v-if="error" type="error" :title="error" :closable="false" class="mt-3">
        <template #actions>
          <VSpace>
            <VButton v-if="!conflict" size="sm" @click="save">重试保存</VButton>
            <VButton v-if="conflict" size="sm" @click="loadLatest">查看最新版本</VButton>
            <VButton v-if="conflict" size="sm" @click="saveCopy">另存为新日记</VButton>
            <VButton size="sm" @click="backup">下载当前输入</VButton>
          </VSpace>
        </template>
      </VAlert>
      <section v-if="latest" class="wd-latest">
        <h3>服务器上的最新版本</h3>
        <p class="wd-reading-meta">{{ contentMeta(latest.working) }}</p>
        <div class="wd-prose" v-html="latest.working.html"></div>
      </section>
      <template #footer>
        <VSpace class="wd-modal-footer">
          <VButton type="secondary" :loading="saving" :disabled="conflict || leaving" @click="done"
            >保存并完成</VButton
          >
          <VButton :disabled="leaving" @click="close">关闭</VButton>
          <span role="status">{{ status }}</span>
        </VSpace>
      </template>
    </VModal>
  </div>
</template>
