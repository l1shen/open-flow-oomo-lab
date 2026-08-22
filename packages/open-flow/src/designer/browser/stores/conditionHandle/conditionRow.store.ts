import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { HandleName } from '../../../../schema/index.ts'
import type { HandleKind } from '../../components/handle.tsx'
import type { Logical } from './constants.ts'
import type { WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { derive } from 'value-enhancer'
import { asTrue } from '../../base/trivial.ts'
import { FieldPath } from '../nodeHandle/fieldPath.ts'
import { getHandleKind } from '../nodeHandle/handleKind.ts'
import { ConditionWidgetStore } from './widget.store.ts'

export class ConditionRowStore {
  public static is(value: unknown): value is ConditionRowStore {
    return value instanceof ConditionRowStore
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly path: FieldPath
  public readonly name: HandleName
  public readonly description$: Val<string | undefined>
  public readonly displayDescription$: ReadonlyVal<string | undefined>
  public readonly logical$: Val<Logical | undefined>
  public readonly widget: ConditionWidgetStore
  public readonly context: WidgetContext

  public readonly reference$: ReadonlyVal<boolean>
  public readonly showSettings$: Val<boolean>
  public readonly kind$: ReadonlyVal<HandleKind | undefined>

  // These properties always inherit from the first input handle definition.
  public readonly schema$: ReadonlyVal<unknown>
  public readonly schemaKind$: ReadonlyVal<string | undefined>
  public readonly nullable$: ReadonlyVal<boolean>
  public readonly value$: undefined
  public readonly error$: undefined

  public constructor(
    name: HandleName,
    description$: Val<string | undefined>,
    displayDescription$: ReadonlyVal<string | undefined>,
    reference$: ReadonlyVal<boolean>,
    showSettings$: Val<boolean>,
    context: WidgetContext,
  ) {
    this.name = name
    this.context = context
    this.path = FieldPath.get()
    this.description$ = description$
    this.displayDescription$ = displayDescription$
    this.reference$ = reference$
    this.showSettings$ = showSettings$
    this.logical$ = context.logical$
    this.widget = this.dispose.add(new ConditionWidgetStore(this.path, context))

    const def$ = this.dispose.add(derive(context.inputHandleDefs$, (defs) => defs?.at(0)))
    this.schema$ = this.dispose.add(derive(def$, (def) => def?.json_schema))
    this.schemaKind$ = this.dispose.add(derive(def$, (def) => def?.kind))
    this.nullable$ = this.dispose.add(derive(def$, (def) => asTrue(def?.nullable)))
    this.kind$ = this.dispose.add(derive(def$, (def) => getHandleKind(def?.json_schema)))
  }
}
