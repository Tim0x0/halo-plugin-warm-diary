import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { Dialog } from '@halo-dev/components'
import { useDraftLeave } from '../useDraftLeave'

vi.mock('@halo-dev/components', () => ({ Dialog: { warning: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

describe('leaving the editor', () => {
  it('flushes pending edits before allowing navigation', async () => {
    const save = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const state = useDraftLeave({ dirty: ref(true), saving: ref(false), save })
    expect(await state.canLeave()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(Dialog.warning).not.toHaveBeenCalled()
  })

  it('coalesces repeated close clicks and allows retry after cancelling a failed save', async () => {
    const save = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    const state = useDraftLeave({ dirty: ref(true), saving: ref(false), save })
    const first = state.canLeave(),
      second = state.canLeave()
    await Promise.resolve()
    expect(Dialog.warning).toHaveBeenCalledTimes(1)
    vi.mocked(Dialog.warning).mock.calls[0]![0]!.onCancel!()
    expect(await first).toBe(false)
    expect(await second).toBe(false)
    save.mockResolvedValue(true)
    expect(await state.canLeave()).toBe(true)
  })

  it('does not ask twice when a confirmed discard passes through the route guard', async () => {
    const state = useDraftLeave({
      dirty: ref(true),
      saving: ref(false),
      save: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    })
    const pending = state.canLeave()
    await Promise.resolve()
    vi.mocked(Dialog.warning).mock.calls[0]![0]!.onConfirm!()
    expect(await pending).toBe(true)
    expect(await state.canLeave()).toBe(true)
    expect(Dialog.warning).toHaveBeenCalledTimes(1)
  })
})
