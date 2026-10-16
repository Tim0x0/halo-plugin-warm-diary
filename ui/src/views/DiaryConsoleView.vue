<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Dialog,
  IconAddCircle,
  IconDeleteBin,
  IconEye,
  IconEyeOff,
  IconExternalLinkLine,
  IconRefreshLine,
  Toast,
  VAlert,
  VButton,
  VCard,
  VDescription,
  VDescriptionItem,
  VDropdownDivider,
  VDropdownItem,
  VEmpty,
  VEntity,
  VEntityContainer,
  VEntityField,
  VLoading,
  VModal,
  VPageHeader,
  VPagination,
  VSpace,
  VStatusDot,
  VTabbar,
} from '@halo-dev/components'
import { utils } from '@halo-dev/ui-shared'
import IconDiary from '~icons/ri/booklet-line'
import DiaryEditorModal from '../components/DiaryEditorModal.vue'
import { diaryConsoleApiClient, diaryPublicApiClient } from '@/api'
import {
  changedLabel,
  message,
  metaLine,
  longDate,
  moods,
  title,
  weathers,
  type Entry,
  type Session,
  type Summary,
} from '../diary/api'
import { useConsoleEntries } from '../diary/useConsoleEntries'
import {
  confirmDescription,
  confirmTitles,
  isShared,
  operationLabels,
  type EntryOperation,
  pendingLabel,
  shareLabel,
  shareNote,
  statusLabel,
} from '../diary/wording'
import '../diary/console.css'

const session = ref<Session>()
const starting = ref(true)
const sessionError = ref('')
const working = ref(false)
const {
  trash,
  filters,
  data,
  loading,
  error,
  selectedNames,
  selectedEntries,
  checkedAll,
  indeterminate,
  hasFilters,
  hasSearch,
  keyword,
  setFilters,
  clearFilters,
  resetSearch,
  changePage,
  load,
  mutating,
  operate,
} = useConsoleEntries(computed(() => session.value?.canManage === true))
const busy = computed(() => working.value || mutating.value)
const editing = ref(false)
const editEntry = ref<Entry>()
const reading = ref<Entry>()
// 有未分享修改时，阅读框可以切到访客看到的版本对照。
const readingVersion = ref<string | number>('working')
const readingContent = computed(() =>
  readingVersion.value === 'published' && reading.value?.published
    ? reading.value.published
    : reading.value!.working,
)
watch(reading, () => (readingVersion.value = 'working'))
const publishPreview = ref<Entry>()
const showDates = ref(false)
const dateFrom = ref('')
const dateTo = ref('')
const dateError = ref('')
const actionError = ref('')
const selectedPublicEntries = computed(() => selectedEntries.value.filter((entry) => entry.shared))
// 列表只有摘要；编辑、阅读、分享预览前取这一篇的完整内容。
const opening = ref('')
async function openFull(item: Summary, then: (entry: Entry) => void) {
  if (opening.value) return
  opening.value = item.name
  actionError.value = ''
  try {
    then((await diaryConsoleApiClient.entry.getPrivateEntry({ name: item.name })).data)
  } catch (e) {
    actionError.value = message(e)
  } finally {
    opening.value = ''
  }
}
const visibilityItems = [
  { label: '全部', value: undefined },
  { label: '已分享', value: 'public' },
  { label: '写给自己', value: 'private' },
]
const moodItems = [
  { label: '全部', value: undefined },
  ...moods.map((value) => ({ label: value, value })),
]
const weatherItems = [
  { label: '全部', value: undefined },
  ...weathers.map((value) => ({ label: value, value })),
]
// Halo 的 FilterDropdown 再次点击已选项会取消筛选，所以「当前自定义范围」和
// 「打开范围弹窗」必须是两项，否则已选的范围无法修改。
const dateItems = computed(() => [
  { label: '全部', value: undefined },
  { label: '今天', value: 'today' },
  { label: '最近 7 天', value: 'week' },
  { label: '本月', value: 'month' },
  ...(dateSelection.value === 'custom' ? [{ label: dateLabel.value, value: 'custom' }] : []),
  { label: '自定义范围…', value: 'pick' },
])
function rangeFor(value: string) {
  const today = session.value?.today || ''
  if (value === 'today') return { from: today, to: today }
  if (value === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 6)
  return { from: date.toISOString().slice(0, 10), to: today }
}
const dateSelection = computed(() => {
  const { from, to } = filters.value
  if (!from && !to) return undefined
  if (session.value) {
    for (const value of ['today', 'week', 'month']) {
      const range = rangeFor(value)
      if (range.from === from && range.to === to) return value
    }
  }
  return 'custom'
})
const dateLabel = computed(() => {
  const { from, to } = filters.value
  return from && to ? `${from} 至 ${to}` : from ? `${from} 起` : `${to} 及以前`
})
function selectVisibility(value: unknown) {
  void setFilters({ visibility: value === 'private' || value === 'public' ? value : undefined })
}
function selectOption(key: 'mood' | 'weather', value: unknown, allowed: readonly string[]) {
  void setFilters({
    [key]: typeof value === 'string' && allowed.includes(value) ? value : undefined,
  })
}
function selectDates(value: unknown) {
  if (value === 'pick') {
    dateFrom.value = filters.value.from
    dateTo.value = filters.value.to
    dateError.value = ''
    showDates.value = true
  } else if (value === 'today' || value === 'week' || value === 'month') {
    void setFilters(rangeFor(value))
  } else {
    void setFilters({ from: undefined, to: undefined })
  }
}
async function applyDates(values: { from?: string; to?: string }) {
  if (values.from && values.to && values.from > values.to) {
    dateError.value = '开始日期不能晚于结束日期'
    return
  }
  await setFilters({ from: values.from || undefined, to: values.to || undefined })
  showDates.value = false
}
const dateForm = ref<{ node: { submit: () => void } }>()

