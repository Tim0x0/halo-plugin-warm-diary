import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { diaryConsoleApiClient } from '@/api'
import { download, message, saveEntry, statusOf, type Draft, type Entry } from './api'
import { newEntryId } from './id'

function workingDraft(content: Entry['working'], today: string): Draft {
  return {
    date: content.date || today,
    title: content.title,
    html: content.html,
    mood: content.mood,
    weather: content.weather,
  }
}

export function useDraft(
  initial: Entry | undefined,
  today: string,
  onSaved: (entry: Entry) => void,
  initialName?: string,
) {
  const entry = ref(initial)
  const name = ref(initial?.name || initialName || newEntryId())
  const draft = reactive<Draft>(
    initial
      ? workingDraft(initial.working, today)
      : { date: today, title: '', html: '', mood: '', weather: '' },
  )
  const snapshot = () =>
    JSON.stringify({
      date: draft.date,
      title: draft.title,
      html: draft.html,
      mood: draft.mood,
      weather: draft.weather,
    })
  const savedSnapshot = ref(snapshot())
  const dirty = computed(
    () => snapshot() !== savedSnapshot.value && (!!entry.value || hasContent()),
  )
  const saving = ref(false)
  const error = ref('')
  const conflict = ref(false)
  const authFailed = ref(false)
  const latest = ref<Entry>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<boolean> | undefined
  let disposed = false
  let validationError = false

  function hasContent() {
    return (
      !!draft.title.trim() ||
      !!new DOMParser().parseFromString(draft.html, 'text/html').body.textContent?.trim()
    )
  }

  async function run(): Promise<boolean> {
    if (conflict.value) return false
    saving.value = true
    error.value = ''
    authFailed.value = false
    try {
      while (dirty.value && !disposed) {
        if (!hasContent()) {
          validationError = true
          error.value = '写一点内容再保存吧'
          return false
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) {
          validationError = true
          error.value = '请选择完整的日记日期'
          return false
        }
        const sent = snapshot()
        const result = await saveEntry(name.value, entry.value?.version, JSON.parse(sent))
        entry.value = result
        savedSnapshot.value = sent
        if (!disposed) onSaved(result)
      }
      return true
    } catch (e) {
      error.value = message(e)
      const status = statusOf(e)
      conflict.value = status === 409
      authFailed.value = status === 401 || status === 403
      return false
    } finally {
      saving.value = false
    }
  }

  function save(): Promise<boolean> {
    clearTimeout(timer)
    if (!pending)
      pending = run().finally(() => {
        pending = undefined
      })
    return pending
  }

  watch(draft, () => {
    clearTimeout(timer)
    if (validationError) {
      error.value = ''
      validationError = false
    }
    if (dirty.value && hasContent() && !conflict.value && !error.value)
      timer = setTimeout(() => void save(), 1000)
  })

  async function loadLatest() {
    try {
      latest.value = (await diaryConsoleApiClient.entry.getPrivateEntry({ name: name.value })).data
    } catch (e) {
      error.value = message(e)
    }
  }

  async function saveAsNew() {
    if (saving.value) return false
    name.value = newEntryId()
    entry.value = undefined
    conflict.value = false
    authFailed.value = false
    savedSnapshot.value = ''
    return save()
  }

  function backup() {
    download(
      new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }),
      `warm-diary-unsaved-${draft.date}.json`,
    )
  }

  const status = computed(() =>
    saving.value
      ? '保存中…'
      : error.value
        ? '尚未保存 · 输入已保留'
        : dirty.value
          ? '尚未保存'
          : entry.value
            ? '已保存'
            : '写一点今天的生活吧',
  )
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value || saving.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
    window.removeEventListener('beforeunload', beforeUnload)
  })
  return {
    draft,
    entry,
    dirty,
    saving,
    error,
    conflict,
    authFailed,
    latest,
    status,
    save,
    loadLatest,
    saveAsNew,
    backup,
  }
}
