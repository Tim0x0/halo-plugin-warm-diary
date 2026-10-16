import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router'
import { diaryConsoleApiClient } from '@/api'
import { message, mutateEntry, type Page } from './api'
import type { EntryOperation } from './wording'
type FilterPatch = {
  keyword?: string
  visibility?: string
  from?: string
  to?: string
  mood?: string
  weather?: string
}

function queryText(value: LocationQueryValue | LocationQueryValue[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || ''
}

export function useConsoleEntries(manage: Ref<boolean>) {
  const route = useRoute()
  const router = useRouter()
  const trash = computed(() => route.name === 'WarmDiaryTrash')
  const filters = computed(() => {
    const query = route.query
    const pageValue = Number(queryText(query.page))
    const sizeValue = Number(queryText(query.size))
    const visibility = queryText(query.visibility)
    return {
      page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
      size: [20, 30, 50, 100].includes(sizeValue) ? sizeValue : 20,
      keyword: queryText(query.keyword).slice(0, 200),
      visibility: !trash.value && ['private', 'public'].includes(visibility) ? visibility : 'all',
      from: trash.value ? '' : queryText(query.from),
      to: trash.value ? '' : queryText(query.to),
      mood: trash.value ? '' : queryText(query.mood),
      weather: trash.value ? '' : queryText(query.weather),
      trash: trash.value,
    }
  })
  const queryKey = computed(() => JSON.stringify(filters.value))
  const data = ref<Page>({ items: [], total: 0, page: 1, size: 20 })
  const loading = ref(false)
  const error = ref('')
  const selectedNames = ref<string[]>([])
  const selectedEntries = computed(() =>
    data.value.items.filter((item) => selectedNames.value.includes(item.name)),
  )
  const checkedAll = computed({
    get: () =>
      data.value.items.length > 0 && selectedEntries.value.length === data.value.items.length,
    set: (checked: boolean) => {
      selectedNames.value = checked ? data.value.items.map((item) => item.name) : []
    },
  })
  const indeterminate = computed(() => selectedEntries.value.length > 0 && !checkedAll.value)
  const hasFilters = computed(
    () =>
      filters.value.visibility !== 'all' ||
      !!filters.value.from ||
      !!filters.value.to ||
      !!filters.value.mood ||
      !!filters.value.weather,
  )
  const hasSearch = computed(() => hasFilters.value || !!filters.value.keyword)
  let requestId = 0
  let disposed = false

  function updateQuery(patch: Record<string, string | undefined>) {
    return router.replace({ query: { ...route.query, ...patch } })
  }
  function setFilters(patch: FilterPatch) {
    return updateQuery({ ...patch, page: undefined })
  }
  function clearFilters() {
    return setFilters({
      visibility: undefined,
      from: undefined,
      to: undefined,
      mood: undefined,
      weather: undefined,
    })
  }
  function resetSearch() {
    return setFilters({
      keyword: undefined,
      visibility: undefined,
      from: undefined,
      to: undefined,
      mood: undefined,
      weather: undefined,
    })
  }
  function changePage({ page, size }: { page: number; size: number }) {
    return updateQuery({
      page: page > 1 ? String(page) : undefined,
      size: size !== 20 ? String(size) : undefined,
    })
  }
  const keyword = computed({
    get: () => filters.value.keyword,
    set: (value: string) => {
      void setFilters({ keyword: value || undefined })
    },
  })

  async function load() {
    if (!manage.value || disposed) return
    const request = ++requestId
    loading.value = true
    error.value = ''
    try {
      if (filters.value.from && filters.value.to && filters.value.from > filters.value.to) {
        error.value = '开始日期不能晚于结束日期'
        return
      }
      const result = (await diaryConsoleApiClient.entry.listPrivateEntries({ ...filters.value }))
        .data
      if (request !== requestId) return
      const lastPage = Math.max(1, Math.ceil(result.total / filters.value.size))
      if (filters.value.page > lastPage) {
        await changePage({ page: lastPage, size: filters.value.size })
        return
      }
      data.value = result
      selectedNames.value = selectedNames.value.filter((name) =>
        result.items.some((item) => item.name === name),
      )
    } catch (e) {
      if (request === requestId) error.value = message(e, { keepInput: false })
    } finally {
      if (request === requestId) loading.value = false
    }
  }

  watch(
    [manage, queryKey],
    () => {
      selectedNames.value = []
      if (manage.value) void load()
      else {
        requestId++
        data.value = { items: [], total: 0, page: 1, size: 20 }
        loading.value = false
      }
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    disposed = true
    requestId++
  })

  const mutating = ref(false)
  async function operate(entries: { name: string; version: string }[], operation: EntryOperation) {
    if (mutating.value || !manage.value || disposed || !entries.length) return
    mutating.value = true
    // Capture exactly the reviewed selection and versions; never act on another page.
    const targets = [...entries]
    const origin = queryKey.value
    const succeeded: string[] = []
    const failed: { name: string; error: unknown }[] = []
    try {
      for (let start = 0; start < targets.length; start += 5) {
        const batch = targets.slice(start, start + 5)
        const results = await Promise.allSettled(
          batch.map((entry) => mutateEntry(entry, operation)),
        )
        results.forEach((result, index) => {
          const name = batch[index]!.name
          if (result.status === 'fulfilled') succeeded.push(name)
          else failed.push({ name, error: result.reason })
        })
      }
      await load()
      if (!disposed && origin === queryKey.value) {
        selectedNames.value = failed
          .map((item) => item.name)
          .filter((name) => data.value.items.some((item) => item.name === name))
      }
      return { succeeded, failed }
    } finally {
      mutating.value = false
    }
  }

  return {
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
  }
}
