import type { ReadonlyVal } from 'value-enhancer'
import type { GroupDividerDef, HandleName, InputHandleDef, OutputHandleDef } from '../../../../../schema/index.ts'
import type { BlockName, BlockPath, BlockResourceName, FlowLikePath, SearchPath, SharedBlockType, WSId } from '../../../manifestTypes.ts'
import type { WritableSharedBlockManifest } from '../../../writable/block/writableSharedBlockManifest.ts'
import type { BlockMeta } from '../blockMeta.ts'

import { SharedBlockMetaKind } from '../internal.ts'

export interface SharedBlockMeta$ {
  readonly title: ReadonlyVal<string | undefined>
  /** For quick pick panel to search from. */
  readonly detail: ReadonlyVal<string | undefined>
  readonly description: ReadonlyVal<string | undefined>
  /** Resolved icon URI. */
  readonly icon: ReadonlyVal<string | undefined>
  readonly private: ReadonlyVal<boolean | undefined>
  readonly inputHandleDefs: ReadonlyVal<InputHandleDef[] | undefined>
  readonly outputHandleDefs: ReadonlyVal<OutputHandleDef[] | undefined>
  readonly inputHandleNames: ReadonlyVal<HandleName[]>
  readonly outputHandleNames: ReadonlyVal<HandleName[]>
  readonly displayInputHandleDefs: ReadonlyVal<(InputHandleDef | GroupDividerDef)[] | undefined>
  readonly displayOutputHandleDefs: ReadonlyVal<(OutputHandleDef | GroupDividerDef)[] | undefined>
}

export interface SharedBlockMeta extends BlockMeta {
  readonly KIND: Record<SharedBlockMetaKind, boolean> & BlockMeta['KIND']

  readonly wsId: WSId

  readonly manifest: WritableSharedBlockManifest

  readonly blockType: SharedBlockType
  readonly manifestType: SharedBlockType

  readonly searchPath: SearchPath

  readonly blockResourceName: BlockResourceName

  readonly blockName: BlockName
  readonly manifestName: BlockName

  readonly blockPath: BlockPath
  readonly manifestPath: BlockPath | FlowLikePath

  readonly blockDir: string

  readonly $: SharedBlockMeta$
}

export const isSharedBlockMeta = (blockMeta: any): blockMeta is SharedBlockMeta => blockMeta?.KIND?.[SharedBlockMetaKind] === true

export const toSharedBlockMeta = (blockMeta: unknown): SharedBlockMeta | undefined => {
  if (isSharedBlockMeta(blockMeta)) {
    return blockMeta
  }
}
