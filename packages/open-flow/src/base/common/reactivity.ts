import type { DisposableType, Disposer } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { ReadonlyReactiveMap, ReactiveList, ReactiveMap, ReactiveSet, ReadonlyReactiveList, ReadonlyReactiveSet } from 'value-enhancer/collections'

import { dispose } from '@wopjs/disposable'
import { WeakCache } from '@wopjs/weak-cache'
import { derive, isVal } from 'value-enhancer'

/**
 * Map a readonly reactive value writable to a writable reactive value.
 */
export type WritableReactive<T> =
  T extends ReadonlyVal<infer TValue>
    ? Val<TValue>
    : T extends ReadonlyReactiveMap<infer TKey, infer TValue>
      ? ReactiveMap<TKey, TValue>
      : T extends ReadonlyReactiveList<infer TValue>
        ? ReactiveList<TValue>
        : T extends ReadonlyReactiveSet<infer TValue>
          ? ReactiveSet<TValue>
          : T

/** Run and own one side effect for every reactive map entry. */
export const watchReactiveMap = <K, V>(
  map$: ReadonlyReactiveMap<K, V>,
  callbackfn: (value: V, key: K, map$: ReadonlyReactiveMap<K, V>) => DisposableType | null,
  thisArg?: unknown,
): Disposer => {
  const lastMap = new Map<K, { value: V; disposer: DisposableType | null }>()
  const disposeMapSubs = map$.$.subscribe((map) => {
    for (const [key, { disposer }] of lastMap) {
      if (!map.has(key)) {
        lastMap.delete(key)
        dispose(disposer)
      }
    }
    for (const [key, value] of map) {
      const lastX = lastMap.get(key)
      if (lastX) {
        if (!Object.is(lastX.value, value)) {
          dispose(lastX.disposer)
          lastX.value = value
          lastX.disposer = callbackfn.call(thisArg, value, key, map$)
        }
      } else {
        lastMap.set(key, {
          value,
          disposer: callbackfn.call(thisArg, value, key, map$),
        })
      }
    }
  })
  return () => {
    disposeMapSubs()
    for (const { disposer } of lastMap.values()) {
      dispose(disposer)
    }
    lastMap.clear()
  }
}

const getValue = <V, K extends PropertyKey = PropertyKey>(key: K, object: Record<K, V>): V => object[key]

const cache = /* @__PURE__ */ new WeakMap()

/** Return one cached reactive value for a key in a reactive dictionary. */
export function getReactiveValue<V, K extends PropertyKey = PropertyKey>(col: ReadonlyVal<Record<K, V>>, key: K): ReadonlyVal<V | undefined>
export function getReactiveValue<V, K = unknown>(col: ReadonlyReactiveMap<K, V>, key: K): ReadonlyVal<V | undefined>
export function getReactiveValue<V, K extends PropertyKey = PropertyKey>(
  col: ReadonlyReactiveMap<K, V> | ReadonlyVal<Record<K, V>>,
  key: K,
): ReadonlyVal<V | undefined> {
  let weakCache = cache.get(col)
  if (!weakCache) {
    cache.set(col, (weakCache = new WeakCache()))
  }
  let val$ = weakCache.get(key)
  if (!val$) {
    weakCache.set(key, (val$ = isVal(col) ? derive(col, getValue.bind(null, key)) : derive(col.$, col.get.bind(col, key))))
  }
  return val$
}
