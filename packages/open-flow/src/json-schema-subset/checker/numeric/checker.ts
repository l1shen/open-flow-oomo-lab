import type { CompiledSchema } from '../../compiler/index.ts'
import type { ExpressionResult } from '../../expression/index.ts'

import { swap, ExpressionAny } from '../../expression/index.ts'
import { calculateFloat, calculateFloatAndInteger } from './float.ts'
import { calculateInteger } from './integer.ts'

export function calculateNumeric<E>(schema1: CompiledSchema<E>, schema2: CompiledSchema<E>): ExpressionResult {
  if (isUndefinedNumber(schema1) || isUndefinedNumber(schema2)) {
    return ExpressionAny
  }
  const isFloat1 = isFloat(schema1)
  const isFloat2 = isFloat(schema2)

  if (isFloat1 && isFloat2) {
    return calculateFloat(schema1, schema2)
  } else if (isFloat1) {
    return calculateFloatAndInteger(schema1, schema2)
  } else if (isFloat2) {
    return swap(calculateFloatAndInteger(schema2, schema1))
  } else {
    return calculateInteger(schema1, schema2)
  }
}

function isUndefinedNumber<E>(schema: CompiledSchema<E>): boolean {
  const { multipleOf } = schema
  if (multipleOf === undefined) {
    return false
  }
  if (!Number.isInteger(multipleOf)) {
    return true
  }
  if (multipleOf < 0) {
    return true
  }
  return false
}

function isFloat<E>(schema: CompiledSchema<E>): boolean {
  const { multipleOf } = schema

  if (multipleOf !== undefined && Number.isInteger(multipleOf)) {
    return false
  }
  if (schema.type === 'integer') {
    return false
  }
  return true
}
