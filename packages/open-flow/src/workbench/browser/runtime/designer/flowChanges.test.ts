import type { Draft } from '../api.ts'

import { describe, expect, it } from 'vitest'
import { revisionView } from '../revisionView.ts'
import { addNode, applyFlowChanges, updateCodeTaskPorts } from './flowChanges.ts'

function draft(source: string): Draft {
  return {
    actorId: 'actor',
    content: {
      document: {
        bindings: {},
        graph: {
          nodes: {
            task: {
              concurrency: 1,
              inputs: {},
              kind: 'task',
              name: 'Code',
              task: {
                inputs: [{ handle: 'value', jsonSchema: {}, nullable: true }],
                moduleId: 'module',
                name: 'Code',
                outputs: [{ handle: 'result', jsonSchema: {}, nullable: true }],
              },
            },
          },
        },
        subflows: {},
        tasks: {},
      },
      modelVersion: 1,
      modules: { module: { imports: [], name: 'Code', source } },
    },
    createdAt: '2026-08-26T00:00:00.000Z',
    digest: 'digest',
    flowId: 'flow',
    modelVersion: 1,
    parentRevisionId: null,
    revisionId: 'revision',
    version: 1,
  }
}

describe('Code task port changes', () => {
  it('uses the node ID for a new code module', () => {
    const current = draft('export default () => {}\n')
    const changes = addNode(revisionView(current), { kind: 'flow' }, 'new-code', { kind: 'code', name: 'New code' }, () => 'unused')

    if (changes == null) throw new Error('Expected code task changes.')
    const changed = applyFlowChanges(current, changes)
    expect(changed.content.document.graph.nodes['new-code']).toMatchObject({ task: { moduleId: 'new-code' } })
    expect(changed.content.modules['new-code']).toMatchObject({ name: 'New code' })
  })

  it('updates an intact generated metadata region with the port contract', () => {
    const current = draft(
      ['//#region generated meta', '/**', ' * @typedef {{}} Inputs', ' * @typedef {{}} Outputs', ' */', '//#endregion', '', 'export default () => {}', ''].join(
        '\n',
      ),
    )
    const changes = updateCodeTaskPorts(revisionView(current), { kind: 'flow' }, 'task', {
      inputs: [{ handle: 'prompt', jsonSchema: { type: 'string' }, nullable: false }],
      outputs: [{ handle: 'count', jsonSchema: { type: 'number' }, nullable: false }],
    })

    if (changes == null) throw new Error('Expected code task port changes.')
    const changed = applyFlowChanges(current, changes)
    expect(changed.content.modules.module?.source).toContain(' *   prompt: string;')
    expect(changed.content.modules.module?.source).toContain(' *   count: number;')
    expect(changed.content.document.graph.nodes.task).toMatchObject({ task: { inputs: [{ handle: 'prompt' }], outputs: [{ handle: 'count' }] } })
  })

  it('does not recreate a removed generated metadata region', () => {
    const current = draft('export default (input) => ({ result: input.value })\n')
    const changes = updateCodeTaskPorts(revisionView(current), { kind: 'flow' }, 'task', {
      inputs: [{ handle: 'prompt', jsonSchema: { type: 'string' }, nullable: false }],
      outputs: [{ handle: 'count', jsonSchema: { type: 'number' }, nullable: false }],
    })

    if (changes == null) throw new Error('Expected code task port changes.')
    expect(applyFlowChanges(current, changes).content.modules.module?.source).toBe(current.content.modules.module?.source)
  })
})
