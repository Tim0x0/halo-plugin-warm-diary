import type { Entry } from './api'
import { useDraft } from './useDraft'
import { useDraftLeave } from './useDraftLeave'

/** 前后台编辑器共用：草稿、离开确认、保存并关闭。 */
export function useDiaryWriter(
  entry: Entry | undefined,
  today: string,
  onSaved: (entry: Entry) => void,
  onClose: () => void,
  initialName?: string,
) {
  const state = useDraft(entry, today, onSaved, initialName)
  const { canLeave, leaving } = useDraftLeave(state)

  async function close() {
    if (await canLeave()) onClose()
  }
  async function done() {
    if (await state.save()) onClose()
  }
  async function saveCopy() {
    if (await state.saveAsNew()) onClose()
  }

  return { ...state, canLeave, leaving, close, done, saveCopy }
}
