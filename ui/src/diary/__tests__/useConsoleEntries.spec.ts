import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { diaryConsoleApiClient } from '@/api'
import { mutateEntry, type Page, type Summary } from '../api'
import { useConsoleEntries } from '../useConsoleEntries'

vi.mock('@/api', () => ({
  diaryConsoleApiClient: {
    entry: { listPrivateEntries: vi.fn() },
  },
}))
vi.mock('../api', () => ({
  mutateEntry: vi.fn(),
  message: () => '加载失败',
}))
function asData<T>(value: T) {
  return { data: value } as never
}
const listPrivateEntries = () => vi.mocked(diaryConsoleApiClient.entry.listPrivateEntries)
const entry: Summary = {
  name: 'entry-a',
  version: '1',
  date: '2026-09-20',
  title: 'A',
  excerpt: 'A',
  mood: '',
  weather: '',
  shared: false,
  pendingChanges: false,
  changedFields: [],
  createdAt: '',
  updatedAt: '',
  publishedAt: null,
  trashedAt: null,
}
const second: Summary = { ...entry, name: 'entry-b', title: 'B' }
// 这些测试只关心操作成败，返回值不参与断言。
const done = { deleted: true }
const pageOf = (items: Summary[], page = 1, total = items.length): Page => ({
  items,
  page,
  total,
  size: 20,
})
let wrapper: VueWrapper
async function setup(path = '/warm-diary', manage = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/warm-diary', name: 'WarmDiary', component: { render: () => null } },
      { path: '/warm-diary/deleted', name: 'WarmDiaryTrash', component: { render: () => null } },
    ],
  })
  await router.push(path)
  const manageRef = ref(manage)
  let state!: ReturnType<typeof useConsoleEntries>
  wrapper = mount(
    defineComponent({
      setup() {
        state = useConsoleEntries(manageRef)
        return () => h('div')
      },
    }),
    { global: { plugins: [router] } },
  )
  await flushPromises()
  return { state, router, manage: manageRef }
}
beforeEach(() => {
  vi.resetAllMocks()
  listPrivateEntries().mockResolvedValue(asData(pageOf([entry, second])))
  vi.mocked(mutateEntry).mockResolvedValue(done)
})
afterEach(() => wrapper?.unmount())

