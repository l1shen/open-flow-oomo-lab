import type { DisposableStore } from '@wopjs/disposable'
import type { EventReceiver } from 'remitter'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { SubflowNodeManifest, SubflowNodeManifest$ } from '../../model/node/subflowNodeManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent } from '../../yaml.ts'
import type { WritableNodeManifest, WritableNodeManifestEvents } from './writableNodeManifest.ts'

import { disposableStore } from '@wopjs/disposable'
import { Remitter } from 'remitter'
import { parseBlockResourceName } from '../../blockResourceName.ts'
import { NodeManifestKind, SubflowNodeManifestKind } from '../../model/node/internal.ts'
import { bindWritableVal } from '../../writableFileManifest.ts'
import { setYamlNodeValue } from '../../yaml.ts'
import { bindWritableNodeValGroup, bindWritableProgressNodeValGroup, bindWritableScheduledNodeValGroup } from './utils.ts'

export interface WritableSubflowNodeManifest$ extends SubflowNodeManifest$ {}

export type WritableSubflowNodeManifest$$ = {
  [K in keyof WritableSubflowNodeManifest$]: WritableReactive<WritableSubflowNodeManifest$[K]>
}

export class WritableSubflowNodeManifest implements WritableNodeManifest, SubflowNodeManifest {
  public readonly KIND: Record<NodeManifestKind | SubflowNodeManifestKind, boolean> = {
    [NodeManifestKind]: true,
    [SubflowNodeManifestKind]: true,
  }

  public readonly nodeId: NodeId

  public readonly nodeType = 'subflow'

  public readonly $: WritableSubflowNodeManifest$

  public readonly $$: WritableSubflowNodeManifest$$

  public readonly dispose: DisposableStore = disposableStore()

  public readonly onYamlParentUpdated: OnYamlParentUpdated

  public yamlParent: YamlParent

  public readonly events: EventReceiver<WritableNodeManifestEvents>
  protected readonly eventEmitter: Remitter<WritableNodeManifestEvents>

  public static is(manifest: unknown): manifest is WritableSubflowNodeManifest {
    return manifest instanceof WritableSubflowNodeManifest
  }

  public static to(manifest: unknown): WritableSubflowNodeManifest | undefined {
    return WritableSubflowNodeManifest.is(manifest) ? manifest : undefined
  }

  public constructor(nodeId: NodeId, yamlParent: YamlParent) {
    this.nodeId = nodeId
    this.yamlParent = yamlParent

    setYamlNodeValue(yamlParent, 'node_id', nodeId)

    this.events = this.eventEmitter = this.dispose.add(new Remitter())

    const [nodeVals, onYamlParentUpdated] = bindWritableNodeValGroup(yamlParent)
    const [progressVals, onProgressYamlParentUpdated] = bindWritableProgressNodeValGroup(yamlParent)
    const [scheduledVals, onScheduledYamlParentUpdated] = bindWritableScheduledNodeValGroup(yamlParent)
    const [subflow, onFlowYamlParentUpdate] = bindWritableVal(yamlParent, 'subflow', parseBlockResourceName)
    this.$ = this.$$ = { ...nodeVals, ...progressVals, ...scheduledVals, subflow }
    this.onYamlParentUpdated = onYamlParentUpdated
      .add(onProgressYamlParentUpdated)
      .add(onScheduledYamlParentUpdated)
      .add(onFlowYamlParentUpdate)
      .add((nodeYaml) => (this.yamlParent = nodeYaml))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }

  public clone(nodeId: NodeId): WritableSubflowNodeManifest {
    const nodeYaml = this.yamlParent.clone()
    setYamlNodeValue(nodeYaml, 'node_id', nodeId)
    return new WritableSubflowNodeManifest(nodeId, nodeYaml)
  }

  public toJSON(): object {
    return this.yamlParent.toJSON()
  }
}
