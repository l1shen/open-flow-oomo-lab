import type { ChangeOperation } from './change.ts'

export function createFlow(flowId: string, name: string): readonly ChangeOperation[] {
  return [{ flow: { graph: { nodes: {} }, name }, flowId, kind: 'flow.create' }]
}

export function renameFlow(flowId: string, name: string): readonly ChangeOperation[] {
  return [{ flowId, kind: 'flow.rename', name }]
}

export function deleteFlow(flowId: string): readonly ChangeOperation[] {
  return [{ flowId, kind: 'flow.delete' }]
}
