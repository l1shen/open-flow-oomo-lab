import type { JSONSchema7 } from 'json-schema'
import type { Schema } from '../types.ts'
import type { Context } from './common.ts'
import type { InputSchema } from './compiler.ts'
import type { CompiledSchema } from './wrapper.ts'

import { ValidResult, valid } from '../checker/validator.ts'
import { recordWarn, isJSONSchemaKey, joinPath, unwrapJSONSchema7Definition } from './common.ts'
import { compileSchema } from './compiler.ts'
import { cleanEmptyValues } from './utils.ts'
import { NEVER, wrapCompiledSchema, toNever, CompiledKind, getKind } from './wrapper.ts'

type ObjectKeys =
  | 'type'
  | 'maxProperties'
  | 'minProperties'
  | 'required'
  | 'properties'
  | 'patternProperties'
  | 'additionalProperties'
  | 'dependencies'
  | 'propertyNames'

const OBJECT_KEYS = new Set<ObjectKeys>([
  'type',
  'maxProperties',
  'minProperties',
  'required',
  'properties',
  'patternProperties',
  'additionalProperties',
  'dependencies',
  'propertyNames',
])

type PatternProperties<E> = {
  [key: string]: [Schema<E>, RegExp]
}

type CompiledSchemaMap<E> = {
  [key: string]: Schema<E>
}

// This internal shape simplifies dependency handling without exposing unsupported schema keywords.
type DependentRequired = {
  [key: string]: string[]
}

type DependentTuple<E> = [DependentRequired, CompiledSchemaMap<E>]
type BanChecker = (key: string) => boolean

export function compileObjectSchema<E>(context: Context<E>, schema: InputSchema): CompiledSchema<E> | null {
  const rejectKeys = Object.keys(schema).filter((k) => !OBJECT_KEYS.has(k as ObjectKeys) && isJSONSchemaKey(k))
  if (rejectKeys.length > 0) {
    recordWarn(context, `type="object" will exclude other keys: ${rejectKeys.toSorted().join(', ')}`)
  }
  const maxProperties = getPropertiesLimit(context, 'maxProperties', schema)
  const minProperties = getPropertiesLimit(context, 'minProperties', schema)
  const additionalPropertiesSchema = compileAdditionalProperties(context, schema)
  const patternProperties = compilePatternProperties(context, schema)
  const propertyNames = compilePropertyNames(context, schema)
  const dependentTuple = compileDependencies(context, schema)

  if (!additionalPropertiesSchema || !patternProperties || !propertyNames || !dependentTuple) {
    return null
  }
  const properties = compileProperties(context, patternProperties, propertyNames, schema)

  if (!properties) {
    return null
  }
  const isBanKey = createBanKeyChecker(additionalPropertiesSchema, patternProperties, propertyNames, properties)
  const required = compileRequired(context, isBanKey, dependentTuple, schema)
  const kind = checkSchemaIsNever(context, additionalPropertiesSchema, properties, required, maxProperties, minProperties)
    ? CompiledKind.Never
    : CompiledKind.Object

  const mergedSchema = cleanEmptyValues({
    type: 'object',
    required,
    properties,
    minProperties,
    maxProperties,
    additionalProperties: additionalPropertiesSchema,
    patternProperties: unwrapPatternProperties(patternProperties),
    dependencies: mergeDependentTuple(dependentTuple, schema),
    propertyNames: propertyNames,
  })
  return wrapCompiledSchema(kind, mergedSchema as JSONSchema7, context.delegate, context.path)
}

