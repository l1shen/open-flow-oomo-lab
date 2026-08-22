import { ExpressionSingleResult } from '../expression/index.ts'
import { splitRange } from './tools/index.ts'

export type RangeSplitter = (min1?: number, max1?: number, min2?: number, max2?: number) => RangeSplitResult
export type RangeSplitResult = {
  readonly left?: RangeItem & { readonly isFrom1: boolean }
  readonly right?: RangeItem & { readonly isFrom1: boolean }
  readonly intersection?: RangeItem
}

export type RangeItem = {
  readonly min: number
  readonly max: number
}

export const createRangeSplitter =
  (undefinedMin: number): RangeSplitter =>
  (min1 = undefinedMin, max1 = Number.POSITIVE_INFINITY, min2 = undefinedMin, max2 = Number.POSITIVE_INFINITY) => {
    const { left, center, right } = splitRange(
      [
        { num: min1, exclusive: false },
        { num: max1, exclusive: false },
      ],
      [
        { num: min2, exclusive: false },
        { num: max2, exclusive: false },
      ],
    )
    let leftItem: RangeSplitResult['left']
    let rightItem: RangeSplitResult['right']
    let intersectionItem: RangeSplitResult['intersection']

    if (left) {
      leftItem = {
        min: left.range[0].num,
        max: left.range[1].num,
        isFrom1: left.fromLeft,
      }
    }
    if (right) {
      rightItem = {
        min: right.range[0].num,
        max: right.range[1].num,
        isFrom1: right.fromLeft,
      }
    }
    if (center) {
      intersectionItem = {
        min: center[0].num,
        max: center[1].num,
      }
    }
    return {
      left: leftItem,
      right: rightItem,
      intersection: intersectionItem,
    }
  }

export function toExpressionSingleResult({ left, right, intersection }: RangeSplitResult): ExpressionSingleResult {
  if (!intersection) {
    return ExpressionSingleResult.Rejection
  }
  let extra1 = false
  let extra2 = false

  if (left) {
    if (left.isFrom1) {
      extra1 = true
    } else {
      extra2 = true
    }
  }
  if (right) {
    if (right.isFrom1) {
      extra1 = true
    } else {
      extra2 = true
    }
  }
  if (extra1 && extra2) {
    return ExpressionSingleResult.Intersection
  }
  if (extra1) {
    return ExpressionSingleResult.Containing
  }
  if (extra2) {
    return ExpressionSingleResult.ContainedBy
  }
  return ExpressionSingleResult.Equals
}
