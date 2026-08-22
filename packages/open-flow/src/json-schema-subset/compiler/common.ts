import type { JSONSchema7, JSONSchema7Definition } from 'json-schema'
import type { SchemaErrorItem } from '../error.ts'
import type { ExtendsContext } from '../extends/index.ts'
import type { JSONDelegate } from '../types.ts'

import { SchemaErrorItemKind } from '../error.ts'

const jsonSchemaKeys: Set<string> = new Set([
  'type',
  'enum',
  'const',
  'multipleOf',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'items',
  'additionalItems',
  'maxItems',
  'minItems',
  'uniqueItems',
  'contains',
  'maxProperties',
  'minProperties',
  'required',
  'properties',
  'patternProperties',
  'additionalProperties',
  'dependencies',
  'propertyNames',
  'if',
  'then',
  'else',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'format',
  'contentMediaType',
  'contentEncoding',
  'definitions',
])

export function isJSONSchemaKey(key: string): key is keyof JSONSchema7 {
  return jsonSchemaKeys.has(key)
}

export function isLogicEmptyObject(object: object): boolean {
  for (const key in object) {
    if (isJSONSchemaKey(key)) {
      return false
    }
  }
  return true
}

export type Context<E> = {
  readonly delegate?: JSONDelegate<E>
  readonly payload?: unknown
  readonly extends: ExtendsContext
  readonly path: readonly (string | number)[]
  readonly errors: SchemaErrorItem<E>[]
  readonly warns: SchemaErrorItem<E>[]
}

export function joinPath<E>(context: Context<E>, ...extraPath: (string | number)[]): Context<E> {
  return {
    ...context,
    path: [...context.path, ...extraPath],
  }
}

export function unwrapJSONSchema7Definition<T>(schema: T): T extends JSONSchema7Definition ? JSONSchema7 : T {
  if (typeof schema === 'boolean') {
    // This compiler deliberately rejects boolean schemas even though JSONSchema7Definition includes them.
    throw new Error('JSONSchema7Definition cannot be boolean')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return schema as any
}

export function recordError<E>({ path, errors }: Context<E>, message: string, ...extraPath: (string | number)[]): void {
  errors.push(createSchemaError(path, extraPath, message))
}

export function recordWarn<E>({ path, warns }: Context<E>, message: string, ...extraPath: (string | number)[]): void {
  warns.push(createSchemaError(path, extraPath, message))
}

function createSchemaError<E>(path: readonly (string | number)[], extraPath: (string | number)[], message: string): SchemaErrorItem<E> {
  return {
    kind: SchemaErrorItemKind.Compiled,
    message,
    path: [...path, ...extraPath],
  }
}
