import type { Draft } from './api.ts'
import type { ProjectChanges } from './designer/projectChanges.ts'

import { describe, expect, it } from 'vitest'
import { remoteChangeTargets } from './designer/remoteChangeTargets.ts'
import { revisionView } from './revisionView.ts'

const target = { id: 'main', kind: 'flow' } as const

function draft(nodes: Draft['content']['document']['flows'][string]['graph']['nodes']): Draft {
  return {
    actorId: 'actor',
    content: {
      document: {
        bindings: {},
        flows: {
          main: { graph: { nodes: { ...nodes, trigger: { inputsDef: [], kind: 'webhook', name: 'Webhook' } } }, name: 'Main' },
          secondary: { graph: { nodes: {} }, name: 'Secondary' },
        },
        subflows: {
          shared: {
            graph: { nodes: {} },
            inputs: {},
            name: 'Shared',
            outputs: {},
          },
        },
        tasks: {
          shared: {
            executor: { kind: 'llm', mode: 'chat' },
            inputs: {},
            name: 'Shared task',
            outputs: {},
          },
        },
      },
      modelVersion: 1,
      modules: { module: { imports: [], name: 'Module', source: 'export default function run() {}' } },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    digest: 'digest',
    modelVersion: 1,
    parentRevisionId: null,
    projectId: 'project',
    revisionId: 'revision',
    version: 1,
  }
}

const condition = {
  cases: [{ expressions: [], output: 'true', relation: 'all' as const }],
  concurrency: 1,
  input: { handle: 'value', jsonSchema: {}, nullable: true, value: null },
  inputs: {},
  kind: 'condition' as const,
}

describe('remote Change targets', () => {
  it('merges create, replace, and edge operations for one node', () => {
    const before = revisionView(draft({}))
    const after = revisionView(draft({ created: condition }))
    const operations: ProjectChanges = [
      { kind: 'graph.node.create', node: condition, nodeId: 'created', target },
      { kind: 'graph.node.replace', node: { ...condition, concurrency: 2 }, nodeId: 'created', target },
      {
        edge: { source: 'created', sourceHandle: 'true', target: 'created', targetHandle: 'value' },
        kind: 'graph.edge.connect',
        target,
      },
    ]

    expect([...remoteChangeTargets(before, after, target, operations)]).toEqual(['created'])
  })

  it('maps Task, Module, Subflow, and Trigger changes to visible nodes', () => {
    const current = revisionView(
      draft({
        'subflow-node': { concurrency: 1, inputs: {}, kind: 'subflow', subflowId: 'shared' },
        'task-a': { concurrency: 1, inputs: {}, kind: 'task', taskId: 'shared' },
        'task-b': { concurrency: 1, inputs: {}, kind: 'task', taskId: 'shared' },
        'code': { concurrency: 1, inputs: {}, kind: 'task', task: { inputs: {}, moduleId: 'module', name: 'Code', outputs: {} } },
      }),
    )
    const task = current.task('shared')!
    const trigger = current.trigger('main', 'trigger')!

    expect([...remoteChangeTargets(current, current, target, [{ kind: 'task.replace', task, taskId: 'shared' }])].toSorted()).toEqual(['task-a', 'task-b'])
    expect(
      [
        ...remoteChangeTargets(current, current, target, [
          { imports: [], kind: 'module.source.replace', moduleId: 'module', source: 'export default function run() { return 1 }' },
        ]),
      ].toSorted(),
    ).toEqual(['code'])
    expect([
      ...remoteChangeTargets(current, current, target, [{ definition: current.subflow('shared')!, kind: 'subflow.definition.replace', subflowId: 'shared' }]),
    ]).toEqual(['subflow-node'])
    expect([...remoteChangeTargets(current, current, target, [{ kind: 'graph.node.replace', node: trigger, nodeId: 'trigger', target }])]).toEqual(['trigger'])
  })

  it('ignores edge-only, deletion, resource, and other-target changes', () => {
    const before = revisionView(draft({ deleted: condition }))
    const after = revisionView(draft({}))
    const operations: ProjectChanges = [
      { flowId: 'main', kind: 'flow.rename', name: 'Renamed' },
      { kind: 'graph.node.delete', nodeId: 'deleted', target },
      { kind: 'graph.node.replace', node: condition, nodeId: 'other', target: { id: 'secondary', kind: 'flow' } },
    ]

    expect([...remoteChangeTargets(before, after, target, operations)]).toEqual([])
  })

  it('drops a candidate that no longer exists in the final Draft', () => {
    const before = revisionView(draft({ removed: condition }))
    const after = revisionView(draft({}))

    expect([
      ...remoteChangeTargets(before, after, target, [
        { kind: 'graph.node.replace', node: { ...condition, concurrency: 2 }, nodeId: 'removed', target },
        { kind: 'graph.node.delete', nodeId: 'removed', target },
      ]),
    ]).toEqual([])
  })
})
