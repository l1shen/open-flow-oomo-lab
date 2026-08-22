import type { ReadonlyVal } from 'value-enhancer'
import type { ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { HandleInputFrom, HandleOutputFrom, NodeId } from '../../../../schema/index.ts'
import type { NodeStore, NodeStoreDisplay$, NodeStoreManifest$ } from '../node/node.store.ts'
import type { SubflowNodeStore } from '../node/subflowNode.store.ts'
import type { EdgeId } from './edge.store.ts'
import type { ManifestConnection, ManifestConnectionTo } from './typings.ts'

import { compute } from 'value-enhancer'
import { shallowPlainObjectEqual } from '../../../../base/common/equality.ts'
import { isManifestNodeType, NODE_TYPE, OUTPUT_NODE_ID } from '../node/constants.ts'
import { EdgeStore, getRFEdgeId } from './edge.store.ts'

export function deriveEdgesFromNodes(
  nodes: ReadonlyReactiveMap<NodeId, NodeStore>,
  pseudoNodes: ReadonlyReactiveMap<NodeId, NodeStore> | undefined,
  flowNode: SubflowNodeStore | undefined,
  bindValidateConnection?: (edgeStore: EdgeStore) => void,
): ReadonlyVal<EdgeStore[]> {
  return compute((get) => {
    const edges: EdgeStore[] = []
    for (const nodeStore of get(nodes).values()) {
      if (!nodeStore.edges) {
        nodeStore.edges = nodeStore.dispose.add(deriveEdgesFromNode(nodeStore, nodes, flowNode, bindValidateConnection))
      }
      edges.push(...Object.values(get(nodeStore.edges)))
    }
    const outputNode = pseudoNodes && get(pseudoNodes).get(OUTPUT_NODE_ID)
    if (outputNode) {
      if (!outputNode.edges) {
        outputNode.edges = outputNode.dispose.add(deriveEdgesFromNode(outputNode, nodes, flowNode, bindValidateConnection))
      }
      edges.push(...Object.values(get(outputNode.edges)))
    }
    return edges
  })
}

function deriveEdgesFromNode(
  toNode: NodeStore,
  nodes: ReadonlyReactiveMap<NodeId, NodeStore>,
  flowNode: SubflowNodeStore | undefined,
  bindValidateConnection?: (edgeStore: EdgeStore) => void,
): ReadonlyVal<Record<EdgeId, EdgeStore>> {
  let lastEdgeStores: Record<EdgeId, EdgeStore> | undefined
  const edgeStores$ = compute(
    (get) => {
      const edgeStores: Record<EdgeId, EdgeStore> = {}
      const inputs_from = get(toNode.display$.inputs_from)
      if (inputs_from) {
        makeEdges(inputs_from, toNode, edgeStores, lastEdgeStores, nodes, flowNode, bindValidateConnection)
      }

      const outputs_from = get(toNode.display$.outputs_from)
      if (outputs_from) {
        makeEdges(outputs_from, toNode, edgeStores, lastEdgeStores, nodes, flowNode, bindValidateConnection)
      }

      if (lastEdgeStores) {
        for (const edgeStore of Object.values(lastEdgeStores)) {
          if (!edgeStores[edgeStore.edgeId]) {
            edgeStore.dispose()
          }
        }
      }

      lastEdgeStores = edgeStores
      return edgeStores
    },
    { equal: shallowPlainObjectEqual },
  )

  const dispose = edgeStores$.dispose
  edgeStores$.dispose = () => {
    dispose.call(edgeStores$)
    for (const edgeStore of Object.values(edgeStores$.value)) {
      edgeStore.dispose()
    }
  }

  return edgeStores$
}

function makeEdges(
  from: readonly HandleInputFrom[] | readonly HandleOutputFrom[],
  toNode: NodeStore<NodeStoreManifest$, NodeStoreDisplay$>,
  edgeStores: Record<EdgeId, EdgeStore>,
  lastEdgeStores: Record<EdgeId, EdgeStore> | undefined,
  nodes: ReadonlyReactiveMap<NodeId, NodeStore<NodeStoreManifest$, NodeStoreDisplay$>>,
  flowNode: SubflowNodeStore | undefined,
  bindValidateConnection?: (edgeStore: EdgeStore) => void,
) {
  for (const f of from) {
    const to = getEdgeUIConnectionTo(toNode, f)
    if (!to) {
      continue
    }

    if (f.from_node) {
      for (const source of f.from_node) {
        const connection: ManifestConnection = { from: { type: 'from_node', source }, to }
        const rfEdgeId = getRFEdgeId(connection)
        edgeStores[rfEdgeId] = lastEdgeStores?.[rfEdgeId] ?? new EdgeStore(rfEdgeId, { nodes, flowNode, connection })
        bindValidateConnection?.(edgeStores[rfEdgeId])
      }
    }

    if (f.from_flow) {
      // from_flow only exists when the designer has pseudo nodes.
      if (flowNode) {
        for (const source of f.from_flow) {
          const connection: ManifestConnection = { from: { type: 'from_flow', source }, to }
          const rfEdgeId = getRFEdgeId(connection)
          edgeStores[rfEdgeId] = lastEdgeStores?.[rfEdgeId] ?? new EdgeStore(rfEdgeId, { nodes, flowNode, connection })
          bindValidateConnection?.(edgeStores[rfEdgeId])
        }
      }
    }
  }
}

function getEdgeUIConnectionTo(node: NodeStore, from: HandleInputFrom | HandleOutputFrom): ManifestConnectionTo | null {
  if (isManifestNodeType(node.nodeType)) {
    return {
      type: 'to_node',
      target: { node_id: node.nodeId, input_handle: from.handle },
    }
  } else if (node.nodeType === NODE_TYPE.OutputNode) {
    return {
      type: 'to_flow',
      target: { output_handle: from.handle },
    }
  } else {
    return null
  }
}
