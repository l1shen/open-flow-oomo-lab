import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { CleansedObjectWidgetSchema } from '../nodeHandle/objectWidget.store.ts'
import type { WidgetStore } from './reconcileWidget.ts'
import type { FieldPath, WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { arrayShallowEqual, attachSetter, derive } from 'value-enhancer'
import { inferNewItemName, toPlainObject } from '../../base/trivial.ts'
import { getDefaultSchemaForNewHandle } from '../../jsonSchema/preset.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

// { type: "object", additionalProperties: true, properties: { name: { type: "string" } } }
export class ObjectWidgetStore extends SimpleWidgetStore {
  public readonly fields$: ReadonlyVal<ObjectFieldStore[]>

  public constructor(path: FieldPath, schema$: Val<unknown>, context: WidgetContext) {
    super(path, schema$, context)

    this.fields$ = this.dispose.add(this.deriveFields$())
  }

  public override isObject(): this is ObjectWidgetStore {
    return true
  }

  /**
   * `name` is the field whose add button was clicked. An omitted name inserts at the beginning.
   */
  public addField(name?: string): void {
    if (this.context.role === 'user') {
      console.error(new Error("User can't add object field"))
      return
    }
    const schema = toPlainObject(this.schema$.value)
    const properties = toPlainObject(schema?.properties)
    if (properties) {
      const entries = Object.entries(properties)
      const index = (name ? entries.findIndex(([key]) => key === name) : -1) + 1
      const newName = inferNewItemName(
        'field',
        entries.map(([key]) => key),
      )
      const lastSchema = index > 0 ? entries[index - 1][1] : null
      entries.splice(index, 0, [newName, lastSchema || getDefaultSchemaForNewHandle()])
      this.schema$.set({
        ...schema,
        properties: Object.fromEntries(entries),
      })
    } else {
      this.schema$.set({
        ...schema,
        properties: { field: getDefaultSchemaForNewHandle() },
      })
    }
  }

  public renameField(oldName: string, newName: string): void {
    const schema = toPlainObject(this.schema$.value)
    const properties = toPlainObject(schema?.properties)
    if (properties) {
      const entries = Object.entries(properties)
      const index = entries.findIndex(([name]) => name === oldName)
      if (index >= 0) {
        entries[index] = [newName, entries[index][1]]
        this.schema$.set({
          ...schema,
          properties: Object.fromEntries(entries),
        })
      }
    }
  }

  public removeField(name: string): void {
    const schema = toPlainObject(this.schema$.value)
    const properties = toPlainObject(schema?.properties)
    if (properties) {
      const entries = Object.entries(properties)
      const index = entries.findIndex(([key]) => key === name)
      if (index >= 0) {
        entries.splice(index, 1)
        this.schema$.set({
          ...schema,
          properties: Object.fromEntries(entries),
        })
      }
    }
  }

  private deriveFields$(): ReadonlyVal<ObjectFieldStore[]> {
    let oldProperties: any
    let oldFields: ObjectFieldStore[] = []

    return derive(
      this.schema$,
      (schema: unknown) => {
        const properties = toPlainObject((schema as CleansedObjectWidgetSchema)?.properties)

        if (oldProperties === properties) {
          return oldFields
        }

        oldProperties = properties

        const newFields = properties
          ? Object.keys(properties).map((name) => oldFields.find((field) => field.name === name) || new ObjectFieldStore(name, this, this.context))
          : []

        for (const field of oldFields) {
          if (!properties?.[field.name]) {
            field.dispose()
          }
        }

        oldFields = newFields

        return newFields
      },
      { equal: arrayShallowEqual },
    )
  }
}

export class ObjectFieldStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly path: FieldPath
  public readonly name: string
  public readonly schema$: Val<unknown>
  public readonly widget$: ReadonlyVal<WidgetStore>
  public readonly context: WidgetContext

  public constructor(name: string, objectStore: ObjectWidgetStore, context: WidgetContext) {
    this.name = name
    this.context = context
    this.path = objectStore.path.append(name)

    this.schema$ = this.dispose.add(
      attachSetter(
        derive(objectStore.schema$, (schema) => (schema as CleansedObjectWidgetSchema)?.properties?.[name]),
        (fieldSchema) => {
          const schema = toPlainObject(objectStore.schema$.value)
          objectStore.schema$.set({
            ...schema,
            properties: {
              ...toPlainObject(schema?.properties),
              [name]: fieldSchema,
            },
          })
        },
      ),
    )

    this.widget$ = this.dispose.add(reconcileWidget$(this.path, this.schema$, context))
  }
}
