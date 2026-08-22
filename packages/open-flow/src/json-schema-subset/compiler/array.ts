import type { JSONSchema7, JSONSchema7Definition } from 'json-schema'
import type { JSONDelegate } from '../types.ts'
import type { Schema } from '../types.ts'
import type { Context } from './common.ts'
import type { InputSchema } from './compiler.ts'
import type { CompiledSchema } from './wrapper.ts'

import { joinPath, recordWarn, unwrapJSONSchema7Definition } from './common.ts'
import { compileSchema } from './compiler.ts'
import { cleanEmptyValues } from './utils.ts'
import { wrapCompiledSchema, CompiledKind, getKind, toNever, isCompiledSchema } from './wrapper.ts'

export function compileArraySchema<E>(context: Context<E>, schema: InputSchema): CompiledSchema<E> | null {
  let items = compileItems(context, schema)
  let maxItems = getItemsLimit(context, 'maxItems', schema)
  const minItems = getItemsLimit(context, 'minItems', schema)
  const contains = compileContains(context, schema)
  const uniqueItems = schema.uniqueItems

  // Undefined means no value is required, while null represents a compilation error.
  let additionalItems: Schema<E> | false | null | undefined

  if (Array.isArray(items)) {
    additionalItems = compileAdditionalItems(context, schema)
  } else if (schema.additionalItems) {
    // Additional items are ignored when items is not an array.
    // See https://datatracker.ietf.org/doc/html/draft-handrews-json-schema-validation-01#section-6.4.2.
    recordWarn(context, 'it is needless when items is not array', 'additionalItems')
  }
  if (!items || !contains || additionalItems === null) {
    return null
  }
  let isNever = false
  let updateMaxItems = false

  if (Array.isArray(items)) {
    if (maxItems !== undefined && maxItems <= items.length) {
      items = items.splice(maxItems)
      additionalItems = variableToNever(additionalItems, context.delegate)
    }
    const firstNeverItemIndex = items.findIndex((item) => getKind(item) === CompiledKind.Never)

    if (firstNeverItemIndex !== -1) {
      items = items.splice(firstNeverItemIndex)
      additionalItems = variableToNever(additionalItems, context.delegate)
      if (maxItems === undefined) {
        maxItems = items.length
        updateMaxItems = true
      }
    }
    if (minItems !== undefined && items.length < minItems) {
      recordWarn(context, `length(${items.length}) of items if less than minItems(${minItems})`)
      isNever = true
    }
    if (items.length === 0 && additionalItems && getKind(additionalItems) === CompiledKind.Never) {
      isNever = true
    }
  } else if (getKind(items) === CompiledKind.Never) {
    isNever = true
  }
  if (maxItems !== undefined && minItems !== undefined && maxItems < minItems) {
    if (!updateMaxItems) {
      recordWarn(context, `maxItems(${maxItems}) is less than minItems(${minItems})`)
    }
    isNever = true
  }
  const kind = isNever ? CompiledKind.Never : CompiledKind.Array
  const mergedSchema = cleanEmptyValues({
    type: 'array',
    items,
    contains,
    uniqueItems,
    maxItems,
    minItems,
    additionalItems: additionalItems!,
  })
  return wrapCompiledSchema(kind, mergedSchema as JSONSchema7, context.delegate, context.path)
}

function compileItems<E>(context: Context<E>, { items }: InputSchema): Schema<E> | Schema<E>[] | null {
  if (!items) {
    return wrapCompiledSchema(CompiledKind.Any, {}, context.delegate, context.path)
  }
  if (Array.isArray(items)) {
    const schemas: Schema<E>[] = []
    let hasAnyError = false
    for (const [i, item] of items.entries()) {
      const subContext = joinPath(context, 'items', i)
      const schema = compileSchema(subContext, unwrapJSONSchema7Definition(item))
      if (!schema) {
        hasAnyError = true
        continue
      }
      schemas.push(schema)
    }
    if (hasAnyError) {
      return null
    }
    return schemas
  } else {
    const subContext = joinPath(context, 'items')
    const itemsSchema = unwrapJSONSchema7Definition(items as JSONSchema7Definition)
    const schema = compileSchema(subContext, itemsSchema)

    return schema
  }
}

function getItemsLimit<E>(context: Context<E>, name: 'maxItems' | 'minItems', schema: InputSchema): number | undefined {
  const propertiesLimit = schema[name]
  if (propertiesLimit === undefined) {
    return undefined
  }
  if (Number.isNaN(propertiesLimit)) {
    recordWarn(context, 'find NaN', name)
    return undefined
  }
  if (propertiesLimit < 0) {
    recordWarn(context, `find invalid number ${propertiesLimit}`, name)
    return undefined
  }
  return propertiesLimit
}

function compileContains<E>(context: Context<E>, { contains }: InputSchema): Schema<E> | null {
  if (!contains) {
    return wrapCompiledSchema(CompiledKind.Any, {}, context.delegate, context.path)
  }
  const subContext = joinPath(context, 'contains')
  const containsSchema = unwrapJSONSchema7Definition(contains)

  return compileSchema(subContext, containsSchema)
}

function compileAdditionalItems<E>(context: Context<E>, { additionalItems }: InputSchema): Schema<E> | false | null {
  switch (typeof additionalItems) {
    case 'boolean': {
      if (additionalItems) {
        return wrapCompiledSchema(CompiledKind.Any, {}, context.delegate, context.path)
      } else {
        return false
      }
    }
    case 'object': {
      const subContext = joinPath(context, 'additionalItems')
      const compiledSchema = compileSchema(subContext, additionalItems)
      return compiledSchema
    }
    default: {
      return wrapCompiledSchema(CompiledKind.Any, {}, context.delegate, context.path)
    }
  }
}

function variableToNever<T, E>(schema: Schema<E> | T | undefined, delegate?: JSONDelegate<E>): Schema<E> | T {
  if (schema === undefined) {
    return wrapCompiledSchema(CompiledKind.Never, { type: 'string', maxLength: 0, minLength: 1 }, delegate)
  } else if (isCompiledSchema(schema)) {
    return getKind(schema) === CompiledKind.Never ? schema : toNever(schema as CompiledSchema<E>)
  } else {
    return schema
  }
}
