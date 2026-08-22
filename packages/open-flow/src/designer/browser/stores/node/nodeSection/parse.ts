import type { HandleInputFrom, HandleName, HandleOutputFrom } from '../../../../../schema/index.ts'
import type { FieldPathKey } from '../../nodeHandle/fieldPath.ts'

import { isBoolean, isDefined, isPlainObject } from '@wopjs/cast'

export type FieldCollapsed = Record<HandleName, Record<FieldPathKey, boolean> | undefined>

export function parseFieldCollapsed(data: unknown): FieldCollapsed | undefined {
  if (isPlainObject(data)) {
    for (const collapsedConfig of Object.values(data)) {
      if (isDefined(collapsedConfig)) {
        if (!isPlainObject(collapsedConfig)) {
          return
        }
        for (const collapsed of Object.values(collapsedConfig)) {
          if (isDefined(collapsed) && !isBoolean(collapsed)) {
            return
          }
        }
      }
    }
    return data as Record<PropertyKey, any>
  }
}

export type FieldHeight = Record<HandleName, Record<FieldPathKey, number> | undefined>

export function parseFieldHeight(data: unknown): FieldHeight | undefined {
  if (isPlainObject(data)) {
    for (const heightConfig of Object.values(data)) {
      if (isDefined(heightConfig)) {
        if (!isPlainObject(heightConfig)) {
          return
        }
        for (const height of Object.values(heightConfig)) {
          if (isDefined(height) && typeof height !== 'number') {
            return
          }
        }
      }
    }
    return data as Record<PropertyKey, any>
  }
}

export function isConnected(handle: HandleInputFrom | HandleOutputFrom | undefined): boolean {
  if (!handle) return false
  return Boolean((handle.from_flow && handle.from_flow.length > 0) || (handle.from_node && handle.from_node.length > 0))
}
