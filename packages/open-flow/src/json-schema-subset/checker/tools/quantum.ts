import type { ExpressionResult, ExpressionSingleResult } from '../../expression/index.ts'
import type { VariableBundle } from './mark.ts'

import { ExpressionMaskList } from '../../expression/index.ts'
import { VariableBundleDescription } from './mark.ts'

export interface Quantum<K extends string> {
  readonly keys: readonly K[]
  variable(variable?: Partial<Record<K, boolean>>): QuantumVariable<K>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QuantumVariableType<Q extends Quantum<any>> = VariableBundle<Q['keys'][0]>

export interface QuantumVariable<K extends string> extends Iterable<VariableBundle<K>> {
  assign(other: QuantumVariable<K>): this
  push(expression: ExpressionResult, calculate: QuantumCalculator<K>): void
  update(invoker: (variable: VariableBundle<K>) => void): void
}

export type QuantumCalculator<K extends string> = (singleExpression: ExpressionSingleResult, variable: VariableBundle<K>) => void

export function makeQuantum<K extends string>(keys: readonly K[]): Quantum<K> {
  return new QuantumImpls(keys)
}

class QuantumImpls<K extends string> {
  private readonly description: VariableBundleDescription<K>

  public constructor(keys: readonly K[]) {
    this.description = new VariableBundleDescription(keys)
  }

  public get keys(): readonly K[] {
    return this.description.keys
  }

  public variable(variable?: Partial<Record<K, boolean>>): QuantumVariable<K> {
    let int32: number | undefined
    if (variable) {
      int32 = this.description.toBundle(variable).toInt32()
    }
    return new QuantumVariableImpls(this.description, int32)
  }
}

class QuantumVariableImpls<K extends string> implements QuantumVariable<K> {
  private readonly description: VariableBundleDescription<K>
  private values: Set<number> = new Set()

  public constructor(description: VariableBundleDescription<K>, int32?: number) {
    this.description = description
    if (int32 !== undefined) {
      this.values.add(int32)
    }
  }

  public [Symbol.iterator](): Iterator<VariableBundle<K>> {
    const iterator = this.values[Symbol.iterator]()
    return {
      next: (): IteratorResult<VariableBundle<K>> => {
        const result = iterator.next()
        if (result.done) {
          return result
        } else {
          return {
            done: false,
            value: this.description.toBundle(result.value),
          }
        }
      },
    }
  }

  public assign(other: QuantumVariable<K>): this {
    const { values } = other as QuantumVariableImpls<K>
    for (const int32 of values) {
      this.values.add(int32)
    }
    return this
  }

  public push(expression: ExpressionResult, calculate: QuantumCalculator<K>): void {
    const nextValues = new Set<number>()
    for (const int32 of this.values) {
      for (const [singleExpression, mask] of ExpressionMaskList) {
        if (expression & mask) {
          const variable = this.description.toBundle(int32)
          calculate(singleExpression, variable)
          nextValues.add(variable.toInt32())
        }
      }
    }
    this.values = nextValues
  }

  public update(invoker: (variable: VariableBundle<K>) => void): void {
    const nextValues = new Set<number>()
    for (const int32 of this.values) {
      const variable = this.description.toBundle(int32)
      invoker(variable)
      nextValues.add(variable.toInt32())
    }
    this.values = nextValues
  }
}
