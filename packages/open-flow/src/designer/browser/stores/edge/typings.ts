import type { HandleFromFlow, HandleFromNode, HandleName, NodeId } from '../../../../schema/index.ts'

export type { HandleFromFlow, HandleFromNode }

export interface FlowDataTarget {
  output_handle: HandleName
}

export interface NodeDataTarget {
  node_id: NodeId
  input_handle: HandleName
}

export type ManifestConnectionFrom =
  | {
      type: 'from_node'
      source: HandleFromNode
    }
  | {
      type: 'from_flow'
      source: HandleFromFlow
    }

export type ManifestConnectionTo =
  | {
      type: 'to_node'
      target: NodeDataTarget
    }
  | {
      type: 'to_flow'
      target: FlowDataTarget
    }

export interface ManifestConnection {
  from: ManifestConnectionFrom
  to: ManifestConnectionTo
}
