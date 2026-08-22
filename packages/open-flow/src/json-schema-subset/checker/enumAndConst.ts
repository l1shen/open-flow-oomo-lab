import type { CompiledSchema, CompiledValue } from '../compiler/index.ts'
import type { ExpressionResult } from '../expression/index.ts'
import type { Context } from './cache.ts'

import { getKind, CompiledKind } from '../compiler/index.ts'
import {
  ExpressionAny,
  ExpressionEquals,
  ExpressionContaining,
  ExpressionContainedBy,
  ExpressionIntersection,
  ExpressionRejection,
} from '../expression/index.ts'
import { valid, ValidResult } from './validator.ts'

export function calculateEnumAndEnum<E>(context: Context<E>, schema1: CompiledSchema<E>, schema2: CompiledSchema<E>): ExpressionResult {
  const enumList1 = normalizeEnumList(schema1)
  const enumList2 = normalizeEnumList(schema2)

  let foundExtra1 = false
  let foundExtra2 = false
  let foundIntersection = false

  for (const enum1 of enumList1) {
    if (hasEqualsEnum(context, enumList2, enum1)) {
      foundIntersection = true
    } else {
      foundExtra1 = true
    }
    if (foundExtra1 && foundIntersection) {
      break
    }
  }
  for (const enum2 of enumList2) {
    if (hasEqualsEnum(context, enumList1, enum2)) {
      foundIntersection = true
    } else {
      foundExtra2 = true
    }
    if (foundExtra2 && foundIntersection) {
      break
    }
  }
  if (!foundIntersection) {
    return ExpressionRejection
  }
  if (foundExtra1 && foundExtra2) {
    return ExpressionIntersection
  }
  if (foundExtra1) {
    return ExpressionContaining
  }
  if (foundExtra2) {
    return ExpressionContainedBy
  }
  return ExpressionEquals
}

export function calculateEnumAndSchema<E>(enumSchema: CompiledSchema<E>, schema: CompiledSchema<E>): ExpressionResult {
  let hasValid = false
  let hasInvalid = false

  for (const enumValue of normalizeEnumList(enumSchema)) {
    switch (valid(schema, enumValue)) {
      case ValidResult.Valid: {
        hasValid = true
        break
      }
      case ValidResult.Invalid: {
        hasInvalid = true
        break
      }
      case ValidResult.Unknown: {
        return ExpressionAny
      }
    }
    if (hasValid && hasInvalid) {
      break
    }
  }
  if (hasValid && hasInvalid) {
    return ExpressionIntersection
  }
  if (hasValid) {
    return ExpressionEquals | ExpressionContainedBy
  }
  if (hasInvalid) {
    return ExpressionRejection
  }
  if (getKind(schema) === CompiledKind.Never) {
    return ExpressionEquals
  }
  return ExpressionContainedBy
}

function normalizeEnumList<E>({ const: constValue, enum: enumList }: CompiledSchema<E>): CompiledValue[] {
  if (constValue !== undefined) {
    return [constValue as CompiledValue]
  }
  if (enumList) {
    return enumList as CompiledValue[]
  }
  throw new Error('invalid branch')
}

function hasEqualsEnum<E>({ isEquals }: Context<E>, enumList: CompiledValue[], checkedEnum: CompiledValue): boolean {
  for (const searchedEnum of enumList) {
    if (isEquals(searchedEnum, checkedEnum)) {
      return true
    }
  }
  return false
}
