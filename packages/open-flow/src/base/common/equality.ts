import { isPlainObject } from '@wopjs/cast'

export function shallowPlainObjectEqual(a: unknown, b: unknown): boolean {
  const same = Object.is(a, b)
  if (same || !isPlainObject(a) || !isPlainObject(b)) {
    return same
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length != keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) {
      return false
    }
  }
  return true
}
