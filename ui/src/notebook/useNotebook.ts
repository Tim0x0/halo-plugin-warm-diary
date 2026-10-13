import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'
import { diaryConsoleApiClient, diaryPublicApiClient } from '@/api'
import {
  message,
  monthTitle,
  mutateEntry,
  shortDate,
  type Entry,
  type PublicEntry,
  type PublicSummary,
  type Session,
  type Summary,
} from '../diary/api'
import { newEntryId } from '../diary/id'
import { monthDays, monthEnd, shiftMonth } from './calendar'

const listParams = ['q', 'visibility', 'month', 'day', 'page'] as const

export type Notebook = ReturnType<typeof useNotebook>

export function useNotebook(canLeave: () => Promise<boolean>) {
  const route = useRoute(),
    router = useRouter()
  const session = ref<Session>()
  const directory = '/diary'
  const writing = computed(() => route.path === `${directory}/write`)
  const visitorView = ref(false)
  const mine = computed(() => !!session.value?.isOwner && !visitorView.value)
  const loading = ref(true),
    opening = ref(false),
    error = ref(''),
    busy = ref(false),
    editing = ref(false)
  const entries = ref<Array<Summary | PublicSummary>>([]),
    total = ref(0),
    page = ref(1)
  const selected = ref<Entry | PublicEntry>(),
    editEntry = ref<Entry>(),
    savedEntry = ref<Entry>()
  const draftName = ref('')
  const keyword = ref(''),
    visibility = ref('all'),
    month = ref(''),
    selectedDate = ref(''),
    showFilters = ref(false)
  const calendarMonth = ref(''),
    calendar = ref<Record<string, number>>({}),
    calendarError = ref('')
  const publishing = ref<Entry>(),
    actionError = ref('')
  const size = 12
  const privateEntry = computed(() =>
    selected.value && 'working' in selected.value ? selected.value : undefined,
  )
  const content = computed(
    () => selected.value && ('working' in selected.value ? selected.value.working : selected.value),
  )
  const accessible = computed(() => !!session.value && (!writing.value || session.value.isOwner))
  const filtered = computed(
    () => !!(queryText('q') || month.value || selectedDate.value || visibility.value !== 'all'),
  )
  const monthLabel = computed(() => (month.value ? `${monthTitle(month.value)}手记` : ''))
  /** 筛选摘要：关键词、日期、状态，没有就不显示。关键词取已提交的搜索，输入过程中不变。 */
  const filterSummary = computed(() =>
    [
      queryText('q') && `“${queryText('q')}”`,
      selectedDate.value ? shortDate(selectedDate.value) : month.value && monthTitle(month.value),
      visibility.value === 'public' ? '已分享' : visibility.value === 'private' ? '写给自己' : '',
    ]
      .filter(Boolean)
      .join(' · '),
  )
  let requestId = 0,
    calendarRequestId = 0
  // 目录正在按新条件刷新时，不显示按上一份结果算出的篇数。
  const listing = ref(false)
  let sessionRequest: Promise<Session> | undefined
  // 当前屏幕上目录对应的条件；在同一目录里换一篇时不重新加载整页。
  let shownList = ''
  let softNext = false

  function listKey(query: LocationQuery) {
    return JSON.stringify([
      visitorView.value,
      ...listParams.map((key) => (typeof query[key] === 'string' ? query[key] : '')),
    ])
  }
  // 地址上已生效的目录条件，不含搜索框里尚未提交的输入。
  function currentListQuery(): LocationQueryRaw {
    return Object.fromEntries(
      listParams
        .filter(
          (key) => typeof route.query[key] === 'string' && (key !== 'visibility' || mine.value),
        )
        .map((key) => [key, route.query[key]]),
    )
  }
  function isMissing(error: unknown) {
    return (error as { response?: { status: number } }).response?.status === 404
  }
  function readError(e: unknown) {
    return isMissing(e) ? '这篇日记不存在，或已不再可见。' : message(e)
  }

  const calendarDays = computed(() => monthDays(calendarMonth.value))
  const queryText = (key: string) =>
    typeof route.query[key] === 'string' ? (route.query[key] as string) : ''
  function query(): LocationQueryRaw {
    return {
      q: keyword.value || undefined,
      visibility: !mine.value || visibility.value === 'all' ? undefined : visibility.value,
      month: month.value || undefined,
      day: selectedDate.value || undefined,
      page: page.value > 1 ? String(page.value) : undefined,
    }
  }
  function readQuery() {
    keyword.value = queryText('q')
    visibility.value =
      mine.value && ['private', 'public'].includes(queryText('visibility'))
        ? queryText('visibility')
        : 'all'
    month.value = /^\d{4}-\d{2}$/.test(queryText('month')) ? queryText('month') : ''
    selectedDate.value = /^\d{4}-\d{2}-\d{2}$/.test(queryText('day')) ? queryText('day') : ''
    page.value = Math.max(1, Number.parseInt(queryText('page')) || 1)
    if (month.value || selectedDate.value) showFilters.value = true
  }
  async function loadCalendar(keep = false) {
    const request = ++calendarRequestId
    if (!keep) calendar.value = {}
    calendarError.value = ''
    if (!session.value || !calendarMonth.value) {
      calendar.value = {}
      return
    }
    try {
      // 主人看全部日记；访客和访客预览只统计已分享的日期。
      const result = (
        await diaryPublicApiClient.entry.getReadableCalendar({
          month: calendarMonth.value,
          publicOnly: visitorView.value,
        })
      ).data.days
      if (request === calendarRequestId) calendar.value = result
    } catch {
      if (request === calendarRequestId) calendarError.value = '日历加载失败，请重试。'
    }
  }

  function clearReading() {
    loading.value = true
    opening.value = false
    error.value = ''
    actionError.value = ''
    publishing.value = undefined
    // Never keep private text, titles or counts on screen while changing views.
    selected.value = undefined
    entries.value = []
    total.value = 0
    shownList = ''
    calendarRequestId++
    calendar.value = {}
    calendarError.value = ''
  }

  // soft：刷新完成前保留当前页面，用于分享、收回等操作之后。
  // 筛选和翻页也保留上一份目录，等新结果回来再替换；只有切换访客视图才清空。
  async function load(soft = false) {
    const request = ++requestId
    const shownOwner = session.value?.isOwner
    shownList = ''
    listing.value = true
    if (soft || selected.value) {
      opening.value = false
      error.value = ''
      actionError.value = ''
      publishing.value = undefined
    } else clearReading()
    if (!writing.value) editing.value = false
    else visitorView.value = false
    try {
      sessionRequest ??= diaryPublicApiClient.entry
        .getDiarySession()
        .then((response) => response.data)
        .finally(() => {
          sessionRequest = undefined
        })
      const currentSession = await sessionRequest
      if (request !== requestId) return
      // 身份变了（如登录过期），不能把按原身份读到的内容留在屏幕上。
      if (soft && currentSession.isOwner !== shownOwner) clearReading()
      session.value = currentSession
      if (!currentSession.isOwner) visitorView.value = false
      readQuery()
      if (!accessible.value) {
        selected.value = undefined
        entries.value = []
        editing.value = false
        return
      }
      const nextCalendar =
        selectedDate.value.slice(0, 7) ||
        month.value ||
        calendarMonth.value ||
        session.value.today.slice(0, 7)
      const sameMonth = calendarMonth.value === nextCalendar
      if (!sameMonth) calendarMonth.value = nextCalendar
      void loadCalendar(soft && sameMonth)
      if (writing.value) {
        const name = queryText('entry')
        if (!name) {
          await router.replace({
            path: `${directory}/write`,
            query: { ...query(), entry: newEntryId(), new: '1' },
          })
          return
        }
        if (!editing.value || draftName.value !== name) {
          editing.value = false
          let result: Entry | undefined
          try {
            result = (await diaryConsoleApiClient.entry.getPrivateEntry({ name })).data
          } catch (e) {
            if (
              (e as { response?: { status: number } }).response?.status !== 404 ||
              queryText('new') !== '1'
            )
              throw e
          }
          if (request !== requestId) return
          if (result?.trashedAt) {
            throw Object.assign(new Error('trashed'), { response: { status: 404 } })
          }
          editEntry.value = result
          savedEntry.value = result
          draftName.value = name
          editing.value = true
        }
        return
      }
      editing.value = false
      let from = '',
        to = ''
      if (month.value) {
        from = month.value + '-01'
        to = monthEnd(month.value)
      }
      if (selectedDate.value) from = to = selectedDate.value
      const filters = {
        page: page.value,
        size,
        keyword: keyword.value,
        from,
        to,
        visibility: visibility.value,
      }
      const result = (
        await diaryPublicApiClient.entry.listReadableEntries({
          ...filters,
          publicOnly: visitorView.value,
        })
      ).data
      if (request !== requestId) return
      // 总数随列表一起更新，不等正文；否则筛选摘要会先闪一下 0 篇。
      total.value = result.total
      const lastPage = Math.max(1, Math.ceil(result.total / size))
      if (page.value > lastPage) {
        page.value = lastPage
        await router.replace({ path: route.path, query: query() })
        return
      }
      const preferred =
        typeof route.params.id === 'string' ? route.params.id : result.items[0]?.name
      // 正在看的这一篇以刚取回的目录为准：分享、收回后版本变了，不能沿用旧正文。
      const current = selected.value
      if (preferred && current?.name === preferred) opened.delete(versionOf(current))
      const entry = preferred ? await readEntry(preferred) : undefined
      // A slower detail response must never replace a newer search or navigation.
      if (request !== requestId) return
      entries.value = result.items
      selected.value = entry
      shownList = listKey(route.query)
    } catch (e) {
      if (request === requestId) {
        selected.value = undefined
        entries.value = []
        editing.value = false
        error.value = readError(e)
      }
    } finally {
      if (request === requestId) {
        loading.value = false
        listing.value = false
      }
    }
  }

  // 目录只有摘要，打开一篇时才取正文。按标识和版本记住取过的，来回切换不重复请求。
  const opened = new Map<string, Entry | PublicEntry>()
  function versionOf(item?: { name: string; version?: string; publishedAt?: string | null }) {
    return item ? `${visitorView.value}:${item.name}:${item.version ?? item.publishedAt}` : ''
  }
  async function readEntry(name: string) {
    const listed = entries.value.find((e) => e.name === name)
    const cached = listed && opened.get(versionOf(listed))
    if (cached) return cached
    const entry = (
      await diaryPublicApiClient.entry.getReadableEntry({ name, publicOnly: visitorView.value })
    ).data
    if ('trashedAt' in entry && entry.trashedAt) {
      throw Object.assign(new Error('trashed'), { response: { status: 404 } })
    }
    opened.set(versionOf(entry), entry)
    return entry
  }

  // 在屏幕上的目录里换一篇：保留目录、日历和滚动位置，只换正文。
  async function selectInPlace() {
    const request = ++requestId
    error.value = ''
    actionError.value = ''
    publishing.value = undefined
    readQuery()
    const name = typeof route.params.id === 'string' ? route.params.id : entries.value[0]?.name
    if (!name) {
      opening.value = false
      selected.value = undefined
      return
    }
    // 正在看的就是这一篇，不用再取；换篇时先留着上一篇，取到再替换。
    if (selected.value?.name === name) return
    opening.value = true
    try {
      const entry = await readEntry(name)
      if (request !== requestId) return
      selected.value = entry
    } catch (e) {
      if (request !== requestId) return
      selected.value = undefined
      error.value = readError(e)
    } finally {
      if (request === requestId) opening.value = false
    }
  }

  function pick(entry: { name: string }) {
    return router.push({
      path: `${directory}/entry/${encodeURIComponent(entry.name)}`,
      query: currentListQuery(),
    })
  }
  function filter() {
    page.value = 1
    return router.push({ path: directory, query: query() })
  }
  function reset() {
    keyword.value = ''
    visibility.value = 'all'
    month.value = ''
    selectedDate.value = ''
    calendarMonth.value = session.value?.today.slice(0, 7) || ''
    return filter()
  }
  function chooseDate(date: string) {
    selectedDate.value = selectedDate.value === date ? '' : date
    month.value = ''
    return filter()
  }
  /** 筛选这一整月；日历停在这个月。 */
  function chooseMonth() {
    month.value = month.value === calendarMonth.value ? '' : calendarMonth.value
    selectedDate.value = ''
    return filter()
  }
  /** 翻日历只换显示的月份，不改变列表的筛选。 */
  function turnCalendar(delta: number) {
    calendarMonth.value = shiftMonth(
      calendarMonth.value || session.value?.today.slice(0, 7) || '',
      delta,
    )
    return loadCalendar()
  }
  function turn(delta: number) {
    page.value += delta
    return router.push({ path: directory, query: query() })
  }
  async function switchView(publicOnly: boolean) {
    if (
      !session.value?.isOwner ||
      editing.value ||
      busy.value ||
      loading.value ||
      visitorView.value === publicOnly
    )
      return
    // A private entry has no visitor URL; open the public directory instead.
    const entry = selected.value
    const keepEntry =
      entry && route.params.id && (!publicOnly || !('working' in entry) || entry.published)
    const target = router.resolve({
      path: keepEntry ? `${directory}/entry/${encodeURIComponent(entry.name)}` : directory,
      query: {},
    })
    clearReading()
    visitorView.value = publicOnly
    if (target.fullPath === route.fullPath) await load()
    else {
      const failure = await router.replace(target)
      if (failure) {
        visitorView.value = !publicOnly
        await load()
      }
    }
  }
  function write(entry?: Entry) {
    return router.push({
      path: `${directory}/write`,
      query: {
        ...query(),
        entry: entry?.name || newEntryId(),
        new: entry ? undefined : '1',
      },
    })
  }
  function saved(entry: Entry) {
    savedEntry.value = entry
  }
  function closeWriter() {
    const name = savedEntry.value?.name
    return router.replace({
      path: name ? `${directory}/entry/${encodeURIComponent(name)}` : directory,
      query: query(),
    })
  }
  async function action(entry: Entry, operation: 'publish' | 'unpublish' | 'trash') {
    if (busy.value) return
    busy.value = true
    actionError.value = ''
    try {
      await mutateEntry(entry, operation)
      publishing.value = undefined
      if (operation === 'trash' && route.path !== directory) {
        softNext = true
        shownList = ''
        await router.replace({ path: directory, query: currentListQuery() })
      } else await load(true)
    } catch (e) {
      actionError.value = message(e)
    } finally {
      busy.value = false
    }
  }
  const removeGuard = router.beforeEach(async () => !editing.value || (await canLeave()))
  watch(
    () => route.fullPath,
    () => {
      // 只在目录里换一篇：目录、日历和正文都留在屏幕上，取到新正文再替换。
      const sameList =
        !writing.value &&
        !editing.value &&
        !loading.value &&
        shownList !== '' &&
        shownList === listKey(route.query)
      if (sameList) return void selectInPlace()
      const soft = softNext
      softNext = false
      void load(soft)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    requestId++
    calendarRequestId++
    removeGuard()
  })
  return {
    session,
    mine,
    visitorView,
    directory,
    loading,
    opening,
    error,
    busy,
    editing,
    entries,
    total,
    page,
    selected,
    editEntry,
    draftName,
    keyword,
    visibility,
    month,
    selectedDate,
    showFilters,
    calendarMonth,
    calendar,
    calendarError,
    publishing,
    actionError,
    size,
    privateEntry,
    content,
    accessible,
    filtered,
    filterSummary,
    listing,
    monthLabel,
    calendarDays,
    load,
    loadCalendar,
    pick,
    filter,
    reset,
    chooseDate,
    chooseMonth,
    turnCalendar,
    turn,
    switchView,
    write,
    saved,
    closeWriter,
    action,
  }
}
