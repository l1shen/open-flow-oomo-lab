import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { FieldPath } from './fieldPath.ts'
import type { WidgetStore } from './reconcileWidget.ts'
import type { OverrideSchema, WidgetContext } from './widgetContext.ts'

import { isString } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { arrayShallowEqual, attachSetter, combine, derive } from 'value-enhancer'
import { inferNewItemName, toPlainObject } from '../../base/trivial.ts'
import { getDefaultSchemaForNewHandle, getDefaultValueForNewHandle, typeOfSchema } from '../../jsonSchema/preset.ts'
import { reconcileWidget$ } from './reconcileWidget.ts'
import { SimpleWidgetStore } from './simpleWidget.store.ts'

export interface CleansedObjectWidgetSchema {
  type: 'object'
  properties?: Record<string, unknown>
  additionalProperties?: boolean | unknown
}

export class ObjectWidgetStore extends SimpleWidgetStore {
  public readonly allowsUntypedFields$: ReadonlyVal<boolean>
  public readonly fixedFields$: ReadonlyVal<ObjectFieldStore[]>
  public readonly overrideFields$: ReadonlyVal<ObjectFieldStore[]>
  public readonly untypedFields$?: ReadonlyVal<ObjectFieldStore[]>
  public readonly fieldNames$: ReadonlyVal<string[]>

  public constructor(
    path: FieldPath,
    schema$: Val<unknown>,
    context: WidgetContext,
    value$: Val<unknown> | undefined,
    overrideSchema$: Val<OverrideSchema | undefined>,
  ) {
    super(path, schema$, context, value$, overrideSchema$)

    this.allowsUntypedFields$ = this.dispose.add(
      derive(this.schema$, (schema) => {
        const objectSchema = toPlainObject(schema)
        return typeOfSchema(schema) == 'object' && objectSchema?.additionalProperties !== false
      }),
    )
    this.fixedFields$ = this.dispose.add(this.deriveFixedFields$())
    this.overrideFields$ = this.dispose.add(this.deriveOverrideFields$())
    this.untypedFields$ = value$ == null ? undefined : this.dispose.add(this.deriveUntypedFields$(value$))

    this.fieldNames$ = this.dispose.add(
      this.untypedFields$
        ? combine([this.fixedFields$, this.overrideFields$, this.untypedFields$], ([fixedFields, overrideFields, untypedFields]) => {
            return [...fixedFields.map((field) => field.name), ...overrideFields.map((field) => field.name), ...untypedFields.map((field) => field.name)]
          })
        : combine([this.fixedFields$, this.overrideFields$], ([fixedFields, overrideFields]) => {
            return [...fixedFields.map((field) => field.name), ...overrideFields.map((field) => field.name)]
          }),
    )

    this.dispose.add(() => {
      for (const field of this.fixedFields$.value) {
        field.dispose()
      }
      for (const field of this.overrideFields$.value) {
        field.dispose()
      }
      if (this.untypedFields$) {
        for (const field of this.untypedFields$.value) {
          field.dispose()
        }
      }
    })
  }

  public override isObject(): boolean {
    return true
  }

  public addFixedField(index: number): void {
    if (this.context.role === 'user') {
      console.error(new Error("User can't add fixed field"))
      return
    }
    const schema = toPlainObject(this.schema$.value)
    const properties = toPlainObject(schema?.properties)
    const newFieldName = inferNewItemName('field', this.fieldNames$.value)

    if (properties) {
      const names = Object.keys(properties)
      const newProperties: Record<string, unknown> = {}
      let lastSchema: unknown
      for (let i = 0; i < index; i++) {
        lastSchema = newProperties[names[i]] = properties[names[i]]
      }
      newProperties[newFieldName] = lastSchema || getDefaultSchemaForNewHandle()
      for (let i = index; i < names.length; i++) {
        newProperties[names[i]] = properties[names[i]]
      }
      this.schema$.set({
        ...schema,
        properties: newProperties,
      })
    } else {
      this.schema$.set({
        ...schema,
        properties: { [newFieldName]: getDefaultSchemaForNewHandle() },
      })
    }

    if (this.value$) {
      const value = toPlainObject(this.value$.value)
      if (value) {
        this.value$.set({ ...value, [newFieldName]: getDefaultValueForNewHandle() })
      } else {
        this.value$.set({ [newFieldName]: getDefaultValueForNewHandle() })
      }
    }
  }

