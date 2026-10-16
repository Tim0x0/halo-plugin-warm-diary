import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { diaryConsoleApiClient, diaryPublicApiClient } from '@/api'
import {
  mutateEntry,
  type Entry,
  type PublicEntry,
  type PublicSummary,
  type Summary,
} from '../../diary/api'
import { useNotebook } from '../useNotebook'
import { createNotebookRouter } from '../router'

vi.mock('../App.vue', () => ({ default: { render: () => null } }))
vi.mock('@/api', () => ({
  diaryPublicApiClient: {
    entry: {
      getDiarySession: vi.fn(),
      listReadableEntries: vi.fn(),
      getReadableEntry: vi.fn(),
      getReadableCalendar: vi.fn(),
    },
  },
  diaryConsoleApiClient: {
    entry: {
      getPrivateEntry: vi.fn(),
      listPrivateEntries: vi.fn(),
    },
  },
}))
vi.mock('../../diary/api', () => ({
  mutateEntry: vi.fn(),
  message: () => '加载失败',
  monthTitle: (month: string) => month,
  shortDate: (date: string) => date,
}))

function asData<T>(value: T) {
  return { data: value } as never
}

const getDiarySession = () => vi.mocked(diaryPublicApiClient.entry.getDiarySession)
const listReadableEntries = () => vi.mocked(diaryPublicApiClient.entry.listReadableEntries)
const getReadableEntry = () => vi.mocked(diaryPublicApiClient.entry.getReadableEntry)
const getPrivateEntry = () => vi.mocked(diaryConsoleApiClient.entry.getPrivateEntry)
const listPrivateEntries = () => vi.mocked(diaryConsoleApiClient.entry.listPrivateEntries)
const getReadableCalendar = () => vi.mocked(diaryPublicApiClient.entry.getReadableCalendar)

const entry: Entry = {
  name: 'entry-a',
  version: '1',
  working: { date: '2026-09-20', title: 'A', html: '<p>A</p>', text: 'A', mood: '', weather: '' },
  published: null,
  pendingChanges: false,
  changedFields: [],
  createdAt: '',
  updatedAt: '',
  trashedAt: null,
}
const publicEntry: PublicEntry = {
  name: 'entry-b',
  date: '2026-09-19',
  title: '公开旧标题',
  html: '<p>公开旧正文</p>',
  text: '公开旧正文',
  mood: '平静',
  weather: '多云',
  publishedAt: '2026-09-19T08:00:00Z',
}
const second: Entry = {
  ...entry,
  name: 'entry-b',
  working: { ...entry.working, title: 'B' },
  published: publicEntry,
  pendingChanges: true,
  changedFields: ['title'],
}
// 目录接口只返回摘要。
const summaryOf = (e: Entry): Summary => ({
  name: e.name,
  version: e.version,
  date: e.working.date,
  title: e.working.title,
  excerpt: e.working.text,
  mood: e.working.mood,
  weather: e.working.weather,
  shared: !!e.published,
  pendingChanges: e.pendingChanges,
  changedFields: e.changedFields,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  publishedAt: e.published?.publishedAt ?? null,
  trashedAt: e.trashedAt,
})
const publicSummary: PublicSummary = {
  name: publicEntry.name,
  date: publicEntry.date,
  title: publicEntry.title,
  excerpt: publicEntry.text,
  mood: publicEntry.mood,
  weather: publicEntry.weather,
  publishedAt: publicEntry.publishedAt,
}
const managerSession = {
  canManage: true,
  loggedIn: true,
  today: '2026-09-20',
  timeZone: 'Asia/Shanghai',
}
const managerPage = { items: [summaryOf(entry), summaryOf(second)], total: 2, page: 1, size: 12 }
const publicPage = { items: [publicSummary], total: 1, page: 1, size: 12 }
// 打开一篇时按名称取完整内容；访客（或访客预览）只拿到分享版本。
const owned: Record<string, Entry> = { 'entry-a': entry, 'entry-b': second }
let managerReads = true
let wrapper: VueWrapper
async function setup(path = '/diary') {
  const router = createNotebookRouter(createMemoryHistory())
  await router.push(path)
  let state!: ReturnType<typeof useNotebook>
  const leave = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  wrapper = mount(
    defineComponent({
      setup() {
        state = useNotebook(leave)
        return () => h('div')
      },
    }),
    { global: { plugins: [router] } },
  )
  await flushPromises()
  return { state, router, leave }
}
beforeEach(() => {
  vi.resetAllMocks()
  managerReads = true
  getDiarySession().mockResolvedValue(asData(managerSession))
  listReadableEntries().mockImplementation(async (request) =>
    asData(request?.publicOnly || !managerReads ? publicPage : managerPage),
  )
  getReadableEntry().mockImplementation(async (request) => {
    if (request.publicOnly || !managerReads) {
      if (request.name === publicEntry.name) return asData(publicEntry)
      throw { response: { status: 404 } }
    }
    const found = owned[request.name]
    if (!found) throw { response: { status: 404 } }
    return asData(found)
  })
  getPrivateEntry().mockResolvedValue(asData(entry))
  getReadableCalendar().mockResolvedValue(asData({ days: {} }))
})
afterEach(() => wrapper?.unmount())

