import type { ReactiveMap, ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { Revision } from '../../../../base/common/revision.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { SubflowBlockManifest, SubflowBlockManifest$ } from '../../model/block/subflow/subflowBlockManifest.ts'
import type { YamlDoc } from '../../yaml.ts'
import type { WritableFlowLikeManifest } from '../flowLike/writableFlowLikeManifest.ts'
import type { WritableNodeManifest } from '../node/writableNodeManifest.ts'
import type { WritableBlockManifest } from './writableBlockManifest.ts'

import { isEqual } from 'radash'
import { shallowPlainObjectEqual } from '../../../../base/common/equality.ts'
import { parseArray } from '../../../../base/common/parse.ts'
import { watchReactiveMap } from '../../../../base/common/reactivity.ts'
import { BlockManifestKind, SharedBlockManifestKind, SubflowBlockManifestKind } from '../../model/block/internal.ts'
import { FlowLikeManifestKind } from '../../model/flowLike/internal.ts'
import { parseHandleOutputsFrom } from '../../model/handle/parse.ts'
import { parseNodeId } from '../../utils.ts'
import { WritableFileManifest, bindWritableVal } from '../../writableFileManifest.ts'
import { bindWritableNodes } from '../node/bindWritableNodes.ts'
import { bindSharedWritableBlockValGroup } from './utils.ts'

export interface WritableSubflowBlockManifest$ extends SubflowBlockManifest$ {}

export type WritableSubflowBlockManifest$$ = {
  [K in keyof WritableSubflowBlockManifest$]: WritableReactive<WritableSubflowBlockManifest$[K]>
}

export class WritableSubflowBlockManifest extends WritableFileManifest implements SubflowBlockManifest, WritableBlockManifest, WritableFlowLikeManifest {
  public readonly KIND: Record<BlockManifestKind | SharedBlockManifestKind | FlowLikeManifestKind | SubflowBlockManifestKind, boolean> = {
    [BlockManifestKind]: true,
    [SharedBlockManifestKind]: true,
    [FlowLikeManifestKind]: true,
    [SubflowBlockManifestKind]: true,
  }

  public readonly nodes: ReadonlyReactiveMap<NodeId, WritableNodeManifest>

  /** @interface @deprecated */
  public readonly nodeManifests: ReactiveMap<NodeId, WritableNodeManifest>

  public readonly $: WritableSubflowBlockManifest$

  public readonly $$: WritableSubflowBlockManifest$$

  public static is(manifest: unknown): manifest is WritableSubflowBlockManifest {
    return manifest instanceof WritableSubflowBlockManifest
  }

  public static to(manifest: unknown): WritableSubflowBlockManifest | undefined {
    if (WritableSubflowBlockManifest.is(manifest)) {
      return manifest
    }
  }

  public constructor(sourceOrDoc: YamlDoc | string, revision?: Revision) {
    super(sourceOrDoc, revision)

    const [blockVals, onSourceUpdated] = bindSharedWritableBlockValGroup(this.yamlParent)

    const [outputs_from, onOutputsFromSourceUpdated] = bindWritableVal(this.yamlParent, 'outputs_from', parseHandleOutputsFrom, { equal: isEqual })

    const [forward_previews, onForwardPreviewsSourceUpdated] = bindWritableVal(this.yamlParent, 'forward_previews', (data) => parseArray(data, parseNodeId), {
      equal: shallowPlainObjectEqual,
    })

    this.$ = this.$$ = { ...blockVals, outputs_from, forward_previews }
    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const [nodes, onNodesSourceUpdated] = bindWritableNodes(this.yamlParent)
    this.nodes = this.nodeManifests = this.dispose.add(nodes)

    this.onYamlParentUpdated = onSourceUpdated.add(onOutputsFromSourceUpdated).add(onNodesSourceUpdated).add(onForwardPreviewsSourceUpdated)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
    /* disposed by class */ this.nodes.$.reaction(onChanged)
    this.dispose.add(watchReactiveMap(this.nodeManifests, (node) => node.events.on('changed', onChanged)))
  }
}
