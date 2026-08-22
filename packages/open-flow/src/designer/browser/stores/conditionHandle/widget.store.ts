import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { ConditionExpression, HandleName, InputHandleDef } from '../../../../schema/index.ts'
import type { FieldPath } from '../nodeHandle/fieldPath.ts'
import type { ConditionOperator } from './constants.ts'
import type { WidgetContext } from './widgetContext.ts'

import { disposableStore } from '@wopjs/disposable'
import { attachSetter, compute, derive, setValue } from 'value-enhancer'
import { asNumber, asString, asTrue } from '../../base/trivial.ts'
import { getDefaultValueOfType, getFirstOperatorOfType, predicateOperator, predicateValueType } from './constants.ts'

export class ConditionWidgetStore {
  public readonly dispose: DisposableStore = disposableStore()
  public readonly expressions$: ReadonlyVal<ConditionExpressionStore[]>

  public constructor(
    public readonly path: FieldPath,
    public readonly context: WidgetContext,
  ) {
    this.expressions$ = this.dispose.add(this.deriveExpressions$())
  }

  private collapsedCache$?: Val<boolean>
  public get collapsed$(): Val<boolean> {
    return (this.collapsedCache$ ??= this.dispose.add(this.context.deriveCollapsed$(this.path)))
  }

  public addExpression(itemIndex: number): void {
    const expressions = this.context.expressions$.value
    const previousExpr = expressions?.[itemIndex >= 0 ? itemIndex : 0]
    if (previousExpr) {
      const newExpressions = expressions.toSpliced(itemIndex + 1, 0, structuredClone(previousExpr))
      setValue(this.context.expressions$, newExpressions)
    } else {
      const def = this.context.inputHandleDefs$.value?.[0]
      const inputHandle = def?.handle ?? ('handle' as HandleName)
      const operator = getFirstOperatorOfType(def)
      const value = getDefaultValueOfType(def, operator)
      const newExpression: ConditionExpression = { input_handle: inputHandle, operator, value }
      setValue(this.context.expressions$, [newExpression])
    }
  }

  public removeExpression(itemIndex: number): void {
    const expressions = this.context.expressions$.value
    if (expressions) {
      const newExpressions = expressions.toSpliced(itemIndex, 1)
      setValue(this.context.expressions$, newExpressions.length > 0 ? newExpressions : undefined)
    }
  }

  private deriveExpressions$(): ReadonlyVal<ConditionExpressionStore[]> {
    let oldExpressions: ConditionExpressionStore[] = []
    return derive(this.context.expressions$, (expressions) => {
      const len = Array.isArray(expressions) ? expressions.length : 0
      const newExpressions: ConditionExpressionStore[] = oldExpressions.slice(0, len)

      for (let i = oldExpressions.length; i < len; i++) {
        newExpressions[i] = new ConditionExpressionStore(i, this, this.context)
      }

      for (let i = len; i < oldExpressions.length; i++) {
        oldExpressions[i]?.dispose()
      }

      oldExpressions = newExpressions

      return newExpressions
    })
  }
}

export class ConditionExpressionStore {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly path: FieldPath
  public readonly index: number
  public readonly context: WidgetContext

  /** The left part of the expression: which handle to be calculated. */
  public readonly inputHandle$: Val<HandleName | undefined>
  /** The middle part of the expression: the operator between handle and operand. */
  public readonly operator$: Val<ConditionOperator | undefined>
  /** The right part of the expression: the operand, can be `undefined` if unnecessary. */
  public readonly value$: Val<unknown>

  public readonly inputHandleDef$: ReadonlyVal<InputHandleDef | undefined>

  public constructor(index: number, conditionStore: ConditionWidgetStore, context: WidgetContext) {
    this.index = index
    this.context = context
    this.path = conditionStore.path.append(index)

    this.inputHandle$ = this.dispose.add(
      attachSetter(
        derive(context.expressions$, (expressions) => expressions?.[index]?.input_handle),
        (inputHandle: HandleName | undefined) => {
          if (inputHandle) {
            const expressions = context.expressions$.value?.slice() ?? []
            expressions[index] = { ...expressions[index], input_handle: inputHandle }
            this.fixOperator(expressions[index])
            context.expressions$.set(expressions)
          } else {
            // The UI cannot set this value to `undefined`.
          }
        },
      ),
    )
    this.inputHandleDef$ = this.dispose.add(
      compute((get) => {
        const handle = get(this.inputHandle$)
        if (handle != null) {
          return get(context.inputHandleDefs$)?.find((def) => def.handle === handle)
        }
      }),
    )

    this.operator$ = this.dispose.add(
      attachSetter(
        derive(context.expressions$, (expressions) => expressions?.[index]?.operator),
        (operator: ConditionOperator | undefined) => {
          if (operator) {
            const expressions = context.expressions$.value?.slice() ?? []
            expressions[index] = { ...expressions[index], operator }
            this.fixValue(expressions[index])
            context.expressions$.set(expressions)
          } else {
            // The UI cannot set this value to `undefined`.
          }
        },
      ),
    )

    this.value$ = this.dispose.add(
      attachSetter(
        derive(context.expressions$, (expressions) => expressions?.[index]?.value),
        (value: unknown) => {
          const expressions = context.expressions$.value?.slice() ?? []
          expressions[index] = { ...expressions[index], value }
          context.expressions$.set(expressions)
        },
      ),
    )
  }

  // Select a compatible operator after the handle changes.
  private fixOperator(expr: ConditionExpression) {
    const def = this.context.inputHandleDefs$.value?.find((candidate) => candidate.handle === expr.input_handle)
    const predicate = predicateOperator(def)
    if (!predicate(expr.operator)) {
      expr.operator = getFirstOperatorOfType(def)
    }
    this.fixValue(expr)
  }

  // Normalize the value after the operator changes.
  private fixValue(expr: ConditionExpression) {
    const def = this.context.inputHandleDefs$.value?.find((candidate) => candidate.handle === expr.input_handle)
    const valueType = predicateValueType(def, expr.operator)
    if (valueType === undefined) {
      expr.value = undefined
    } else if (valueType === 'string' && typeof expr.value !== 'string') {
      expr.value = asString(expr.value)
    } else if (valueType === 'number' && typeof expr.value !== 'number') {
      expr.value = asNumber(expr.value)
    } else if (valueType === 'boolean' && typeof expr.value !== 'boolean') {
      expr.value = asTrue(expr.value)
    }
  }
}
