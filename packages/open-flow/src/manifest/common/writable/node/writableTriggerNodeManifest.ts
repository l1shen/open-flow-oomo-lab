import type { DisposableStore } from '@wopjs/disposable'
import type { EventReceiver } from 'remitter'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { NodeId, TriggerDescriptor } from '../../../../schema/index.ts'
import type { NodeManifestKind, TriggerNodeManifestKind } from '../../model/node/internal.ts'
import type { TriggerNodeManifest, TriggerNodeManifest$ } from '../../model/node/triggerNodeManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent } from '../../yaml.ts'
import type { WritableNodeManifest, WritableNodeManifestEvents } from './writableNodeManifest.ts'

import { disposableStore } from '@wopjs/disposable'
import { isEqual } from 'radash'
import { Remitter } from 'remitter'
import { TriggerDescriptorSchema } from '../../../../schema/index.ts'
import { NodeManifestKind as NodeKind, TriggerNodeManifestKind as TriggerKind } from '../../model/node/internal.ts'
import { bindWritableValGroup } from '../../writableFileManifest.ts'
import { setYamlNodeValue } from '../../yaml.ts'
import { bindWritableNodeValGroup } from './utils.ts'

export type WritableTriggerNodeManifest$$ = {
  [K in keyof TriggerNodeManifest$]: WritableReactive<TriggerNodeManifest$[K]>
}

export class WritableTriggerNodeManifest implements WritableNodeManifest, TriggerNodeManifest {
  public readonly KIND: Record<NodeManifestKind | TriggerNodeManifestKind, boolean> = {
    [NodeKind]: true,
    [TriggerKind]: true,
  }

  public readonly nodeId: NodeId
  public readonly nodeType = 'trigger'
  public readonly events: EventReceiver<WritableNodeManifestEvents>
  protected readonly eventEmitter: Remitter<WritableNodeManifestEvents>
  public readonly $: TriggerNodeManifest$
  public readonly $$: WritableTriggerNodeManifest$$
  public readonly dispose: DisposableStore = disposableStore()
  public readonly onYamlParentUpdated: OnYamlParentUpdated
  public yamlParent: YamlParent

  public static is(value: unknown): value is WritableTriggerNodeManifest {
    return value instanceof WritableTriggerNodeManifest
  }

  public static to(value: unknown): WritableTriggerNodeManifest | undefined {
    return WritableTriggerNodeManifest.is(value) ? value : undefined
  }

  public constructor(nodeId: NodeId, yamlParent: YamlParent) {
    this.nodeId = nodeId
    this.yamlParent = yamlParent
    setYamlNodeValue(yamlParent, 'node_id', nodeId)

    this.events = this.eventEmitter = this.dispose.add(new Remitter())

    const [nodeVals, onYamlParentUpdated] = bindWritableNodeValGroup(yamlParent)
    const [triggerVals, onTriggerYamlParentUpdated] = bindWritableValGroup<{ trigger: TriggerDescriptor }>(yamlParent, {
      trigger: {
        parser: (value) => TriggerDescriptorSchema.safeParse(value).data,
        config: { equal: isEqual },
      },
    })
    this.$ = this.$$ = { ...nodeVals, ...triggerVals }
    this.onYamlParentUpdated = onYamlParentUpdated.add(onTriggerYamlParentUpdated).add((nodeYaml) => (this.yamlParent = nodeYaml))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }

  public clone(nodeId: NodeId): WritableTriggerNodeManifest {
    const nodeYaml = this.yamlParent.clone()
    setYamlNodeValue(nodeYaml, 'node_id', nodeId)
    return new WritableTriggerNodeManifest(nodeId, nodeYaml)
  }

  public toJSON(): object {
    return this.yamlParent.toJSON()
  }
}
