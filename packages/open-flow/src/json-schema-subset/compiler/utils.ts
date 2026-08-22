export function cleanEmptyValues<T extends object>(origin: T): Partial<T> {
  for (const key in origin) {
    const value = origin[key]
    if (value === undefined) {
      delete origin[key]
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          delete origin[key]
        }
      } else if (isEmptyObject(value)) {
        delete origin[key]
      }
    }
  }
  return origin
}

function isEmptyObject(object: object): boolean {
  for (const _ in object) {
    return false
  }
  return true
}
