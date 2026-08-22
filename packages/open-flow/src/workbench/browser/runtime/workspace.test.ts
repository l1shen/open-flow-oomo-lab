import type { ConnectorAction, Draft, Flow, Run, RunEvent } from './api.ts'

import { describe, expect, it } from 'vitest'
import { designerGraph, eventSubject, initialFlow, removeComments, setComment, setFlowViewport, setNodePosition } from './workspace.ts'

const flows: readonly Flow[] = [
  { draft: null, flowId: 'live-only', hasUnpublishedChanges: false, live: null },
  {
    draft: { closureDigest: 'closure', name: 'Main', revisionDigest: 'digest', revisionId: 'revision-a' },
    flowId: 'main',
    hasUnpublishedChanges: true,
    live: null,
  },
]

const draft: Draft = {
  actorId: 'actor',
  content: {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              filter: {
                concurrency: 1,
                inputs: {
                  value: {
                    kind: 'sources',
                    sources: [
                      { kind: 'node', nodeId: 'webhook', output: 'result' },
                      { kind: 'node', nodeId: 'webhook', output: 'result' },
                    ],
                  },
                },
                cases: [{ expressions: [], output: 'matched', relation: 'all' }],
                input: { handle: 'value', jsonSchema: {}, nullable: false },
                kind: 'condition',
              },
              webhook: {
                concurrency: 1,
                inputs: {},
                kind: 'task',
                task: {
                  inputs: {},
                  moduleId: 'receive-module',
                  name: 'Receive webhook',
                  outputs: { result: { jsonSchema: {}, nullable: false } },
                },
              },
            },
          },
          name: 'Main',
        },
      },
      subflows: {},
      tasks: {},
    },
    modelVersion: 1,
    modules: { 'receive-module': { imports: [], name: 'Receive webhook', source: 'export default function run() {}' } },
  },
  createdAt: '2026-08-10T00:00:00.000Z',
  digest: 'digest',
  modelVersion: 1,
  parentRevisionId: null,
  projectId: 'project-a',
  revisionId: 'revision-a',
  version: 1,
}

const main = { id: 'main', kind: 'flow' as const }

function runEvent(payload: RunEvent['payload']): RunEvent {
  return {
    createdAt: '2026-08-10T00:00:00.000Z',
    kind: 'node.started',
    payload,
    sequence: 1,
  }
}

describe('workspace selection', () => {
  it('selects only editable Draft Flows as a reconciliation fallback', () => {
    expect(initialFlow(flows, 'live-only')?.flowId).toBe('main')
    expect(initialFlow(flows, 'missing')?.flowId).toBe('main')
  })
})

