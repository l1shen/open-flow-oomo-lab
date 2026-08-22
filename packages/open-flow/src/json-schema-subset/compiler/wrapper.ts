import type { JSONSchema7 } from 'json-schema'
import type { ExtendsSchema } from '../extends/index.ts'
import type { Schema } from '../types.ts'
import type { JSONDelegate } from '../types.ts'
import type { DeepReadonly } from '../utils.ts'

import { createId, deepFreeze } from '../utils.ts'

const symbolID = Symbol('compiledId')
const symbolKind = Symbol('compiledKind')
const symbolPath = Symbol('compiledPath')
const symbolValidatorLoader = Symbol('validatorLoader')

export type SchemaPath = readonly (string | number)[]

export const CompiledKind = Object.freeze({
  Extends: 0,
  Never: 1,
  Any: 2,
  Null: 3,
  String: 4,
  Numeric: 5,
  Boolean: 6,
  Object: 7,
  Array: 8,
  Not: 9,
  Combination: 10,
  EnumOrConst: 11,
})

export type CompiledKind = (typeof CompiledKind)[keyof typeof CompiledKind]

export type CompiledValue = null | number | string | boolean | CompiledObject
export type CompiledObject = (CompiledValue[] | { [key: string]: CompiledValue }) & {
  readonly [symbolID]: number
}

type ValidatorLoader<E> = () => (value: unknown) => boolean | readonly E[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ANY: DeepReadonly<CompiledSchema<any>> = deepFreeze(toCompiledSchema(CompiledKind.Any, createId(), {}, () => () => true))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const NEVER: DeepReadonly<CompiledSchema<any>> = deepFreeze(
  toCompiledSchema(CompiledKind.Never, createId(), { type: 'string', maxLength: 0, minLength: 1 }, () => () => false),
)

export interface CompiledSchema<E> extends JSONSchema7 {
  readonly [symbolKind]: CompiledKind
  readonly [symbolID]: number
  readonly [symbolPath]: SchemaPath
  readonly [symbolValidatorLoader]?: ValidatorLoader<E>
  readonly isValid?: (value: unknown) => boolean | readonly E[]
}

export function isCompiledObject(value: unknown): value is DeepReadonly<CompiledObject> {
  if (value === null || typeof value !== 'object') {
    return false
  }
  return symbolID in value
}

export function isCompiledSchema<E>(object: unknown): object is DeepReadonly<CompiledSchema<E>> {
  if (object === null || typeof object !== 'object') {
    return false
  }
  return symbolID in object && symbolKind in object
}

export function getKind<E>(schema: Schema<E>): CompiledKind {
  if (isCompiledSchema(schema)) {
    return schema[symbolKind]
  } else {
    return CompiledKind.Extends
  }
}

export function getId<E>(schema: ExtendsSchema | DeepReadonly<CompiledSchema<E>> | DeepReadonly<CompiledObject>): number {
  if (isCompiledSchema(schema) || isCompiledObject(schema)) {
    return schema[symbolID]
  } else {
    return (schema as ExtendsSchema).id
  }
}

export function getPath<E>(schema: Schema<E>): SchemaPath | undefined {
  return isCompiledSchema(schema) ? schema[symbolPath] : undefined
}

export function assertCompiledValue<V>(value: V): asserts value is V & CompiledValue {
  let failure = false
  switch (typeof value) {
    case 'number':
    case 'string':
    case 'boolean': {
      break
    }
    case 'object': {
      failure = !isCompiledObject(value)
      break
    }
    default: {
      failure = true
      break
    }
  }
  if (failure) {
    throw new Error('assert a CompiledValue but fail')
  }
}

export function wrapCompiledValue(value: unknown): CompiledValue {
  if (value === null || typeof value !== 'object') {
    return value as CompiledValue
  }
  Object.defineProperty(value, symbolID, {
    value: createId(),
    configurable: false,
    writable: false,
    enumerable: false,
  })
  return value as CompiledValue
}

export function wrapCompiledSchema<E>(kind: CompiledKind, schema: JSONSchema7, delegate?: JSONDelegate<E>, path: SchemaPath = []): CompiledSchema<E> {
  return toCompiledSchema(
    kind,
    createId(),
    schema,
    delegate &&
      (() => {
        return delegate.compile(schema)
      }),
    path,
  )
}

export function toNever<T extends CompiledSchema<E>, E>(schema: T): T {
  return toCompiledSchema(CompiledKind.Never, createId(), { ...schema }, schema[symbolValidatorLoader], schema[symbolPath]) as T
}

function toCompiledSchema<E>(
  kind: CompiledKind,
  id: number,
  schema: JSONSchema7,
  validatorLoader?: ValidatorLoader<E>,
  path: SchemaPath = [],
): CompiledSchema<E> {
  let validator: ReturnType<ValidatorLoader<E>> | null = null

  Object.defineProperties(schema, {
    [symbolKind]: {
      value: kind,
      configurable: false,
      writable: false,
      enumerable: false,
    },
    [symbolID]: {
      value: id,
      configurable: false,
      writable: false,
      enumerable: false,
    },
    [symbolPath]: {
      value: path,
      configurable: false,
      writable: false,
      enumerable: false,
    },
    [symbolValidatorLoader]: {
      value: validatorLoader,
      configurable: false,
      writable: false,
      enumerable: false,
    },
    isValid: {
      configurable: false,
      enumerable: false,
      get: (): ((value: unknown) => boolean | readonly E[]) | undefined => {
        if (validatorLoader) {
          if (!validator) {
            validator = validatorLoader()
          }
          return validator
        } else {
          return undefined
        }
      },
    },
  })
  return schema as CompiledSchema<E>
}
