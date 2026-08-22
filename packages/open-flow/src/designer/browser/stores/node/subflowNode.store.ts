import type { ComputeGet, ReadonlyVal } from 'value-enhancer'
import type { HandleName, InputHandleDef, NodeId, OutputHandleDef } from '../../../../schema/index.ts'
import type { CommentNodeStore } from './commentNode.store.ts'
import type { GroupedInputHandleDef, GroupedOutputHandleDef } from './constants.ts'
import type { NodeStoreManifest$, NodeStoreDisplay$, NodeStoreProps } from './node.store.ts'

import { isDefined } from '@wopjs/cast'
import { isVal } from 'value-enhancer'
import { NODE_TYPE } from './constants.ts'
import { NodeStore } from './node.store.ts'

export interface SubflowNodeStoreManifest$ extends NodeStoreManifest$ {}

export interface SubflowNodeStoreDisplay$ extends NodeStoreDisplay$ {
  // A resolved subflow node always has a subflow path.
  readonly subflow: ReadonlyVal<string | undefined>
}

export interface SubflowNodeStoreProps extends NodeStoreProps<SubflowNodeStoreManifest$, SubflowNodeStoreDisplay$> {
  // The nested subflow designer does not expose this action.
  readonly openBlockDesigner?: () => void
}

export class SubflowNodeStore extends NodeStore<SubflowNodeStoreManifest$, SubflowNodeStoreDisplay$> {
  public readonly openBlockDesigner: (() => void) | undefined

  public static override is(store: unknown): store is SubflowNodeStore {
    return NodeStore.is(store) && store.nodeType === NODE_TYPE.SubflowNode
  }

  public constructor(nodeId: NodeId, props: SubflowNodeStoreProps) {
    super(nodeId, NODE_TYPE.SubflowNode, props)
    this.openBlockDesigner = props.openBlockDesigner
  }

  /** @internal */
  public getInputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): InputHandleDef | undefined {
    return get(this.display$.inputs_def)?.find((def: GroupedInputHandleDef): def is InputHandleDef => def.handle === handle)
  }

  /** @internal */
  public getOutputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): OutputHandleDef | undefined {
    return get(this.display$.outputs_def)?.find((def: GroupedOutputHandleDef): def is OutputHandleDef => def.handle === handle)
  }

  /** @internal */
  public getInputFrom(handle: HandleName): unknown {
    for (const input of this.display$.inputs_from?.value ?? []) {
      if (input.handle === handle && isDefined(input.value)) {
        return input.value
      }
    }
  }
}

export function toSubflowNodeStore(store: NodeStore | CommentNodeStore | undefined): SubflowNodeStore | undefined {
  return SubflowNodeStore.is(store) ? store : undefined
}
