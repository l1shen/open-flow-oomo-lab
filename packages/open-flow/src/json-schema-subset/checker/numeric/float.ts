import type { CompiledSchema } from '../../compiler/index.ts'
import type { ExpressionResult } from '../../expression/index.ts'
import type { Point, Range, SplitterSide } from '../tools/index.ts'

import { ExpressionEquals, ExpressionContaining, ExpressionContainedBy, ExpressionIntersection, ExpressionRejection } from '../../expression/index.ts'
import { splitRange } from '../tools/index.ts'
import { isPointRange, cutRange, normalizeInteger } from './integerNormalizer.ts'

export function calculateFloat<E>(schema1: CompiledSchema<E>, schema2: CompiledSchema<E>): ExpressionResult {
  const range1 = pickRange(schema1)
  const range2 = pickRange(schema2)
  const { left, right, center } = splitRange(range1, range2)

  if (!center) {
    return ExpressionRejection
  }
  let extraLeft = false
  let extraRight = false

  if (left) {
    if (left.fromLeft) {
      extraLeft = true
    } else {
      extraRight = true
    }
  }
  if (right) {
    if (right.fromLeft) {
      extraLeft = true
    } else {
      extraRight = true
    }
  }
  if (extraLeft && extraRight) {
    return ExpressionIntersection
  }
  if (extraLeft) {
    return ExpressionContaining
  }
  if (extraRight) {
    return ExpressionContainedBy
  }
  return ExpressionEquals
}

export function calculateFloatAndInteger<E>(schema1: CompiledSchema<E>, schema2: CompiledSchema<E>): ExpressionResult {
  const floatRange = pickRange(schema1)
  const integer = normalizeInteger(schema2)

  if (!integer) {
    return ExpressionContaining
  }
  const result = splitRange(floatRange, integer.range)
  const intCenter = cutRange(result.center, integer.multipleOf)
  const leftIntRange = unwrapAndCutRange(result.left, integer.multipleOf)
  const rightIntRange = unwrapAndCutRange(result.right, integer.multipleOf)

  if (!result.center) {
    return ExpressionRejection
  }
  let extraFloat = false
  let extraInteger = false

  if (result.left?.fromLeft) {
    extraFloat = true
  }
  if (result.right?.fromLeft) {
    extraFloat = true
  }
  if (!intCenter || !isPointRange(result.center)) {
    extraFloat = true
  }
  if (leftIntRange) {
    extraInteger = true
  }
  if (rightIntRange) {
    extraInteger = true
  }
  if (extraFloat && extraInteger) {
    return ExpressionIntersection
  }
  if (extraFloat) {
    return ExpressionContaining
  }
  if (extraInteger) {
    return ExpressionContainedBy
  }
  return ExpressionEquals
}

export function pickRange<E>(schema: CompiledSchema<E>): Range {
  let point1: Point
  let point2: Point

  if (schema.exclusiveMinimum !== undefined) {
    point1 = { num: schema.exclusiveMinimum, exclusive: true }
  } else if (schema.minimum !== undefined) {
    point1 = { num: schema.minimum, exclusive: false }
  } else {
    point1 = { num: Number.NEGATIVE_INFINITY, exclusive: true }
  }
  if (schema.exclusiveMaximum !== undefined) {
    point2 = { num: schema.exclusiveMaximum, exclusive: true }
  } else if (schema.maximum !== undefined) {
    point2 = { num: schema.maximum, exclusive: false }
  } else {
    point2 = { num: Number.POSITIVE_INFINITY, exclusive: true }
  }
  return [point1, point2]
}

function unwrapAndCutRange(side: SplitterSide | undefined, multipleOf: number): Range | undefined {
  if (!side) {
    return undefined
  }
  if (side.fromLeft) {
    // left is always float in this file
    return undefined
  }
  return cutRange(side.range, multipleOf)
}
