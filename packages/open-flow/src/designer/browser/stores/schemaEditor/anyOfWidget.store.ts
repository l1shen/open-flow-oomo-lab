import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WidgetStore } from './reconcileWidget.ts'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { attachSetter, derive } from 'value-enhancer'
import { filterString, toArray, toPlainObject, toSomeTruthyArray } from '../../base/trivial.ts'
import { getDefaultSchemaForNewHandle, typeOfSchema, ui_options } from '../../jsonSchema/preset.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

// { anyOf: [{ type: "string" }, { type: "number" }], ui:options: { labels: ["Option 1"] } }
export class AnyOfWidgetStore extends SimpleWidgetStore {
  public readonly conditions$: ReadonlyVal<AnyOfConditionStore[]>

  public constructor(path: FieldPath, schema$: Val<unknown>, context: WidgetContext) {
    super(path, schema$, context)

    this.conditions$ = this.dispose.add(this.deriveConditions$())
  }

  public override isAnyOf(): this is AnyOfWidgetStore {
    return true
  }

  public addCondition(itemIndex: number): void {
    const schema = { ...toPlainObject(this.schema$.value) }
    const xxxOf = typeOfSchema(schema)
    const values = toArray(schema[xxxOf])?.slice() ?? []

    // Sync the labels array
    const uiOptions = { ...toPlainObject(schema[ui_options]) }
    const labels = toArray(uiOptions.labels)?.slice() ?? []
    while (labels.length < values.length) {
      labels.push('')
    }
    labels.splice(itemIndex + 1, 0, '')
    uiOptions.labels = toSomeTruthyArray(labels)

    values.splice(itemIndex + 1, 0, getDefaultSchemaForNewHandle())
    schema[xxxOf] = values
    schema[ui_options] = uiOptions
    this.schema$.set(schema)
  }

  public removeCondition(itemIndex: number): void {
    const schema = { ...toPlainObject(this.schema$.value) }
    const xxxOf = typeOfSchema(schema)
    const values = toArray(schema[xxxOf])?.slice() ?? []

    // Sync the labels array
    const uiOptions = { ...toPlainObject(schema[ui_options]) }
    const labels = toArray(uiOptions.labels)?.slice() ?? []
    while (labels.length < values.length) {
      labels.push('')
    }
    labels.splice(itemIndex, 1)
    uiOptions.labels = toSomeTruthyArray(labels)

    values.splice(itemIndex, 1)
    schema[xxxOf] = values
    schema[ui_options] = uiOptions
    this.schema$.set(schema)
  }

  private deriveConditions$(): ReadonlyVal<AnyOfConditionStore[]> {
    let oldItems: AnyOfConditionStore[] = []

    return derive(this.schema$, (schema: unknown) => {
      const raw = toPlainObject(schema)
      const len = toArray(raw?.[typeOfSchema(schema)])?.length ?? 0
      const newItems = oldItems.slice(0, len)
      for (let i = newItems.length; i < len; i++) {
        newItems[i] = new AnyOfConditionStore(i, this, this.context)
      }
      for (let i = newItems.length; i < oldItems.length; i++) {
        oldItems[i]?.dispose()
      }
      oldItems = newItems
      return newItems
    })
  }

  /** @internal */
  public deriveConditionSchema$(index: number, fallbackType: 'anyOf' | 'oneOf' | 'allOf' = 'anyOf'): Val<unknown> {
    return attachSetter(
      derive(this.schema$, (schema: unknown) => {
        return toArray(toPlainObject(schema)?.[typeOfSchema(schema)])?.[index]
      }),
      (value: unknown) => {
        const currentSchema = toPlainObject(this.schema$.value)
        // The schema type should be `allOf`, `anyOf`, or `oneOf` here.
        let type = typeOfSchema(currentSchema)
        if (type !== 'allOf' && type !== 'anyOf' && type !== 'oneOf') {
          type = fallbackType
        }
        const currentItems = toArray(currentSchema?.[type])
        if (!Object.is(currentItems?.[index], value)) {
          const newItems = currentItems?.slice() ?? []
          newItems[index] = value
          this.schema$.set({
            ...currentSchema,
            [type]: newItems,
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

export class AnyOfConditionStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly path: FieldPath
  public readonly index: number
  public readonly label$: Val<string | undefined>
  public readonly schema$: Val<unknown>
  public readonly widget$: ReadonlyVal<WidgetStore>
  public readonly context: WidgetContext

  public constructor(index: number, anyOfWidget: AnyOfWidgetStore, context: WidgetContext) {
    this.index = index
    this.path = anyOfWidget.path.append(index)
    this.context = context
    this.label$ = this.dispose.add(anyOfWidget.deriveLabel$(index))
    this.schema$ = this.dispose.add(anyOfWidget.deriveConditionSchema$(index))

    this.widget$ = this.dispose.add(reconcileWidget$(this.path, this.schema$, context))
  }
}
