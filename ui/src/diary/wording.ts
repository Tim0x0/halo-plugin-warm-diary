// 前后台共用的操作名称与确认文案。

export type EntryOperation = 'publish' | 'unpublish' | 'trash' | 'restore' | 'delete'

export const operationLabels: Record<EntryOperation, string> = {
  publish: '分享',
  unpublish: '收回分享',
  trash: '删除',
  restore: '恢复',
  delete: '永久删除',
}

type Confirmed = Exclude<EntryOperation, 'publish'>

export const confirmTitles: Record<Confirmed, string> = {
  unpublish: '收回分享',
  trash: '删除日记',
  restore: '恢复日记',
  delete: '永久删除日记',
}

const confirmNotes: Record<Confirmed, string> = {
  unpublish: '收回后，访客将无法读到。',
  trash: '日记会移入回收站，可以恢复；已分享的会同时收回。',
  restore: '恢复后为「写给自己」。',
  delete: '正文和已分享的版本都会删除，无法恢复。',
}

/** subject 为带引号的标题，或「选中的 N 篇日记」。 */
export function confirmDescription(operation: Confirmed, subject: string) {
  return `确定${operationLabels[operation]}${subject}？${confirmNotes[operation]}`
}

export function isDanger(operation: EntryOperation) {
  return operation === 'trash' || operation === 'delete'
}

/** 已分享的日记再次分享即为更新分享。 */
export function shareLabel(entry: { published?: unknown } | { shared: boolean }) {
  return isShared(entry) ? '更新分享' : '分享'
}

export const pendingLabel = '有修改未分享'

/** 完整日记看 published，列表摘要看 shared。 */
export function isShared(entry: { published?: unknown } | { shared: boolean }) {
  return 'shared' in entry ? entry.shared : !!entry.published
}

export function statusLabel(
  entry: ({ published?: unknown } | { shared: boolean }) & { pendingChanges?: boolean },
) {
  if (!isShared(entry)) return '写给自己'
  return entry.pendingChanges ? pendingLabel : '已分享'
}

/** 分享确认框里的说明。 */
export function shareNote(entry: { published?: unknown } | { shared: boolean }) {
  return isShared(entry)
    ? '访客看到的内容将更新为下面这一版。'
    : '分享后，所有访客都能读到下面的内容。'
}
