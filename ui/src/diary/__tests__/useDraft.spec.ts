import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { diaryConsoleApiClient } from '@/api'
import { saveEntry, type Entry } from '../api'
import { useDraft } from '../useDraft'

vi.mock('@/api', () => ({
  diaryConsoleApiClient: {
    entry: { getPrivateEntry: vi.fn() },
  },
}))
vi.mock('../api', () => ({
  saveEntry: vi.fn(),
  message: () => '保存失败',
  download: vi.fn(),
  statusOf: (error: unknown) => (error as { response?: { status?: number } }).response?.status,
}))
const original: Entry = {
  name: '48ff835d-1558-4a5a-9a90-5b6b8df1b408',
  version: '7',
  working: {
    date: '2026-09-20',
    title: '原标题',
    html: '<p>原内容</p>',
    text: '原内容',
    mood: '',
    weather: '',
  },
  published: null,
  pendingChanges: false,
  changedFields: [],
  createdAt: '',
  updatedAt: '',
  trashedAt: null,
}
let wrapper: VueWrapper
function setup(entry?: Entry) {
  let state!: ReturnType<typeof useDraft>
  wrapper = mount(
    defineComponent({
      setup() {
        state = useDraft(entry, '2026-09-20', vi.fn())
        return () => h('div')
      },
    }),
  )
  return state
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('automatic saving', () => {
  it('serializes edits made while a save is in flight and uses the returned version', async () => {
    let finish!: (entry: Entry) => void
    vi.mocked(saveEntry)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce({ ...original, version: '9' })
    const state = setup(original)
    state.draft.title = '第一笔'
    const first = state.save()
    state.draft.title = '第二笔'
    const second = state.save()
    expect(saveEntry).toHaveBeenCalledTimes(1)
    finish({ ...original, version: '8' })
    await Promise.all([first, second])
    expect(saveEntry).toHaveBeenNthCalledWith(
      2,
      original.name,
      '8',
      expect.objectContaining({ title: '第二笔' }),
    )
    expect(state.dirty.value).toBe(false)
    expect(state.error.value).toBe('')
  })

  it('preserves input and stops autosave on a version conflict', async () => {
    vi.mocked(saveEntry).mockRejectedValueOnce({ response: { status: 409 } })
    const state = setup(original)
    state.draft.title = '我的未保存修改'
    expect(await state.save()).toBe(false)
    state.draft.html = '<p>仍然可以继续输入</p>'
    await nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect(state.dirty.value).toBe(true)
    expect(state.conflict.value).toBe(true)
    expect(state.draft.title).toBe('我的未保存修改')
    vi.mocked(diaryConsoleApiClient.entry.getPrivateEntry).mockResolvedValueOnce({
      data: { ...original, version: '8' },
    } as never)
    await state.loadLatest()
    expect(state.latest.value?.version).toBe('8')
    expect(state.draft.html).toBe('<p>仍然可以继续输入</p>')
  })

  it('reuses the client identifier when retrying a failed create', async () => {
    vi.mocked(saveEntry)
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(original)
    const fresh = setup()
    fresh.draft.title = '今天'
    expect(await fresh.save()).toBe(false)
    expect(fresh.dirty.value).toBe(true)
    await fresh.save()
    const calls = vi.mocked(saveEntry).mock.calls
    expect(calls[0]?.[0]).toBe(calls[1]?.[0])
    expect(calls[0]?.[1]).toBeUndefined()
    expect(fresh.dirty.value).toBe(false)
  })

  it('does not persist a blank entry and warns on navigation with unsaved input', async () => {
    const state = setup()
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveEntry).not.toHaveBeenCalled()
    state.draft.title = '尚未保存'
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)
    expect(saveEntry).not.toHaveBeenCalled()
    await flushPromises()
  })

  it('resumes autosave when an incomplete date is corrected', async () => {
    vi.mocked(saveEntry).mockResolvedValue(original)
    const state = setup(original)
    state.draft.date = ''
    expect(await state.save()).toBe(false)
    expect(saveEntry).not.toHaveBeenCalled()
    state.draft.date = '2026-09-19'
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect(state.dirty.value).toBe(false)
  })

  it('does not create or block leaving an empty new editor after changing metadata', async () => {
    const state = setup()
    state.draft.mood = '平静'
    state.draft.html = '<p></p>'
    await nextTick()
    await vi.advanceTimersByTimeAsync(2000)
    expect(state.dirty.value).toBe(false)
    expect(await state.save()).toBe(true)
    expect(saveEntry).not.toHaveBeenCalled()
  })

  it('saves conflicting input under a new identifier without overwriting the original', async () => {
    vi.mocked(saveEntry).mockRejectedValueOnce({ response: { status: 409 } })
    const state = setup(original)
    state.draft.title = '保留我的输入'
    await state.save()
    vi.mocked(saveEntry).mockImplementationOnce(async (name, _version, draft) => ({
      ...original,
      name,
      version: '1',
      working: { ...original.working, ...draft },
    }))
    expect(await state.saveAsNew()).toBe(true)
    expect(state.entry.value?.name).not.toBe(original.name)
    expect(vi.mocked(saveEntry).mock.calls[1]?.[1]).toBeUndefined()
    expect(state.entry.value?.working.title).toBe('保留我的输入')
    expect(state.conflict.value).toBe(false)
  })
})
