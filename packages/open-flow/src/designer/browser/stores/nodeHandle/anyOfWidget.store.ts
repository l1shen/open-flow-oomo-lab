import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { FieldPath } from './fieldPath.ts'
import type { WidgetStore } from './reconcileWidget.ts'
import type { OverrideSchema, WidgetContext } from './widgetContext.ts'

import { disposableOne, disposableStore } from '@wopjs/disposable'
import { attachSetter, combine, derive, setValue } from 'value-enhancer'
import { toArray, toNumber, toPlainObject } from '../../base/trivial.ts'
import { ui_options } from '../../jsonSchema/preset.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

export class AnyOfWidgetStore extends SimpleWidgetStore {
  public readonly selected$: Val<number | undefined>
  public readonly selectedSchema$: Val<unknown | undefined>

  public readonly condition$: ReadonlyVal<AnyOfConditionStore | undefined>

  public constructor(
    path: FieldPath,
    schema$: Val<unknown>,
    context: WidgetContext,
    value$: Val<unknown> | undefined,
    overrideSchema$: Val<OverrideSchema | undefined>,
  ) {
    super(path, schema$, context, value$, overrideSchema$)

    this.selected$ = this.dispose.add(
      attachSetter(
        derive(this.overrideSchema$, (schema) => toNumber(toPlainObject(toPlainObject(schema)?.[ui_options])?.selected)),
        (selected) => {
          if (selected) {
            setValue(this.overrideSchema$, {
              ...toPlainObject(this.overrideSchema$.value),
              path: this.path,
              [ui_options]: {
                ...toPlainObject(toPlainObject(this.overrideSchema$.value)?.[ui_options]),
                selected,
              },
            })
          } else {
            setValue(this.overrideSchema$, undefined)
          }
        },
      ),
    )

    this.selectedSchema$ = this.dispose.add(
      attachSetter(
        combine([this.schemaWidgetType$, this.schema$, this.selected$], ([type, schema, selected]) => toArray(toPlainObject(schema)?.[type])?.[selected || 0]),
        (schema) => {
          const conditions = toArray(toPlainObject(this.schema$.value)?.[this.schemaWidgetType$.value]) || []
          setValue(this.schema$, {
            ...toPlainObject(this.schema$.value),
            [this.schemaWidgetType$.value]: conditions.toSpliced(this.selected$.value || 0, 1, schema),
          })
        },
      ),
    )

    const disposeLastCond = this.dispose.add(disposableOne())
    let lastConditionStore: AnyOfConditionStore | undefined
    this.condition$ = this.dispose.add(
      combine([this.selected$, this.selectedSchema$], ([selected = 0, selectedSchema]) => {
        if (!selectedSchema) return undefined
        if (lastConditionStore?.selected === selected) {
          return lastConditionStore
        }
        lastConditionStore = new AnyOfConditionStore(selected, this.selectedSchema$, this, this.context)
        return disposeLastCond.set(lastConditionStore)
      }),
    )

    if (value$) {
      // Cache the value for each option.
      const valueCache: Record<number, unknown> = {}

      this.dispose.add([
        value$.subscribe((value) => {
          valueCache[this.selected$.value || 0] = value
        }, true),
        this.selected$.reaction((selected = 0) => {
          setValue(value$, valueCache[selected])
        }),
      ])
    }
  }

  public override isAnyOf(): boolean {
    return true
  }
}

export class AnyOfConditionStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly selected: number
  public readonly value$?: Val<unknown>
  public readonly schema$: Val<unknown>
  public readonly widget$: ReadonlyVal<WidgetStore>
  public readonly context: WidgetContext

  public readonly overrideSchema$: Val<OverrideSchema | undefined>

  public constructor(selected: number, schema$: Val<unknown>, parent: AnyOfWidgetStore, context: WidgetContext) {
    this.selected = selected
    this.schema$ = schema$
    this.context = context

    this.value$ = parent.value$
    this.overrideSchema$ = parent.overrideSchema$

    this.widget$ = this.dispose.add(reconcileWidget$(parent.path, this.schema$, context, this.value$, this.overrideSchema$))
  }
}
