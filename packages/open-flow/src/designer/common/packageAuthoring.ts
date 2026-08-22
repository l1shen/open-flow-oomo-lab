import type { BlockName, BlockPath } from '../../manifest/common/manifestTypes.ts'
import type { BlockMeta } from '../../manifest/common/meta/block/blockMeta.ts'
import type { SharedBlockMeta } from '../../manifest/common/meta/block/shared/sharedBlockMeta.ts'
import type { FlowLikeMeta } from '../../manifest/common/meta/flowLike/flowLikeMeta.ts'
import type { PackageMeta } from '../../manifest/common/meta/package/packageMeta.ts'
import type { HandleName, NodeId } from '../../schema/index.ts'

export interface AddNodeHandleItem {
  readonly name: HandleName
  readonly json_schema?: unknown
  readonly description?: string
}

export interface AddNodeBlockItem {
  readonly name: BlockName
  readonly path: BlockPath
  readonly icon?: string
  readonly title?: string
  readonly detail?: string
  readonly description?: string
  readonly input_handles?: AddNodeHandleItem[]
  readonly output_handles?: AddNodeHandleItem[]
}

export interface PackageAuthoring {
  readonly packageMeta: PackageMeta
  readonly canRenameSharedBlocks: boolean
  readonly canWriteScriptlets: boolean
  getAddNodeItems(): readonly AddNodeBlockItem[]
  getLocalBlock(blockPath: BlockPath): SharedBlockMeta | undefined
  addSharedBlockNode(flowLikeMeta: FlowLikeMeta, blockMeta: SharedBlockMeta): NodeId
  propagateHandleRename(blockMeta: BlockMeta, section: 'input' | 'output', rename: [oldName: HandleName, newName: HandleName]): void
  resolveTaskEntryPath(blockPath: BlockPath, executorEntry: string): Promise<string | undefined>
}
