import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Dialog } from '@halo-dev/components'
import DiaryConsoleView from '../DiaryConsoleView.vue'
import { diaryConsoleApiClient, diaryPublicApiClient } from '@/api'
import { mutateEntry, type Entry, type Page, type Summary } from '../../diary/api'

vi.mock('@halo-dev/components', async () => {
  const { defineComponent, h } = await import('vue')

  const passthrough = (name: string) =>
    defineComponent({
      name,
      setup(_, { slots }) {
        return () =>
          h('div', { 'data-component': name }, [
            slots.icon?.(),
            slots.header?.(),
            slots.checkbox?.(),
            slots.start?.(),
            slots.title?.(),
            slots.description?.(),
            slots.default?.(),
            slots.end?.(),
            slots.dropdownItems?.(),
            slots.actions?.(),
            slots.footer?.(),
          ])
      },
    })
  const icon = (name: string) =>
    defineComponent({ name, setup: () => () => h('span', { 'data-icon': name }) })

  const VButton = defineComponent({
    name: 'VButton',
    props: { disabled: Boolean, loading: Boolean },
    emits: ['click'],
    setup(props, { emit, slots }) {
      return () =>
        h(
          'button',
          {
            disabled: props.disabled || props.loading,
            onClick: (event: MouseEvent) => emit('click', event),
          },
          [slots.icon?.(), slots.default?.()],
        )
    },
  })
  const VEmpty = defineComponent({
    name: 'VEmpty',
    props: { title: String, message: String },
    setup(props, { slots }) {
      return () =>
        h('section', { 'data-component': 'VEmpty' }, [
          h('h2', props.title),
          h('p', props.message),
          slots.actions?.(),
        ])
    },
  })
  const VPageHeader = defineComponent({
    name: 'VPageHeader',
    props: { title: String },
    setup(props, { slots }) {
      return () => h('header', [h('h1', props.title), slots.icon?.(), h('div', slots.actions?.())])
    },
  })
  const VModal = defineComponent({
    name: 'VModal',
    props: { title: String },
    emits: ['close'],
    setup(props, { slots }) {
      return () =>
        h('section', { role: 'dialog', 'aria-label': props.title }, [
          h('h2', props.title),
          slots.default?.(),
          slots.footer?.(),
        ])
    },
  })
  const VAlert = defineComponent({
    name: 'VAlert',
    props: { type: String, title: String, description: String, closable: Boolean },
    setup(props, { slots }) {
      return () =>
        h('div', { role: 'alert', 'data-component': 'VAlert' }, [
          props.title,
          props.description,
          slots.actions?.(),
        ])
    },
  })

  return {
    Dialog: { warning: vi.fn() },
    Toast: { success: vi.fn(), error: vi.fn() },
    IconAddCircle: icon('IconAddCircle'),
    IconDeleteBin: icon('IconDeleteBin'),
    IconEye: icon('IconEye'),
    IconEyeOff: icon('IconEyeOff'),
    IconExternalLinkLine: icon('IconExternalLinkLine'),
    IconRefreshLine: icon('IconRefreshLine'),
    VAlert,
    VButton,
    VCard: passthrough('VCard'),
    VDescription: passthrough('VDescription'),
    VDescriptionItem: passthrough('VDescriptionItem'),
    VDropdownDivider: passthrough('VDropdownDivider'),
    VDropdownItem: passthrough('VDropdownItem'),
    VEmpty,
    VEntity: passthrough('VEntity'),
    VEntityContainer: passthrough('VEntityContainer'),
    VEntityField: passthrough('VEntityField'),
    VLoading: passthrough('VLoading'),
    VModal,
    VPageHeader,
    VPagination: passthrough('VPagination'),
    VSpace: passthrough('VSpace'),
    VStatusDot: passthrough('VStatusDot'),
    VTabbar: passthrough('VTabbar'),
  }
})

