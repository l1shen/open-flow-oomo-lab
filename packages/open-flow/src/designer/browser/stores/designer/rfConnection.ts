import type { ComputeGet, ReadonlyVal } from 'value-enhancer'
import type { ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { HandleName, NodeId } from '../../../../schema/index.ts'
import type { RFHandleName, RFNodeId } from '../../base/rfHelpers.ts'
import type { ManifestConnectionFrom, ManifestConnectionTo } from '../edge/typings.ts'
import type { NodeStore } from '../node/node.store.ts'

import { isVal } from 'value-enhancer'
import { getRFNodeType, RF_NODE_TYPE, toManifestHandleName, toManifestNodeId } from '../../base/rfHelpers.ts'
import { INPUT_NODE_ID, NODE_TYPE, OUTPUT_NODE_ID } from '../node/constants.ts'

interface IHasHandle {
  readonly handle: HandleName
}

function searchHandleDefs<HandleDef extends IHasHandle>(
  defs$: ReadonlyVal<(HandleDef | { readonly handle?: undefined; readonly group: string })[] | undefined> | undefined,
  handle: HandleName,
  get: ComputeGet = (v) => (isVal(v) ? v.value : v),
): HandleDef | undefined {
  return get(defs$)?.find((def): def is HandleDef => def.handle === handle)
}

export function decodeRFSourceHandle(
  nodes: ReadonlyReactiveMap<NodeId, NodeStore>,
  pseudoNodes_: ReadonlyReactiveMap<NodeId, NodeStore> | undefined,
  rfNodeId: RFNodeId,
  rfSourceHandle: RFHandleName,
  get: ComputeGet = (v) => (isVal(v) ? v.value : v),
): ManifestConnectionFrom | undefined {
  let sourceNodeId: NodeId
  let sourceNode: NodeStore | undefined

  const pseudoNodes = get(pseudoNodes_)
  const nodeType = getRFNodeType(rfNodeId)
  if (nodeType === RF_NODE_TYPE.InputNode && pseudoNodes?.has(INPUT_NODE_ID)) {
    sourceNode = pseudoNodes.get(INPUT_NODE_ID)!
    sourceNodeId = sourceNode.nodeId
  } else if (nodeType === RF_NODE_TYPE.OutputNode && pseudoNodes?.has(OUTPUT_NODE_ID)) {
    sourceNode = pseudoNodes.get(OUTPUT_NODE_ID)!
    sourceNodeId = sourceNode.nodeId
  } else {
    sourceNodeId = toManifestNodeId(rfNodeId)
    sourceNode = get(nodes).get(sourceNodeId)
  }

  if (!sourceNode || sourceNode.nodeType === NODE_TYPE.ErrorNode) return

  const handle = searchHandleDefs(sourceNode.display$.outputs_def, toManifestHandleName(rfSourceHandle), get)?.handle

  if (handle) {
    if (sourceNode.nodeType === NODE_TYPE.InputNode) {
      return { type: 'from_flow', source: { input_handle: handle } }
    } else {
      return {
        type: 'from_node',
        source: { node_id: sourceNodeId, output_handle: handle },
      }
    }
  }
}

export function decodeRFTargetHandle(
  nodes: ReadonlyReactiveMap<NodeId, NodeStore>,
  pseudoNodes_: ReadonlyReactiveMap<NodeId, NodeStore> | undefined,
  rfNodeId: RFNodeId,
  rfTargetHandle: RFHandleName,
  get: ComputeGet = (v) => (isVal(v) ? v.value : v),
): ManifestConnectionTo | undefined {
  let targetNodeId: NodeId
  let targetNode: NodeStore | undefined

  const pseudoNodes = get(pseudoNodes_)
  const nodeType = getRFNodeType(rfNodeId)
  if (nodeType === RF_NODE_TYPE.InputNode && pseudoNodes?.has(INPUT_NODE_ID)) {
    targetNode = pseudoNodes.get(INPUT_NODE_ID)!
    targetNodeId = targetNode.nodeId
  } else if (nodeType === RF_NODE_TYPE.OutputNode && pseudoNodes?.has(OUTPUT_NODE_ID)) {
    targetNode = pseudoNodes.get(OUTPUT_NODE_ID)!
    targetNodeId = targetNode.nodeId
  } else {
    targetNodeId = toManifestNodeId(rfNodeId)
    targetNode = get(nodes).get(targetNodeId)
  }

  if (!targetNode || targetNode.nodeType === NODE_TYPE.ErrorNode) return

  const handle = searchHandleDefs(targetNode.display$.inputs_def, toManifestHandleName(rfTargetHandle), get)?.handle

  if (handle) {
    if (targetNode.nodeType === NODE_TYPE.OutputNode) {
      return { type: 'to_flow', target: { output_handle: handle } }
    } else {
      return {
        type: 'to_node',
        target: { node_id: targetNodeId, input_handle: handle },
      }
    }
  }
}
