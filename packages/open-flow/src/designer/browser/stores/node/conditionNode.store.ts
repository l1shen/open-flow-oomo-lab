import type { ComputeGet } from 'value-enhancer'
import type { HandleName, InputHandleDef, NodeId, OutputHandleDef } from '../../../../schema/index.ts'
import type { GroupedInputHandleDef } from './constants.ts'
import type { NodeStoreDisplay$, NodeStoreManifest$, NodeStoreProps } from './node.store.ts'

import { isDefined } from '@wopjs/cast'
import { isVal } from 'value-enhancer'
import { NODE_TYPE } from './constants.ts'
import { NodeStore } from './node.store.ts'

export interface ConditionNodeStoreManifest$ extends NodeStoreManifest$ {}

export interface ConditionNodeStoreDisplay$ extends NodeStoreDisplay$ {}

export interface ConditionNodeStoreProps extends NodeStoreProps<ConditionNodeStoreManifest$, ConditionNodeStoreDisplay$> {}

export class ConditionNodeStore extends NodeStore<ConditionNodeStoreManifest$, ConditionNodeStoreDisplay$> {
  public static override is(store: unknown): store is ConditionNodeStore {
    return NodeStore.is(store) && store.nodeType === NODE_TYPE.ConditionNode
  }

  public constructor(nodeId: NodeId, props: ConditionNodeStoreProps) {
    super(nodeId, NODE_TYPE.ConditionNode, props)
  }

  /** @internal */
  public getInputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): InputHandleDef | undefined {
    return get(this.display$.inputs_def)?.find((def: GroupedInputHandleDef): def is InputHandleDef => def.handle === handle)
  }

  /** @internal */
  public getOutputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): OutputHandleDef | undefined {
    return get(this.display$.outputs_def)?.find((def: GroupedInputHandleDef): def is OutputHandleDef => def.handle === handle)
  }

  /** @internal */
  public getInputFrom(handle: HandleName): unknown {
    const inputsFrom = this.display$.inputs_from?.value ?? []
    for (const input of inputsFrom) {
      if (input.handle === handle && isDefined(input.value)) {
        return input.value
      }
    }
  }
}
