import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WidgetType } from '../../jsonSchema/preset.ts'
import type { JsonSchema } from '../../jsonSchema/types.ts'
import type { FieldPath } from './fieldPath.ts'
import type { OverrideSchema, WidgetContext } from './widgetContext.ts'

import { isPlainObject } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { attachSetter, combine, compute, derive, setValue, val } from 'value-enhancer'
import { filterString, toPlainObject } from '../../base/trivial.ts'
import { isAny, typeOfSchema } from '../../jsonSchema/preset.ts'

export class SimpleWidgetStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly widgetType$: ReadonlyVal<WidgetType>
  public readonly schemaWidgetType$: ReadonlyVal<WidgetType>
  public readonly overrideWidgetType$: ReadonlyVal<WidgetType>
  public readonly hasSubpanel$: ReadonlyVal<boolean>
  // This description belongs to the JSON Schema rather than the handle.
  public readonly description$: Val<string | undefined>
  public readonly descCollapsed$: Val<boolean>
  public constructor(
    public readonly path: FieldPath,
    public readonly schema$: Val<unknown>,
    public readonly context: WidgetContext,
    public readonly value$: Val<unknown> | undefined,
    public readonly overrideSchema$: Val<OverrideSchema | undefined>,
  ) {
    this.description$ = this.dispose.add(this.deriveDescription$(this.schema$))
    this.descCollapsed$ = this.dispose.add(val(!this.description$.value))
    this.schemaWidgetType$ = this.dispose.add(derive(this.schema$, typeOfSchema))
    this.overrideWidgetType$ = this.dispose.add(derive(this.overrideSchema$, (e) => typeOfSchema(e?.schema)))
    this.widgetType$ = this.dispose.add(
      combine([this.schemaWidgetType$, this.overrideWidgetType$], ([schemaType, overrideType]) => (isAny(schemaType) ? overrideType : schemaType)),
    )
    this.hasSubpanel$ = this.dispose.add(
      compute((get) => {
        const restricted = this.context.restrict$ == null ? false : get(this.context.restrict$) != null
        return hasSubpanel(this.context, get(this.widgetType$), get(this.schema$), restricted)
      }),
    )

    if (value$) {
      const valueCached: Record<string, any> = {}
      // A schema type change clears stale overrides and resets collapsed state.
      // An undefined value adopts the default for the new type.
      this.dispose.add([
        value$.subscribe((value) => {
          valueCached[this.schemaWidgetType$.value] = value
        }, true),
        this.schemaWidgetType$.reaction((type) => {
          if (schema$.value) {
            this.context.coalesceSchemaOverrideItems(this.path)
            this.context.coalesceCollapsed(this.path)
            setValue(value$, valueCached[type])
          }
        }, true),
      ])
    }
  }

  private collapsedValue$?: Val<boolean>
  public get collapsed$(): Val<boolean> {
    return (this.collapsedValue$ ??= this.dispose.add(this.context.deriveCollapsed$(this.path)))
  }

  private heightValue$?: Val<number | undefined>
  public get height$(): Val<number | undefined> {
    return (this.heightValue$ ??= this.dispose.add(this.context.deriveHeight$(this.path)))
  }

  public isObject(): boolean {
    return false
  }

  public isArray(): boolean {
    return false
  }

  public isAnyOf(): boolean {
    return false
  }

  private deriveDescription$(schema$: Val<unknown>): Val<string | undefined> {
    return attachSetter(
      derive(schema$, (schema) => filterString((toPlainObject(schema) as JsonSchema | undefined)?.description)),
      (description) => {
        if (isPlainObject(schema$.value)) {
          schema$.set({ ...schema$.value, description })
        }
      },
    )
  }
}

function hasSubpanel(context: WidgetContext, widgetType: WidgetType, schemaSource: unknown, restricted: boolean): boolean {
  const schema = toPlainObject(schemaSource)
  const schemaType = typeOfSchema(schema)

  if (widgetType == 'object') {
    if ((!restricted && context.canEditSchema) || schemaType == 'any') return true
    const properties = toPlainObject(schema?.properties)
    const hasProperties = properties != null && Object.keys(properties).length > 0
    return context.inout == 'in' ? hasProperties || schema?.additionalProperties !== false : hasProperties
  }

  return context.inout == 'in' && (widgetType == 'text' || widgetType == 'array' || schema?.anyOf != null || schema?.allOf != null || schema?.oneOf != null)
}
