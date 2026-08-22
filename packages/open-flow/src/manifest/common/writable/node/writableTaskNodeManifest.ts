import type { DisposableStore } from '@wopjs/disposable'
import type { EventReceiver } from 'remitter'
import type { ReadonlyVal, Val, ValDisposer } from 'value-enhancer'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { BlockResourceName } from '../../manifestTypes.ts'
import type { TaskNodeManifest, TaskNodeManifest$ } from '../../model/node/taskNodeManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent, YamlKey } from '../../yaml.ts'
import type { WritableNodeManifest, WritableNodeManifestEvents } from './writableNodeManifest.ts'

import { disposableOne, disposableStore, dispose } from '@wopjs/disposable'
import { Remitter } from 'remitter'
import { val } from 'value-enhancer'
import { isLocalBlockReference } from '../../../../schema/index.ts'
import { NodeManifestKind, TaskNodeManifestKind } from '../../model/node/internal.ts'
import { setYamlNodeValue, getYamlNode, isYamlNode, isYamlMap, deleteYamlNode } from '../../yaml.ts'
import { WritableInlineTaskBlockManifest } from '../block/writableInlineTaskBlockManifest.ts'
import { bindWritableNodeValGroup, bindWritableProgressNodeValGroup, bindWritableScheduledNodeValGroup } from './utils.ts'

export interface WritableTaskNodeManifest$ extends TaskNodeManifest$ {
  task: ReadonlyVal<BlockResourceName | WritableInlineTaskBlockManifest | undefined>
}

export type WritableTaskNodeManifest$$ = {
  [K in keyof WritableTaskNodeManifest$]: WritableReactive<WritableTaskNodeManifest$[K]>
}

export class WritableTaskNodeManifest implements WritableNodeManifest, TaskNodeManifest {
  public readonly KIND: Record<NodeManifestKind | TaskNodeManifestKind, boolean> = {
    [NodeManifestKind]: true,
    [TaskNodeManifestKind]: true,
  }

  public readonly nodeId: NodeId

  public readonly nodeType = 'task'

  public readonly events: EventReceiver<WritableNodeManifestEvents>
  protected readonly eventEmitter: Remitter<WritableNodeManifestEvents>

  public readonly $: WritableTaskNodeManifest$

  public readonly $$: WritableTaskNodeManifest$$

  public readonly dispose: DisposableStore = disposableStore()

  public readonly onYamlParentUpdated: OnYamlParentUpdated

  public yamlParent: YamlParent

  public static is(manifest: unknown): manifest is WritableTaskNodeManifest {
    return manifest instanceof WritableTaskNodeManifest
  }

  public static to(manifest: unknown): WritableTaskNodeManifest | undefined {
    if (WritableTaskNodeManifest.is(manifest)) {
      return manifest
    }
  }

  public constructor(nodeId: NodeId, yamlParent: YamlParent) {
    this.nodeId = nodeId
    this.yamlParent = yamlParent

    setYamlNodeValue(yamlParent, 'node_id', nodeId)

    this.events = this.eventEmitter = this.dispose.add(new Remitter())

    const [nodeVals, onYamlParentUpdated] = bindWritableNodeValGroup(yamlParent)
    const [progressVals, onProgressYamlParentUpdated] = bindWritableProgressNodeValGroup(yamlParent)
    const [scheduledVals, onScheduledYamlParentUpdated] = bindWritableScheduledNodeValGroup(yamlParent)
    const [task, onTaskYamlParentUpdated] = bindWritableTaskVal(yamlParent, 'task')
    this.$ = this.$$ = { ...nodeVals, ...progressVals, ...scheduledVals, task }

    this.onYamlParentUpdated = onYamlParentUpdated
      .add(onProgressYamlParentUpdated)
      .add(onScheduledYamlParentUpdated)
      .add(onTaskYamlParentUpdated)
      .add((nodeYaml) => (this.yamlParent = nodeYaml))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }

    const taskDispose = this.dispose.add(disposableOne())
    this.dispose.add(
      task.subscribe((nextTask) => {
        if (WritableInlineTaskBlockManifest.is(nextTask)) {
          taskDispose.set(nextTask.events.on('changed', onChanged))
        }
      }, true),
    )
  }

  public clone(nodeId: NodeId): WritableTaskNodeManifest {
    const nodeYaml = this.yamlParent.clone()
    setYamlNodeValue(nodeYaml, 'node_id', nodeId)
    return new WritableTaskNodeManifest(nodeId, nodeYaml)
  }

  public toJSON(): object {
    return this.yamlParent.toJSON()
  }
}

function bindWritableTaskVal(
  yamlParent: YamlParent,
  key: YamlKey,
): [Val<BlockResourceName | WritableInlineTaskBlockManifest | undefined>, OnYamlParentUpdated] {
  const task$ = val<BlockResourceName | WritableInlineTaskBlockManifest | undefined>(undefined)

  let valDisposer: ValDisposer | undefined

  // The UI creates a new node instead of replacing its Task target.
  const onYamlParentUpdated: OnYamlParentUpdated = (nextYamlParent: YamlParent) => {
    valDisposer?.()

    const taskYamlNode = getYamlNode(nextYamlParent, key).filter(isYamlNode).unwrapOr()

    const value = taskYamlNode?.toJSON()

    if (!value) {
      dispose(task$.value)
      task$.set(undefined)
    } else if (isLocalBlockReference(value)) {
      dispose(task$.value)
      task$.set(value as BlockResourceName)
    } else if (!isYamlMap(taskYamlNode)) {
      dispose(task$.value)
      task$.set(undefined)
    } else if (WritableInlineTaskBlockManifest.is(task$.value)) {
      task$.value.onYamlParentUpdated(taskYamlNode)
    } else {
      dispose(task$.value)
      task$.set(new WritableInlineTaskBlockManifest(taskYamlNode))
    }

    valDisposer = task$.reaction((task) => {
      if (WritableInlineTaskBlockManifest.is(task)) {
        setYamlNodeValue(nextYamlParent, key, task.yamlParent)
      } else if (task) {
        setYamlNodeValue(nextYamlParent, key, task)
      } else {
        deleteYamlNode(nextYamlParent, key)
      }
    }, true)
  }

  onYamlParentUpdated(yamlParent)

  return [task$, onYamlParentUpdated]
}
