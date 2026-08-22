import type { ExpressionResult, ExpressionSingleResult } from './result.ts'

import { ExpressionAny, ExpressionMaskList, ExpressionNone } from './result.ts'

export type SingleCalculator = (e1: ExpressionSingleResult, e2: ExpressionSingleResult) => ExpressionResult
export interface Combination {
  readonly result: ExpressionResult
  readonly count: number
  push(expression: ExpressionResult): ExpressionResult
}

export function makeCombination(calculator: SingleCalculator): Combination {
  let expression: ExpressionResult = ExpressionNone
  let count = 0

  const quantum = {
    push: (newExpression: ExpressionResult): ExpressionResult => {
      if (count === 0) {
        expression = newExpression
      } else {
        expression = forEach(expression, newExpression, calculator)
      }
      count += 1
      return expression
    },
  }
  Object.defineProperties(quantum, {
    result: { get: () => expression },
    count: { get: () => count },
  })
  return quantum as Combination
}

function forEach(e1: ExpressionResult, e2: ExpressionResult, calculator: SingleCalculator): ExpressionResult {
  let expression: ExpressionResult = ExpressionNone
  for (const [singleResult1, mask1] of ExpressionMaskList) {
    if (mask1 & e1) {
      for (const [singleResult2, mask2] of ExpressionMaskList) {
        if (mask2 & e2) {
          expression |= calculator(singleResult1, singleResult2)
          if (expression === ExpressionAny) {
            return expression
          }
        }
      }
    }
  }
  return expression
}
