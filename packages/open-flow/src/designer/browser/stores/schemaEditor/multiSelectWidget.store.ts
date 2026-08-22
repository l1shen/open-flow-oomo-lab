import type { ReadonlyVal, Val } from 'value-enhancer'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { attachSetter, derive } from 'value-enhancer'
import { filterString, toArray, toPlainObject, toSomeTruthyArray } from '../../base/trivial.ts'
import { ui_options } from '../../jsonSchema/preset.ts'
import { SelectItemStore } from './selectWidget.store.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

// { type: "array", uniqueItems: true, items: { enum: ["option1", "option2"] }, ui_options: { labels: ["Option 1", "Option 2"] } }
export class MultiSelectWidgetStore extends SimpleWidgetStore {
  public readonly items$: ReadonlyVal<SelectItemStore[]>

  public constructor(path: FieldPath, schema$: Val<unknown>, context: WidgetContext) {
    super(path, schema$, context)

    this.items$ = this.dispose.add(this.deriveItems())

    this.dispose.add(() => {
      for (const item of this.items$.value) {
        item.dispose()
      }
    })
  }

  public override isMultiSelect(): this is MultiSelectWidgetStore {
    return true
  }

  public addItem(itemIndex: number): void {
    const schema = { ...toPlainObject(this.schema$.value) }
    const items = { ...toPlainObject(schema.items) }
    const values = toArray(items.enum)?.slice() ?? []

    const uiOptions = { ...toPlainObject(schema[ui_options]) }
    const labels = toArray(uiOptions.labels)?.slice() ?? []
    while (labels.length < values.length) {
      labels.push('')
    }
    labels.splice(itemIndex + 1, 0, '')
    uiOptions.labels = toSomeTruthyArray(labels)

    values.splice(itemIndex + 1, 0, '')
    items.enum = values
    schema.items = items
    schema[ui_options] = uiOptions
    this.schema$.set(schema)
  }

  public removeItem(itemIndex: number): void {
    const schema = { ...toPlainObject(this.schema$.value) }
    const items = { ...toPlainObject(schema.items) }
    const values = toArray(items.enum)?.slice() ?? []

    const uiOptions = { ...toPlainObject(schema[ui_options]) }
    const labels = toArray(uiOptions.labels)?.slice() ?? []
    while (labels.length < values.length) {
      labels.push('')
    }
    labels.splice(itemIndex, 1)
    uiOptions.labels = toSomeTruthyArray(labels)

    values.splice(itemIndex, 1)
    items.enum = values
    schema.items = items
    schema[ui_options] = uiOptions
    this.schema$.set(schema)
  }

  private deriveItems(): ReadonlyVal<SelectItemStore[]> {
    let oldItems: SelectItemStore[] = []
    return derive(this.schema$, (schema) => {
      const items = toPlainObject(schema)?.items
      const len = toArray(toPlainObject(items)?.enum)?.length ?? 0
      const newItems = oldItems.slice(0, len)
      for (let i = newItems.length; i < len; i++) {
        newItems[i] = new SelectItemStore(i, this, this.context)
      }
      for (let i = newItems.length; i < oldItems.length; i++) {
        oldItems[i].dispose()
      }
      oldItems = newItems
      return newItems
    })
  }

  /** @internal */
  public deriveValue$(index: number): Val<unknown> {
    return attachSetter(
      derive(this.schema$, (schema: unknown) => {
        const items = toPlainObject(schema)?.items
        return toArray(toPlainObject(items)?.enum)?.[index]
      }),
      (value: unknown) => {
        const currentSchema = toPlainObject(this.schema$.value)
        const currentItems = toPlainObject(currentSchema?.items)
        const currentEnum = toArray(currentItems?.enum)

        if (!Object.is(currentEnum?.[index], value)) {
          const newEnum = currentEnum?.slice() ?? []
          newEnum[index] = value
          this.schema$.set({
            ...currentSchema,
            items: {
              ...currentItems,
              enum: newEnum,
            },
          })
        }
      },
    )
  }

  /** @internal */
  public deriveLabel$(index: number): Val<string | undefined> {
    return attachSetter(
      derive(this.schema$, (schema: unknown) => {
        const uiOptions = toPlainObject(toPlainObject(schema)?.[ui_options])
        return filterString(toArray(uiOptions?.labels)?.[index])
      }),
      (value: string | undefined) => {
        const currentSchema = toPlainObject(this.schema$.value)
        const currentUiOptions = toPlainObject(currentSchema?.[ui_options])
        const currentLabels = toArray(currentUiOptions?.labels)

        if (!Object.is(currentLabels?.[index], value)) {
          const labels = currentLabels?.slice() ?? []
          labels[index] = value
          this.schema$.set({
            ...currentSchema,
            [ui_options]: {
              ...currentUiOptions,
              labels: toSomeTruthyArray(labels),
            },
          })
        }
      },
    )
  }
}