function getPropertiesLimit<E>(context: Context<E>, name: 'maxProperties' | 'minProperties', schema: InputSchema): number | undefined {
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

function compileAdditionalProperties<E>(context: Context<E>, { additionalProperties }: InputSchema): Schema<E> | null {
  if (additionalProperties === false) {
    return wrapCompiledSchema(CompiledKind.Never, { type: 'string', maxLength: 0, minLength: 1 }, context.delegate, context.path)
  }
  if (typeof additionalProperties !== 'object') {
    return wrapCompiledSchema(CompiledKind.Any, {}, context.delegate, context.path)
  }
  const subContext = joinPath(context, 'additionalProperties')
  const schema = unwrapJSONSchema7Definition(additionalProperties)

  return compileSchema(subContext, schema)
}

function compilePatternProperties<E>(context: Context<E>, { patternProperties }: InputSchema): PatternProperties<E> | null {
  let foundSubError = false
  const target: PatternProperties<E> = {}

  for (const key in patternProperties) {
    const regExp = wrapRegExp(key)
    if (regExp instanceof Error) {
      recordWarn(context, `property name invalid. ${key}`, 'patternProperties', key)
      continue
    }
    const schema = unwrapJSONSchema7Definition(patternProperties[key])
    const subContext = joinPath(context, 'patternProperties', key)
    const compiledSchema = compileSchema(subContext, schema)
    if (!compiledSchema) {
      foundSubError = true
      continue
    }
    target[key] = [compiledSchema, regExp]
  }
  if (foundSubError) {
    return null
  }
  return target
}

function compilePropertyNames<E>(context: Context<E>, { propertyNames }: InputSchema): CompiledSchema<E> | null {
  if (!propertyNames) {
    return wrapCompiledSchema(CompiledKind.Any, {}, context.delegate, context.path)
  }
  propertyNames = unwrapJSONSchema7Definition(propertyNames)

  const subContext = joinPath(context, 'propertyNames')
  const schema = compileSchema(subContext, propertyNames)

  if (!schema) {
    return null
  }
  const kind = getKind(schema)
  if (kind !== CompiledKind.String && kind !== CompiledKind.Any) {
    // JSON property names can only be strings, so other types cannot match any property.
    return toNever(schema as CompiledSchema<E>)
  }
  return schema as CompiledSchema<E>
}

function compileProperties<E>(
  context: Context<E>,
  patternProperties: PatternProperties<E>,
  propertyNamesSchema: CompiledSchema<E>,
  { properties }: InputSchema,
): CompiledSchemaMap<E> | null {
  let foundSubError = false
  if (!properties) {
    return {}
  }
  const target: CompiledSchemaMap<E> = {}

  for (const key in properties) {
    if (valid(propertyNamesSchema, key) === ValidResult.Invalid) {
      recordWarn(context, `key ${JSON.stringify(key)} cannot pass JSON schema from propertyNames`, 'properties')
      continue
    }
    const patternSchema = findPatternSchema(patternProperties, key)

    if (patternSchema && getKind(patternSchema) === CompiledKind.Never) {
      recordWarn(context, `key ${JSON.stringify(key)} matches a pattern that has a impossible(never) schema`, 'properties')
      continue
    }
    const schema = unwrapJSONSchema7Definition(properties[key])
    const subContext = joinPath(context, 'properties', key)
    const compiledSchema = compileSchema(subContext, schema)

    if (!compiledSchema) {
      foundSubError = true
      continue
    }
    target[key] = compiledSchema
  }
  if (foundSubError) {
    return null
  }
  return target
}

function compileDependencies<E>(context: Context<E>, { dependencies }: InputSchema): DependentTuple<E> | null {
  if (!dependencies) {
    return [{}, {}]
  }
  const dependentRequired: DependentRequired = {}
  const dependentSchemas: CompiledSchemaMap<E> = {}

  for (const key in dependencies) {
    const dependency = unwrapJSONSchema7Definition(dependencies[key])

    if (Array.isArray(dependency)) {
      const { keys, duplicated } = checkUniqueKeys(dependency)
      if (duplicated) {
        recordWarn(context, `found duplicated property names: ${duplicated.join(', ')}`, 'dependencies', key)
      }
      dependentRequired[key] = keys
    } else {
      const subContext = joinPath(context, 'dependencies', key)
      const compiledSchema = compileSchema(subContext, dependency as InputSchema)
      if (compiledSchema) {
        const kind = getKind(compiledSchema)
        if (kind === CompiledKind.Object || kind === CompiledKind.Any) {
          dependentSchemas[key] = compiledSchema
        } else if (kind === CompiledKind.Extends) {
          dependentSchemas[key] = NEVER
        } else {
          dependentSchemas[key] = toNever(compiledSchema as CompiledSchema<E>)
        }
      }
    }
  }
  return [dependentRequired, dependentSchemas]
}

function createBanKeyChecker<E>(
  additionalPropertiesSchema: Schema<E>,
  patternProperties: PatternProperties<E>,
  propertyNamesSchema: CompiledSchema<E>,
  properties: CompiledSchemaMap<E>,
): BanChecker {
  return (key: string): boolean => {
    if (valid(propertyNamesSchema, key) === ValidResult.Invalid) {
      return true
    }
    const patternSchema = findPatternSchema(patternProperties, key)
    if (patternSchema && getKind(patternSchema) === CompiledKind.Never) {
      return true
    }
    const propertySchema = properties[key] ?? additionalPropertiesSchema
    if (getKind(propertySchema) === CompiledKind.Never) {
      return true
    }
    return false
  }
}

function compileRequired<E>(context: Context<E>, isBan: BanChecker, dependentTuple: DependentTuple<E>, { required }: InputSchema): string[] {
  if (!required) {
    return []
  }
  const uniqueCheckedResult = checkUniqueKeys(required)
  if (uniqueCheckedResult.duplicated) {
    recordWarn(context, `found duplicated required keys: ${uniqueCheckedResult.duplicated.join(', ')}`, 'required')
  }
  const requiredKeys: string[] = []
  const banKeys: string[] = []

  for (const requiredKey of uniqueCheckedResult.keys) {
    const dependentKeys = collectDependencies(dependentTuple, requiredKey)
    if (dependentKeys.some((key) => isBan(key))) {
      banKeys.push(requiredKey)
    } else {
      requiredKeys.push(requiredKey)
    }
  }
  if (banKeys.length > 0) {
    recordWarn(context, `key ${banKeys.map((k) => JSON.stringify(k)).join(', ')} will ban by another condition`, 'required')
  }
  return requiredKeys
}

function checkSchemaIsNever<E>(
  context: Context<E>,
  additionalPropertiesSchema: Schema<E>,
  properties: CompiledSchemaMap<E>,
  required: string[],
  maxProperties?: number,
  minProperties?: number,
): boolean {
  if (maxProperties !== undefined && minProperties !== undefined && maxProperties < minProperties) {
    recordWarn(context, `maxProperties(${maxProperties}) is less than minProperties(${minProperties})`)
    return true
  }
  if (maxProperties !== undefined && required.length > maxProperties) {
    recordWarn(context, `length(${required.length}) of required is greater than maxProperties(${maxProperties})`)
    return true
  }
  if (minProperties !== undefined && required.length < minProperties) {
    recordWarn(context, `length(${required.length}) of required is less than minProperties(${minProperties})`)
    return true
  }
  if (getKind(additionalPropertiesSchema) !== CompiledKind.Never) {
    return false
  }
  for (const key in properties) {
    const compiledSchema = properties[key]
    if (getKind(compiledSchema) !== CompiledKind.Never) {
      return false
    }
  }
  return true
}

function collectDependencies<E>([dependentRequired, dependentSchemas]: DependentTuple<E>, seedKey: string): string[] {
  const queue: string[] = [seedKey]
  const collection = new Set<string>(queue)

  while (queue.length > 0) {
    const key = queue.pop()!
    const schema = dependentSchemas[key]
    const requiredKeys = dependentRequired[key]

    if (schema) {
      if (getKind(schema) === CompiledKind.Object) {
        collectKeys((schema as CompiledSchema<E>).required)
      }
    }
    if (requiredKeys) {
      collectKeys(requiredKeys)
    }
  }
  function collectKeys(keys: string[] | undefined): void {
    if (keys) {
      for (const key of keys) {
        if (!collection.has(key)) {
          collection.add(key)
          queue.push(key)
        }
      }
    }
  }
  return [...collection]
}

function checkUniqueKeys(keys: readonly string[]): { keys: string[]; duplicated: string[] | null } {
  const checking = new Set<string>()
  const duplicated = new Set<string>()

  for (const e of keys) {
    if (checking.has(e)) {
      duplicated.add(e)
    } else {
      checking.add(e)
    }
  }
  if (duplicated.size === 0) {
    return {
      keys: [...keys],
      duplicated: null,
    }
  } else {
    return {
      keys: [...checking],
      duplicated: [...duplicated],
    }
  }
}

function findPatternSchema<E>(patternProperties: PatternProperties<E>, checkedKey: string): Schema<E> | null {
  for (const key in patternProperties) {
    const [schema, regExp] = patternProperties[key]
    if (regExp.test(checkedKey)) {
      return schema
    }
  }
  return null
}

function wrapRegExp(pattern: string): RegExp | Error {
  try {
    return new RegExp(pattern, 'i')
  } catch (error) {
    if (error instanceof SyntaxError) {
      return error
    } else {
      throw error
    }
  }
}

function unwrapPatternProperties<E>(patternProperties: PatternProperties<E>): JSONSchema7['patternProperties'] {
  const target: JSONSchema7['patternProperties'] = {}
  for (const key in patternProperties) {
    target[key] = patternProperties[key][0] as JSONSchema7
  }
  return target
}

function mergeDependentTuple<E>([dependentRequired, dependentSchemas]: DependentTuple<E>, { dependencies }: InputSchema): JSONSchema7['dependencies'] {
  const target: JSONSchema7['dependencies'] = {}
  for (const key in dependencies) {
    const required = dependentRequired[key]
    const schema = dependentSchemas[key]
    target[key] = required || schema
  }
  return target
}
