import { ref, type Ref } from 'vue'
import { Dialog } from '@halo-dev/components'

export function useDraftLeave(draft: {
  dirty: Readonly<Ref<boolean>>
  saving: Readonly<Ref<boolean>>
  save: () => Promise<boolean>
}) {
  const leaving = ref(false)
  let pending: Promise<boolean> | undefined
  let accepted = false
  function canLeave(): Promise<boolean> {
    if (accepted) return Promise.resolve(true)
    if (pending) return pending
    leaving.value = true
    pending = (async () => {
      if ((!draft.dirty.value && !draft.saving.value) || (await draft.save())) return true
      return new Promise<boolean>((resolve) =>
        Dialog.warning({
          title: '还有内容未保存',
          description:
            '保存没有完成，当前输入仍在。可以继续编辑、重试保存或下载输入；离开会放弃未保存的部分。',
          confirmText: '放弃未保存修改',
          cancelText: '继续编辑',
          confirmType: 'danger',
          onConfirm: () => {
            accepted = true
            resolve(true)
          },
          onCancel: () => resolve(false),
        }),
      )
    })().finally(() => {
      pending = undefined
      leaving.value = false
    })
    return pending
  }
  return { canLeave, leaving }
}
