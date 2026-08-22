import type { JSONSchema7Definition } from 'json-schema'
import type { Schema } from '../types.ts'
import type { JSONDelegate } from '../types.ts'
import type { DeepReadonly } from '../utils.ts'
import type { Context } from './common.ts'
import type { CompiledSchema } from './wrapper.ts'

import { joinPath, unwrapJSONSchema7Definition, recordError } from './common.ts'
import { compileSchema } from './compiler.ts'
import { getKind, CompiledKind, wrapCompiledSchema } from './wrapper.ts'

export type CombinationKeys = 'allOf' | 'anyOf' | 'oneOf'
export const COMBINATION_KEYS: readonly CombinationKeys[] = Object.freeze(['allOf', 'anyOf', 'oneOf'])

export function compileCombinationSchema<E>(
  context: Context<E>,
  key: CombinationKeys,
  combinationList: DeepReadonly<JSONSchema7Definition[]>,
  delegate?: JSONDelegate<E>,
): CompiledSchema<E> | null {
  if (combinationList.length === 0) {
    recordError(context, 'disable empty list', key)
    return null
  }
  const compiledCombinationList: Schema<E>[] = []

  for (const [i, element] of combinationList.entries()) {
    const subContext = joinPath(context, key, i)
    const schema = unwrapJSONSchema7Definition(element)
    const compiledSchema = compileSchema(subContext, schema)
    if (compiledSchema) {
      compiledCombinationList.push(compiledSchema)
    }
  }
  if (compiledCombinationList.length < combinationList.length) {
    return null
  }
  let anyCount = 0
  let neverCount = 0

  for (const compiledSchema of compiledCombinationList) {
    switch (getKind(compiledSchema)) {
      case CompiledKind.Any: {
        anyCount += 1
        break
      }
      case CompiledKind.Never: {
        neverCount += 1
        break
      }
    }
  }
  let kind: CompiledKind = CompiledKind.Combination

  switch (key) {
    case 'allOf': {
      if (neverCount > 0) {
        kind = CompiledKind.Never
      } else if (anyCount === compiledCombinationList.length) {
        kind = CompiledKind.Any
      } else if (!areAllTypesTheSame(compiledCombinationList)) {
        kind = CompiledKind.Never
      }
      break
    }
    case 'anyOf': {
      if (anyCount > 0) {
        kind = CompiledKind.Any
      } else if (neverCount === compiledCombinationList.length) {
        kind = CompiledKind.Never
      }
      break
    }
    case 'oneOf': {
      if (anyCount > 1) {
        // More than one unconstrained branch violates oneOf because at least two branches will match.
        kind = CompiledKind.Never
      } else if (neverCount === compiledCombinationList.length) {
        kind = CompiledKind.Never
      } else if (anyCount === 1 && neverCount === compiledCombinationList.length - 1) {
        kind = CompiledKind.Any
      }
      break
    }
  }
  return wrapCompiledSchema(kind, { [key]: compiledCombinationList }, delegate, context.path)
}

function areAllTypesTheSame<E>(combinationList: Schema<E>[]): boolean {
  let lastKind: CompiledKind | null = null
  for (const schema of combinationList) {
    const kind = getKind(schema)
    switch (kind) {
      case CompiledKind.Any:
      case CompiledKind.Never: {
        break
      }
      default: {
        if (lastKind === null) {
          lastKind = kind
        } else if (lastKind !== kind) {
          return false
        }
        break
      }
    }
  }
  return true
}
