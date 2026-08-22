import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WidgetStore } from './reconcileWidget.ts'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { equalConfig } from '../../base/trivial.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

// { type: "array", items: { type: "string" } }
export class ArrayWidgetStore extends SimpleWidgetStore {
  public readonly itemsSchema$: Val<unknown>
  public readonly itemsWidget$: ReadonlyVal<WidgetStore>

  public constructor(path: FieldPath, schema$: Val<unknown>, context: WidgetContext) {
    super(path, schema$, context)

    this.itemsSchema$ = this.dispose.add(this.deriveSchema$('items', (value: unknown) => value, equalConfig))

    this.itemsWidget$ = this.dispose.add(reconcileWidget$(this.path.append('items'), this.itemsSchema$, context))
  }

  public override isArray(): this is ArrayWidgetStore {
    return true
  }
}
