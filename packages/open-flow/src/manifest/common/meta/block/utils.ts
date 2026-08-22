// These pure functions live in a separate file to avoid a cycle between NodeMeta and TaskBlockMeta.

import type { TaskBlockMeta } from './taskBlockMeta.ts'

import { isTaskBlockManifest } from '../../model/block/task/taskBlockManifest.ts'
import { isSharedBlockMeta } from './shared/sharedBlockMeta.ts'

export function isTaskBlockMeta(block: unknown): block is TaskBlockMeta {
  return isSharedBlockMeta(block) && isTaskBlockManifest(block?.manifest)
}

export function toTaskBlockMeta(block: unknown): TaskBlockMeta | undefined {
  if (isTaskBlockMeta(block)) {
    return block
  }
  return undefined
}
