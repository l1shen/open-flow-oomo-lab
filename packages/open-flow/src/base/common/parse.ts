import type { Option } from '@wopjs/tsur'

import { isArray, isBoolean, isString } from '@wopjs/cast'
import { None, Some, filterMap } from '@wopjs/tsur'

/** Parse a number from unknown data. */
export function parseNumber(data: unknown): Option<number> {
  const value = Number(data)
  return Number.isNaN(value) ? None : Some(value)
}

export const parseBoolean = (data: unknown): Option<boolean> => (isBoolean(data) ? Some(data) : None)

/** Parse a string from unknown data. */
export const parseString = (data: unknown): Option<string> => {
  if (isString(data)) {
    return Some(data)
  }
  if (data === null) {
    return Some('')
  }
  if (data !== undefined) {
    try {
      return Some(JSON.stringify(data))
    } catch {
      return None
    }
  }
  return None
}

/**
 * Parse a value to string. If the value is not a string, it will be stringified.
 */
export function enforceString(data: unknown): string {
  if (isString(data)) {
    return data
  }
  if (data == null) {
    return ''
  }
  try {
    return JSON.stringify(data)
  } catch {
    try {
      // Insane case: data = { toString: () => { throw data } }
      return data + ''
    } catch {
      return ''
    }
  }
}

export const parseArray = <TItem>(data: unknown, parseItem: (item: unknown) => Option<TItem>): Option<TItem[]> =>
  isArray(data) ? Some(filterMap(data, parseItem)) : None

export function jsonTryParse<T>(json: string): T | undefined {
  try {
    return JSON.parse(json)
  } catch {
    return
  }
}

export function jsonTryStringify(obj: unknown, pretty = true, logError = false): string | undefined {
  try {
    return JSON.stringify(obj, null, pretty ? 2 : 0)
  } catch (e) {
    if (logError) {
      console.error(e)
    }
  }
}