vi.mock('@halo-dev/ui-shared', () => ({
  utils: { date: { format: (value: string) => value, timeAgo: () => '刚刚' } },
}))

vi.mock('../../components/DiaryEditorModal.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DiaryEditorModal',
      setup: () => () => h('div', { 'data-component': 'DiaryEditorModal' }),
    }),
  }
})

vi.mock('@/api', () => ({
  diaryPublicApiClient: {
    entry: { getDiarySession: vi.fn() },
  },
  diaryConsoleApiClient: {
    entry: { initializeDiary: vi.fn(), listPrivateEntries: vi.fn(), getPrivateEntry: vi.fn() },
  },
}))
vi.mock('../../diary/api', () => ({
  mutateEntry: vi.fn(),
  message: () => '加载失败',
  title: (content: { date: string; title?: string }) => content.title || content.date,
  metaLine: (content: { date: string; mood: string; weather: string }) =>
    [content.date, content.mood, content.weather].filter(Boolean).join(' · '),
  shortDate: (date: string) => date,
  longDate: (date: string) => date,
  changedLabel: (fields: string[]) => fields.join('、'),
  moods: ['平静', '愉快', '放松', '怀念', '低落', '疲惫'],
  weathers: ['晴', '多云', '阴', '雨', '雪', '风'],
}))

// Halo 全局注册的筛选下拉框；保留 label、items 和选中值，便于断言。
const FilterDropdown = defineComponent({
  name: 'FilterDropdown',
  props: { label: String, items: Array, modelValue: [String, Boolean, Number] },
  emits: ['update:modelValue'],
  setup: (props) => () => h('div', { 'data-filter': props.label }),
})

const emptyPage = { items: [], total: 0, page: 1, size: 20 }
const baseSession = {
  initialized: false,
  isOwner: false,
  loggedIn: true,
  timeZone: 'Asia/Shanghai',
  today: '2026-09-21',
  canInitialize: false,
}
const ownerSession = { ...baseSession, initialized: true, isOwner: true }
const privateEntry: Entry = {
  name: 'entry-a',
  version: '4',
  working: {
    date: '2026-09-21',
    title: '秋日晴朗',
    html: '<p>今天路过一片桂花树。</p>',
    text: '今天路过一片桂花树。',
    mood: '愉快',
    weather: '晴',
  },
  published: null,
  pendingChanges: false,
  changedFields: [],
  createdAt: '',
  updatedAt: '',
  trashedAt: null,
}
const publishedEntry: Entry = {
  ...privateEntry,
  version: '5',
  published: {
    date: privateEntry.working.date,
    title: privateEntry.working.title,
    html: privateEntry.working.html,
    text: privateEntry.working.text,
    mood: privateEntry.working.mood,
    weather: privateEntry.working.weather,
    publishedAt: '2026-09-21T01:00:00Z',
  },
}
// 列表接口只返回摘要；打开预览时再按名称取完整内容。
const summaryOf = (entry: Entry): Summary => ({
  name: entry.name,
  version: entry.version,
  date: entry.working.date,
  title: entry.working.title,
  excerpt: entry.working.text,
  mood: entry.working.mood,
  weather: entry.working.weather,
  shared: !!entry.published,
  pendingChanges: entry.pendingChanges,
  changedFields: entry.changedFields,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  publishedAt: entry.published?.publishedAt ?? null,
  trashedAt: entry.trashedAt,
})
const pageOf = (entry: Entry): Page => ({ items: [summaryOf(entry)], total: 1, page: 1, size: 20 })
function asData<T>(value: T) {
  return { data: value } as never
}
const listPrivateEntries = () => vi.mocked(diaryConsoleApiClient.entry.listPrivateEntries)
const getPrivateEntry = () => vi.mocked(diaryConsoleApiClient.entry.getPrivateEntry)
const getDiarySession = () => vi.mocked(diaryPublicApiClient.entry.getDiarySession)
const initializeDiary = () => vi.mocked(diaryConsoleApiClient.entry.initializeDiary)

