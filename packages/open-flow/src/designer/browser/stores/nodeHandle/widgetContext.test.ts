import { val } from 'value-enhancer'
import { describe, expect, it } from 'vitest'
import { FieldPath } from './fieldPath.ts'
import { WidgetContext } from './widgetContext.ts'

describe('FieldPath', () => {
  it('restores canonical paths from serialized keys', () => {
    const path = FieldPath.get(['items', 1, 'name'])

    expect(FieldPath.fromKey(path.key)).toBe(path)
    expect(FieldPath.fromKey(FieldPath.get().key)).toBe(FieldPath.get())
  })
})

function createWidgetContext(collapsed$: ReturnType<typeof val<Record<string, boolean> | undefined>>): WidgetContext {
  return new WidgetContext({ role: 'author', inout: 'in' }, val(), val(), val(), collapsed$, val(), () => {})
}

describe('WidgetContext', () => {
  it('removes only the selected collapsed path and its descendants', () => {
    const selected = FieldPath.get([1])
    const descendant = FieldPath.get([1, 'child'])
    const similarPrefix = FieldPath.get([10])
    const sibling = FieldPath.get([2])
    const collapsed$ = val<Record<string, boolean> | undefined>({
      [selected.key]: true,
      [descendant.key]: true,
      [similarPrefix.key]: true,
      [sibling.key]: true,
    })
    const context = createWidgetContext(collapsed$)

    context.coalesceCollapsed(selected)

    expect(collapsed$.value).toEqual({
      [similarPrefix.key]: true,
      [sibling.key]: true,
    })
  })

  it('removes all collapsed paths when coalescing the root', () => {
    const collapsed$ = val<Record<string, boolean> | undefined>({
      [FieldPath.get().key]: true,
      [FieldPath.get(['items', 0]).key]: true,
    })
    const context = createWidgetContext(collapsed$)

    context.coalesceCollapsed(FieldPath.get())

    expect(collapsed$.value).toEqual({})
  })
})
