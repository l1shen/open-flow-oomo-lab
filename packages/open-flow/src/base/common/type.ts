import { isPlainObject } from '@wopjs/cast'

export function isUnknownRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return isPlainObject(value)
}
