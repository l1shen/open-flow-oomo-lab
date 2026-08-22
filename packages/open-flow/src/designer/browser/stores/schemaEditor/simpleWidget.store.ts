import type { DisposableOne, DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val, ValConfig } from 'value-enhancer'
import type { ColorType, DateTimeFormat } from '../../components/constants.ts'
import type { WidgetType } from '../../jsonSchema/preset.ts'
import type { JsonSchema } from '../../jsonSchema/types.ts'
import type { AnyOfWidgetStore } from './anyOfWidget.store.ts'
import type { ArrayWidgetStore } from './arrayWidget.store.ts'
import type { StringFormat } from './constants.ts'
import type { MultiSelectWidgetStore } from './multiSelectWidget.store.ts'
import type { ObjectWidgetStore } from './objectWidget.store.ts'
import type { SelectWidgetStore } from './selectWidget.store.ts'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { disposableOne, disposableStore } from '@wopjs/disposable'
import { attachSetter, derive, setValue } from 'value-enhancer'
import { updatePartial, toNonEmptyPlainObject, toNumber, toPlainObject, filterString, toBoolean } from '../../base/trivial.ts'
import { isColorType, isDateTimeFormat } from '../../components/constants.ts'
import { typeOfSchema, ui_options } from '../../jsonSchema/preset.ts'

