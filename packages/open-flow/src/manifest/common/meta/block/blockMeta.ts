import type { DisposableStore } from '@wopjs/disposable'
import type { PackageMeta } from '../package/packageMeta.ts'

import { BlockMetaKind } from './internal.ts'

export interface BlockMeta {
  readonly dispose: DisposableStore

  readonly KIND: Record<BlockMetaKind, boolean>

  readonly packageMeta: PackageMeta

  toJSON(): object
}

export const isBlockMeta = (blockMeta: any): blockMeta is BlockMeta => blockMeta?.KIND?.[BlockMetaKind] === true

export const toBlockMeta = (blockMeta: unknown): BlockMeta | undefined => {
  if (isBlockMeta(blockMeta)) {
    return blockMeta
  }
}
