import type { OverrideSchema } from './widgetContext.ts'

import { val } from 'value-enhancer'
import { describe, expect, it, vi } from 'vitest'
import { getBaseSchema } from '../../jsonSchema/preset.ts'
import { FieldPath } from './fieldPath.ts'
import { ObjectWidgetStore } from './objectWidget.store.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'
import { WidgetContext } from './widgetContext.ts'

function createContext(schema$: ReturnType<typeof val<unknown>>): WidgetContext {
  return new WidgetContext({ role: 'user', inout: 'in' }, schema$, val(), val(), val(), val(), () => {})
}

describe('SimpleWidgetStore', () => {
  it('emits subpanel changes only when schema edits cross the presentation boundary', () => {
    const schema$ = val<unknown>({
      additionalProperties: false,
      properties: { value: { type: 'string' } },
      type: 'object',
    })
    const overrideSchema$ = val<OverrideSchema | undefined>(undefined)
    const store = new SimpleWidgetStore(FieldPath.get(), schema$, createContext(schema$), undefined, overrideSchema$)
    const onChange = vi.fn()
    const stop = store.hasSubpanel$.reaction(onChange, true)

    schema$.set({
      additionalProperties: false,
      properties: { value: { minLength: 1, type: 'string' } },
      type: 'object',
    })

    expect(store.hasSubpanel$.value).toBe(true)
    expect(onChange).not.toHaveBeenCalled()

    schema$.set({ additionalProperties: false, properties: {}, type: 'object' })

    expect(store.hasSubpanel$.value).toBe(false)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false)

    stop()
    store.dispose()
  })

  it('keeps the subpanel for allOf schemas', () => {
    const schema$ = val<unknown>({ allOf: [{ type: 'string' }] })
    const overrideSchema$ = val<OverrideSchema | undefined>(undefined)
    const store = new SimpleWidgetStore(FieldPath.get(), schema$, createContext(schema$), undefined, overrideSchema$)

    expect(store.hasSubpanel$.value).toBe(true)

    store.dispose()
  })

  it('keeps a new Any value while replacing its widget type', () => {
    const schema$ = val<unknown>({})
    const value$ = val<unknown>(null)
    const overrideSchema$ = val<OverrideSchema | undefined>(undefined)
    const widgets = reconcileWidget$(FieldPath.get(), schema$, createContext(schema$), value$, overrideSchema$)
    const widget = widgets.value

    widget.value$!.set('')
    widget.overrideSchema$.set({ path: FieldPath.get(), schema: getBaseSchema('string') })

    expect(value$.value).toBe('')
    expect(widgets.value).not.toBe(widget)
    expect(widgets.value.widgetType$.value).toBe('string')

    widgets.dispose()
  })
})

describe('ObjectWidgetStore', () => {
  it('shares one additional-properties projection across object fields', () => {
    const schema$ = val<unknown>({
      additionalProperties: true,
      properties: { value: { type: 'string' } },
      type: 'object',
    })
    const overrideSchema$ = val<OverrideSchema | undefined>(undefined)
    const store = new ObjectWidgetStore(FieldPath.get(), schema$, createContext(schema$), val<unknown>({}), overrideSchema$)
    const onChange = vi.fn()
    const stop = store.allowsUntypedFields$.reaction(onChange, true)

    schema$.set({
      additionalProperties: true,
      properties: { value: { minLength: 1, type: 'string' } },
      type: 'object',
    })

    expect(store.allowsUntypedFields$.value).toBe(true)
    expect(onChange).not.toHaveBeenCalled()

    schema$.set({
      additionalProperties: false,
      properties: { value: { minLength: 1, type: 'string' } },
      type: 'object',
    })

    expect(store.allowsUntypedFields$.value).toBe(false)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false)

    stop()
    store.dispose()
  })
})