export class SimpleWidgetStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly widgetType$: ReadonlyVal<WidgetType>

  public constructor(
    public readonly path: FieldPath,
    public readonly schema$: Val<unknown>,
    public readonly context: WidgetContext,
  ) {
    this.widgetType$ = this.dispose.add(derive(this.schema$, typeOfSchema))
  }

  private expandedCache$?: Val<boolean>
  public get expanded$(): Val<boolean> {
    return (this.expandedCache$ ??= this.dispose.add(this.context.deriveExpanded$(this.path)))
  }

  // { type: "number", ui_options: { step: 0.1 }, minimum: 0, maximum: 10 }
  private numberConfigurationSlot?: DisposableOne
  public configureNumber(): NumberConfig {
    if (!this.numberConfigurationSlot) {
      this.numberConfigurationSlot = this.dispose.add(disposableOne())
    }
    const dispose = disposableStore()
    const step$ = dispose.add(this.deriveUiOptions$('step', toNumber))
    const minimum$ = dispose.add(this.deriveSchema$('minimum', toNumber))
    const maximum$ = dispose.add(this.deriveSchema$('maximum', toNumber))
    const exclusiveMinimum$ = dispose.add(this.deriveSchema$('exclusiveMinimum', toNumber))
    const exclusiveMaximum$ = dispose.add(this.deriveSchema$('exclusiveMaximum', toNumber))
    this.numberConfigurationSlot.set(dispose)
    return { step$, minimum$, maximum$, exclusiveMinimum$, exclusiveMaximum$ }
  }

  // { type: "string", ui_options: { colorType: "HEX" } }
  private colorConfigurationSlot?: DisposableOne
  public configureColor(): ColorConfig {
    if (!this.colorConfigurationSlot) {
      this.colorConfigurationSlot = this.dispose.add(disposableOne())
    }
    const colorType$ = this.colorConfigurationSlot.set(this.deriveUiOptions$('colorType', (value: unknown) => (isColorType(value) ? value : undefined)))
    return { colorType$ }
  }

  // { type: "string", format: "date-time" }
  private dateConfigurationSlot?: DisposableOne
  public configureDate(): DateConfig {
    if (!this.dateConfigurationSlot) {
      this.dateConfigurationSlot = this.dispose.add(disposableOne())
    }
    const format$ = this.dateConfigurationSlot.set(this.deriveSchema$('format', (value: unknown) => (isDateTimeFormat(value) ? value : undefined)))
    return { format$ }
  }

  private stringConfigurationSlot?: DisposableOne
  public configureString(): StringConfig {
    if (!this.stringConfigurationSlot) {
      this.stringConfigurationSlot = this.dispose.add(disposableOne())
    }
    const dispose = disposableStore()
    const format$ = dispose.add(this.deriveSchema$('format', filterString as (v: unknown) => StringFormat | undefined))
    const pattern$ = dispose.add(this.deriveSchema$('pattern', filterString))
    const minLength$ = dispose.add(this.deriveSchema$('minLength', toNumber))
    const maxLength$ = dispose.add(this.deriveSchema$('maxLength', toNumber))
    this.stringConfigurationSlot.set(dispose)
    return { format$, pattern$, minLength$, maxLength$ }
  }

  // { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } }
  private arrayConfigurationSlot?: DisposableOne
  public configureArray(): ArrayConfig {
    if (!this.arrayConfigurationSlot) {
      this.arrayConfigurationSlot = this.dispose.add(disposableOne())
    }
    const dispose = disposableStore()
    const minItems$ = dispose.add(this.deriveSchema$('minItems', toNumber))
    const maxItems$ = dispose.add(this.deriveSchema$('maxItems', toNumber))
    this.arrayConfigurationSlot.set(dispose)
    return { minItems$, maxItems$ }
  }

  // { type: "object", additionalProperties: true, properties: { name: { type: "string" } } }
  private objectConfigurationSlot?: DisposableOne
  public configureObject(): ObjectConfig {
    if (!this.objectConfigurationSlot) {
      this.objectConfigurationSlot = this.dispose.add(disposableOne())
    }
    const additionalProperties$ = this.objectConfigurationSlot.set(this.deriveSchema$('additionalProperties', toBoolean))
    return { additionalProperties$ }
  }

  public isSelect(): this is SelectWidgetStore {
    return false
  }

  public isMultiSelect(): this is MultiSelectWidgetStore {
    return false
  }

  public isArray(): this is ArrayWidgetStore {
    return false
  }

  public isObject(): this is ObjectWidgetStore {
    return false
  }

  public isAnyOf(): this is AnyOfWidgetStore {
    return false
  }

  protected deriveSchema$<T>(key: keyof JsonSchema, toType: (value: unknown) => T | undefined, config?: ValConfig<T | undefined>): Val<T | undefined> {
    return attachSetter(
      derive(this.schema$, (schema) => toType(toPlainObject(schema)?.[key]), config),
      updatePartial(this.schema$ as Val<JsonSchema>, key),
    )
  }

  protected deriveUiOptions$<T>(key: string, toType: (value: unknown) => T | undefined, config?: ValConfig<T | undefined>): Val<T | undefined> {
    return attachSetter(
      derive(this.schema$, (schema) => toType(toPlainObject(toPlainObject(schema)?.[ui_options])?.[key]), config),
      (value) => {
        const currentSchema = toPlainObject(this.schema$.value)
        const currentUiOptions = toPlainObject(currentSchema?.[ui_options])
        if (Object.is(value, currentUiOptions?.[key])) return

        const uiOptions = {
          ...currentUiOptions,
          [key]: value,
        }

        setValue(
          this.schema$,
          currentSchema && {
            ...currentSchema,
            [ui_options]: toNonEmptyPlainObject(uiOptions),
          },
        )
      },
    )
  }
}

interface NumberConfig {
  readonly step$: Val<number | undefined>
  readonly minimum$: Val<number | undefined>
  readonly maximum$: Val<number | undefined>
  readonly exclusiveMinimum$: Val<number | undefined>
  readonly exclusiveMaximum$: Val<number | undefined>
}

interface ColorConfig {
  readonly colorType$: Val<ColorType | undefined>
}

interface DateConfig {
  readonly format$: Val<DateTimeFormat | undefined>
}

interface StringConfig {
  readonly format$: Val<StringFormat | undefined>
  readonly pattern$: Val<string | undefined>
  readonly minLength$: Val<number | undefined>
  readonly maxLength$: Val<number | undefined>
}

interface ArrayConfig {
  readonly minItems$: Val<number | undefined>
  readonly maxItems$: Val<number | undefined>
}

interface ObjectConfig {
  readonly additionalProperties$: Val<boolean | undefined>
}
