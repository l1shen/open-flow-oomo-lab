import type { ExpressionResult } from './result.ts'
import type { Calculator, ExpressionDelegate, ExpressionDescription } from './types.ts'

import { calculate, swap, CalculatorOperator } from './calculator.ts'
import { ExpressionContainedBy, ExpressionEquals, ExpressionNone } from './result.ts'
import { ExpressionKind } from './types.ts'

type Parent<E extends object> = {
  readonly node: Node<E>
  readonly index: number
}

type Node<E extends object> = {
  readonly parent: Parent<E> | null
  readonly swapped: boolean
  expressions: [E, E] | null
  calculation: Calculation | null
}

type Calculation = {
  readonly operator: CalculatorOperator
  readonly results: ExpressionResult[]
  readonly willSwap: boolean
  count: number
}

export const expression =
  <E extends object>(delegate: ExpressionDelegate<E>): Calculator<E> =>
  (e1, e2) => {
    const rootNode: Node<E> = {
      parent: null,
      swapped: false,
      expressions: null,
      calculation: {
        operator: CalculatorOperator.Save,
        results: [ExpressionNone],
        willSwap: false,
        count: 0,
      },
    }
    // Nodes awaiting expansion.
    const extendQueue: Node<E>[] = [
      {
        parent: { node: rootNode, index: 0 },
        swapped: false,
        expressions: [e1, e2],
        calculation: null,
      },
    ]
    // Nodes whose leaf results are ready to calculate.
    const calculateQueue: Node<E>[] = []

    while (extendQueue.length > 0 || calculateQueue.length > 0) {
      while (extendQueue.length > 0) {
        const node = extendQueue.pop()!
        extendNode(node)
      }
      while (calculateQueue.length > 0) {
        const node = calculateQueue.pop()!
        calculateNode(node)
      }
    }

    function extendNode(node: Node<E>): void {
      let result: ExpressionResult = ExpressionEquals
      const [leftExpression, rightExpression] = node.expressions!

      if (!delegate.equals(leftExpression, rightExpression)) {
        const expression1 = delegate.describe(leftExpression)

        if (expression1.kind !== ExpressionKind.Leaf) {
          const willSwap = false
          const [calculation, expressions] = expendExpression(expression1, willSwap)
          node.expressions = null
          node.calculation = calculation

          for (const [index, childExpression] of expressions.entries()) {
            extendQueue.push({
              parent: { node, index },
              swapped: node.swapped,
              expressions: [childExpression, rightExpression],
              calculation: null,
            })
          }
          return
        }
        const expression2 = delegate.describe(rightExpression)

        if (expression2.kind !== ExpressionKind.Leaf) {
          const willSwap = true
          const [calculation, expressions] = expendExpression(expression2, willSwap)
          node.expressions = null
          node.calculation = calculation

          for (const [index, childExpression] of expressions.entries()) {
            extendQueue.push({
              parent: { node, index },
              swapped: !node.swapped,
              expressions: [childExpression, leftExpression],
              calculation: null,
            })
          }
          return
        }
        result = delegate.calculate(leftExpression, rightExpression)
        delegate.observeCalculation?.(leftExpression, rightExpression, result, node.swapped)

        if (result === ExpressionNone) {
          throw new Error('cannot response expression as none')
        }
      }
      node.expressions = null
      node.calculation = {
        operator: CalculatorOperator.Save,
        results: [result],
        willSwap: false,
        count: 0,
      }
      calculateQueue.push(node)
    }

    function expendExpression(description: ExpressionDescription<E>, willSwap: boolean): [Calculation, E[]] {
      let operator: CalculatorOperator = CalculatorOperator.Save
      let expressions: E[]

      switch (description.kind) {
        case ExpressionKind.Not: {
          operator = CalculatorOperator.Not
          expressions = [description.expression]
          break
        }
        case ExpressionKind.AllOf: {
          operator = CalculatorOperator.AllOf
          expressions = [...description.expressions]
          break
        }
        case ExpressionKind.AnyOf: {
          operator = CalculatorOperator.AnyOf
          expressions = [...description.expressions]
          break
        }
        case ExpressionKind.OneOf: {
          operator = CalculatorOperator.OneOf
          expressions = [...description.expressions]
          break
        }
        default: {
          throw new Error(`invalid kind ${description.kind}`)
        }
      }
      const calculation: Calculation = {
        operator,
        willSwap,
        count: 0,
        results: Array(expressions.length).fill(-1),
      }
      return [calculation, expressions]
    }

    function calculateNode(node: Node<E>): void {
      const calculation = node.calculation!
      const parent = node.parent
      let result = calculate(calculation.operator, calculation.results)

      if (result === ExpressionNone) {
        // AllOf assumes the left intersection is not empty, but this defensive fallback still handles an empty result.
        // A forced None result therefore makes the left side equivalent to never.
        result = ExpressionContainedBy
      }
      if (calculation.willSwap) {
        result = swap(result)
      }
      if (parent) {
        const parentCalculation = parent.node.calculation!
        const parentResults = parentCalculation.results

        parentResults[parent.index] = result
        parentCalculation.count += 1

        if (parentCalculation.count >= parentResults.length) {
          calculateQueue.push(parent.node)
        }
      }
    }

    const result = rootNode.calculation!.results[0]
    if (result === 0) {
      throw new Error('cannot find result of root')
    }
    return result
  }
