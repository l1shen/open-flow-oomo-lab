export type { ExpressionResult } from './result.ts'
export type { Calculator, Describer, Equaler, ExpressionDelegate, ExpressionDescription } from './types.ts'

export { expression } from './expression.ts'
export { ExpressionKind } from './types.ts'
export { swap } from './calculator.ts'
export {
  toString,
  hasEquals,
  hasContaining,
  hasContainedBy,
  hasIntersection,
  hasRejection,
  toExpression,
  toSingleExpression,
  ExpressionNone,
  ExpressionAny,
  ExpressionEquals,
  ExpressionContaining,
  ExpressionContainedBy,
  ExpressionIntersection,
  ExpressionRejection,
  ExpressionMaskList,
  ExpressionSingleResult,
} from './result.ts'
