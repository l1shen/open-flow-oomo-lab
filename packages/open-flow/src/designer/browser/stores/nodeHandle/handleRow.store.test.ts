import type { HandleName, OutputHandleDef } from '../../../../schema/index.ts'

import { val } from 'value-enhancer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HandleRowStore } from './handleRow.store.ts'
import { WidgetContext } from './widgetContext.ts'

function toHandleName(value: string): HandleName {
  return value as HandleName
}

function createHandleRow(restrict?: ReturnType<typeof val<boolean | OutputHandleDef | undefined>>) {
  const schema$ = val<unknown>({ type: 'string' })
  const context = new WidgetContext({ role: 'author', inout: 'in', restrict }, schema$, val(), val(), val(), val(), () => {})
  const row = new HandleRowStore(toHandleName('value'), val(), val(), val('en'), val(), val(false), val(false), val(false), context, val<unknown>('initial'))
  return { context, row, schema$ }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HandleRowStore', () => {
  it('cancels superseded and pending idle validation', async () => {
    let nextId = 0
    const requestIdle = vi.fn((_callback: IdleRequestCallback): number => ++nextId)
    const cancelIdle = vi.fn()
    vi.stubGlobal('requestIdleCallback', requestIdle)
    vi.stubGlobal('cancelIdleCallback', cancelIdle)

    const { row, schema$ } = createHandleRow()
    const firstId = requestIdle.mock.results[0].value

    schema$.set({ type: 'number' })

    await vi.waitFor(() => {
      expect(cancelIdle).toHaveBeenCalledWith(firstId)
      expect(requestIdle).toHaveBeenCalledTimes(2)
    })
    const pendingId = requestIdle.mock.results[1].value

    row.dispose()

    expect(cancelIdle).toHaveBeenCalledWith(pendingId)
  })

  it('disposes the derived restriction with its row', () => {
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    const restrict = val<boolean | OutputHandleDef | undefined>(true)
    const { context, row } = createHandleRow(restrict)
    const disposeRestriction = vi.spyOn(context.restrict$!, 'dispose')

    row.dispose()

    expect(disposeRestriction).toHaveBeenCalledOnce()
  })
})
