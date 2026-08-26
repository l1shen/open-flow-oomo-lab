import type { GraphNode } from '../api.ts'
import type { RevisionView } from '../revisionView.ts'
import type { DesignerTarget, FlowChanges } from './flowChanges.ts'

function sameTarget(left: DesignerTarget, right: DesignerTarget): boolean {
  return left.kind == right.kind && (left.kind != 'subflow' || (right.kind == 'subflow' && left.id == right.id))
}

function addMatchingNodes(targets: Set<string>, revision: RevisionView, target: DesignerTarget, matches: (node: GraphNode) => boolean): void {
  for (const [nodeId, node] of Object.entries(revision.graph(target)?.nodes ?? {})) {
    if (matches(node)) targets.add(nodeId)
  }
}

export function remoteChangeTargets(before: RevisionView, after: RevisionView, target: DesignerTarget, operations: FlowChanges): ReadonlySet<string> {
  const targets = new Set<string>()
  for (const operation of operations) {
    switch (operation.kind) {
      case 'graph.node.create':
      case 'graph.node.replace':
        if (sameTarget(operation.target, target)) targets.add(operation.nodeId)
        break
      case 'task.replace':
        addMatchingNodes(targets, before, target, (node) => node.kind == 'task' && node.task == null && node.taskId == operation.taskId)
        addMatchingNodes(targets, after, target, (node) => node.kind == 'task' && node.task == null && node.taskId == operation.taskId)
        break
      case 'module.source.replace': {
        addMatchingNodes(targets, before, target, (node) => node.kind == 'task' && node.task?.moduleId == operation.moduleId)
        addMatchingNodes(targets, after, target, (node) => node.kind == 'task' && node.task?.moduleId == operation.moduleId)
        break
      }
      case 'subflow.definition.replace':
        addMatchingNodes(targets, before, target, (node) => node.kind == 'subflow' && node.subflowId == operation.subflowId)
        addMatchingNodes(targets, after, target, (node) => node.kind == 'subflow' && node.subflowId == operation.subflowId)
        break
      case 'binding.create':
      case 'binding.delete':
      case 'binding.replace':
      case 'graph.edge.connect':
      case 'graph.edge.disconnect':
      case 'graph.node.delete':
      case 'module.create':
      case 'module.delete':
      case 'module.rename':
      case 'subflow.create':
      case 'subflow.delete':
      case 'task.create':
      case 'task.delete':
        break
      default:
        operation satisfies never
    }
  }
  return new Set([...targets].filter((nodeId) => after.selection(target, nodeId) != null))
}
