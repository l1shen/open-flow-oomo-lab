import type { ComputeGet, ReadonlyVal } from 'value-enhancer'
import type { HandleName } from '../../../../schema/index.ts'
import type { RFNodeId } from '../../base/rfHelpers.ts'
import type { CommentNodeStore } from './commentNode.store.ts'
import type { GroupedOutputHandleDef, OutputHandleDef } from './constants.ts'
import type { NodeStoreManifest$, NodeStoreDisplay$, NodeStoreProps } from './node.store.ts'

import { compute, isVal } from 'value-enhancer'
import { toRFNodeId } from '../../base/rfHelpers.ts'
import { INPUT_NODE_ID, NODE_TYPE } from './constants.ts'
import { NodeStore } from './node.store.ts'
import { SubflowInputSectionStore } from './nodeSection/subflowInputSection.store.ts'

export const RF_INPUT_NODE_ID: RFNodeId = /* @__PURE__ */ toRFNodeId(INPUT_NODE_ID, NODE_TYPE.InputNode)

export interface InputNodeStoreManifest$ extends NodeStoreManifest$ {}

export interface InputNodeStoreDisplay$ extends NodeStoreDisplay$ {}

export interface InputNodeStoreProps extends NodeStoreProps<InputNodeStoreManifest$, InputNodeStoreDisplay$> {}

export class InputNodeStore extends NodeStore<InputNodeStoreManifest$, InputNodeStoreDisplay$> {
  public readonly connected$: ReadonlyVal<boolean>

  public static override is(store: unknown): store is InputNodeStore {
    return NodeStore.is(store) && store.nodeType === NODE_TYPE.InputNode
  }

  public constructor(props: InputNodeStoreProps) {
    super(INPUT_NODE_ID, NODE_TYPE.InputNode, props)

    this.connected$ = this.dispose.add(compute((get) => !!get(get(this.display$.sections).find(SubflowInputSectionStore.is)?.$.connectedHandles)?.size))
  }

  /** @internal */
  public getOutputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): OutputHandleDef | undefined {
    return get(this.display$.outputs_def)?.find((def: GroupedOutputHandleDef): def is OutputHandleDef => def.handle === handle)
  }
}

export function toInputNodeStore(store: NodeStore | CommentNodeStore | undefined): InputNodeStore | undefined {
  return InputNodeStore.is(store) ? store : undefined
}
