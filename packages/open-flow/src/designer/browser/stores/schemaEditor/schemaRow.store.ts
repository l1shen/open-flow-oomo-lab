import type { DisposableStore } from '@wopjs/disposable'
import type { Val, ReadonlyVal } from 'value-enhancer'
import type { WidgetStore } from './reconcileWidget.ts'
import type { WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { FieldPath } from './widgetContext.ts'

export class SchemaRowStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly path: FieldPath
  public readonly name: string
  public readonly description$: Val<string | undefined>
  public readonly displayDescription$: ReadonlyVal<string | undefined>
  public readonly nullable$: Val<boolean>
  public readonly kind$: Val<string | undefined>
  public readonly schema$: Val<unknown>
  public readonly widget$: ReadonlyVal<WidgetStore>
  public readonly context: WidgetContext

  public constructor(
    name: string,
    description$: Val<string | undefined>,
    displayDescription$: ReadonlyVal<string | undefined>,
    nullable$: Val<boolean>,
    kind$: Val<string | undefined>,
    context: WidgetContext,
  ) {
    this.path = FieldPath.get()
    this.name = name
    this.description$ = description$
    this.displayDescription$ = displayDescription$
    this.context = context
    this.schema$ = context.schema$
    this.nullable$ = nullable$
    this.kind$ = kind$

    this.widget$ = this.dispose.add(reconcileWidget$(this.path, this.schema$, context))
  }
}
