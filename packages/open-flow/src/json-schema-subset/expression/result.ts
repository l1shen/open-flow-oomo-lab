import type { DeepReadonly } from '../utils.ts'

import { deepFreeze } from '../utils.ts'

export type ExpressionResult = number

export const ExpressionSingleResult = Object.freeze({
  Equals: 0,
  Containing: 1,
  ContainedBy: 2,
  Rejection: 3,
  Intersection: 4,
})

export type ExpressionSingleResult = (typeof ExpressionSingleResult)[keyof typeof ExpressionSingleResult]

export const ExpressionEquals = toExpression(ExpressionSingleResult.Equals)
export const ExpressionContaining = toExpression(ExpressionSingleResult.Containing)
export const ExpressionContainedBy = toExpression(ExpressionSingleResult.ContainedBy)
export const ExpressionRejection = toExpression(ExpressionSingleResult.Rejection)
export const ExpressionIntersection = toExpression(ExpressionSingleResult.Intersection)

export const ExpressionMaskList: DeepReadonly<[ExpressionSingleResult, ExpressionResult][]> = deepFreeze([
  [ExpressionSingleResult.Equals, ExpressionEquals],
  [ExpressionSingleResult.Containing, ExpressionContaining],
  [ExpressionSingleResult.ContainedBy, ExpressionContainedBy],
  [ExpressionSingleResult.Rejection, ExpressionRejection],
  [ExpressionSingleResult.Intersection, ExpressionIntersection],
])

export const ExpressionNone = 0
export const ExpressionAny = ((): ExpressionResult => {
  let expression = ExpressionNone
  for (const [_, mask] of ExpressionMaskList) {
    expression |= mask
  }
  return expression
})()

export function toString(expression: ExpressionResult): string {
  const strList: string[] = [
    hasEquals(expression) ? 'E' : '_',
    hasContaining(expression) ? 'C' : '_',
    hasContainedBy(expression) ? 'B' : '_',
    hasRejection(expression) ? 'R' : '_',
    hasIntersection(expression) ? 'I' : '_',
  ]
  return strList.join('')
}

export function hasEquals(expression: ExpressionResult): boolean {
  return !!(expression & ExpressionEquals)
}

export function hasContaining(expression: ExpressionResult): boolean {
  return !!(expression & ExpressionContaining)
}

export function hasContainedBy(expression: ExpressionResult): boolean {
  return !!(expression & ExpressionContainedBy)
}

export function hasRejection(expression: ExpressionResult): boolean {
  return !!(expression & ExpressionRejection)
}

export function hasIntersection(expression: ExpressionResult): boolean {
  return !!(expression & ExpressionIntersection)
}

export function toExpression(expression: ExpressionSingleResult): ExpressionResult {
  return 1 << expression
}

export function toSingleExpression(expression: ExpressionResult): ExpressionSingleResult | -1 {
  let result: ExpressionSingleResult | -1 = -1
  for (const [singleResult, mask] of ExpressionMaskList) {
    if (mask & expression) {
      if (result !== -1) {
        // A second single result means that the expression is not singular.
        result = -1
        break
      }
      result = singleResult
    }
  }
  return result
}
