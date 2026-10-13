import { diaryConsoleApiClient } from '@/api'
import type { DiaryContent, DiaryWrite } from '@/api'
import { weekdays } from '../notebook/calendar'
// 列表和目录只拿摘要（Summary）；打开一篇时才取完整内容（Entry）。
export type {
  DiaryContent as Content,
  DiaryPublished as Published,
  DiaryPrivateEntry as Entry,
  DiaryPublicEntry as PublicEntry,
  DiaryEntrySummary as Summary,
  DiaryPublicSummary as PublicSummary,
  DiarySession as Session,
  DiaryEntryPage as Page,
} from '@/api'

export type Draft = Omit<DiaryWrite, 'name' | 'version'>

const mutation = { xWarmDiary: '1' }

export async function saveEntry(name: string, version: string | undefined, draft: Draft) {
  const diaryWrite = { name, version, ...draft }
  return (
    await (version
      ? diaryConsoleApiClient.entry.updateEntry({ name, ...mutation, diaryWrite })
      : diaryConsoleApiClient.entry.createEntry({ ...mutation, diaryWrite }))
  ).data
}

/** 操作只需要标识和版本号，完整日记和列表摘要都可以传。 */
export async function mutateEntry(
  entry: { name: string; version: string },
  action: 'publish' | 'unpublish' | 'trash' | 'restore' | 'delete',
) {
  const params = { name: entry.name, ...mutation, diaryVersion: { version: entry.version } }
  switch (action) {
    case 'publish':
      return (await diaryConsoleApiClient.entry.publishEntry(params)).data
    case 'unpublish':
      return (await diaryConsoleApiClient.entry.unpublishEntry(params)).data
    case 'trash':
      return (await diaryConsoleApiClient.entry.trashEntry(params)).data
    case 'restore':
      return (await diaryConsoleApiClient.entry.restoreEntry(params)).data
    case 'delete':
      return (await diaryConsoleApiClient.entry.deleteEntry(params)).data
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } }).response?.status
}

export function message(error: unknown, options?: { keepInput?: boolean }): string {
  const keepInput = options?.keepInput !== false
  const status = statusOf(error)
  if (status === 409)
    return keepInput
      ? '这篇日记已在其他页面修改。你的输入已保留，请先查看最新版本。'
      : '日记已在其他页面修改，列表已刷新，请核对后重试。'
  if (status === 401 || status === 403)
    return keepInput
      ? '登录已失效或当前账号不是日记主人。请重新登录后重试，当前输入已保留。'
      : '登录已失效或没有权限，请重新登录后重试。'
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
  if (keepInput) return detail || '操作失败，请检查网络后重试。当前输入已保留。'
  return detail || '请检查网络后重试。'
}

/** 没有标题时取正文开头，都没有才用日期。 */
export function title(
  content: Pick<DiaryContent, 'date' | 'title'> & { text?: string; excerpt?: string },
) {
  if (content.title) return content.title
  const text = (content.excerpt ?? content.text)?.replace(/\s+/g, ' ').trim()
  if (text) return text.length > 24 ? text.slice(0, 24) + '…' : text
  return longDate(content.date)
}

/** 2026 年 9 月 24 日 · 星期四 */
export function longDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return `${Number(m[1])} 年 ${Number(m[2])} 月 ${Number(m[3])} 日 · 星期${weekdays[day]}`
}

/** 目录和列表用的短格式：9 月 24 日 · 周四 */
export function shortDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return `${Number(m[2])} 月 ${Number(m[3])} 日 · 周${weekdays[day]}`
}

/** 2026 年 9 月 */
export function monthTitle(month: string) {
  const m = /^(\d{4})-(\d{2})/.exec(month)
  return m ? `${Number(m[1])} 年 ${Number(m[2])} 月` : month
}

/** 编辑器状态提示，前后台编辑器共用。 */
export function draftHint(entry?: { published?: unknown }) {
  return entry?.published ? '自动保存 · 修改不会自动更新分享' : '自动保存 · 写给自己'
}

/** 日期 · 心情 · 天气，空值不显示。 */
export function metaLine(content: Pick<DiaryContent, 'date' | 'mood' | 'weather'>) {
  return [
    longDate(content.date),
    content.mood && '心情 ' + content.mood,
    content.weather && '天气 ' + content.weather,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** 版本冲突时服务器版本的摘要行。 */
export function contentMeta(content: Pick<DiaryContent, 'date' | 'title' | 'mood' | 'weather'>) {
  return [content.title || '（无标题）', metaLine(content)].join(' · ')
}

const fieldNames: Record<string, string> = {
  date: '日期',
  title: '标题',
  html: '正文',
  mood: '心情',
  weather: '天气',
}

/** 与已分享版本不同的字段，如「标题、正文」。 */
export function changedLabel(fields: string[]) {
  return fields.map((field) => fieldNames[field] || field).join('、')
}

// 与后端 DiaryContent 的 MOODS、WEATHERS 保持一致。
export const moods = ['平静', '愉快', '放松', '怀念', '低落', '疲惫']
export const weathers = ['晴', '多云', '阴', '雨', '雪', '风']
