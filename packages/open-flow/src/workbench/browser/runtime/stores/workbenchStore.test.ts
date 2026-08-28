import { describe, expect, it, vi } from 'vitest'
import { WorkbenchClient } from '../api.ts'
import { WorkbenchStore } from './workbenchStore.ts'

describe('WorkbenchStore Variables', () => {
  it('does not request Variable names when the host disables Variables', async () => {
    const request = vi.fn(async () => {
      throw new Error('Unexpected request.')
    })
    const store = new WorkbenchStore(
      new WorkbenchClient(request),
      { getItem: () => null, setItem: () => undefined },
      () => 'identity',
      undefined,
      undefined,
      false,
    )

    try {
      await store.refreshVariableNames()

      expect(request).not.toHaveBeenCalled()
      expect(store.$.variableNamesLoading.value).toBe(false)
    } finally {
      store.dispose()
    }
  })
})
