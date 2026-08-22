import type { ReactiveMap, ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { WritableReactive } from '../../../base/common/reactivity.ts'
import type { Revision } from '../../../base/common/revision.ts'
import type { NodeId, TriggerDefinitionSnapshot } from '../../../schema/index.ts'
import type { FlowManifest, FlowManifest$ } from '../model/flow/flowManifest.ts'
import type { YamlDoc } from '../yaml.ts'
import type { WritableFlowLikeManifest } from './flowLike/writableFlowLikeManifest.ts'
import type { WritableNodeManifest } from './node/writableNodeManifest.ts'

import { noop } from '@wopjs/cast'
import { isEqual } from 'radash'
import { attachSetter, val } from 'value-enhancer'
import { parseString } from '../../../base/common/parse.ts'
import { watchReactiveMap } from '../../../base/common/reactivity.ts'
import { TriggerDefinitionSnapshotSchema } from '../../../schema/index.ts'
import { FlowManifestKind } from '../model/flow/internal.ts'
import { FlowLikeManifestKind } from '../model/flowLike/internal.ts'
import { bindWritableValGroup, WritableFileManifest } from '../writableFileManifest.ts'
import { writeMultilineStringYamlScalar } from '../yaml.ts'
import { bindWritableNodes } from './node/bindWritableNodes.ts'

export interface WritableFlowManifest$ extends FlowManifest$ {}

export type WritableFlowManifest$$ = {
  [K in keyof WritableFlowManifest$]: WritableReactive<WritableFlowManifest$[K]>
}

export class WritableFlowManifest extends WritableFileManifest implements WritableFlowLikeManifest, FlowManifest {
  public readonly KIND: Record<FlowManifestKind | FlowLikeManifestKind, boolean> = {
    [FlowManifestKind]: true,
    [FlowLikeManifestKind]: true,
  }

  public readonly $: WritableFlowManifest$
  public readonly $$: WritableFlowManifest$$

  public readonly nodes: ReadonlyReactiveMap<NodeId, WritableNodeManifest>

  /** @internal */
  public readonly nodeManifests: ReactiveMap<NodeId, WritableNodeManifest>

  public constructor(sourceOrDoc?: YamlDoc | string, revision?: Revision) {
    super(sourceOrDoc, revision)

    const [$$, onSourceUpdated] = bindWritableValGroup<{
      title: string
      icon: string
      description: string
      trigger_definitions: readonly TriggerDefinitionSnapshot[]
    }>(this.yamlParent, {
      title: parseString,
      icon: parseString,
      description: {
        parser: parseString,
        writeYamlValue: writeMultilineStringYamlScalar,
      },
      trigger_definitions: {
        parser: (value) => TriggerDefinitionSnapshotSchema.array().safeParse(value).data,
        config: { equal: isEqual },
      },
    })
    this.$ = this.$$ = { ...$$, outputs_from: attachSetter(val(), noop) }
    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const [nodes, onNodesSourceUpdated] = bindWritableNodes(this.yamlParent)
    this.onYamlParentUpdated = onSourceUpdated.add(onNodesSourceUpdated)
    this.nodes = this.nodeManifests = this.dispose.add(nodes)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
    /* disposed by class */ nodes.$.reaction(onChanged)
    this.dispose.add(watchReactiveMap(nodes, (node) => node.events.on('changed', onChanged)))
  }
}
