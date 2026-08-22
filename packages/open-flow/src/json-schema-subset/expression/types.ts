import type { ExpressionResult } from './result.ts'

export type ExpressionDescription<E> =
  | {
      readonly kind: typeof ExpressionKind.Leaf
    }
  | {
      readonly kind: typeof ExpressionKind.Not
      readonly expression: E
    }
  | {
      readonly kind: typeof ExpressionKind.AllOf | typeof ExpressionKind.AnyOf | typeof ExpressionKind.OneOf
      readonly expressions: Iterable<E>
    }

export const ExpressionKind = Object.freeze({
  Leaf: 0,
  Not: 1,
  AllOf: 2,
  AnyOf: 3,
  OneOf: 4,
})

export type ExpressionKind = (typeof ExpressionKind)[keyof typeof ExpressionKind]

export type Calculator<E> = (e1: E, e2: E) => ExpressionResult
export type Equaler<E> = (e1: E, e2: E) => boolean
export type Describer<E> = (e: E) => ExpressionDescription<E>
export type CalculationObserver<E> = (e1: E, e2: E, result: ExpressionResult, swapped: boolean) => void

export type ExpressionDelegate<E> = {
  readonly describe: Describer<E>
  readonly equals: Equaler<E>
  readonly calculate: Calculator<E>
  readonly observeCalculation?: CalculationObserver<E> | undefined
}
