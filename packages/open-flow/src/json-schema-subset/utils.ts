export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

let nextId = 0

export function createId(): number {
  const id = nextId
  nextId += 1
  return id
}

export function deepFreeze<T>(target: T): DeepReadonly<T> {
  if (typeof target === 'object' && target !== null && !Object.isFrozen(target)) {
    for (const key of Object.getOwnPropertyNames(target)) {
      const value: unknown = Reflect.get(target, key)
      deepFreeze(value)
    }
    Object.freeze(target)
  }
  return target as DeepReadonly<T>
}

export function pick<T extends object, K extends keyof T>(target: T, keys: Iterable<K>): { -readonly [P in K]: T[P] } {
  const newTarget: Record<string | number | symbol, unknown> = {}
  for (const key of keys) {
    if (key in target) {
      newTarget[key] = target[key]
    }
  }
  return newTarget as Pick<T, K>
}

export function deepCopy<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value
  } else if (Array.isArray(value)) {
    const array: unknown[] = []
    for (const [i, element] of value.entries()) {
      array[i] = deepCopy(element)
    }
    return array as T
  } else {
    const newObject: { [key: string]: unknown } = {}
    for (const key in value) {
      newObject[key] = deepCopy(value[key])
    }
    return newObject as T
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export function isDeepEquals(value1: any, value2: any): boolean {
  if (value1 === value2) {
    return true
  }
  if (value1 === null) {
    return false
  }
  if (typeof value1 !== 'object') {
    return false
  }
  if (typeof value1 !== typeof value2) {
    return false
  }
  if (Array.isArray(value1)) {
    if (!Array.isArray(value2)) {
      return false
    }
    if (value1.length !== value2.length) {
      return false
    }
    for (const [i, value1Element] of value1.entries()) {
      if (!isDeepEquals(value1Element, value2[i])) {
        return false
      }
    }
  } else {
    if (Array.isArray(value2)) {
      return false
    }
    for (const key in value1) {
      if (!(key in value2)) {
        return false
      }
      if (!isDeepEquals(value1[key], value2[key])) {
        return false
      }
    }
    for (const key in value2) {
      if (!(key in value1)) {
        return false
      }
    }
  }
  return true
}
