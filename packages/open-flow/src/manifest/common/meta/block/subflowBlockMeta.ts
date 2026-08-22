import type { ReadonlyVal } from 'value-enhancer'
import type { ResourceUriResolver } from '../../../../base/common/resource.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { BlockName, BlockPath, BlockResourceName, SearchPath } from '../../manifestTypes.ts'
import type { FlowLikeMeta$ } from '../flowLike/flowLikeMeta.ts'
import type { FlowLikeMetaKind } from '../flowLike/internal.ts'
import type { NodeMeta, ResolveSharedBlockMeta$ } from '../nodeMeta.ts'
import type { PackageMeta } from '../package/packageMeta.ts'
import type { SharedBlockMeta, SharedBlockMeta$ } from './shared/sharedBlockMeta.ts'

import { inertFilter } from '@wopjs/cast'
import { compute } from 'value-enhancer'
import { dirname } from '../../../../base/common/posixPath.ts'
import { encodeBlockResourceName } from '../../blockResourceName.ts'
import { WritableSubflowBlockManifest } from '../../writable/block/writableSubflowBlockManifest.ts'
import { createConnectedInputHandles$, FlowLikeMeta, isFlowLikeMeta, sanitizeHandleOutputsFrom$ } from '../flowLike/flowLikeMeta.ts'
import { BlockMetaKind, SharedBlockMetaKind } from './internal.ts'
import { createSharedBlockMeta$ } from './shared/internal.ts'

export interface SubflowBlockMeta$ extends SharedBlockMeta$, FlowLikeMeta$ {
  readonly forwardPreviews: ReadonlyVal<NodeId[] | undefined>
}

export class SubflowBlockMeta extends FlowLikeMeta<WritableSubflowBlockManifest> implements SharedBlockMeta {
  public readonly KIND: Record<BlockMetaKind | SharedBlockMetaKind | FlowLikeMetaKind, boolean> = {
    ...FlowLikeMeta.KIND,
    [BlockMetaKind]: true,
    [SharedBlockMetaKind]: true,
  }

  public readonly blockType = 'subflow'
  public override readonly manifestType = 'subflow'

  public readonly blockName: BlockName
  declare public readonly manifestName: BlockName

  public readonly blockDir: string

  public readonly blockResourceName: BlockResourceName

  public readonly $: SubflowBlockMeta$

  public static is(blockMeta: any): blockMeta is SubflowBlockMeta {
    return isFlowLikeMeta(blockMeta) && blockMeta.flowLikeType === 'subflow'
  }

  public static to(blockMeta: unknown): SubflowBlockMeta | undefined {
    if (SubflowBlockMeta.is(blockMeta)) {
      return blockMeta
    }
  }

  public constructor(
    public readonly blockPath: BlockPath,
    packageMeta: PackageMeta,
    searchPath: SearchPath,
    manifest: WritableSubflowBlockManifest,
    resolveSharedBlockMeta$: ResolveSharedBlockMeta$,
    resolveResourceUri: ResourceUriResolver,
  ) {
    super('subflow', blockPath, searchPath, packageMeta, manifest, resolveSharedBlockMeta$, resolveResourceUri)

    this.blockDir = dirname(blockPath)
    this.blockName = this.manifestName as BlockName
    this.blockResourceName = encodeBlockResourceName(this.blockName)

    const sharedBlockMeta$ = createSharedBlockMeta$(manifest, resolveResourceUri, packageMeta, blockPath, searchPath)

    const handleOutputsFrom = sanitizeHandleOutputsFrom$(
      manifest.$.outputs_from,
      sharedBlockMeta$.inputHandleDefs,
      sharedBlockMeta$.outputHandleDefs,
      this.isNodeOutputHandleExist$,
    )

    this.$ = {
      ...sharedBlockMeta$,
      handleOutputsFrom,
      connectedInputHandles: createConnectedInputHandles$(this.nodes, sharedBlockMeta$.inputHandleNames, handleOutputsFrom),
      forwardPreviews: compute((get) => {
        const forwardPreviews = get(manifest.$.forward_previews)
        if (forwardPreviews) {
          const nodes = get(this.nodes)
          return inertFilter(forwardPreviews, (nodeId) => nodes.has(nodeId))
        }
      }),
    }

    this.dispose.add(Object.values(this.$))

    this.setupMigrateNodes()
  }

  public override removeNodes(nodeMetaOrNodeMetas: NodeMeta[] | NodeMeta): boolean {
    const result = super.removeNodes(nodeMetaOrNodeMetas)
    this.manifest.$$.forward_previews.set(
      inertFilter(this.manifest.$.forward_previews.value, (nodeId) =>
        Array.isArray(nodeMetaOrNodeMetas) ? nodeMetaOrNodeMetas.every((nodeMeta) => nodeMeta.nodeId !== nodeId) : nodeId !== nodeMetaOrNodeMetas.nodeId,
      ),
    )
    return result
  }
}
