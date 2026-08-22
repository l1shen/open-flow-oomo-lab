import type { ComputeGet } from 'value-enhancer'
import type { HandleName, InputHandleDef, NodeId, ValueHandleDef } from '../../../../schema/index.ts'
import type { GroupedInputHandleDef } from './constants.ts'
import type { NodeStoreDisplay$, NodeStoreManifest$, NodeStoreProps } from './node.store.ts'

import { isVal } from 'value-enhancer'
import { NODE_TYPE } from './constants.ts'
import { NodeStore } from './node.store.ts'
import { ValueSectionStore } from './nodeSection/valueSection.store.ts'

export interface ValueNodeStoreManifest$ extends NodeStoreManifest$ {}

export interface ValueNodeStoreDisplay$ extends NodeStoreDisplay$ {}

export interface ValueNodeStoreProps extends NodeStoreProps<ValueNodeStoreManifest$, ValueNodeStoreDisplay$> {}

export class ValueNodeStore extends NodeStore<ValueNodeStoreManifest$, ValueNodeStoreDisplay$> {
  public static override is(store: unknown): store is ValueNodeStore {
    return NodeStore.is(store) && store.nodeType === NODE_TYPE.ValueNode
  }

  public constructor(nodeId: NodeId, props: ValueNodeStoreProps) {
    super(nodeId, NODE_TYPE.ValueNode, props)
  }

  /**
   * Initializes the handle when a connection creates a value node.
   * @internal
   */
  public setupHandle(def: InputHandleDef, value: unknown): void {
    this.display$.sections.value.find(ValueSectionStore.is)?.addNewHandleFromInputDef(def, value)
  }

  /**
   * Resolves the handle type when a connection creates an inline task.
   * @internal
   */
  public getOutputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): ValueHandleDef | undefined {
    return get(this.display$.inputs_def)?.find((def: GroupedInputHandleDef): def is ValueHandleDef => def.handle === handle)
  }
}