describe('Designer graph', () => {
  it('projects Comment nodes from Presentation without changing the Draft graph', () => {
    const presented = setComment({}, main, 'comment-1', {
      content: 'Explain **why** this branch exists.',
      position: { x: 24, y: 36 },
      title: 'Comment #1',
    })
    const graph = designerGraph(draft, main, presented)

    expect(graph.nodes.find((node) => node.kind == 'comment')).toEqual({
      content: 'Explain **why** this branch exists.',
      id: 'comment-1',
      kind: 'comment',
      position: { x: 24, y: 36 },
      title: 'Comment #1',
    })
    expect(designerGraph(draft, main, removeComments(presented, main, new Set(['comment-1']))).nodes.some((node) => node.kind == 'comment')).toBe(false)
  })

  it('projects Draft nodes, ports, and exact source mappings', () => {
    const graph = designerGraph(draft, main)
    const nodes = graph.nodes.filter((node) => node.kind != 'comment')

    expect(nodes.map((node) => [node.id, node.title, node.inputs.map((port) => port.handle), node.outputs.map((port) => port.handle)])).toEqual([
      ['webhook', 'Receive webhook', [], ['result']],
      ['filter', 'Condition', ['value'], ['matched']],
    ])
    expect(nodes[1]?.inputs[0]?.sources).toEqual([{ nodeId: 'webhook', output: 'result' }])
    expect(graph.edges).toEqual([
      {
        id: '["webhook","result","filter","value"]',
        source: 'webhook',
        sourceHandle: 'result',
        target: 'filter',
        targetHandle: 'value',
      },
    ])
    expect(graph.nodes[0]!.position.x).toBeLessThan(graph.nodes[1]!.position.x)
  })

  it('projects attached Triggers as native source nodes with payload edges', () => {
    const triggered: Draft = {
      ...draft,
      content: {
        ...draft.content,
        document: {
          ...draft.content.document,
          flows: {
            main: {
              ...draft.content.document.flows.main!,
              graph: {
                nodes: {
                  ...draft.content.document.flows.main!.graph.nodes,
                  filter: {
                    cases: [{ expressions: [], output: 'matched', relation: 'all' }],
                    concurrency: 1,
                    input: { handle: 'value', jsonSchema: {}, nullable: false },
                    inputs: { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'incoming', output: 'payload' }] } },
                    kind: 'condition',
                  },
                  incoming: {
                    inputsDef: [{ handle: 'event', jsonSchema: { type: 'object' }, nullable: false }],
                    kind: 'webhook',
                    name: 'Incoming webhook',
                    options: { allowedMethods: ['POST'] },
                  },
                },
              },
            },
          },
        },
      },
    }

    const graph = designerGraph(triggered, main)

    expect(graph.nodes.find((node) => node.id == 'incoming')).toMatchObject({
      icon: ':carbon:webhook:',
      inputs: [],
      kind: 'trigger',
      outputs: [
        {
          handle: 'payload',
          jsonSchema: {
            additionalProperties: false,
            properties: { event: { type: 'object' } },
            required: ['event'],
            type: 'object',
          },
        },
      ],
      presentation: {
        kind: 'webhook',
        schedules: [],
        webhook: {
          inputs: [{ handle: 'event', jsonSchema: { type: 'object' }, nullable: false }],
          options: { allowedMethods: ['POST'] },
        },
      },
      title: 'Incoming webhook',
    })
    const filter = graph.nodes.find((node) => node.id == 'filter')
    expect(filter?.kind).toBe('condition')
    expect(filter?.kind == 'condition' ? filter.inputs[0]?.sources : undefined).toEqual([{ nodeId: 'incoming', output: 'payload' }])
    expect(graph.edges).toContainEqual({
      id: '["incoming","payload","filter","value"]',
      source: 'incoming',
      sourceHandle: 'payload',
      target: 'filter',
      targetHandle: 'value',
    })
  })

  it('projects Provider Trigger config schemas into editable node fields', () => {
    const configured: Draft = {
      ...draft,
      content: {
        ...draft.content,
        document: {
          ...draft.content.document,
          flows: {
            main: {
              graph: {
                nodes: {
                  issues: {
                    bindingId: 'github',
                    config: { events: ['issues'], private: true, repository: 'oomol/open-flow' },
                    definition: {
                      configSchema: {
                        properties: {
                          events: { items: { enum: ['issues', 'push'] }, minItems: 1, type: 'array' },
                          private: { title: 'Private only', type: 'boolean' },
                          repository: { description: 'Repository name.', title: 'Repository', type: 'string' },
                          state: { enum: ['open', 'closed'], title: 'State' },
                        },
                        required: ['events', 'repository'],
                        type: 'object',
                      },
                      definitionVersion: 1,
                      description: 'Run when an issue changes.',
                      displayName: 'GitHub Issue Event',
                      endpoint: {
                        body: { allowArray: false, allowEmpty: false, formats: ['json'] },
                        methods: ['POST'],
                        successStatus: 202,
                      },
                      key: 'github.issue_event',
                      name: 'issue_event',
                      payloadSchema: { type: 'object' },
                      provider: 'github',
                      type: 'integration',
                    },
                    kind: 'integration',
                    name: 'GitHub Issue Event',
                  },
                },
              },
              name: 'Main',
            },
          },
        },
      },
    }

    expect(designerGraph(configured, main).nodes[0]).toMatchObject({
      id: 'issues',
      presentation: {
        config: [
          { description: 'Repository name.', kind: 'string', label: 'Repository', name: 'repository', required: true, source: 'oomol/open-flow' },
          {
            kind: 'multi-select',
            label: 'events',
            name: 'events',
            options: [
              { label: 'issues', source: 'issues', value: 'issues' },
              { label: 'push', source: 'push', value: 'push' },
            ],
            required: true,
            selected: ['issues'],
            source: '["issues"]',
          },
          { kind: 'boolean', label: 'Private only', name: 'private', required: false, source: 'true' },
          {
            kind: 'select',
            label: 'State',
            name: 'state',
            options: [
              { label: 'open', source: 'open', value: 'open' },
              { label: 'closed', source: 'closed', value: 'closed' },
            ],
            required: false,
            source: '',
          },
        ],
        kind: 'integration',
        source: 'github',
      },
    })
    const path = '/document/flows/main/graph/nodes/issues/config'
    const incomplete = designerGraph(configured, main, undefined, [
      { code: 'trigger.config-incomplete', column: 0, line: 1, message: 'Complete the required Trigger config fields: repository.', path },
    ]).nodes[0]
    const invalid = designerGraph(configured, main, undefined, [
      { code: 'trigger.config-invalid', column: 0, line: 1, message: 'Trigger config is invalid.', path },
    ]).nodes[0]
    expect(incomplete?.kind == 'trigger' ? incomplete.diagnostics : undefined).toBe(0)
    expect(invalid?.kind == 'trigger' ? invalid.diagnostics : undefined).toBe(1)
  })

  it('projects the discovered Connector provider icon onto its Task node', () => {
    const managed: Draft = {
      ...draft,
      content: {
        ...draft.content,
        document: {
          ...draft.content.document,
          flows: {
            main: {
              graph: { nodes: { connector: { concurrency: 1, inputs: {}, kind: 'task', taskId: 'connector-task' } } },
              name: 'Main',
            },
          },
          tasks: {
            'connector-task': {
              executor: { action: 'github.create_issue', connectionId: 'github-work', kind: 'connector' },
              inputs: {},
              name: 'GitHub: Create Issue',
              outputs: {},
            },
          },
        },
      },
    }
    const action: ConnectorAction = {
      actionId: 'github.create_issue',
      description: 'Create an issue.',
      icon: 'https://assets.example/github.svg',
      inputs: {},
      name: 'GitHub: Create Issue',
      outputs: {},
      serviceId: 'github',
      serviceName: 'GitHub',
    }

    expect(designerGraph(managed, main, {}, [], { [action.actionId]: action }).nodes[0]).toMatchObject({ icon: action.icon })
  })

  it('projects only the matching Revision Run and clears active node state after terminal', () => {
    const run: Run = {
      createdAt: '2026-08-10T00:00:00.000Z',
      flowId: 'main',
      projectId: 'project-a',
      revisionId: 'revision-a',
      runId: 'run-a',
      source: 'draft',
      status: 'running',
      version: 1,
    }
    const events: RunEvent[] = [
      { createdAt: run.createdAt, kind: 'run.started', payload: { flowId: 'main', scopeId: 'scope-root' }, sequence: 1 },
      {
        createdAt: run.createdAt,
        kind: 'node.started',
        payload: { flowId: 'main', nodeId: 'webhook', scopeId: 'scope-root' },
        sequence: 2,
      },
      {
        createdAt: run.createdAt,
        kind: 'node.progress',
        payload: { flowId: 'main', nodeId: 'webhook', progress: 42, scopeId: 'scope-root' },
        sequence: 3,
      },
      {
        createdAt: run.createdAt,
        kind: 'node.failed',
        payload: { flowId: 'main', nodeId: 'webhook', scopeId: 'scope-nested' },
        sequence: 4,
      },
    ]

    const graph = designerGraph(draft, main, {}, [], {}, {}, undefined, run, events)

    expect(graph.runStatus).toBe('running')
    expect(graph.nodes.find((node) => node.id == 'webhook')).toMatchObject({ run: { progress: 42, status: 'running' } })
    expect(graph.nodes.find((node) => node.id == 'filter')).not.toHaveProperty('run')

    const live = designerGraph(draft, main, {}, [], {}, {}, undefined, { ...run, source: 'live' }, events)
    expect(live.nodes.find((node) => node.id == 'webhook')).toMatchObject({ run: { progress: 42, status: 'running' } })

    const stale = designerGraph(draft, main, {}, [], {}, {}, undefined, { ...run, revisionId: 'revision-older' }, events)
    expect(stale.runStatus).toBeUndefined()
    expect(stale.nodes.find((node) => node.id == 'webhook')).not.toHaveProperty('run')

    const canceled = designerGraph(draft, main, {}, [], {}, {}, undefined, { ...run, status: 'canceled' }, events)
    expect(canceled.runStatus).toBe('idle')
    expect(canceled.nodes.find((node) => node.id == 'webhook')).toMatchObject({ run: { progress: 42, status: 'idle' } })
  })

  it('returns an empty canvas when the selected Flow has no Draft graph', () => {
    expect(designerGraph(draft, { id: 'missing', kind: 'flow' })).toEqual({ edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } })
  })

  it('keeps an invalid cyclic Draft inspectable without looping', () => {
    const cyclic: Draft = {
      ...draft,
      content: {
        ...draft.content,
        document: {
          ...draft.content.document,
          flows: {
            main: {
              graph: {
                nodes: {
                  a: {
                    concurrency: 1,
                    inputs: { input: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'b', output: 'result' }] } },
                    kind: 'task',
                    taskId: 'receive',
                  },
                  b: {
                    concurrency: 1,
                    inputs: { input: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'a', output: 'result' }] } },
                    kind: 'task',
                    taskId: 'receive',
                  },
                },
              },
              name: 'Cyclic',
            },
          },
        },
      },
    }

    const graph = designerGraph(cyclic, main)

    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(graph.edges).toHaveLength(2)
  })

  it('round-trips node positions and viewport without replacing unrelated Presentation data', () => {
    const positioned = setNodePosition({ sidebar: { width: 240 } }, main, 'webhook', { x: 32, y: 48 })
    const value = setFlowViewport(positioned, main, { x: 100, y: -20, zoom: 0.8 })

    expect(value.sidebar).toEqual({ width: 240 })
    expect(setFlowViewport(value, main, { x: 100, y: -20, zoom: 0.8 })).toBe(value)
    expect(designerGraph(draft, main, value)).toMatchObject({
      nodes: [{ id: 'webhook', position: { x: 32, y: 48 } }, { id: 'filter' }],
      viewport: { x: 100, y: -20, zoom: 0.8 },
    })
  })

  it('does not persist the default viewport when no viewport was saved', () => {
    const value = {}

    expect(setFlowViewport(value, main, { x: 0, y: 0, zoom: 1 })).toBe(value)
  })

  it('keeps Subflow layout separate and maps closure diagnostics to its nodes', () => {
    const withSubflow: Draft = {
      ...draft,
      content: {
        ...draft.content,
        document: {
          ...draft.content.document,
          subflows: {
            shared: {
              graph: {
                nodes: {
                  task: {
                    concurrency: 1,
                    description: 'Processes the shared input.',
                    inputs: {},
                    kind: 'task',
                    task: {
                      inputs: {},
                      moduleId: 'receive-module',
                      name: 'Receive webhook',
                      outputs: { result: { jsonSchema: {}, nullable: false } },
                    },
                  },
                },
              },
              inputs: {},
              name: 'Shared',
              outputs: {},
            },
          },
        },
      },
    }
    const target = { id: 'shared', kind: 'subflow' as const }
    const value = setNodePosition({}, target, 'task', { x: 18, y: 24 })
    const graph = designerGraph(withSubflow, target, value, [
      { code: 'module.invalid', column: 3, line: 2, message: 'Invalid source.', path: '/modules/receive-module/source' },
    ])

    expect(value).toMatchObject({ designer: { subflows: { shared: { nodes: { task: { x: 18, y: 24 } } } } } })
    expect(graph.nodes[0]).toMatchObject({ description: 'Processes the shared input.', diagnostics: 1, id: 'task', position: { x: 18, y: 24 } })
  })
})

describe('run event copy', () => {
  it('prefers a projected node title, then the node identity', () => {
    expect(eventSubject(runEvent({ nodeId: 'node-a', nodeTitle: 'Update CRM' }))).toBe('Update CRM')
    expect(eventSubject(runEvent({ executionId: 'execution-a', nodeId: 'node-a' }), undefined, new Map([['execution-a', 'Update CRM']]))).toBe('Update CRM')
    expect(eventSubject(runEvent({ nodeId: 'node-a' }), undefined, new Map([['node-a', 'Update CRM']]))).toBe('Update CRM')
    expect(eventSubject(runEvent({ nodeId: 'node-a' }))).toBe('node-a')
    expect(eventSubject({ ...runEvent({}), kind: 'run.started' })).toBe('Flow run')
  })
})
