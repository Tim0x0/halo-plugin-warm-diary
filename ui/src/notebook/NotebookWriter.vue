<script setup lang="ts">
// 编辑器依赖 Halo 组件样式；只在管理账号写日记时随这个分块加载，访客页不需要。
import '@halo-dev/components/dist/style.css'
import '@halo-dev/richtext-editor/dist/style.css'
import { contentMeta, draftHint, moods, weathers, type Entry } from '../diary/api'
import { useDiaryWriter } from '../diary/useDiaryWriter'
import DiaryBodyEditor from '../diary/DiaryBodyEditor.vue'
import NotebookDateField from './NotebookDateField.vue'

const props = defineProps<{ entry?: Entry; today: string; name: string }>()
const emit = defineEmits<{ close: []; saved: [entry: Entry] }>()
const {
  draft,
  saving,
  error,
  conflict,
  authFailed,
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
  props.name,
)
defineExpose({ canLeave })
</script>

<template>
  <section class="nb-writer">
    <div class="nb-eyebrow">A LITTLE NOTE TO MYSELF</div>
    <div class="nb-writer-fields">
      <label>日期<NotebookDateField v-model="draft.date" :today="today" /></label>
      <label
        >心情<select v-model="draft.mood" class="nb-select">
          <option value="">不填写</option>
          <option v-for="mood in moods" :key="mood">{{ mood }}</option>
        </select></label
      >
      <label
        >天气<select v-model="draft.weather" class="nb-select">
          <option value="">不填写</option>
          <option v-for="weather in weathers" :key="weather">{{ weather }}</option>
        </select></label
      >
    </div>
    <label class="nb-sr-only" for="diary-title">标题</label
    ><input
      id="diary-title"
      v-model="draft.title"
      class="nb-writer-title"
      placeholder="标题（可留空）"
      maxlength="120"
    />
    <p class="nb-writer-hint">{{ draftHint(props.entry) }}</p>
    <DiaryBodyEditor v-model="draft.html" />
    <div v-if="error" class="nb-error" role="alert">
      <p>{{ error }}</p>
      <div class="nb-error-actions">
        <button v-if="!conflict" class="nb-btn" @click="save">重试保存</button
        ><button v-if="conflict" class="nb-btn" @click="loadLatest">查看最新版本</button
        ><button v-if="conflict" class="nb-btn" @click="saveCopy">另存为新日记</button
        ><button class="nb-btn" @click="backup">下载当前输入</button
        ><a
          v-if="authFailed"
          href="/login?redirect_uri=/diary"
          target="_blank"
          rel="noopener"
          class="nb-link"
          >重新登录</a
        >
      </div>
    </div>
    <section v-if="latest" class="nb-conflict">
      <h3>服务器上的最新版本</h3>
      <p>{{ contentMeta(latest.working) }}</p>
      <div class="nb-prose" v-html="latest.working.html"></div>
    </section>
    <footer class="nb-writer-foot">
      <span role="status" aria-live="polite">{{ status }}</span>
      <div class="nb-writer-buttons">
        <button class="nb-btn" :disabled="leaving" @click="close">关闭</button
        ><button class="nb-btn is-primary" :disabled="saving || conflict || leaving" @click="done">
          {{ saving ? '保存中…' : '保存并完成' }}
        </button>
      </div>
    </footer>
  </section>
</template>