async function start() {
  starting.value = true
  sessionError.value = ''
  const wasManager = session.value?.canManage
  try {
    session.value = (await diaryPublicApiClient.entry.getDiarySession()).data
    if (wasManager && session.value.canManage) await load()
  } catch (e) {
    sessionError.value = message(e)
  } finally {
    starting.value = false
  }
}
onMounted(start)
watch(trash, () => {
  reading.value = undefined
  publishPreview.value = undefined
  showDates.value = false
  actionError.value = ''
})
function edit(item?: Summary | Entry) {
  reading.value = undefined
  if (!item || 'working' in item) {
    editEntry.value = item
    editing.value = true
    return
  }
  void openFull(item, (entry) => {
    editEntry.value = entry
    editing.value = true
  })
}
function read(item: Summary) {
  void openFull(item, (entry) => (reading.value = entry))
}
async function closeEditor() {
  editing.value = false
  await load()
}
type Target = Summary | Entry
const nameOf = (entry: Target) => title('working' in entry ? entry.working : entry)
function labelOf(entries: Target[], operation: EntryOperation) {
  return operation === 'publish' && entries.every(isShared)
    ? '更新分享'
    : operationLabels[operation]
}
async function action(entries: Target[], operation: EntryOperation) {
  if (busy.value || !entries.length) return
  actionError.value = ''
  const label = labelOf(entries, operation)
  const result = await operate(entries, operation)
  if (!result) return
  if (result.failed.length) {
    const prefix = result.succeeded.length ? `已完成 ${result.succeeded.length} 篇；` : ''
    actionError.value = `${prefix}${result.failed.length} 篇未能${label}。${message(result.failed[0]!.error, { keepInput: false })}`
  } else {
    reading.value = undefined
    publishPreview.value = undefined
    const count = result.succeeded.length
    Toast.success(count > 1 ? `已${label} ${count} 篇日记` : `已${label}`)
  }
}
function confirmAction(entries: Target[], operation: Exclude<EntryOperation, 'publish'>) {
  if (busy.value || !entries.length) return
  const targets = [...entries]
  const subject =
    targets.length === 1 ? `“${nameOf(targets[0]!)}”` : `选中的 ${targets.length} 篇日记`
  Dialog.warning({
    title: confirmTitles[operation],
    description: confirmDescription(operation, subject),
    confirmText: operationLabels[operation],
    cancelText: '取消',
    // 和 Halo 文章列表一致：收回、删除这类操作的确认按钮用红色，恢复用默认。
    confirmType: operation === 'restore' ? 'primary' : 'danger',
    onConfirm: () => action(targets, operation),
  })
}
function preview(item: Summary | Entry) {
  if (busy.value) return
  actionError.value = ''
  if ('working' in item) publishPreview.value = item
  else void openFull(item, (entry) => (publishPreview.value = entry))
}
</script>

