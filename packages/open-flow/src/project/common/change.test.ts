import type { ChangeOperation, GraphNode, RevisionContent } from './change.ts'

import { describe, expect, it } from 'vitest'
import { applyProjectChanges, ProjectChangeError } from './change.ts'

const port = { jsonSchema: {}, nullable: false } as const
const target = { id: 'main', kind: 'flow' } as const

function revision(): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: { main: { graph: { nodes: {} }, name: 'Main' } },
      subflows: {},
      tasks: {},
    },
    modelVersion: 1,
    modules: {},
  }
}

function valueNode(value: number): GraphNode {
  return { concurrency: 1, inputs: {}, kind: 'value', values: { value: { ...port, value } } }
}

function taskNode(): GraphNode {
  return {
    concurrency: 1,
    inputs: {},
    kind: 'task',
    task: { inputs: { input: port }, moduleId: 'module-main', name: 'Task', outputs: { output: port } },
  }
}

describe('Project changes', () => {
  it('applies every resource lifecycle operation in order', () => {
    const subflow = { graph: { nodes: {} }, inputs: { input: port }, name: 'Child', outputs: { output: { ...port, sources: [] } } }
    const task = { executor: { kind: 'llm' as const, mode: 'chat' as const }, inputs: {}, name: 'Managed', outputs: {} }
    const operations: readonly ChangeOperation[] = [
      { binding: { kind: 'connection', target: 'connection-a' }, bindingId: 'binding', kind: 'binding.create' },
      { binding: { kind: 'connection', target: 'connection-b' }, bindingId: 'binding', kind: 'binding.replace' },
      { flow: { graph: { nodes: {} }, name: 'Secondary' }, flowId: 'secondary', kind: 'flow.create' },
      { flowId: 'secondary', kind: 'flow.rename', name: 'Renamed' },
      { kind: 'module.create', module: { imports: [], name: 'Module', source: 'export default () => 1' }, moduleId: 'module' },
      { imports: ['helper'], kind: 'module.source.replace', moduleId: 'module', source: 'export default () => 2' },
      { kind: 'module.rename', moduleId: 'module', name: 'Renamed module' },
      { kind: 'subflow.create', subflow, subflowId: 'child' },
      { definition: { ...subflow, inputs: {}, name: 'Renamed child', outputs: {} }, kind: 'subflow.definition.replace', subflowId: 'child' },
      { kind: 'task.create', task, taskId: 'managed' },
      { kind: 'task.replace', task: { ...task, executor: { kind: 'llm', mode: 'json' }, name: 'Replaced' }, taskId: 'managed' },
    ]

    const changed = applyProjectChanges(revision(), operations)

    expect(changed.document.bindings.binding).toEqual({ kind: 'connection', target: 'connection-b' })
    expect(changed.document.flows.secondary?.name).toBe('Renamed')
    expect(changed.modules.module).toEqual({ imports: ['helper'], name: 'Renamed module', source: 'export default () => 2' })
    expect(changed.document.subflows.child).toEqual({ graph: { nodes: {} }, inputs: {}, name: 'Renamed child', outputs: {} })
    expect(changed.document.tasks.managed).toMatchObject({ executor: { kind: 'llm', mode: 'json' }, name: 'Replaced' })

    const removed = applyProjectChanges(changed, [
      { bindingId: 'binding', kind: 'binding.delete' },
      { flowId: 'secondary', kind: 'flow.delete' },
      { kind: 'module.delete', moduleId: 'module' },
      { kind: 'subflow.delete', subflowId: 'child' },
      { kind: 'task.delete', taskId: 'managed' },
    ])
    expect(removed).toEqual(revision())
  })

  it('connects, replaces, disconnects, and deletes graph nodes while removing their sources', () => {
    const created = applyProjectChanges(revision(), [
      { kind: 'graph.node.create', node: valueNode(1), nodeId: 'source', target },
      { kind: 'graph.node.create', node: taskNode(), nodeId: 'target', target },
      {
        edge: { source: 'source', sourceHandle: 'value', target: 'target', targetHandle: 'input' },
        kind: 'graph.edge.connect',
        target,
      },
      { kind: 'graph.node.replace', node: valueNode(2), nodeId: 'source', target },
    ])
    expect(created.document.flows.main?.graph.nodes.source).toEqual(valueNode(2))
    expect(created.document.flows.main?.graph.nodes.target).toMatchObject({
      inputs: { input: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'source', output: 'value' }] } },
    })

    const disconnected = applyProjectChanges(created, [
      {
        edge: { source: 'source', sourceHandle: 'value', target: 'target', targetHandle: 'input' },
        kind: 'graph.edge.disconnect',
        target,
      },
    ])
    expect(disconnected.document.flows.main?.graph.nodes.target).toMatchObject({ inputs: {} })

    const connected = applyProjectChanges(disconnected, [
      {
        edge: { source: 'source', sourceHandle: 'value', target: 'target', targetHandle: 'input' },
        kind: 'graph.edge.connect',
        target,
      },
      { kind: 'graph.node.delete', nodeId: 'source', target },
    ])
    expect(connected.document.flows.main?.graph.nodes).toEqual({ target: expect.objectContaining({ inputs: {} }) })
  })

  it('removes deleted Subflow node sources from its boundary outputs', () => {
    const source = revision()
    const withSubflow = applyProjectChanges(source, [
      {
        kind: 'subflow.create',
        subflow: {
          graph: { nodes: { source: valueNode(1) } },
          inputs: {},
          name: 'Child',
          outputs: { output: { ...port, sources: [{ kind: 'node', nodeId: 'source', output: 'value' }] } },
        },
        subflowId: 'child',
      },
      { kind: 'graph.node.delete', nodeId: 'source', target: { id: 'child', kind: 'subflow' } },
    ])

    expect(withSubflow.document.subflows.child).toMatchObject({ graph: { nodes: {} }, outputs: { output: { sources: [] } } })
  })

  it.each([
    { binding: { kind: 'secret', target: 'secret' }, bindingId: 'missing', kind: 'binding.replace' },
    { flow: { graph: { nodes: {} }, name: 'Duplicate' }, flowId: 'main', kind: 'flow.create' },
    { flowId: 'missing', kind: 'flow.rename', name: 'Missing' },
    { kind: 'module.delete', moduleId: 'missing' },
    { kind: 'subflow.delete', subflowId: 'missing' },
    { kind: 'task.delete', taskId: 'missing' },
    { kind: 'graph.node.create', node: { inputsDef: [], kind: 'webhook', name: 'Invalid' }, nodeId: 'trigger', target: { id: 'missing', kind: 'subflow' } },
  ] satisfies readonly ChangeOperation[])('rejects invalid operation %#', (operation) => {
    expect(() => applyProjectChanges(revision(), [operation])).toThrow(ProjectChangeError)
  })

  it('does not mutate the input when a later operation fails', () => {
    const source = revision()
    expect(() =>
      applyProjectChanges(source, [
        { flow: { graph: { nodes: {} }, name: 'Created' }, flowId: 'created', kind: 'flow.create' },
        { flowId: 'missing', kind: 'flow.delete' },
      ]),
    ).toThrow(ProjectChangeError)
    expect(source).toEqual(revision())
  })
})