describe('notebook navigation and server-authorized reading', () => {
  it('opens another entry of the index without reloading or blanking the page', async () => {
    const { state } = await setup()
    const index = state.entries.value
    await state.pick(second)
    expect(state.loading.value).toBe(false)
    expect(state.entries.value).toBe(index)
    await flushPromises()
    expect(state.selected.value?.name).toBe('entry-b')
    expect(listReadableEntries()).toHaveBeenCalledOnce()
    // 目录只有摘要，打开一篇时只取这一篇的正文；回到看过的那篇不再请求。
    expect(getReadableEntry()).toHaveBeenLastCalledWith({ name: 'entry-b', publicOnly: false })
    const reads = getReadableEntry().mock.calls.length
    await state.pick(entry)
    await flushPromises()
    expect(state.selected.value?.name).toBe('entry-a')
    expect(getReadableEntry()).toHaveBeenCalledTimes(reads)
  })

  it('fetches only the detail of an entry outside the index', async () => {
    const { state, router } = await setup()
    getReadableEntry().mockResolvedValueOnce(asData({ ...entry, name: 'entry-z' }))
    await router.push('/diary/entry/entry-z')
    expect(state.entries.value).toHaveLength(2)
    await flushPromises()
    expect(state.selected.value?.name).toBe('entry-z')
    expect(state.opening.value).toBe(false)
    expect(listReadableEntries()).toHaveBeenCalledOnce()
  })

  it('keeps the page on screen while refreshing after sharing', async () => {
    const { state } = await setup('/diary/entry/entry-a')
    vi.mocked(mutateEntry).mockResolvedValueOnce(entry)
    let finish!: (value: never) => void
    listReadableEntries().mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const sharing = state.action(entry, 'publish')
    await flushPromises()
    expect(mutateEntry).toHaveBeenCalledExactlyOnceWith(entry, 'publish')
    expect(state.loading.value).toBe(false)
    expect(state.entries.value).toHaveLength(2)
    expect(state.selected.value?.name).toBe('entry-a')
    const shared = { ...summaryOf(entry), shared: true, version: '2' }
    finish(asData({ ...managerPage, items: [shared, summaryOf(second)] }))
    getReadableEntry().mockResolvedValueOnce(
      asData({ ...entry, version: '2', published: publicEntry, pendingChanges: false }),
    )
    await sharing
    await flushPromises()
    expect(listReadableEntries()).toHaveBeenCalledTimes(2)
    // 分享之后正文按新版本重取，状态从「写给自己」变成「已分享」。
    expect(state.selected.value?.name).toBe('entry-a')
    expect(state.privateEntry.value?.published).toBeTruthy()
    expect(getReadableEntry()).toHaveBeenLastCalledWith({ name: 'entry-a', publicOnly: false })
  })

  it('records selected entries and filters in history and restores them on back', async () => {
    const { state, router } = await setup()
    await state.pick(second)
    await flushPromises()
    expect(state.selected.value?.name).toBe('entry-b')
    state.keyword.value = '没有结果'
    listReadableEntries().mockResolvedValueOnce(asData({ ...managerPage, items: [], total: 0 }))
    await state.filter()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/diary')
    expect(router.currentRoute.value.query.q).toBe('没有结果')
    expect(state.selected.value).toBeUndefined()
    router.back()
    await flushPromises()
    expect(state.keyword.value).toBe('')
    expect(state.selected.value?.name).toBe('entry-b')
  })

  it('ignores a slow detail response after another search', async () => {
    let finish!: (value: never) => void
    getReadableEntry().mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { state } = await setup('/diary/entry/old-entry')
    state.keyword.value = 'B'
    listReadableEntries().mockResolvedValueOnce(
      asData({ ...managerPage, items: [summaryOf(second)], total: 1 }),
    )
    await state.filter()
    await flushPromises()
    finish(asData({ ...entry, name: 'old-entry' }))
    await flushPromises()
    expect(state.selected.value?.name).toBe('entry-b')
    expect(state.entries.value).toEqual([summaryOf(second)])
  })

  it('turns the calendar without filtering the list, and filters by a whole month on request', async () => {
    const { state, router } = await setup('/diary?day=2026-09-20')
    listReadableEntries().mockClear()
    await state.turnCalendar(-1)
    await flushPromises()
    expect(state.calendarMonth.value).toBe('2026-08')
    expect(getReadableCalendar()).toHaveBeenLastCalledWith({ month: '2026-08', publicOnly: false })
    expect(router.currentRoute.value.query.day).toBe('2026-09-20')
    expect(listReadableEntries()).not.toHaveBeenCalled()
    await state.chooseMonth()
    await flushPromises()
    expect(state.selectedDate.value).toBe('')
    expect(router.currentRoute.value.query.month).toBe('2026-08')
    expect(listReadableEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: '2026-08-01', to: '2026-08-31' }),
    )
  })

  it('retries session initialization after a failed request', async () => {
    getDiarySession().mockRejectedValueOnce(new Error('offline'))
    const { state } = await setup()
    expect(state.error.value).toBe('加载失败')
    await state.load()
    expect(state.session.value?.canManage).toBe(true)
    expect(state.selected.value?.name).toBe(entry.name)
  })

  it('restores an autosaved entry on refresh and returns to its reading URL', async () => {
    const { state, router } = await setup('/diary/write?entry=entry-a&new=1')
    expect(state.editing.value).toBe(true)
    expect(state.editEntry.value?.name).toBe(entry.name)
    state.saved(entry)
    await state.closeWriter()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/diary/entry/entry-a')
    expect(state.editing.value).toBe(false)
  })

  it('keeps the editor and URL when a leave guard is cancelled', async () => {
    const { state, router, leave } = await setup('/diary/write?entry=entry-a')
    leave.mockResolvedValue(false)
    await router.push('/diary')
    expect(state.editing.value).toBe(true)
    expect(router.currentRoute.value.path).toBe('/diary/write')
  })

  it('corrects an empty last index page without losing a linked detail', async () => {
    listReadableEntries().mockResolvedValueOnce(
      asData({
        ...managerPage,
        items: [],
        total: 12,
        page: 2,
      }),
    )
    const { state, router } = await setup('/diary/entry/entry-b?page=2')
    expect(state.page.value).toBe(1)
    expect(router.currentRoute.value.path).toBe('/diary/entry/entry-b')
    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(state.selected.value?.name).toBe(second.name)
  })

  it('uses the unified read API for the manager without selecting a private endpoint', async () => {
    const { state } = await setup()
    expect(state.mine.value).toBe(true)
    expect(state.entries.value).toHaveLength(2)
    expect(listReadableEntries()).toHaveBeenCalledWith(
      expect.objectContaining({ publicOnly: false }),
    )
    expect(listPrivateEntries()).not.toHaveBeenCalled()
  })

  it.each([false, true])('uses that same API for a non-manager (loggedIn=%s)', async (loggedIn) => {
    getDiarySession().mockResolvedValue(asData({ ...managerSession, canManage: false, loggedIn }))
    managerReads = false
    const { state } = await setup('/diary?view=private&visibility=private')
    expect(state.mine.value).toBe(false)
    expect(state.entries.value).toEqual([publicSummary])
    expect(state.visibility.value).toBe('all')
    expect(listReadableEntries()).toHaveBeenCalledWith(
      expect.objectContaining({ publicOnly: false }),
    )
    expect(listPrivateEntries()).not.toHaveBeenCalled()
    // 访客也有日历，但由服务器按身份只统计已分享的日期。
    expect(getReadableCalendar()).toHaveBeenCalledWith({ month: '2026-09', publicOnly: false })
  })

  it('reads the mood and weather shared with the entry for a visitor', async () => {
    getDiarySession().mockResolvedValue(
      asData({ ...managerSession, canManage: false, loggedIn: false }),
    )
    managerReads = false
    const { state } = await setup('/diary/entry/entry-b')
    expect(state.privateEntry.value).toBeUndefined()
    expect(state.content.value).toMatchObject({ mood: '平静', weather: '多云' })
  })

  it('previews published content on the same address without adding query or history entries', async () => {
    const { state, router } = await setup('/diary/entry/entry-b')
    expect(state.content.value?.title).toBe('B')
    listReadableEntries().mockClear()
    await state.switchView(true)
    expect(router.currentRoute.value.fullPath).toBe('/diary/entry/entry-b')
    expect(state.content.value?.title).toBe('公开旧标题')
    expect(state.privateEntry.value).toBeUndefined()
    expect(listReadableEntries()).toHaveBeenCalledTimes(1)
    await state.switchView(false)
    expect(router.currentRoute.value.fullPath).toBe('/diary/entry/entry-b')
    expect(state.content.value?.title).toBe('B')
  })

  it('clears private data and filters before a preview response, ignoring a late calendar', async () => {
    let finishCalendar!: (value: never) => void
    getReadableCalendar().mockReturnValueOnce(
      new Promise((resolve) => {
        finishCalendar = resolve
      }),
    )
    const { state, router } = await setup(
      '/diary/entry/entry-a?visibility=private&day=2026-09-20&q=secret',
    )
    let finishReading!: (value: never) => void
    listReadableEntries().mockReturnValueOnce(
      new Promise((resolve) => {
        finishReading = resolve
      }),
    )
    const switching = state.switchView(true)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/diary')
    expect(state.loading.value).toBe(true)
    expect(state.content.value).toBeUndefined()
    expect(state.entries.value).toEqual([])
    expect(state.total.value).toBe(0)
    expect(state.visibility.value).toBe('all')
    expect(state.keyword.value).toBe('')
    expect(state.selectedDate.value).toBe('')
    finishCalendar(asData({ days: { '2026-09-20': 42 } }))
    finishReading(asData(publicPage))
    await switching
    await flushPromises()
    expect(state.calendar.value).toEqual({})
    expect(state.entries.value).toEqual([publicSummary])
  })

  it('keeps preview as local state through search, paging and directory navigation', async () => {
    const { state, router } = await setup()
    listReadableEntries().mockResolvedValue(asData({ ...publicPage, total: 25 }))
    await state.switchView(true)
    state.keyword.value = '公开'
    await state.filter()
    await flushPromises()
    await state.turn(1)
    await flushPromises()
    await state.pick(publicEntry)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: '公开', page: '2' })
    expect(state.visitorView.value).toBe(true)
    expect(listReadableEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicOnly: true }),
    )
    await router.push(state.directory)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/diary')
    expect(state.visitorView.value).toBe(true)
  })

  it.each([false, true])('blocks writing without the manage role (loggedIn=%s)', async (loggedIn) => {
    getDiarySession().mockResolvedValue(asData({ ...managerSession, canManage: false, loggedIn }))
    const { state } = await setup('/diary/write?entry=entry-a')
    expect(state.accessible.value).toBe(false)
    expect(state.editing.value).toBe(false)
    expect(getPrivateEntry()).not.toHaveBeenCalled()
    expect(listReadableEntries()).not.toHaveBeenCalled()
  })

  it('never falls back to a private API when a preview detail returns 404', async () => {
    const { state, router } = await setup()
    await state.switchView(true)
    getReadableEntry().mockRejectedValue({ response: { status: 404 } })
    await router.push('/diary/entry/entry-a')
    await flushPromises()
    expect(state.error.value).toBe('这篇日记不存在，或已不再可见。')
    expect(state.selected.value).toBeUndefined()
    expect(getPrivateEntry()).not.toHaveBeenCalled()
  })

  it('exits preview when entering the writer and returns to saved manager content', async () => {
    const { state, router } = await setup()
    await state.switchView(true)
    await state.write(entry)
    await flushPromises()
    expect(state.visitorView.value).toBe(false)
    expect(state.editing.value).toBe(true)
    state.saved(entry)
    await state.closeWriter()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/diary/entry/entry-a')
    expect(state.mine.value).toBe(true)
  })

  it('refreshes identity when a manage session expires or another account logs in', async () => {
    const { state } = await setup()
    getDiarySession().mockResolvedValue(
      asData({ ...managerSession, canManage: false, loggedIn: false }),
    )
    managerReads = false
    getReadableCalendar().mockClear()
    await state.load()
    expect(state.mine.value).toBe(false)
    expect(state.privateEntry.value).toBeUndefined()
    expect(state.entries.value).toEqual([publicSummary])
    expect(getReadableCalendar()).toHaveBeenCalledOnce()
  })
})
