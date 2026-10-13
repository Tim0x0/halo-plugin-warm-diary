<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import IconPrevious from '~icons/ri/arrow-left-s-line'
import IconNext from '~icons/ri/arrow-right-s-line'
import { monthDays, shiftDate, shiftMonth, weekdays } from './calendar'

const props = defineProps<{
  modelValue: string
  today?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const grid = ref<HTMLElement>()
// 没有值也没有「今天」时，才退回浏览器当天。
const fallback = () => props.today || new Date().toISOString().slice(0, 10)
const view = ref(viewOf(props.modelValue || fallback()))
// 方向键移动到的格子；只有它可以 Tab 进入。
const active = ref('')

const label = computed(() => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(props.modelValue)
  return d ? `${Number(d[1])} 年 ${Number(d[2])} 月 ${Number(d[3])} 日` : '选择日期'
})
const year = computed(() => Number(view.value.slice(0, 4)))
const month = computed(() => Number(view.value.slice(5, 7)))
const days = computed(() => monthDays(view.value))

function viewOf(value: string) {
  return value.slice(0, 7)
}

function shift(delta: number) {
  view.value = shiftMonth(view.value, delta)
  // 翻页后让新的一页里有一个可以 Tab 进入的格子。
  active.value = `${view.value}-01`
}

function pick(value: string) {
  emit('update:modelValue', value)
  close()
}

function focusActive() {
  void nextTick(() =>
    grid.value?.querySelector<HTMLButtonElement>(`[data-value="${active.value}"]`)?.focus(),
  )
}

function toggle() {
  if (open.value) return close()
  const start = props.modelValue || fallback()
  view.value = viewOf(start)
  active.value = start
  open.value = true
  focusActive()
}

function close(returnFocus = true) {
  if (!open.value) return
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function move(event: KeyboardEvent) {
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  }
  const step = steps[event.key]
  if (!step || !active.value) return
  event.preventDefault()
  active.value = shiftDate(active.value, step)
  view.value = viewOf(active.value)
  focusActive()
}

function onDoc(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) close(false)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}

watch(open, (value) => {
  if (value) {
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('mousedown', onDoc)
    document.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="nb-date-field">
    <button
      ref="trigger"
      type="button"
      class="nb-select nb-date-trigger"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      {{ label }}
    </button>
    <div v-if="open" class="nb-date-panel" role="dialog" aria-label="选择日期">
      <div class="nb-date-nav">
        <button type="button" class="nb-icon-btn" aria-label="上一月" @click="shift(-1)">
          <IconPrevious aria-hidden="true" />
        </button>
        <span aria-live="polite">{{ year }} 年 {{ month }} 月</span>
        <button type="button" class="nb-icon-btn" aria-label="下一月" @click="shift(1)">
          <IconNext aria-hidden="true" />
        </button>
      </div>
      <div ref="grid" class="nb-calendar" @keydown="move">
        <span v-for="(day, index) in weekdays" :key="index">{{ day }}</span>
        <template v-for="(date, index) in days" :key="index">
          <button
            v-if="date"
            type="button"
            :data-value="date"
            :tabindex="date === active ? 0 : -1"
            :aria-label="date"
            :aria-pressed="modelValue === date"
            :class="{ 'is-picked': modelValue === date, 'is-today': today === date }"
            @click="pick(date)"
          >
            {{ Number(date.slice(8)) }}
          </button>
          <span v-else></span>
        </template>
      </div>
    </div>
  </div>
</template>
