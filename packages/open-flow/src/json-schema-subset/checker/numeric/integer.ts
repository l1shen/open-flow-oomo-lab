import type { CompiledSchema } from '../../compiler/index.ts'
import type { ExpressionResult } from '../../expression/index.ts'
import type { Range } from '../tools/index.ts'
import type { Integer } from './integerNormalizer.ts'

import { ExpressionEquals, ExpressionContaining, ExpressionContainedBy, ExpressionIntersection, ExpressionRejection } from '../../expression/index.ts'
import { splitRange } from '../tools/index.ts'
import { cutRange, normalizeInteger } from './integerNormalizer.ts'

export function calculateInteger<E>(schema1: CompiledSchema<E>, schema2: CompiledSchema<E>): ExpressionResult {
  const integer1 = normalizeInteger(schema1)
  const integer2 = normalizeInteger(schema2)

  if (!integer1 && !integer2) {
    return ExpressionEquals
  }
  if (!integer1) {
    return ExpressionContainedBy
  }
  if (!integer2) {
    return ExpressionContaining
  }
  const { range: range1, multipleOf: multipleOf1 } = integer1
  const { range: range2, multipleOf: multipleOf2 } = integer2
  const result = splitRange(range1, range2)

  let centerRange: Range | undefined
  let lcm = 0

  if (result.center) {
    lcm = getLCM(multipleOf1, multipleOf2)
    centerRange = cutRange(result.center, lcm)
  }
  if (!centerRange) {
    return ExpressionRejection
  }
  let extraLeft = false
  let extraRight = false

  const { left, right } = result

  if (left && cutRange(left.range, left.fromLeft ? multipleOf1 : multipleOf2)) {
    if (left.fromLeft) {
      extraLeft = true
    } else {
      extraRight = true
    }
  }
  if (right && cutRange(right.range, right.fromLeft ? multipleOf1 : multipleOf2)) {
    if (right.fromLeft) {
      extraLeft = true
    } else {
      extraRight = true
    }
  }
  extraLeft = extraLeft || hasExtraIntegersOnCenter(integer1, centerRange, lcm)
  extraRight = extraRight || hasExtraIntegersOnCenter(integer2, centerRange, lcm)

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

function hasExtraIntegersOnCenter({ range, multipleOf }: Integer, lcmCenterRange: Range, lcm: number): boolean {
  const result = splitRange(range, lcmCenterRange)

  if (cutRange(result.left?.range, multipleOf)) {
    return true
  }
  if (cutRange(result.right?.range, multipleOf)) {
    return true
  }
  const center = cutRange(result.center, multipleOf)

  if (!center) {
    return false
  }
  const lcmCenterLength = rangeLength(lcmCenterRange)

  if (rangeLength(center) > lcmCenterLength) {
    return true
  }
  if (lcmCenterLength === 1) {
    return false
  }
  if (multipleOf < lcm) {
    return true
  }
  return false
}

/** Returns the least common multiple. */
function getLCM(a: number, b: number): number {
  return (a * b) / getGCD(a, b)
}

/** @returns The greatest common divisor. */
function getGCD(a: number, b: number): number {
  if (a === 0) {
    return b
  }
  return getGCD(b % a, a)
}

function rangeLength(range?: Range): number {
  if (!range) {
    return 0
  }
  const [point1, point2] = range
  // Both endpoints are inclusive, so the range length includes one extra value.
  return point2.num - point1.num + 1
}