describe('Console list interactions', () => {
  it('waits for the manage role before loading private entries and clears them when it is lost', async () => {
    const { state, manage } = await setup('/warm-diary', false)
    expect(listPrivateEntries()).not.toHaveBeenCalled()
    manage.value = true
    await flushPromises()
    state.checkedAll.value = true
    expect(state.selectedNames.value).toEqual(['entry-a', 'entry-b'])
    manage.value = false
    await flushPromises()
    expect(state.data.value.items).toEqual([])
    expect(state.selectedNames.value).toEqual([])
  })

  it('applies a filter in one request, resets page and selection, and preserves the search when clearing filters', async () => {
    listPrivateEntries().mockResolvedValue(asData(pageOf([entry, second], 3, 60)))
    const { state, router } = await setup('/warm-diary?page=3&keyword=阳光')
    state.checkedAll.value = true
    listPrivateEntries().mockClear()
    await state.setFilters({ visibility: 'private', from: '2026-09-01', to: '2026-09-20' })
    await flushPromises()
    expect(listPrivateEntries()).toHaveBeenCalledTimes(1)
    expect(listPrivateEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        keyword: '阳光',
        visibility: 'private',
        from: '2026-09-01',
        to: '2026-09-20',
      }),
    )
    expect(state.selectedNames.value).toEqual([])
    expect(router.currentRoute.value.query.page).toBeUndefined()
    await state.clearFilters()
    await flushPromises()
    expect(state.filters.value.visibility).toBe('all')
    expect(state.keyword.value).toBe('阳光')
  })

  it('opens a distinct trash route and restores filters on browser back without restoring selection', async () => {
    const { state, router } = await setup('/warm-diary?visibility=private')
    state.selectedNames.value = [entry.name]
    expect(state.indeterminate.value).toBe(true)
    await router.push({ name: 'WarmDiaryTrash' })
    await flushPromises()
    expect(state.trash.value).toBe(true)
    expect(state.selectedNames.value).toEqual([])
    expect(listPrivateEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({ trash: true, visibility: 'all' }),
    )
    router.back()
    await flushPromises()
    expect(state.trash.value).toBe(false)
    expect(state.filters.value.visibility).toBe('private')
    expect(state.selectedNames.value).toEqual([])
  })

  it('ignores an earlier response after switching filters', async () => {
    let finish!: (result: never) => void
    listPrivateEntries().mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { state } = await setup()
    listPrivateEntries().mockResolvedValueOnce(asData(pageOf([second])))
    await state.setFilters({ keyword: 'B' })
    await flushPromises()
    finish(asData(pageOf([entry])))
    await flushPromises()
    expect(state.data.value.items).toEqual([second])
  })

  it('clears selection on a page-size change and issues only one request', async () => {
    const { state } = await setup()
    state.checkedAll.value = true
    listPrivateEntries().mockClear()
    await state.changePage({ page: 1, size: 50 })
    await flushPromises()
    expect(listPrivateEntries()).toHaveBeenCalledTimes(1)
    expect(listPrivateEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 50 }),
    )
    expect(state.selectedNames.value).toEqual([])
  })

  it('retains only failed items with refreshed versions after a partially successful batch', async () => {
    const { state } = await setup()
    state.checkedAll.value = true
    const conflict = { response: { status: 409 } }
    vi.mocked(mutateEntry).mockResolvedValueOnce(done).mockRejectedValueOnce(conflict)
    const refreshed = { ...second, version: '2' }
    listPrivateEntries().mockResolvedValueOnce(asData(pageOf([refreshed])))
    const result = await state.operate(state.selectedEntries.value, 'trash')
    expect(result).toEqual({
      succeeded: [entry.name],
      failed: [{ name: second.name, error: conflict }],
    })
    expect(state.selectedNames.value).toEqual([second.name])
    expect(state.selectedEntries.value[0]?.version).toBe('2')
    expect(mutateEntry).toHaveBeenNthCalledWith(2, second, 'trash')
  })

  it('does not resubmit successful items if the refresh fails', async () => {
    const { state } = await setup()
    state.checkedAll.value = true
    vi.mocked(mutateEntry).mockResolvedValueOnce(done).mockRejectedValueOnce(new Error('offline'))
    listPrivateEntries().mockRejectedValueOnce(new Error('offline'))
    await state.operate(state.selectedEntries.value, 'unpublish')
    expect(state.error.value).toBe('加载失败')
    expect(state.selectedNames.value).toEqual([second.name])
  })

  it('prevents duplicate submissions and retains the reviewed targets while navigating', async () => {
    let finish!: (result: typeof done) => void
    const { state, router } = await setup()
    state.checkedAll.value = true
    vi.mocked(mutateEntry).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const pending = state.operate(state.selectedEntries.value, 'trash')
    await state.operate(state.selectedEntries.value, 'trash')
    expect(mutateEntry).toHaveBeenCalledTimes(2)
    await router.push({ name: 'WarmDiaryTrash' })
    await flushPromises()
    finish(done)
    await pending
    expect(state.selectedNames.value).toEqual([])
  })

  it('moves back from an empty last page and keeps the empty list unselected', async () => {
    listPrivateEntries().mockResolvedValueOnce(asData(pageOf([], 2, 20)))
    const { state, router } = await setup('/warm-diary?page=2')
    expect(state.filters.value.page).toBe(1)
    expect(router.currentRoute.value.query.page).toBeUndefined()
    listPrivateEntries().mockResolvedValueOnce(asData(pageOf([])))
    await state.load()
    expect(state.checkedAll.value).toBe(false)
    expect(state.indeterminate.value).toBe(false)
  })

  it('rejects an inverted date range without querying and recovers when filters are cleared', async () => {
    const { state } = await setup('/warm-diary?from=2026-09-20&to=2026-09-01')
    expect(state.error.value).toBe('开始日期不能晚于结束日期')
    expect(listPrivateEntries()).not.toHaveBeenCalled()
    await state.clearFilters()
    await flushPromises()
    expect(state.error.value).toBe('')
    expect(state.data.value.items).toHaveLength(2)
  })
})
