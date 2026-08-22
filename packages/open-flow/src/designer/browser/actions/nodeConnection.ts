import type { FlowLikeMeta } from '../../../manifest/common/meta/flowLike/flowLikeMeta.ts'
import type { NodeMeta } from '../../../manifest/common/meta/nodeMeta.ts'
import type { HandleFromFlow, HandleFromNode } from '../../../schema/index.ts'
import type { ManifestConnection } from '../stores/edge/typings.ts'

import { dequal } from 'dequal/lite'
import { applyFlowEditOperations } from '../../../manifest/common/flowEdit.ts'
import { FlowMeta } from '../../../manifest/common/meta/flowMeta.ts'
import { WritableSubflowBlockManifest } from '../../../manifest/common/writable/block/writableSubflowBlockManifest.ts'

export function connect(flowLikeMeta: FlowLikeMeta, connection: ManifestConnection): void {
  const { from, to } = connection
  if (FlowMeta.is(flowLikeMeta) && from.type == 'from_node' && to.type == 'to_node') {
    applyFlowEditOperations(flowLikeMeta.manifest, [
      {
        type: 'connect',
        connection: {
          from: { nodeId: from.source.node_id, handle: from.source.output_handle },
          to: { nodeId: to.target.node_id, handle: to.target.input_handle },
        },
      },
    ])
    return
  }

  switch (to.type) {
    case 'to_node': {
      const node = flowLikeMeta.nodes.get(to.target.node_id)
      if (node) {
        const inputs_from$ = node.$.handleInputsFrom
        const replacement = inputs_from$.value?.slice() || []
        let index: number
        for (index = 0; index < replacement.length; index++) {
          if (replacement[index].handle === to.target.input_handle) break
        }
        const inputFrom = {
          ...replacement[index],
          handle: to.target.input_handle,
        }
        const fromNode = inputFrom[from.type as 'from_node']?.slice() || []
        if (fromNode.some((e) => dequal(e, from.source))) return
        fromNode.push(from.source as HandleFromNode)
        inputFrom[from.type as 'from_node'] = fromNode
        replacement[index] = inputFrom
        node.manifest.$$.inputs_from.set(replacement)
      }
      break
    }
    case 'to_flow': {
      if (WritableSubflowBlockManifest.is(flowLikeMeta.manifest)) {
        // X | InputNode --> OutputNode
        const handleOutputsFrom$ = flowLikeMeta.$.handleOutputsFrom
        const replacement = handleOutputsFrom$.value?.slice() || []
        let index: number
        for (index = 0; index < replacement.length; index++) {
          if (replacement[index].handle === to.target.output_handle) break
        }
        const outputFrom = {
          ...replacement[index],
          handle: to.target.output_handle,
        }
        const fromNode = outputFrom[from.type]?.slice() || ([] as (HandleFromFlow | HandleFromNode)[])
        if (fromNode.some((e) => dequal(e, from.source))) return
        fromNode.push(from.source)
        outputFrom[from.type] = fromNode as HandleFromFlow[] & HandleFromNode[]
        replacement[index] = outputFrom
        flowLikeMeta.manifest.$$.outputs_from.set(replacement)
      }
      break
    }
  }
}

export function disconnect(flowLikeMeta: FlowLikeMeta, connection: ManifestConnection): void {
  let node: NodeMeta | undefined
  const { from, to } = connection
  if (FlowMeta.is(flowLikeMeta) && from.type == 'from_node' && to.type == 'to_node') {
    applyFlowEditOperations(flowLikeMeta.manifest, [
      {
        type: 'disconnect',
        connection: {
          from: { nodeId: from.source.node_id, handle: from.source.output_handle },
          to: { nodeId: to.target.node_id, handle: to.target.input_handle },
        },
      },
    ])
    return
  }

  switch (to.type) {
    case 'to_node': {
      node = flowLikeMeta.nodes.get(to.target.node_id)
      if (node) {
        const inputsFrom = node.$.handleInputsFrom.value
        if (inputsFrom) {
          const index = inputsFrom.findIndex((e) => e.handle === to.target.input_handle)
          if (index >= 0) {
            const handleFrom = inputsFrom[index][from.type]
            if (handleFrom && handleFrom.length > 0) {
              const index2 = handleFrom.findIndex((e) => dequal(e, from.source))
              if (index2 >= 0) {
                const replacement = inputsFrom.toSpliced(index, 1, {
                  ...inputsFrom[index],
                  [from.type]: handleFrom.toSpliced(index2, 1),
                })
                node.manifest.$$.inputs_from.set(replacement)
              }
            }
          }
        }
      }
      break
    }
    case 'to_flow':
      if (WritableSubflowBlockManifest.is(flowLikeMeta.manifest)) {
        const outputsFrom = flowLikeMeta.$.handleOutputsFrom.value
        if (outputsFrom) {
          const index = outputsFrom.findIndex((e) => e.handle === to.target.output_handle)
          if (index >= 0) {
            const handleFrom = outputsFrom[index][from.type]
            if (handleFrom && handleFrom.length > 0) {
              const index2 = handleFrom.findIndex((e) => dequal(e, from.source))
              if (index2 >= 0) {
                const replacement = outputsFrom.toSpliced(index, 1, {
                  ...outputsFrom[index],
                  [from.type]: handleFrom.toSpliced(index2, 1),
                })
                flowLikeMeta.manifest.$$.outputs_from.set(replacement)
              }
            }
          }
        }
      }
      break
  }
}

export function disconnectEdges(flowLikeMeta: FlowLikeMeta, toRemoveConnections: Iterable<ManifestConnection>): void {
  for (const connection of toRemoveConnections) {
    disconnect(flowLikeMeta, connection)
  }
}
