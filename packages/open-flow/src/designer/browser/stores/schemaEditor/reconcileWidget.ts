import type { ReadonlyVal, Val } from 'value-enhancer'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { disposableOne } from '@wopjs/disposable'
import { derive } from 'value-enhancer'
import { typeOfSchema } from '../../jsonSchema/preset.ts'
import { AnyOfWidgetStore } from './anyOfWidget.store.ts'
import { ArrayWidgetStore } from './arrayWidget.store.ts'
import { typeHasSubpanel } from './constants.ts'
import { MultiSelectWidgetStore } from './multiSelectWidget.store.ts'
import { ObjectWidgetStore } from './objectWidget.store.ts'
import { SelectWidgetStore } from './selectWidget.store.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

export type WidgetStore = SimpleWidgetStore

export const reconcileWidget$ = (path: FieldPath, schema$: Val<unknown>, context: WidgetContext): ReadonlyVal<WidgetStore> => {
  const disposer = disposableOne()
  const schemaType$ = derive(schema$, typeOfSchema)
  const derived$ = derive(schemaType$, (type) => {
    let widgetStore: WidgetStore
    if (type === 'select') {
      widgetStore = new SelectWidgetStore(path, schema$, context)
    } else if (type === 'multiSelect') {
      widgetStore = new MultiSelectWidgetStore(path, schema$, context)
    } else if (type === 'array') {
      widgetStore = new ArrayWidgetStore(path, schema$, context)
    } else if (type === 'object') {
      widgetStore = new ObjectWidgetStore(path, schema$, context)
    } else if (type === 'anyOf') {
      widgetStore = new AnyOfWidgetStore(path, schema$, context)
    } else {
      widgetStore = new SimpleWidgetStore(path, schema$, context)
    }
    return disposer.set(widgetStore)
  })
  const derived$Dispose = derived$.dispose
  const reactionDispose = schemaType$.reaction((type) => {
    if (typeHasSubpanel.has(type)) {
      context.expand(path)
    }
  })
  derived$.dispose = () => {
    reactionDispose()
    derived$Dispose.call(derived$)
    disposer.dispose()
  }
  return derived$
}
