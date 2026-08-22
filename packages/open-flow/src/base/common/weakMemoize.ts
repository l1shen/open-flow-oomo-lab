import type { IDisposable } from '@wopjs/disposable'

import { dispose } from '@wopjs/disposable'
import { WeakCache } from '@wopjs/weak-cache'

export interface WeakMemoizedFunction<TFirst, TRest extends unknown[], TResult extends WeakKey> extends IDisposable {
  (first: TFirst, ...rest: TRest): TResult
}

export function createWeakMemoizedFunction<TFirst, TRest extends unknown[], TResult extends WeakKey, TKey extends {}>(
  calculate: (first: TFirst, ...rest: TRest) => TResult,
  getKey: (first: TFirst, ...rest: TRest) => TKey,
): WeakMemoizedFunction<TFirst, TRest, TResult> {
  const memo = new WeakCache<TKey, TResult>()

  const fn: WeakMemoizedFunction<TFirst, TRest, TResult> = (...args) => {
    const key = getKey(...args)
    let result = memo.get(key)
    if (!result) {
      result = calculate(...args)
      memo.set(key, result)
    }
    return result
  }
  fn.dispose = () => {
    for (const v of memo.values()) {
      dispose(v)
    }
    memo.clear()
  }
  return fn
}
