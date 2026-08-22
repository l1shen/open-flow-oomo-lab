import type { Draft } from './api.ts'

import { describe, expect, it } from 'vitest'
import { revisionView } from './revisionView.ts'

function draft(): Draft {
  return {
    actorId: 'actor-1',
    content: {
      document: {
        bindings: {},
        flows: {
          main: {
            graph: {
              nodes: {
                code: {
                  concurrency: 1,
                  inputs: {},
                  kind: 'task',
                  task: { inputs: {}, moduleId: 'shared-module', name: 'Code task', outputs: {} },
                },
                connector: { concurrency: 1, inputs: {}, kind: 'task', taskId: 'connector-task' },
                nested: { concurrency: 1, inputs: {}, kind: 'subflow', subflowId: 'middle' },
              },
            },
            name: 'Main',
          },
          secondary: {
            graph: { nodes: { nested: { concurrency: 1, inputs: {}, kind: 'subflow', subflowId: 'leaf' } } },
            name: 'Secondary',
          },
        },
        subflows: {
          leaf: {
            graph: { nodes: { cycle: { concurrency: 1, inputs: {}, kind: 'subflow', subflowId: 'middle' } } },
            inputs: {},
            name: 'Leaf',
            outputs: {},
          },
          middle: {
            graph: { nodes: { nested: { concurrency: 1, inputs: {}, kind: 'subflow', subflowId: 'leaf' } } },
            inputs: {},
            name: 'Middle',
            outputs: {},
          },
        },
        tasks: {
          'connector-task': {
            executor: { action: 'github.create_issue', kind: 'connector' },
            inputs: {},
            name: 'Connector task',
            outputs: {},
          },
        },
      },
      modelVersion: 1,
      modules: {
        'shared-module': { imports: [], name: 'Shared', source: 'export default function run() {}' },
      },
    },
    createdAt: '2026-08-12T00:00:00.000Z',
    digest: 'digest-1',
    modelVersion: 1,
    parentRevisionId: null,
    projectId: 'project-1',
    revisionId: 'revision-1',
    version: 1,
  }
}

describe('RevisionView', () => {
  it('resolves targets and node definitions from one revision', () => {
    const revision = draft()
    const view = revisionView(revision)

    expect(revisionView(revision)).toBe(view)
    expect(view.flow('main')?.name).toBe('Main')
    const code = view.node({ id: 'main', kind: 'flow' }, 'code')
    expect(code).toMatchObject({
      definition: { name: 'Code task' },
      id: 'code',
      kind: 'task',
      module: { name: 'Shared' },
    })
    expect(view.node({ id: 'main', kind: 'flow' }, 'code')).toBe(code)
    expect(view.node({ id: 'main', kind: 'flow' }, 'nested')).toMatchObject({ definition: { name: 'Middle' }, kind: 'subflow' })
    expect(view.node({ id: 'missing', kind: 'flow' }, 'code')).toBeUndefined()
  })

  it('indexes reverse relationships and isolates different revision objects', () => {
    const revision = draft()
    const view = revisionView(revision)
    const main = { id: 'main', kind: 'flow' as const }

    expect(view.findModuleNode(main, 'shared-module')).toBe('code')
    expect(view.findTaskNode(main, new Set(['connector-task']))).toBe('connector')
    expect([...view.connectorActionIds]).toEqual(['github.create_issue'])
    expect(view.flowIdsUsingSubflow('leaf')).toEqual(['main', 'secondary'])
    expect(view.flowIdsUsingSubflow('missing')).toEqual([])

    expect(revisionView({ ...revision, revisionId: 'revision-2' })).not.toBe(view)
  })
})
