import { val } from 'value-enhancer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowRunInputEditorStore } from './flowRunInputEditor.tsx'

beforeEach(() => {
  vi.stubGlobal('cancelIdleCallback', vi.fn())
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 1),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('FlowRunInputEditorStore', () => {
  it('requires an explicit value for each requested input and preserves null', () => {
    const language = val('en')
    const store = new FlowRunInputEditorStore(
      [
        { handle: 'name', jsonSchema: { type: 'string' }, nullable: false },
        { handle: 'optional', jsonSchema: { type: 'string' }, nullable: true },
      ],
      language,
    )

    expect(store.valid$.value).toBe(false)
    expect(store.replaceValues({ name: 'Ada' })).toBe(true)
    expect(store.valid$.value).toBe(false)
    expect(store.replaceValues({ name: 'Ada', optional: null })).toBe(true)
    expect(store.valid$.value).toBe(true)
    expect(store.values()).toEqual({ name: 'Ada', optional: null })
    expect(store.replaceValues({ unknown: true })).toBe(false)

    store.dispose()
    language.dispose()
  })
})
