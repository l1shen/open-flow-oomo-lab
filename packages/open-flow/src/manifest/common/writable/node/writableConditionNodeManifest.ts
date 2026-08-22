import type { DisposableStore } from '@wopjs/disposable'
import type { EventReceiver } from 'remitter'
import type { ValDisposer, ReadonlyVal, Val } from 'value-enhancer'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { ConditionNodeManifest, ConditionNodeManifest$ } from '../../model/node/conditionNodeManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent } from '../../yaml.ts'
import type { WritableNodeManifest, WritableNodeManifestEvents } from './writableNodeManifest.ts'

import { disposableOne, disposableStore, dispose } from '@wopjs/disposable'
import { Remitter } from 'remitter'
import { val } from 'value-enhancer'
import { ConditionNodeManifestKind, NodeManifestKind } from '../../model/node/internal.ts'
import { deleteYamlNode, getYamlNode, isYamlMap, isYamlNode, setYamlNodeValue } from '../../yaml.ts'
import { WritableConditionBlockManifest } from '../block/writableConditionBlockManifest.ts'
import { bindWritableNodeValGroup, bindWritableProgressNodeValGroup } from './utils.ts'

export interface WritableConditionNodeManifest$ extends ConditionNodeManifest$ {
  readonly conditions: ReadonlyVal<WritableConditionBlockManifest | undefined>
}

export type WritableConditionNodeManifest$$ = {
  [K in keyof WritableConditionNodeManifest$]: WritableReactive<WritableConditionNodeManifest$[K]>
}

export class WritableConditionNodeManifest implements WritableNodeManifest, ConditionNodeManifest {
  public readonly KIND: Record<symbol, boolean> = {
    [NodeManifestKind]: true,
    [ConditionNodeManifestKind]: true,
  }

  public readonly nodeId: NodeId

  public readonly nodeType = 'condition'

  public readonly events: EventReceiver<WritableNodeManifestEvents>
  protected readonly eventEmitter: Remitter<WritableNodeManifestEvents>

  public readonly $: WritableConditionNodeManifest$

  public readonly $$: WritableConditionNodeManifest$$

  public readonly dispose: DisposableStore = disposableStore()

  public readonly onYamlParentUpdated: OnYamlParentUpdated

  public yamlParent: YamlParent

  public static is(manifest: unknown): manifest is WritableConditionNodeManifest {
    return manifest instanceof WritableConditionNodeManifest
  }

  public static to(manifest: unknown): WritableConditionNodeManifest | undefined {
    if (WritableConditionNodeManifest.is(manifest)) {
      return manifest as WritableConditionNodeManifest
    }
  }

  public constructor(nodeId: NodeId, yamlParent: YamlParent) {
    this.nodeId = nodeId
    this.yamlParent = yamlParent

    setYamlNodeValue(yamlParent, 'node_id', nodeId)

    this.events = this.eventEmitter = this.dispose.add(new Remitter())

    const [nodeVals, onYamlParentUpdated] = bindWritableNodeValGroup(yamlParent)
    const [progressVals, onProgressYamlParentUpdated] = bindWritableProgressNodeValGroup(yamlParent)
    const [conditions, onConditionsYamlParentUpdated] = bindWritableConditionsVal(yamlParent, 'conditions')

    this.$ = this.$$ = { ...nodeVals, ...progressVals, conditions }

    this.onYamlParentUpdated = onYamlParentUpdated
      .add(onProgressYamlParentUpdated)
      .add(onConditionsYamlParentUpdated)
      .add((nodeYaml) => (this.yamlParent = nodeYaml))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }

    const conditionsDispose = this.dispose.add(disposableOne())
    this.dispose.add(
      conditions.subscribe((nextConditions) => {
        if (WritableConditionBlockManifest.is(nextConditions)) {
          conditionsDispose.set(nextConditions.events.on('changed', onChanged))
        }
      }, true),
    )
  }

  public clone(nodeId: NodeId): WritableConditionNodeManifest {
    const nodeYaml = this.yamlParent.clone()
    setYamlNodeValue(nodeYaml, 'node_id', nodeId)
    return new WritableConditionNodeManifest(nodeId, nodeYaml)
  }

  public toJSON(): object {
    return this.yamlParent.toJSON()
  }
}

function bindWritableConditionsVal(yamlParent: YamlParent, key: string): [Val<WritableConditionBlockManifest | undefined>, OnYamlParentUpdated] {
  const conditions$ = val<WritableConditionBlockManifest | undefined>(undefined)

  let valDisposer: ValDisposer | undefined

  const onYamlParentUpdated: OnYamlParentUpdated = (nextYamlParent: YamlParent) => {
    valDisposer?.()

    const conditionsYamlNode = getYamlNode(nextYamlParent, key).filter(isYamlNode).unwrapOr()

    const value = conditionsYamlNode?.toJSON()

    if (!value) {
      dispose(conditions$.value)
      conditions$.set(undefined)
    } else if (!isYamlMap(conditionsYamlNode)) {
      dispose(conditions$.value)
      conditions$.set(undefined)
    } else if (WritableConditionBlockManifest.is(conditions$.value)) {
      conditions$.value.onYamlParentUpdated(conditionsYamlNode)
    } else {
      dispose(conditions$.value)
      conditions$.set(new WritableConditionBlockManifest(conditionsYamlNode))
    }

    valDisposer = conditions$.reaction((conditions) => {
      if (WritableConditionBlockManifest.is(conditions)) {
        setYamlNodeValue(nextYamlParent, key, conditions.yamlParent)
      } else {
        deleteYamlNode(nextYamlParent, key)
      }
    }, true)
  }

  onYamlParentUpdated(yamlParent)

  return [conditions$, onYamlParentUpdated]
}
