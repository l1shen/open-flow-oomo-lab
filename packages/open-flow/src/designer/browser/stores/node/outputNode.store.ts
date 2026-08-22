import type { ComputeGet, ReadonlyVal } from 'value-enhancer'
import type { HandleName } from '../../../../schema/index.ts'
import type { RFNodeId } from '../../base/rfHelpers.ts'
import type { CommentNodeStore } from './commentNode.store.ts'
import type { GroupedInputHandleDef, InputHandleDef } from './constants.ts'
import type { NodeStoreManifest$, NodeStoreDisplay$, NodeStoreProps } from './node.store.ts'

import { isDefined } from '@wopjs/cast'
import { compute, isVal } from 'value-enhancer'
import { toRFNodeId } from '../../base/rfHelpers.ts'
import { NODE_TYPE, OUTPUT_NODE_ID } from './constants.ts'
import { NodeStore } from './node.store.ts'
import { SubflowOutputSectionStore } from './nodeSection/subflowOutputSection.store.ts'

export const RF_OUTPUT_NODE_ID: RFNodeId = /* @__PURE__ */ toRFNodeId(OUTPUT_NODE_ID, NODE_TYPE.OutputNode)

export interface OutputNodeStoreManifest$ extends NodeStoreManifest$ {}

export interface OutputNodeStoreDisplay$ extends NodeStoreDisplay$ {}

export interface OutputNodeStoreProps extends NodeStoreProps<OutputNodeStoreManifest$, OutputNodeStoreDisplay$> {}

export class OutputNodeStore extends NodeStore<OutputNodeStoreManifest$, OutputNodeStoreDisplay$> {
  public readonly connected$: ReadonlyVal<boolean>

  public static override is(store: unknown): store is OutputNodeStore {
    return NodeStore.is(store) && store.nodeType === NODE_TYPE.OutputNode
  }

  public constructor(props: OutputNodeStoreProps) {
    super(OUTPUT_NODE_ID, NODE_TYPE.OutputNode, props)

    this.connected$ = this.dispose.add(compute((get) => !!get(get(this.display$.sections).find(SubflowOutputSectionStore.is)?.$.connectedHandles)?.size))
  }

  /** @internal */
  public getInputHandleDef(handle: HandleName, get: ComputeGet = (v) => (isVal(v) ? v.value : v)): InputHandleDef | undefined {
    return get(this.display$.inputs_def)?.find((def: GroupedInputHandleDef): def is InputHandleDef => def.handle === handle)
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

export function toOutputNodeStore(store: NodeStore | CommentNodeStore | undefined): OutputNodeStore | undefined {
  return OutputNodeStore.is(store) ? store : undefined
}