<template>
  <div class="wd-console">
    <VPageHeader :title="trash ? '日记回收站' : '日记'">
      <template #icon><IconDeleteBin v-if="trash" /><IconDiary v-else /></template>
      <template #actions>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <VButton v-if="trash" :route="{ name: 'WarmDiary' }" size="sm">返回</VButton>
          <VButton v-else-if="session?.canManage" :route="{ name: 'WarmDiaryTrash' }" size="sm"
            >回收站</VButton
          >
          <VButton v-if="session?.canManage" type="secondary" :disabled="busy" @click="edit()">
            <template #icon><IconAddCircle /></template>写日记
          </VButton>
        </div>
      </template>
    </VPageHeader>
    <div class="m-0 md:m-4">
      <VAlert
        v-if="actionError && !publishPreview"
        type="error"
        :title="actionError"
        :closable="false"
        class="mb-4"
      />
      <VCard v-if="sessionError"
        ><VEmpty title="暂时无法加载日记" :message="sessionError"
          ><template #actions><VButton @click="start">重新加载</VButton></template></VEmpty
        ></VCard
      >
      <VLoading v-else-if="starting && !session" />
      <VCard v-else-if="session && !session.canManage"
        ><VEmpty
          title="需要日记管理权限"
          message="当前账号没有「暖阳日记管理」角色，不能查看或管理未分享的日记。"
      /></VCard>
      <VCard v-else-if="session?.canManage" :body-class="['!p-0']">
        <template #header>
          <!-- Layout and global controls follow Halo 2.26's PostList. -->
          <div class="block w-full bg-gray-50 px-4 py-3">
            <div
              class="relative flex flex-col flex-wrap items-start gap-4 sm:flex-row sm:items-center"
            >
              <div class="hidden items-center sm:flex">
                <input
                  v-model="checkedAll"
                  :indeterminate="indeterminate"
                  :disabled="busy || loading || !!error || !data.items.length"
                  type="checkbox"
                  aria-label="选择本页全部日记"
                />
              </div>
              <div class="flex w-full flex-1 items-center sm:w-auto">
                <SearchInput
                  v-if="!selectedNames.length"
                  v-model="keyword"
                  placeholder="输入关键词搜索日记"
                />
                <VSpace v-else class="flex-wrap">
                  <span class="text-sm text-gray-600">已选 {{ selectedNames.length }} 篇</span>
                  <template v-if="trash">
                    <VButton
                      type="danger"
                      :disabled="busy || loading || !!error"
                      @click="confirmAction(selectedEntries, 'delete')"
                      >永久删除</VButton
                    >
                    <VButton
                      :disabled="busy || loading || !!error"
                      @click="confirmAction(selectedEntries, 'restore')"
                      >恢复</VButton
                    >
                  </template>
                  <template v-else>
                    <VButton
                      v-if="selectedPublicEntries.length"
                      :disabled="busy || loading || !!error"
                      @click="confirmAction(selectedPublicEntries, 'unpublish')"
                      >收回分享</VButton
                    >
                    <VButton
                      type="danger"
                      :disabled="busy || loading || !!error"
                      @click="confirmAction(selectedEntries, 'trash')"
                      >删除</VButton
                    >
                  </template>
                  <VButton :disabled="busy" @click="selectedNames = []">取消选择</VButton>
                </VSpace>
              </div>
              <VSpace spacing="lg" class="flex-wrap">
                <template v-if="!trash">
                  <FilterCleanButton
                    v-if="hasFilters"
                    v-tooltip="'清除筛选'"
                    aria-label="清除筛选"
                    @click="clearFilters"
                  />
                  <FilterDropdown
                    :model-value="filters.visibility === 'all' ? undefined : filters.visibility"
                    label="状态"
                    :items="visibilityItems"
                    @update:model-value="selectVisibility"
                  />
                  <FilterDropdown
                    :model-value="dateSelection"
                    label="日期"
                    :items="dateItems"
                    @update:model-value="selectDates"
                  />
                  <FilterDropdown
                    :model-value="filters.mood || undefined"
                    label="心情"
                    :items="moodItems"
                    @update:model-value="selectOption('mood', $event, moods)"
                  />
                  <FilterDropdown
                    :model-value="filters.weather || undefined"
                    label="天气"
                    :items="weatherItems"
                    @update:model-value="selectOption('weather', $event, weathers)"
                  />
                </template>
                <button
                  v-tooltip="'刷新'"
                  type="button"
                  aria-label="刷新日记列表"
                  class="group cursor-pointer rounded p-1 hover:bg-gray-200"
                  :disabled="busy || loading"
                  @click="load"
                >
                  <IconRefreshLine
                    :class="{ 'animate-spin text-gray-900': loading }"
                    class="h-4 w-4 text-gray-600 group-hover:text-gray-900"
                  />
                </button>
              </VSpace>
            </div>
          </div>
        </template>
        <VLoading v-if="loading" />
        <VEmpty v-else-if="error" title="暂时无法加载日记" :message="error"
          ><template #actions
            ><VSpace
              ><VButton @click="load">重试</VButton
              ><VButton v-if="hasSearch" @click="resetSearch">重置搜索和筛选</VButton></VSpace
            ></template
          ></VEmpty
        >
        <VEmpty
          v-else-if="!data.items.length"
          :title="
            hasSearch ? '没有符合条件的日记' : trash ? '没有日记被放入回收站' : '这里还没有日记'
          "
          :message="
            hasSearch
              ? '试试其他关键词，或清除筛选条件。'
              : trash
                ? '你可以刷新列表，或返回日记管理。'
                : '写下今天的小小日常，默认写给自己。'
          "
        >
          <template #actions>
            <VSpace>
              <VButton v-if="hasSearch" @click="resetSearch">重置搜索和筛选</VButton>
              <VButton v-else @click="load">刷新</VButton>
              <VButton v-if="trash" :route="{ name: 'WarmDiary' }" type="secondary">返回</VButton>
              <VButton v-else type="secondary" @click="edit()"
                ><template #icon><IconAddCircle /></template>写日记</VButton
              >
            </VSpace>
          </template>
        </VEmpty>
        <VEntityContainer v-else>
          <VEntity
            v-for="item in data.items"
            :key="item.name"
            :is-selected="selectedNames.includes(item.name) || reading?.name === item.name"
          >
            <template #checkbox
              ><input
                v-model="selectedNames"
                :value="item.name"
                :aria-label="'选择日记：' + title(item)"
                :disabled="busy"
                name="diary-checkbox"
                type="checkbox"
            /></template>
            <template #start>
              <!-- 标题用属性而不是插槽：和 Halo 文章列表一致，extra 槽才会渲染在标题旁边。 -->
              <VEntityField
                class="wd-diary-title"
                max-width="30rem"
                :title="title(item)"
                @click="trash ? read(item) : edit(item)"
              >
                <template #extra>
                  <VSpace v-if="!trash">
                    <VStatusDot
                      v-if="item.pendingChanges"
                      v-tooltip="`${pendingLabel}：${changedLabel(item.changedFields)}`"
                      state="warning"
                      animate
                      :aria-label="pendingLabel"
                    />
                    <a
                      :href="'/diary/entry/' + item.name"
                      target="_blank"
                      rel="noopener"
                      class="text-gray-600 opacity-0 transition-all hover:text-gray-900 group-hover:opacity-100"
                      :aria-label="'在前台阅读：' + title(item)"
                      ><IconExternalLinkLine class="h-3.5 w-3.5"
                    /></a>
                  </VSpace>
                </template>
                <!-- 描述信息一行：心情和天气，没填的不占位。对应 Halo 文章标题下的分类行。 -->
                <template v-if="!trash && (item.mood || item.weather)" #description>
                  <span class="inline-flex gap-2 text-xs text-gray-500">
                    <span v-if="item.mood">{{ item.mood }}</span>
                    <span v-if="item.weather">{{ item.weather }}</span>
                  </span>
                </template>
              </VEntityField>
            </template>
            <template #end>
              <VEntityField width="13rem">
                <template #description>
                  <span class="truncate text-xs tabular-nums text-gray-500">{{
                    trash && item.trashedAt
                      ? '删除于 ' + utils.date.format(item.trashedAt)
                      : longDate(item.date)
                  }}</span>
                </template>
              </VEntityField>
              <VEntityField v-if="!trash">
                <template #description>
                  <button
                    v-tooltip="item.shared ? '已分享 · 点击收回' : '写给自己 · 点击分享'"
                    type="button"
                    :aria-label="(item.shared ? '收回分享：' : '分享日记：') + title(item)"
                    :disabled="busy"
                    class="inline-flex cursor-pointer items-center rounded text-sm transition-all hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    @click.stop="item.shared ? confirmAction([item], 'unpublish') : preview(item)"
                  >
                    <IconEye v-if="item.shared" aria-hidden="true" />
                    <IconEyeOff v-else aria-hidden="true" />
                  </button>
                </template>
              </VEntityField>
            </template>
            <template #dropdownItems>
              <template v-if="!trash">
                <VDropdownItem
                  v-if="!item.shared || item.pendingChanges"
                  :disabled="busy"
                  @click="preview(item)"
                  >{{ shareLabel(item) }}</VDropdownItem
                >
                <VDropdownItem :disabled="busy" @click="edit(item)">编辑</VDropdownItem>
                <VDropdownItem :disabled="!!opening" @click="read(item)">阅读</VDropdownItem>
                <VDropdownDivider />
                <VDropdownItem
                  v-if="item.shared"
                  type="danger"
                  :disabled="busy"
                  @click="confirmAction([item], 'unpublish')"
                  >收回分享</VDropdownItem
                >
                <VDropdownItem
                  type="danger"
                  :disabled="busy"
                  @click="confirmAction([item], 'trash')"
                  >删除</VDropdownItem
                >
              </template>
              <template v-else>
                <VDropdownItem
                  type="danger"
                  :disabled="busy"
                  @click="confirmAction([item], 'delete')"
                  >永久删除</VDropdownItem
                >
                <VDropdownItem :disabled="busy" @click="confirmAction([item], 'restore')"
                  >恢复</VDropdownItem
                >
              </template>
            </template>
          </VEntity>
        </VEntityContainer>
        <template #footer
          ><VPagination
            :key="error || !data.total ? 'empty' : 'entries'"
            :page="filters.page"
            :size="filters.size"
            :size-options="[20, 30, 50, 100]"
            :total="error ? 0 : data.total"
            :total-label="`共 ${error ? 0 : data.total} 篇日记`"
            @change="changePage"
        /></template>
      </VCard>
    </div>
    <DiaryEditorModal
      v-if="editing && session"
      :entry="editEntry"
      :today="session.today"
      @close="closeEditor"
    />
    <VModal
      v-if="showDates"
      mount-to-body
      title="自定义日期范围"
      :width="440"
      @close="showDates = false"
    >
      <FormKit ref="dateForm" type="form" :actions="false" @submit="applyDates">
        <FormKit
          v-model="dateFrom"
          type="date"
          name="from"
          label="开始日期"
          :max="dateTo || undefined"
        />
        <FormKit
          v-model="dateTo"
          type="date"
          name="to"
          label="结束日期"
          :min="dateFrom || undefined"
        />
      </FormKit>
      <VAlert v-if="dateError" type="error" :title="dateError" :closable="false" class="mt-3" />
      <template #footer
        ><VSpace
          ><VButton type="secondary" @click="dateForm?.node.submit()">确定</VButton
          ><VButton @click="showDates = false">取消</VButton></VSpace
        ></template
      >
    </VModal>
    <VModal
      v-if="reading"
      mount-to-body
      layer-closable
      :width="780"
      :title="title(readingContent)"
      @close="reading = undefined"
    >
      <VTabbar
        v-if="reading.published && reading.pendingChanges && !reading.trashedAt"
        v-model:active-id="readingVersion"
        class="mb-4"
        :items="[
          { id: 'working', label: '当前内容' },
          { id: 'published', label: '访客看到的版本' },
        ]"
        type="outline"
      />
      <p class="wd-reading-meta">
        {{
          [metaLine(readingContent), reading.trashedAt ? '在回收站' : statusLabel(reading)]
            .filter(Boolean)
            .join(' · ')
        }}
      </p>
      <div class="wd-prose" v-html="readingContent.html"></div>
      <template #footer
        ><VSpace
          ><VButton v-if="!reading.trashedAt" type="secondary" @click="edit(reading)"
            >编辑</VButton
          ><VButton @click="reading = undefined">关闭</VButton></VSpace
        ></template
      >
    </VModal>
    <VModal
      v-if="publishPreview"
      mount-to-body
      :width="640"
      :title="publishPreview.published ? '更新分享' : '分享日记'"
      @close="publishPreview = undefined"
    >
      <VAlert v-if="actionError" type="error" :title="actionError" :closable="false" class="mb-4" />
      <!-- 用 Halo 的描述列表：标签在左，内容在右，和设置页同一套。 -->
      <p class="wd-hint">
        {{ shareNote(publishPreview)
        }}<template v-if="publishPreview.published && publishPreview.changedFields.length"
          >改动了：{{ changedLabel(publishPreview.changedFields) }}。</template
        >
      </p>
      <VDescription>
        <VDescriptionItem label="标题">{{ title(publishPreview.working) }}</VDescriptionItem>
        <VDescriptionItem label="日期">{{
          longDate(publishPreview.working.date)
        }}</VDescriptionItem>
        <VDescriptionItem v-if="publishPreview.working.mood" label="心情">{{
          publishPreview.working.mood
        }}</VDescriptionItem>
        <VDescriptionItem v-if="publishPreview.working.weather" label="天气">{{
          publishPreview.working.weather
        }}</VDescriptionItem>
        <VDescriptionItem label="正文">
          <div class="wd-share-body" v-html="publishPreview.working.html"></div>
        </VDescriptionItem>
      </VDescription>
      <template #footer
        ><VSpace
          ><VButton type="secondary" :loading="busy" @click="action([publishPreview], 'publish')">{{
            shareLabel(publishPreview)
          }}</VButton
          ><VButton :disabled="busy" @click="publishPreview = undefined">取消</VButton></VSpace
        ></template
      >
    </VModal>
  </div>
</template>
