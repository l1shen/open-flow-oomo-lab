import type { DisposableStore } from '@wopjs/disposable'
import type { EventReceiver } from 'remitter'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { NodeManifest$ } from '../../model/node/nodeManifest.ts'
import type { ValueNodeManifest, ValueNodeManifest$ } from '../../model/node/valueNodeManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlKey, YamlParent } from '../../yaml.ts'
import type { WritableNodeManifest, WritableNodeManifestEvents } from './writableNodeManifest.ts'

import { disposableOne, disposableStore, dispose } from '@wopjs/disposable'
import { Remitter } from 'remitter'
import { val } from 'value-enhancer'
import { NodeManifestKind, ValueNodeManifestKind } from '../../model/node/internal.ts'
import { getYamlNode, isYamlSeq, setYamlNodeValue } from '../../yaml.ts'
import { WritableValueBlockManifest } from '../block/writableValueBlockManifest.ts'
import { bindWritableNodeValGroup } from './utils.ts'

export interface WritableValueNodeManifest$ extends NodeManifest$ {
  values: ReadonlyVal<WritableValueBlockManifest | undefined>
}

export type WritableValueNodeManifest$$ = {
  [K in keyof WritableValueNodeManifest$]: WritableReactive<WritableValueNodeManifest$[K]>
}

export class WritableValueNodeManifest implements WritableNodeManifest, ValueNodeManifest {
  public readonly KIND: Record<NodeManifestKind | ValueNodeManifestKind, boolean> = {
    [NodeManifestKind]: true,
    [ValueNodeManifestKind]: true,
  }

  public readonly nodeId: NodeId

  public readonly nodeType = 'value'

  public readonly events: EventReceiver<WritableNodeManifestEvents>
  protected readonly eventEmitter: Remitter<WritableNodeManifestEvents>

  public readonly $: ValueNodeManifest$

  public readonly $$: WritableValueNodeManifest$$

  public readonly dispose: DisposableStore = disposableStore()

  public readonly onYamlParentUpdated: OnYamlParentUpdated

  public yamlParent: YamlParent

  public static is(value: unknown): value is WritableValueNodeManifest {
    return value instanceof WritableValueNodeManifest
  }

  public static to(value: unknown): WritableValueNodeManifest | undefined {
    return WritableValueNodeManifest.is(value) ? value : undefined
  }

  public constructor(nodeId: NodeId, yamlParent: YamlParent) {
    this.nodeId = nodeId
    this.yamlParent = yamlParent

    setYamlNodeValue(yamlParent, 'node_id', nodeId)

    this.events = this.eventEmitter = this.dispose.add(new Remitter())

    const [nodeVals, onYamlParentUpdated] = bindWritableNodeValGroup(yamlParent)
    const [values, onValuesYamlParentUpdated] = bindWritableValuesVal(yamlParent, 'values')

    this.$ = this.$$ = { ...nodeVals, values }

    this.onYamlParentUpdated = onYamlParentUpdated.add(onValuesYamlParentUpdated).add((nextYamlParent) => (this.yamlParent = nextYamlParent))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }

    const taskPromise = this.dispose.add(disposableOne())
    this.dispose.add(
      values.subscribe((nextValues) => {
        if (WritableValueBlockManifest.is(nextValues)) {
          taskPromise.set(nextValues.events.on('changed', onChanged))
        }
      }, true),
    )
  }

  public clone(nodeId: NodeId): WritableValueNodeManifest {
    const nodeYaml = this.yamlParent.clone()
    setYamlNodeValue(nodeYaml, 'node_id', nodeId)
    return new WritableValueNodeManifest(nodeId, nodeYaml)
  }

  public toJSON(): object {
    return this.yamlParent.toJSON()
  }
}

function bindWritableValuesVal(yamlParent: YamlParent, key: YamlKey): [Val<WritableValueBlockManifest | undefined>, OnYamlParentUpdated] {
  const block$ = val<WritableValueBlockManifest | undefined>()

  const onYamlParentUpdated: OnYamlParentUpdated = (nextYamlParent: YamlParent) => {
    const valuesYamlNode = getYamlNode(nextYamlParent, key).filter(isYamlSeq).unwrapOr()

    const value = valuesYamlNode?.toJSON()

    if (!value || !isYamlSeq(valuesYamlNode)) {
      dispose(block$.value)
      block$.set(undefined)
    } else if (WritableValueBlockManifest.is(block$.value)) {
      block$.value.updateValuesYaml(valuesYamlNode)
    } else {
      dispose(block$.value)
      block$.set(new WritableValueBlockManifest(valuesYamlNode))
    }
  }

  onYamlParentUpdated(yamlParent)

  return [block$, onYamlParentUpdated]
}
