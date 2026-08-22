import type { CompiledSchema } from '../../compiler/index.ts'
import type { Range } from '../tools/index.ts'

import { pickRange } from './float.ts'

export type Integer = {
  readonly multipleOf: number
  readonly range: Range
}

export function normalizeInteger<E>(schema: CompiledSchema<E>): Integer | null {
  const floatRange = pickRange(schema)
  const multipleOf = schema.multipleOf ?? 1
  const range = cutRange(floatRange, multipleOf)

  if (!range) {
    return null
  }
  return { multipleOf, range }
}

export function isPointRange([point1, point2]: Range): boolean {
  if (point1.num !== point2.num) {
    return false
  }
  if (point1.exclusive) {
    return false
  }
  if (point2.exclusive) {
    return false
  }
  return true
}

export function cutRange(range: Range | undefined, multipleOf: number): Range | undefined {
  if (!range) {
    return undefined
  }
  const [originMin, originMax] = range
  let min = nextInteger(originMin.num, multipleOf)
  let max = previousInteger(originMax.num, multipleOf)

  if (min === originMin.num && originMin.exclusive) {
    min += multipleOf
  }
  if (max === originMax.num && originMax.exclusive) {
    max -= multipleOf
  }
  if (min > max) {
    return undefined
  }
  if (min === max) {
    if (min === Number.POSITIVE_INFINITY) {
      return undefined
    }
    if (min === Number.NEGATIVE_INFINITY) {
      return undefined
    }
  }
  return [
    { num: min, exclusive: false },
    { num: max, exclusive: false },
  ]
}

function nextInteger(float: number, multipleOf: number): number {
  return Math.ceil(float / multipleOf) * multipleOf
}

function previousInteger(float: number, multipleOf: number): number {
  return Math.floor(float / multipleOf) * multipleOf
}