let wrapper: VueWrapper | undefined
// 预览时取完整内容返回的那一版。
let currentEntry: Entry = privateEntry

async function setup(session: typeof baseSession, path = '/warm-diary') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/warm-diary', name: 'WarmDiary', component: { render: () => null } },
      {
        path: '/warm-diary/deleted',
        name: 'WarmDiaryTrash',
        component: { render: () => null },
      },
    ],
  })
  await router.push(path)
  getDiarySession().mockResolvedValue(asData(session))
  wrapper = mount(DiaryConsoleView, {
    global: {
      plugins: [router],
      directives: { tooltip: {} },
      stubs: {
        FilterCleanButton: true,
        FilterDropdown,
        FormKit: true,
        SearchInput: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  listPrivateEntries().mockResolvedValue(asData(emptyPage))
  initializeDiary().mockResolvedValue(asData({ initialized: true }))
  currentEntry = privateEntry
  getPrivateEntry().mockImplementation(async () => asData(currentEntry))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('Console first-use access', () => {
  it('offers initialization only to an uninitialized super administrator', async () => {
    const view = await setup({ ...baseSession, canInitialize: true })

    const start = view.get('button')
    expect(start.text()).toBe('开始使用暖阳日记')
    expect(view.text()).not.toContain('请让超级管理员先完成初始化')
    expect(listPrivateEntries()).not.toHaveBeenCalled()

    await start.trigger('click')
    expect(initializeDiary()).toHaveBeenCalledOnce()
  })

  it('shows guidance without an initialization action to an ordinary account', async () => {
    const view = await setup(baseSession)

    expect(view.text()).toContain('请让超级管理员先完成初始化')
    expect(view.text()).not.toContain('开始使用暖阳日记')
    expect(view.find('button').exists()).toBe(false)
    expect(initializeDiary()).not.toHaveBeenCalled()
    expect(listPrivateEntries()).not.toHaveBeenCalled()
  })

  it('does not expose initialization or writing to an initialized non-owner', async () => {
    const view = await setup({ ...baseSession, initialized: true, canInitialize: true })

    expect(view.text()).toContain('这是站长的日记本')
    expect(view.text()).toContain('当前账号不能查看或管理未分享的日记')
    expect(view.text()).not.toContain('开始使用暖阳日记')
    expect(view.text()).not.toContain('写日记')
    expect(view.find('button').exists()).toBe(false)
    expect(initializeDiary()).not.toHaveBeenCalled()
    expect(listPrivateEntries()).not.toHaveBeenCalled()
  })
})

describe('Console visibility controls', () => {
  it.each(['cancel', 'close'] as const)(
    'opens a preview before publishing and does not write when the preview is dismissed with %s',
    async (dismiss) => {
      listPrivateEntries().mockResolvedValue(asData(pageOf(privateEntry)))
      const view = await setup(ownerSession)

      const visibility = view.get('button[aria-label="分享日记：秋日晴朗"]')
      expect(visibility.find('[data-icon="IconEyeOff"]').exists()).toBe(true)
      await visibility.trigger('click')

      const preview = view.get('[role="dialog"][aria-label="分享日记"]')
      expect(preview.text()).toContain(privateEntry.working.title)
      expect(preview.text()).toContain(privateEntry.working.text)
      expect(mutateEntry).not.toHaveBeenCalled()
      expect(Dialog.warning).not.toHaveBeenCalled()

      if (dismiss === 'cancel') {
        await preview
          .findAll('button')
          .find((button) => button.text() === '取消')!
          .trigger('click')
      } else {
        view.getComponent({ name: 'VModal' }).vm.$emit('close')
        await flushPromises()
      }

      expect(view.find('[role="dialog"]').exists()).toBe(false)
      expect(mutateEntry).not.toHaveBeenCalled()
      expect(view.find('button[aria-label="分享日记：秋日晴朗"]').exists()).toBe(true)
    },
  )

  it('publishes the reviewed version once, disables controls while saving, and refreshes visibility', async () => {
    listPrivateEntries()
      .mockResolvedValueOnce(asData(pageOf(privateEntry)))
      .mockResolvedValue(asData(pageOf(publishedEntry)))
    let finish!: (entry: Entry) => void
    vi.mocked(mutateEntry).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = await setup(ownerSession)
    const visibility = view.get('button[aria-label="分享日记：秋日晴朗"]')
    await visibility.trigger('click')
    const confirm = view
      .get('[role="dialog"]')
      .findAll('button')
      .find((button) => button.text() === '分享')!

    expect(mutateEntry).not.toHaveBeenCalled()
    await confirm.trigger('click')

    expect(mutateEntry).toHaveBeenCalledExactlyOnceWith(privateEntry, 'publish')
    expect(visibility.attributes('disabled')).toBeDefined()
    expect(confirm.attributes('disabled')).toBeDefined()
    await confirm.trigger('click')
    expect(mutateEntry).toHaveBeenCalledOnce()

    finish(publishedEntry)
    await flushPromises()

    expect(listPrivateEntries()).toHaveBeenCalledTimes(2)
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    const refreshed = view.get('button[aria-label="收回分享：秋日晴朗"]')
    expect(refreshed.find('[data-icon="IconEye"]').exists()).toBe(true)
    expect(refreshed.attributes('disabled')).toBeUndefined()
  })

  it('requires Halo dialog confirmation before withdrawing and refreshes back to private', async () => {
    const withdrawn = { ...privateEntry, version: '6' }
    listPrivateEntries()
      .mockResolvedValueOnce(asData(pageOf(publishedEntry)))
      .mockResolvedValue(asData(pageOf(withdrawn)))
    vi.mocked(mutateEntry).mockResolvedValueOnce(withdrawn)
    const view = await setup(ownerSession)
    await view.get('button[aria-label="收回分享：秋日晴朗"]').trigger('click')

    expect(Dialog.warning).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: '收回分享',
        confirmText: '收回分享',
        cancelText: '取消',
        onConfirm: expect.any(Function),
      }),
    )
    expect(view.find('[role="dialog"][aria-label="分享日记"]').exists()).toBe(false)
    expect(mutateEntry).not.toHaveBeenCalled()

    const dialog = vi.mocked(Dialog.warning).mock.calls[0]![0]!
    await dialog.onConfirm?.()
    await flushPromises()

    expect(mutateEntry).toHaveBeenCalledExactlyOnceWith(summaryOf(publishedEntry), 'unpublish')
    expect(listPrivateEntries()).toHaveBeenCalledTimes(2)
    expect(
      view.get('button[aria-label="分享日记：秋日晴朗"]').find('[data-icon="IconEyeOff"]').exists(),
    ).toBe(true)
  })
})

describe('Console date filter', () => {
  it('keeps an applied custom range editable instead of clearing it on click', async () => {
    const view = await setup(ownerSession, '/warm-diary?from=2026-09-01&to=2026-09-10')
    const dates = view
      .findAllComponents(FilterDropdown)
      .find((dropdown) => dropdown.props('label') === '日期')!

    expect(dates.props('modelValue')).toBe('custom')
    expect(dates.props('items')).toEqual(
      expect.arrayContaining([
        { label: '2026-09-01 至 2026-09-10', value: 'custom' },
        { label: '自定义范围…', value: 'pick' },
      ]),
    )

    dates.vm.$emit('update:modelValue', 'pick')
    await flushPromises()
    expect(view.find('[role="dialog"][aria-label="自定义日期范围"]').exists()).toBe(true)
    expect(listPrivateEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: '2026-09-01', to: '2026-09-10' }),
    )

    // 再次点击已选的范围，按 Halo 的方式取消筛选。
    dates.vm.$emit('update:modelValue', undefined)
    await flushPromises()
    expect(listPrivateEntries()).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: '', to: '' }),
    )
  })
})
