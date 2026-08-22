import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WidgetType } from '../../jsonSchema/preset.ts'
import type { JsonSchema } from '../../jsonSchema/types.ts'
import type { FieldPath } from './fieldPath.ts'
import type { WidgetStore } from './reconcileWidget.ts'
import type { OverrideSchema, WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { attachSetter, derive, setValue } from 'value-enhancer'
import { updatePartial, toArray, toPlainObject } from '../../base/trivial.ts'
import { getDefaultValue, typeOfSchema } from '../../jsonSchema/preset.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

export class ArrayWidgetStore extends SimpleWidgetStore {
  public readonly items$?: ReadonlyVal<ArrayItemStore[]>
  public readonly itemsSchema$: Val<unknown>
  public readonly itemsWidgetType$: ReadonlyVal<WidgetType>

  public constructor(
    path: FieldPath,
    schema$: Val<unknown>,
    context: WidgetContext,
    value$: Val<unknown> | undefined,
    overrideSchema$: Val<OverrideSchema | undefined>,
  ) {
    super(path, schema$, context, value$, overrideSchema$)

    this.itemsSchema$ = this.dispose.add(
      attachSetter(
        derive(schema$, (schema) => toPlainObject(schema)?.items),
        updatePartial(schema$ as Val<JsonSchema | undefined>, 'items'),
      ),
    )

    this.itemsWidgetType$ = this.dispose.add(derive(this.itemsSchema$, (schema) => typeOfSchema(schema)))

    if (value$) {
      this.items$ = this.dispose.add(this.deriveItems(value$))
      this.dispose.add(() => {
        for (const item of this.items$!.value) {
          item.dispose()
        }
      })
    }
  }

  public override isArray(): boolean {
    return true
  }

  /**
   * Add one item to the array, `itemIndex` is the item who clicked the add button.
   * If `itemIndex` is `-1`, the new item will be added to the start of the array.
   */
  public addItem(itemIndex: number): void {
    if (this.value$) {
      const items = toArray(this.value$.value)
      const v = getDefaultValue(typeOfSchema(this.itemsSchema$.value))
      if (items) {
        this.context.duplicateSchemaOverrideItem(this.path.append(itemIndex))
        const newItems = items.toSpliced(itemIndex + 1, 0, v)
        setValue(this.value$, newItems)
      } else {
        setValue(this.value$, [v])
      }
    }
  }

  /**
   * Delete one item from the array.
   */
  public removeItem(itemIndex: number): void {
    this.context.removeSchemaOverrideItem(this.path.append(itemIndex))
    if (this.value$) {
      const items = toArray(this.value$.value)
      setValue(this.value$, items ? items.toSpliced(itemIndex, 1) : [])
    }
  }

  private deriveItems(value$: Val<unknown>): ReadonlyVal<ArrayItemStore[]> {
    let oldItems: ArrayItemStore[] = []
    return derive(value$, (items) => {
      const len = Array.isArray(items) ? items.length : 0
      const newItems: ArrayItemStore[] = oldItems.slice(0, len)

      for (let i = newItems.length; i < len; i++) {
        newItems[i] = new ArrayItemStore(i, this, this.context)
      }

      for (let i = newItems.length; i < oldItems.length; i++) {
        oldItems[i]?.dispose()
      }

      oldItems = newItems

      return newItems
    })
  }
}

export class ArrayItemStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly path: FieldPath
  public readonly index: number
  public readonly value$?: Val<unknown>
  public readonly schema$: Val<unknown>
  public readonly widget$: ReadonlyVal<WidgetStore>
  public readonly context: WidgetContext

  public readonly overrideSchema$: Val<OverrideSchema | undefined>

  public constructor(index: number, arrayStore: ArrayWidgetStore, context: WidgetContext) {
    this.index = index
    this.context = context
    this.path = arrayStore.path.append(index)

    const array$ = arrayStore.value$
    if (array$) {
      this.value$ = this.dispose.add(
        attachSetter(
          derive(array$, (value) => toArray(value)?.[index]),
          (fieldValue) => {
            const array = toArray(array$.value)
            if (!Object.is(array?.[index], fieldValue)) {
              const newArray = array?.slice() ?? []
              newArray[index] = fieldValue
              array$.set(newArray)
            }
          },
        ),
      )
    }

    // Array item types are currently read-only.
    this.schema$ = arrayStore.itemsSchema$

    this.overrideSchema$ = this.dispose.add(this.context.deriveSchemaOverrideItem$(this.path))

    this.widget$ = this.dispose.add(reconcileWidget$(this.path, this.schema$, context, this.value$, this.overrideSchema$))
  }
}