  public addOverrideField(index: number): void {
    const lastField = index > 0 ? this.overrideFields$.value[index - 1] : null
    const newFieldName = inferNewItemName('field', this.fieldNames$.value)
    this.context.addSchemaOverrideItem(
      {
        path: this.path.append(newFieldName),
        schema: lastField?.schema$.value || getDefaultSchemaForNewHandle(),
      },
      index,
    )

    if (this.value$) {
      const value = toPlainObject(this.value$.value)
      if (value) {
        this.value$.set({ ...value, [newFieldName]: getDefaultValueForNewHandle() })
      } else {
        this.value$.set({ [newFieldName]: getDefaultValueForNewHandle() })
      }
    }
  }

  public addUntypedField(): void {
    if (this.value$ == null) return
    const value = toPlainObject(this.value$.value) ?? {}
    const newFieldName = inferNewItemName('field', this.fieldNames$.value)
    this.value$.set({ ...value, [newFieldName]: getDefaultValueForNewHandle() })
  }

  /**
   * Add one field to the object. The `index` is item index inside `group` who clicked the add button.
   * If the `index` is `-1`, the field will be added to the top of the group.
   */
  public addField(group: 'fixed' | 'override' | 'untyped', itemIndex: number): void {
    if (this.context.role === 'author' && group === 'fixed' && !this.context.restrict$?.value) {
      this.addFixedField(itemIndex + 1)
    } else if (group === 'untyped') {
      this.addUntypedField()
    } else {
      this.addOverrideField(group === 'override' ? itemIndex + 1 : 0)
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

    const overrides = this.context.schemaOverrides$.value
    if (overrides) {
      const oldPath = this.path.append(oldName)
      const index = overrides.findIndex((override) => oldPath.equals(override.path))
      if (index >= 0) {
        this.context.schemaOverrides$.set(
          overrides.toSpliced(index, 1, {
            ...overrides[index],
            path: this.path.append(newName),
          }),
        )
      }
    }

    if (this.value$) {
      const value = toPlainObject(this.value$.value)
      if (value) {
        const entries = Object.entries(value)
        const index = entries.findIndex(([name]) => name === oldName)
        if (index >= 0) {
          entries[index] = [newName, entries[index][1]]
          this.value$.set(Object.fromEntries(entries))
        }
      }
    }

    const collapsed = this.context.collapsed$.value
    if (collapsed) {
      const oldPath = this.path.append(oldName)
      const newPath = this.path.append(newName)
      if (Object.hasOwn(collapsed, oldPath.key)) {
        collapsed[newPath.key] = collapsed[oldPath.key]
        this.context.collapsed$.set(collapsed)
      }
    }
  }

  public removeField(name: string): void {
    const schema = toPlainObject(this.schema$.value)
    const properties = schema?.properties
    if (properties) {
      const entries = Object.entries(properties)
      const index = entries.findIndex((e) => e[0] === name)
      if (index >= 0) {
        this.schema$.set({
          ...schema,
          properties: Object.fromEntries(entries.toSpliced(index, 1)),
        })
      }
    }

    this.context.removeSchemaOverrideItem(this.path.append(name))

    const value = toPlainObject(this.value$?.value)
    if (value) {
      const newValue = { ...value }
      delete newValue[name]
      this.value$?.set(newValue)
    }
  }

  public setField(name: string, value: unknown): void {
    if (!this.value$) return
    const newValue: Record<PropertyKey, unknown> = {}
    for (const field of this.fixedFields$.value) {
      if (field.name === name) {
        if (value !== undefined) newValue[name] = value
      } else if (field.value$?.value !== undefined) {
        newValue[field.name] = field.value$.value
      }
    }
    for (const field of this.overrideFields$.value) {
      if (field.name === name) {
        if (value !== undefined) newValue[name] = value
      } else if (field.value$?.value !== undefined) {
        newValue[field.name] = field.value$.value
      }
    }
    for (const field of this.untypedFields$?.value ?? []) {
      if (field.name === name) {
        if (value !== undefined) newValue[name] = value
      } else if (field.value$?.value !== undefined) {
        newValue[field.name] = field.value$.value
      }
    }
    this.value$.set(newValue)
  }

  private deriveFixedFields$(): ReadonlyVal<ObjectFieldStore[]> {
    let oldProperties: any
    let oldFields: ObjectFieldStore[] = []

    return derive(
      this.schema$,
      (schema): ObjectFieldStore[] => {
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

  private deriveOverrideFields$(): ReadonlyVal<ObjectFieldStore[]> {
    let oldFields: ObjectFieldStore[] | undefined

    return combine(
      [this.context.schemaOverrides$, this.schema$],
      ([overrides, schema]): ObjectFieldStore[] => {
        const newFields: ObjectFieldStore[] = []

        if (overrides) {
          const properties = toPlainObject(toPlainObject(schema)?.properties)

          for (const override of overrides) {
            if (this.path.matchChild(override.path)) {
              const name = override.path.last()
              if (isString(name) && !properties?.[name]) {
                newFields.push(oldFields?.find((field) => field.name === name) ?? new ObjectFieldStore(name, this, this.context, 'override'))
              }
            }
          }
        }

        if (oldFields) {
          for (const field of oldFields) {
            if (!newFields.some((f) => f.name === field.name)) {
              field.dispose()
            }
          }
        }

        oldFields = newFields

        return newFields
      },
      { equal: arrayShallowEqual },
    )
  }

  private deriveUntypedFields$(value$: Val<unknown>): ReadonlyVal<ObjectFieldStore[]> {
    let oldFields: ObjectFieldStore[] = []

    return combine(
      [value$, this.schema$, this.context.schemaOverrides$],
      ([value, schema, overrides]): ObjectFieldStore[] => {
        const objectSchema = toPlainObject(schema)
        const properties = toPlainObject(objectSchema?.properties)
        const overrideNames = new Set<string>()
        for (const override of overrides ?? []) {
          if (!this.path.matchChild(override.path)) continue
          const name = override.path.last()
          if (isString(name)) overrideNames.add(name)
        }
        const object = objectSchema?.additionalProperties === false ? undefined : toPlainObject(value)
        const newFields =
          object == null
            ? []
            : Object.keys(object)
                .filter((name) => properties?.[name] == null && !overrideNames.has(name))
                .map((name) => oldFields.find((field) => field.name === name) ?? new ObjectFieldStore(name, this, this.context, 'untyped'))

        for (const field of oldFields) {
          if (!newFields.some((candidate) => candidate.name === field.name)) field.dispose()
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
  public readonly value$?: Val<unknown>
  public readonly schema$: Val<unknown>
  public readonly widget$: ReadonlyVal<WidgetStore>
  public readonly context: WidgetContext

  public readonly overrideSchema$: Val<OverrideSchema | undefined>

  public constructor(name: string, objectStore: ObjectWidgetStore, context: WidgetContext, group: 'fixed' | 'override' | 'untyped' = 'fixed') {
    this.name = name
    this.context = context
    this.path = objectStore.path.append(name)

    if (objectStore.value$) {
      this.value$ = this.dispose.add(
        attachSetter(
          derive(objectStore.value$, (value) => toPlainObject(value)?.[name]),
          (value: unknown) => objectStore.setField(name, value),
        ),
      )
    }

    this.schema$ = this.dispose.add(
      attachSetter(
        derive(objectStore.schema$, (schema) => {
          const objectSchema = schema as CleansedObjectWidgetSchema
          if (group !== 'untyped') return objectSchema?.properties?.[name]
          return objectSchema?.additionalProperties === true ? undefined : objectSchema?.additionalProperties
        }),
        (fieldSchema) => {
          if (group === 'untyped') return
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

    this.overrideSchema$ = this.dispose.add(context.deriveSchemaOverrideItem$(this.path))

    this.widget$ = this.dispose.add(reconcileWidget$(this.path, this.schema$, context, this.value$, this.overrideSchema$))
  }

  public setSchema(group: 'fixed' | 'override' | 'untyped', schema: unknown): void {
    if (group === 'fixed') {
      this.schema$.set(schema)
    } else {
      const widget = this.widget$.value
      widget.overrideSchema$.set({
        ...widget.overrideSchema$.value,
        path: this.path,
        schema: schema,
      })
    }
    if (toPlainObject(schema)?.type === 'null') {
      this.value$?.set(null)
    }
  }
}
