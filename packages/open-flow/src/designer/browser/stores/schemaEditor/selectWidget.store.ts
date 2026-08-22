import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { attachSetter, derive } from 'value-enhancer'
import { filterString, toArray, toPlainObject, toSomeTruthyArray } from '../../base/trivial.ts'
import { ui_options } from '../../jsonSchema/preset.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

// { type: "string", enum: ["a", "b", "c"], ui_options: { labels: ["A", "B", "C"] } }
export class SelectWidgetStore extends SimpleWidgetStore {
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

  public override isSelect(): this is SelectWidgetStore {
    return true
  }

  /**
   * `itemIndex` identifies the item whose add button was clicked. Use `-1` to insert at the beginning.
   */
  public addItem(itemIndex: number): void {
    const schema = { ...toPlainObject(this.schema$.value) }
    const values = toArray(schema.enum)?.slice() ?? []

    // Sync the labels array
    const uiOptions = { ...toPlainObject(schema[ui_options]) }
    const labels = toArray(uiOptions.labels)?.slice() ?? []
    while (labels.length < values.length) {
      labels.push('')
    }
    labels.splice(itemIndex + 1, 0, '')
    uiOptions.labels = toSomeTruthyArray(labels)

    values.splice(itemIndex + 1, 0, '')
    schema.enum = values
    schema[ui_options] = uiOptions
    this.schema$.set(schema)
  }

  /**
   * `itemIndex` identifies the item whose remove button was clicked and is never `-1`.
   */
  public removeItem(itemIndex: number): void {
    const schema = { ...toPlainObject(this.schema$.value) }
    const values = toArray(schema.enum)?.slice() ?? []

    // Shrink the labels array
    const uiOptions = { ...toPlainObject(schema[ui_options]) }
    const labels = toArray(uiOptions.labels)?.slice() ?? []
    while (labels.length < values.length) {
      labels.push('')
    }
    labels.splice(itemIndex, 1)
    uiOptions.labels = toSomeTruthyArray(labels)

    values.splice(itemIndex, 1)
    schema.enum = values
    schema[ui_options] = uiOptions
    this.schema$.set(schema)
  }

  private deriveItems(): ReadonlyVal<SelectItemStore[]> {
    let oldItems: SelectItemStore[] = []
    return derive(this.schema$, (schema) => {
      const len = toArray(toPlainObject(schema)?.enum)?.length ?? 0
      const newItems = oldItems.slice(0, len)
      for (let i = newItems.length; i < len; i++) {
        newItems[i] = new SelectItemStore(i, this, this.context)
      }
      for (let i = newItems.length; i < oldItems.length; i++) {
        oldItems[i]?.dispose()
      }
      oldItems = newItems
      return newItems
    })
  }

  /** @internal */
  public deriveValue$(index: number): Val<unknown> {
    return attachSetter(
      derive(this.schema$, (schema: unknown) => toArray(toPlainObject(schema)?.enum)?.[index]),
      (value: unknown) => {
        const currentSchema = toPlainObject(this.schema$.value)
        const currentEnum = toArray(currentSchema?.enum)

        if (!Object.is(currentEnum?.[index], value)) {
          const newEnum = currentEnum?.slice() ?? []
          newEnum[index] = value
          this.schema$.set({
            ...currentSchema,
            enum: newEnum,
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

interface ISelectStore {
  deriveValue$(index: number): Val<unknown>
  deriveLabel$(index: number): Val<string | undefined>
}

export class SelectItemStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly value$: Val<unknown>
  public readonly label$: Val<string | undefined>

  public constructor(
    public readonly index: number,
    public readonly selectStore: ISelectStore,
    public readonly context: WidgetContext,
  ) {
    this.value$ = this.dispose.add(this.selectStore.deriveValue$(index))
    this.label$ = this.dispose.add(this.selectStore.deriveLabel$(index))
  }
}
