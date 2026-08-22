import type { ReadonlyVal } from 'value-enhancer'
import type { GroupDividerDef, HandleName, InputHandleDef, OutputHandleDef } from '../../../../schema/index.ts'
import type { FlowLikePath, SearchPath } from '../../manifestTypes.ts'
import type { WritableInlineTaskBlockManifest } from '../../writable/block/writableInlineTaskBlockManifest.ts'
import type { BlockMeta } from './blockMeta.ts'
import type { BlockMetaKind } from './internal.ts'

import { InlineBlockMetaKind } from './internal.ts'

export interface InlineBlockMeta$ {
  readonly inputHandleDefs: ReadonlyVal<InputHandleDef[] | undefined>
  readonly outputHandleDefs: ReadonlyVal<OutputHandleDef[] | undefined>
  readonly inputHandleNames: ReadonlyVal<HandleName[]>
  readonly outputHandleNames: ReadonlyVal<HandleName[]>
  /** Input definitions with localized handle descriptions. */
  readonly displayInputHandleDefs: ReadonlyVal<(InputHandleDef | GroupDividerDef)[] | undefined>
  readonly displayOutputHandleDefs: ReadonlyVal<(OutputHandleDef | GroupDividerDef)[] | undefined>
}

export interface InlineBlockMeta extends BlockMeta {
  readonly KIND: Record<InlineBlockMetaKind | BlockMetaKind, boolean>

  readonly manifest: WritableInlineTaskBlockManifest

  readonly searchPath: SearchPath

  readonly flowLikePath: FlowLikePath
}

export const isInlineBlockMeta = (blockMeta: any): blockMeta is InlineBlockMeta => blockMeta?.KIND?.[InlineBlockMetaKind] === true

export const toInlineBlockMeta = (blockMeta: unknown): InlineBlockMeta | undefined => {
  if (isInlineBlockMeta(blockMeta)) {
    return blockMeta
  }
}
