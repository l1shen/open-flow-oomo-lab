import type {
  WorkbenchClient,
  ConnectorAction,
  ConnectorConnection,
  Draft,
  DraftChange,
  DraftSync,
  DraftRun,
  Flow,
  FlowCheck,
  Live,
  Presentation,
  Project,
  Publication,
  RunEvent,
  TriggerBinding,
  TriggerBindingDetail,
  TriggerKeySnapshot,
} from './api.ts'
import type { ProjectChangeEvent } from './contract.ts'

import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api.ts'
import { createI18n } from './i18n.ts'
import { WorkbenchStore } from './stores/workbenchStore.ts'

const project: Project = {
  createdAt: '2026-08-10T00:00:00.000Z',
  draftRevisionId: 'revision-1',
  name: 'Acme',
  projectId: 'project-1',
  status: 'active',
  updatedAt: '2026-08-10T00:00:00.000Z',
  version: 1,
}

function draft(revisionId = 'revision-1'): Draft {
  return {
    actorId: 'actor',
    content: {
      document: {
        bindings: {},
        flows: { main: { graph: { nodes: {} }, name: 'Main' } },
        subflows: {},
        tasks: {},
      },
      modelVersion: 1,
      modules: {},
    },
    createdAt: '2026-08-10T00:00:00.000Z',
    digest: `digest-${revisionId}`,
    modelVersion: 1,
    parentRevisionId: revisionId == 'revision-1' ? null : `revision-${Number(revisionId.slice('revision-'.length)) - 1}`,
    projectId: 'project-1',
    revisionId,
    version: 1,
  }
}

function draftWithNode(revisionId = 'revision-1', concurrency = 1, description?: string): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        flows: {
          main: {
            graph: {
              nodes: {
                first: {
                  cases: [{ expressions: [{ input: 'value', operator: 'isTrue' }], output: 'true', relation: 'all' }],
                  concurrency,
                  defaultOutput: 'false',
                  ...(description == null ? {} : { description }),
                  input: { handle: 'value', jsonSchema: {}, nullable: true, value: null },
                  inputs: { value: { kind: 'value', value: null } },
                  kind: 'condition',
                  name: 'Condition',
                },
              },
            },
            name: 'Main',
          },
        },
      },
    },
  }
}

function draftWithConnector(revisionId = 'revision-1', connectionId: string | null = 'github-work'): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        flows: {
          main: {
            graph: { nodes: { connector: { concurrency: 1, inputs: {}, kind: 'task', taskId: 'connector-task' } } },
            name: 'Main',
          },
        },
        tasks: {
          'connector-task': {
            executor: { action: 'github.create_issue', ...(connectionId == null ? {} : { connectionId }), kind: 'connector' },
            inputs: {},
            name: 'GitHub: Create Issue',
            outputs: {},
          },
        },
      },
    },
  }
}

function draftWithTrigger(revisionId = 'revision-1', connectionId = 'github-work', repository = 'oomol/open-flow'): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        bindings: { 'trigger-connection': { kind: 'connection', target: connectionId } },
        flows: {
          main: {
            graph: {
              nodes: {
                'target': {
                  cases: [{ expressions: [], output: 'matched', relation: 'all' }],
                  concurrency: 1,
                  input: { handle: 'event', jsonSchema: triggerDefinition.payloadSchema, nullable: false },
                  inputs: { event: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'trigger-1', output: 'payload' }] } },
                  kind: 'condition',
                },
                'trigger-1': {
                  bindingId: 'trigger-connection',
                  config: { repository },
                  definition: triggerDefinition,
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
}

function draftWithCronTrigger(revisionId = 'revision-1', unit: 'hour' | 'minute' = 'hour'): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        flows: {
          main: {
            graph: {
              nodes: {
                'cron-trigger': {
                  cronTimes: [{ type: 'every', unit, value: 1 }],
                  kind: 'cron',
                  name: 'Scheduled',
                },
              },
            },
            name: 'Main',
          },
        },
      },
    },
  }
}

function draftWithWebhookTrigger(revisionId = 'revision-1', responseStatusCode = 200): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        flows: {
          main: {
            graph: {
              nodes: {
                'webhook-trigger': {
                  inputsDef: [],
                  kind: 'webhook',
                  name: 'Incoming webhook',
                  options: { responseStatusCode },
                },
              },
            },
            name: 'Main',
          },
        },
      },
    },
  }
}

function draftWithCode(
  revisionId = 'revision-1',
  source = 'export default async function run({ value }) {\n  return { result: value }\n}\n',
  imports: readonly string[] = [],
): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        flows: {
          main: {
            graph: {
              nodes: {
                code: {
                  concurrency: 1,
                  inputs: {},
                  kind: 'task',
                  task: {
                    inputs: { value: { jsonSchema: {}, nullable: true } },
                    moduleId: 'code-module',
                    name: 'Code task',
                    outputs: { result: { jsonSchema: {}, nullable: true } },
                  },
                },
                other: {
                  cases: [{ expressions: [{ input: 'value', operator: 'isTrue' }], output: 'true', relation: 'all' }],
                  concurrency: 1,
                  defaultOutput: 'false',
                  input: { handle: 'value', jsonSchema: {}, nullable: true, value: null },
                  inputs: {},
                  kind: 'condition',
                },
              },
            },
            name: 'Main',
          },
          secondary: { graph: { nodes: {} }, name: 'Secondary' },
        },
        tasks: {},
      },
      modules: { 'code-module': { imports, name: 'Code task', source } },
    },
  }
}

function flow(revisionId = 'revision-1'): Flow {
  return {
    draft: { closureDigest: 'closure', name: 'Main', revisionDigest: 'digest', revisionId },
    flowId: 'main',
    hasUnpublishedChanges: true,
    live: null,
  }
}

function draftWithFlows(revisionId: string, flows: Readonly<Record<string, string>>): Draft {
  const current = draft(revisionId)
  return {
    ...current,
    content: {
      ...current.content,
      document: {
        ...current.content.document,
        flows: Object.fromEntries(Object.entries(flows).map(([flowId, name]) => [flowId, { graph: { nodes: {} }, name }])),
      },
    },
  }
}

function draftChange(revision: Draft): DraftChange {
  const { content: _content, ...metadata } = revision
  return {
    draftFlows: Object.entries(revision.content.document.flows).map(([flowId, value]) => ({
      closureDigest: flowId == 'main' ? 'closure' : `closure-${flowId}`,
      flowId,
      name: value.name,
    })),
    revision: metadata,
    version: 1,
  }
}

function revisionMetadata(revision: Draft, parentRevisionId: string | null) {
  const { content: _content, ...metadata } = revision
  return { ...metadata, parentRevisionId }
}

function publication(flowId: string, revisionId: string): Publication {
  return {
    actorId: 'actor',
    closureDigest: `closure-${flowId}`,
    createdAt: '2026-08-10T00:00:00.000Z',
    engineContract: 'open-flow-engine/v1',
    flowId,
    modelVersion: 1,
    operation: 'publish',
    projectId: 'project-1',
    publicationId: `publication-${flowId}`,
    revisionDigest: `digest-${revisionId}`,
    revisionId,
    version: 1,
  }
}

function liveState(current: Publication | null, revision = current == null ? 0 : 1): Live {
  return {
    flowId: 'main',
    hasUnpublishedChanges: current?.revisionId != 'revision-1',
    projectId: 'project-1',
    publication: current,
    revision,
    status: current == null ? 'not-published' : 'runnable',
    version: 1,
  }
}

function triggerBinding(operatorState: TriggerBinding['operatorState'], health: TriggerBinding['health'] = 'healthy'): TriggerBinding {
  return {
    currentPublicationId: 'publication-main',
    currentRevisionId: 'revision-1',
    flowId: 'main',
    health,
    kind: 'webhook',
    operatorState,
    projectId: 'project-1',
    runtimeVersion: 1,
    triggerNodeId: 'incoming-webhook',
    updatedAt: '2026-08-12T00:00:00.000Z',
    version: 1,
  }
}

function flowSummary(flowId: string, name: string | null, revisionId: string, live = false): Flow {
  return {
    draft: name == null ? null : { closureDigest: `closure-${flowId}`, name, revisionDigest: `digest-${revisionId}`, revisionId },
    flowId,
    hasUnpublishedChanges: name != null,
    live: live ? { publication: publication(flowId, revisionId), revision: 1, status: 'runnable' } : null,
  }
}

function presentation(revision = 1): Presentation {
  return { revision, updatedAt: '2026-08-10T00:00:00.000Z', value: {}, version: 1 }
}

function check(revisionId = 'revision-1'): FlowCheck {
  return {
    closureDigest: 'closure',
    diagnostics: [],
    engineContract: 'open-flow-engine/v1',
    flowId: 'main',
    modelVersion: 1,
    projectId: 'project-1',
    revisionDigest: 'digest',
    revisionId,
    valid: true,
    version: 1,
  }
}

const connectorAction: ConnectorAction = {
  actionId: 'github.create_issue',
  defaultConnection: {
    connectionId: 'github-work',
    displayName: 'Work account',
    isDefault: true,
    serviceId: 'github',
    status: 'active',
  },
  description: 'Create an issue in a GitHub repository.',
  icon: 'https://assets.example/github.svg',
  inputs: { title: { jsonSchema: { type: 'string' }, nullable: false } },
  name: 'GitHub: Create Issue',
  outputs: { issue: { jsonSchema: { type: 'object' }, nullable: false } },
  serviceId: 'github',
  serviceName: 'GitHub',
}

const triggerDefinition: Extract<TriggerKeySnapshot, { readonly type: 'integration' }> = {
  configSchema: {
    properties: { repository: { description: 'Repository name.', type: 'string' } },
    required: ['repository'],
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
  payloadSchema: { properties: { action: { type: 'string' } }, type: 'object' },
  provider: 'github',
  type: 'integration',
}

function preferences(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  }
}

function client(overrides: Partial<WorkbenchClient> = {}): WorkbenchClient {
  return {
    checkFlow: vi.fn(async (_projectId, revisionId) => check(revisionId)),
    getDraft: vi.fn(async () => draft()),
    getPresentation: vi.fn(async () => presentation()),
    getProject: vi.fn(async () => project),
    listConnectorActions: vi.fn(async () => []),
    listConnectorProviders: vi.fn(async () => []),
    listFlows: vi.fn(async () => [flow()]),
    listFlowTriggerActivities: vi.fn(async () => ({ activities: [], version: 1 as const })),
    listFlowTriggerBindings: vi.fn(async () => []),
    listProjects: vi.fn(async () => ({ projects: [project], total: 1, version: 1 as const })),
    syncDraft: vi.fn(async () => ({ draft: draft(), draftFlows: draftChange(draft()).draftFlows, kind: 'snapshot' as const, version: 1 as const })),
    watchProject: vi.fn(() => () => {}),
    ...overrides,
  } as WorkbenchClient
}

async function start(store: WorkbenchStore): Promise<void> {
  await store.start('project-1', 'main')
}

describe('WorkbenchStore', () => {
  it('loads the Project browser without selecting a Project or Flow', async () => {
    const getDraft = vi.fn(async () => draft())
    const listFlows = vi.fn(async () => [flow()])
    const store = new WorkbenchStore(client({ getDraft, listFlows }), preferences())

    await store.start()

    expect(store.workspace.$.projects.value).toEqual([project])
    expect(store.workspace.$.projectTotal.value).toBe(1)
    expect(store.workspace.$.projectId.value).toBeUndefined()
    expect(store.workspace.$.target.value).toBeUndefined()
    expect(getDraft).not.toHaveBeenCalled()
    expect(listFlows).not.toHaveBeenCalled()
  })

  it('appends paged Projects and preserves the loaded list when a retry is needed', async () => {
    const second = { ...project, name: 'Beta', projectId: 'project-2' }
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce({ nextCursor: 'next', projects: [project], total: 2, version: 1 as const })
      .mockRejectedValueOnce(new ApiError(503, 'request.failed', 'Unavailable.'))
      .mockResolvedValueOnce({ projects: [second], version: 1 as const })
    const store = new WorkbenchStore(client({ listProjects }), preferences())

    await store.start()
    await store.workspace.loadMoreProjects()

    expect(store.workspace.$.projects.value).toEqual([project])
    expect(store.workspace.$.projectLoadMoreFailed.value).toBe(true)

    await store.workspace.loadMoreProjects()

    expect(store.workspace.$.projects.value).toEqual([project, second])
    expect(store.workspace.$.projectLoadMoreFailed.value).toBe(false)
    expect(listProjects.mock.calls).toEqual([[{ includeTotal: true, limit: 50 }], [{ cursor: 'next', limit: 50 }], [{ cursor: 'next', limit: 50 }]])
  })

  it('removes a Project from the catalog after retirement is accepted', async () => {
    const deleteProject = vi.fn(async () => ({ ...project, status: 'retiring' as const }))
    const store = new WorkbenchStore(client({ deleteProject }), preferences())

    await store.start()

    expect(await store.workspace.deleteProject(project.projectId)).toBe(true)
    expect(deleteProject).toHaveBeenCalledWith(project.projectId)
    expect(store.workspace.$.projects.value).toEqual([])
    expect(store.workspace.$.projectTotal.value).toBe(0)
    expect(store.$.notice.value).toMatchObject({ kind: 'success', message: 'Permanently deleting Project Acme.' })
  })

  it('loads reactive state and derives the active Designer', async () => {
    const store = new WorkbenchStore(client(), preferences())

    await start(store)

    expect(store.$.designer.value).toMatchObject({ edges: [], nodes: [] })
    expect(store.workspace.$.projectId.value).toBe('project-1')
    expect(store.workspace.$.status.value).toBe('saved')
    expect(store.workspace.$.target.value).toEqual({ id: 'main', kind: 'flow' })
    expect(store.workspace.$.targetName.value).toBe('Main')
    expect(store.workspace.$.addNodeOptions.value.map((option) => option.kind)).toEqual([
      'trigger',
      'trigger',
      'new-task',
      'llm',
      'llm',
      'value',
      'condition',
      'comment',
    ])
    expect(store.workspace.$.addNodeOptions.value.map(({ group, label }) => ({ group, label }))).toEqual([
      { group: 'Triggers', label: 'Webhook' },
      { group: 'Triggers', label: 'Schedule' },
      { group: 'Blocks', label: 'JavaScript' },
      { group: 'Blocks', label: 'LLM Chat' },
      { group: 'Blocks', label: 'LLM Structured Output' },
      { group: 'Blocks', label: 'Value' },
      { group: 'Blocks', label: 'Condition' },
      { group: 'Blocks', label: 'Comment' },
    ])
    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'value')).toMatchObject({
      inputs: [],
      outputs: [{ handle: 'value', jsonSchema: {} }],
    })
    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'condition')).toMatchObject({
      inputs: [{ handle: 'value', jsonSchema: {} }],
      outputs: [
        { handle: 'false', jsonSchema: {} },
        { handle: 'true', jsonSchema: {} },
      ],
    })
  })

  it('restores the routed Flow even when it only has a Live version', async () => {
    const store = new WorkbenchStore(client({ listFlows: vi.fn(async () => [flow(), flowSummary('live-only', null, 'revision-live', true)]) }), preferences())

    await store.start('project-1', 'live-only')

    expect(store.workspace.$.target.value).toEqual({ id: 'live-only', kind: 'flow' })
    expect(store.workspace.$.targetFlow.value?.flowId).toBe('live-only')
    expect(store.workspace.$.targetFlow.value?.draft).toBeNull()
  })

  it('locates only root-scope events from the current canvas revision', async () => {
    const observedRun: DraftRun = {
      closureDigest: 'closure',
      createdAt: '2026-08-11T00:00:00.000Z',
      engineContract: 'open-flow-engine/v1',
      engineDigest: 'engine-digest',
      finishedAt: '2026-08-11T00:00:00.008Z',
      flowId: 'main',
      modelVersion: 1,
      projectId: 'project-1',
      revisionDigest: 'digest-revision-1',
      revisionId: 'revision-1',
      runId: 'run-1',
      source: 'draft',
      startedAt: '2026-08-11T00:00:00.001Z',
      status: 'completed',
      version: 1,
    }
    const events: readonly RunEvent[] = [
      { createdAt: observedRun.createdAt, kind: 'run.started', payload: { flowId: 'main', scopeId: 'root' }, sequence: 1 },
      {
        createdAt: observedRun.createdAt,
        kind: 'node.started',
        payload: { flowId: 'main', nodeId: 'first', nodeTitle: 'Condition', scopeId: 'root' },
        sequence: 2,
      },
      {
        createdAt: observedRun.createdAt,
        kind: 'node.started',
        payload: { flowId: 'child', nodeId: 'first', nodeTitle: 'Nested condition', scopeId: 'child' },
        sequence: 3,
      },
    ]
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => draftWithNode()),
        getRun: vi.fn(async () => observedRun),
        getRunEvents: vi.fn(async () => ({ done: true, events, historyComplete: true, nextAfter: 3, runId: observedRun.runId, version: 1 as const })),
        getRunResult: vi.fn(async () => ({
          finishedAt: observedRun.finishedAt!,
          result: null,
          runId: observedRun.runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns: vi.fn(async () => ({ projectId: project.projectId, runs: [observedRun], version: 1 as const })),
      }),
      preferences(),
    )
    await start(store)
    await store.runs.load(project.projectId, 'main')
    await vi.waitFor(() => expect(store.$.runEventNodes.value.size).toBe(1))

    expect(store.$.runEventNodes.value).toEqual(new Map([[2, 'first']]))
    expect(store.locateRunEvent(3)).toBe(false)
    expect(store.locateRunEvent(2)).toBe(true)
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['first'])
    expect(store.workspace.$.nodeFocus.value).toEqual({ nodeId: 'first', requestId: 1 })
    store.dispose()
  })

  it('does not locate events from an older revision', async () => {
    const oldRun: DraftRun = {
      closureDigest: 'closure',
      createdAt: '2026-08-11T00:00:00.000Z',
      engineContract: 'open-flow-engine/v1',
      engineDigest: 'engine-digest',
      finishedAt: '2026-08-11T00:00:00.008Z',
      flowId: 'main',
      modelVersion: 1,
      projectId: 'project-1',
      revisionDigest: 'digest-revision-0',
      revisionId: 'revision-0',
      runId: 'run-old',
      source: 'draft',
      startedAt: '2026-08-11T00:00:00.001Z',
      status: 'completed',
      version: 1,
    }
    const events: readonly RunEvent[] = [
      { createdAt: oldRun.createdAt, kind: 'run.started', payload: { flowId: 'main', scopeId: 'root' }, sequence: 1 },
      { createdAt: oldRun.createdAt, kind: 'node.started', payload: { flowId: 'main', nodeId: 'first', scopeId: 'root' }, sequence: 2 },
    ]
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => draftWithNode()),
        getRun: vi.fn(async () => oldRun),
        getRunEvents: vi.fn(async () => ({ done: true, events, historyComplete: true, nextAfter: 2, runId: oldRun.runId, version: 1 as const })),
        getRunResult: vi.fn(async () => ({
          finishedAt: oldRun.finishedAt!,
          result: null,
          runId: oldRun.runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns: vi.fn(async () => ({ projectId: project.projectId, runs: [oldRun], version: 1 as const })),
      }),
      preferences(),
    )
    await start(store)
    await store.runs.load(project.projectId, 'main')
    await vi.waitFor(() => expect(store.runs.$.events.value).toHaveLength(2))

    expect(store.$.runEventNodes.value.size).toBe(0)
    expect(store.locateRunEvent(2)).toBe(false)
    store.dispose()
  })

  it('updates authoring options when the language changes', async () => {
    const i18n = createI18n('zh-CN')
    const store = new WorkbenchStore(client(), preferences(), () => crypto.randomUUID(), i18n)

    await start(store)

    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'value')?.label).toBe('值')
    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'value')?.group).toBe('节点')
    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'trigger')?.group).toBe('触发器')

    await i18n.switchLang('en')

    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'value')?.label).toBe('Value')
    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'value')?.group).toBe('Blocks')
    expect(store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'trigger')?.group).toBe('Triggers')

    store.dispose()
    i18n.dispose()
  })

  it('renames a Flow with a typed change and keeps it selected', async () => {
    const renamed = draftWithFlows('revision-2', { main: 'Renamed' })
    const changeDraft = vi.fn(async () => draftChange(renamed) satisfies DraftChange)
    const listFlows = vi
      .fn()
      .mockResolvedValueOnce([flowSummary('main', 'Main', 'revision-1')])
      .mockResolvedValueOnce([flowSummary('main', 'Renamed', 'revision-2')])
    const store = new WorkbenchStore(client({ changeDraft, listFlows }), preferences())
    await start(store)

    expect(await store.workspace.renameFlow('main', '  Renamed  ')).toBe(true)

    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [{ flowId: 'main', kind: 'flow.rename', name: 'Renamed' }])
    expect(store.workspace.$.target.value).toEqual({ id: 'main', kind: 'flow' })
    expect(store.workspace.$.targetName.value).toBe('Renamed')
    expect(store.$.notice.value?.message).toContain('Renamed')
  })

  it('deletes the selected Flow with its Live deployment and selects the next Draft', async () => {
    const initial = draftWithFlows('revision-1', { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma' })
    const changed = draftWithFlows('revision-2', { alpha: 'Alpha', gamma: 'Gamma' })
    const initialFlows = [
      flowSummary('alpha', 'Alpha', 'revision-1'),
      flowSummary('beta', 'Beta', 'revision-1', true),
      flowSummary('gamma', 'Gamma', 'revision-1'),
    ]
    const nextFlows = [flowSummary('alpha', 'Alpha', 'revision-2'), flowSummary('gamma', 'Gamma', 'revision-2')]
    const changeDraft = vi.fn(async () => draftChange(changed) satisfies DraftChange)
    const listFlows = vi.fn().mockResolvedValueOnce(initialFlows).mockResolvedValueOnce(nextFlows)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial), listFlows }), preferences())
    await start(store)
    store.workspace.selectTarget({ id: 'beta', kind: 'flow' })

    expect(await store.workspace.deleteFlow('beta')).toBe(true)

    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [{ flowId: 'beta', kind: 'flow.delete' }])
    expect(store.workspace.$.target.value).toEqual({ id: 'gamma', kind: 'flow' })
    expect(store.workspace.$.flows.value.find((candidate) => candidate.flowId == 'beta')).toBeUndefined()
    expect(store.$.notice.value?.message).toContain('Deleted')
  })

  it('clears the canvas target when deleting the last editable Draft Flow', async () => {
    const initial = draftWithFlows('revision-1', { main: 'Main' })
    const changed = draftWithFlows('revision-2', {})
    const changeDraft = vi.fn(async () => draftChange(changed) satisfies DraftChange)
    const listFlows = vi
      .fn()
      .mockResolvedValueOnce([flowSummary('main', 'Main', 'revision-1', true)])
      .mockResolvedValueOnce([])
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial), listFlows }), preferences())
    await start(store)

    expect(await store.workspace.deleteFlow('main')).toBe(true)

    expect(store.workspace.$.target.value).toBeUndefined()
    expect(store.workspace.$.diagnostics.value).toBeUndefined()
    expect(store.workspace.$.flows.value).toEqual([])
  })

  it('reuses document projections when only selection or notices change', async () => {
    const store = new WorkbenchStore(client({ getDraft: vi.fn(async () => draftWithNode()) }), preferences())
    await start(store)
    await vi.waitFor(() => expect(store.workspace.$.checkLoading.value).toBe(false))
    const initialDesigner = store.$.designer.value
    const initialDesignerNodeById = store.$.designerNodeById.value
    const initialAddNodeOptions = store.workspace.$.addNodeOptions.value

    store.selectNodes(['first'])

    expect(store.$.designer.value).toBe(initialDesigner)
    expect(store.$.designerNodeById.value).toBe(initialDesignerNodeById)
    expect(store.workspace.$.addNodeOptions.value).toBe(initialAddNodeOptions)
    expect(store.$.selectedDesignerNode.value).toBe(initialDesignerNodeById.get('first'))

    store.dismissNotice()

    expect(store.$.designer.value).toBe(initialDesigner)
    expect(store.$.designerNodeById.value).toBe(initialDesignerNodeById)
    expect(store.workspace.$.addNodeOptions.value).toBe(initialAddNodeOptions)
  })

  it('saves JavaScript source and imports atomically while exposing editor status', async () => {
    const initial = draftWithCode()
    const nextSource = [
      'import { identity } from "open-flow:platform"',
      'import { shared } from "./shared.mjs"',
      'import "./other.mjs"',
      'import { another } from "./shared.mjs"',
      '// import "./ignored.mjs"',
      'export default async function run() {',
      '  return { result: shared + another + identity }',
      '}',
      '',
    ].join('\n')
    const changed = draftWithCode('revision-2', nextSource, ['other', 'shared'])
    const pending = Promise.withResolvers<DraftChange>()
    const changeDraft = vi.fn(async () => await pending.promise)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['code'])

    expect(store.workspace.$.moduleEditor.value).toMatchObject({ moduleId: 'code-module', status: 'saved' })

    store.workspace.updateModuleSource(nextSource)

    expect(store.workspace.$.moduleEditor.value).toMatchObject({ source: nextSource, status: 'dirty' })
    expect(store.workspace.$.draft.value?.content.modules['code-module']?.source).toBe(initial.content.modules['code-module']?.source)

    const save = store.workspace.saveModuleEditor()
    expect(store.workspace.$.moduleEditor.value?.status).toBe('saving')
    pending.resolve(draftChange(changed))

    await expect(save).resolves.toBe(true)
    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      { imports: ['other', 'shared'], kind: 'module.source.replace', moduleId: 'code-module', source: nextSource },
    ])
    expect(store.workspace.$.moduleEditor.value).toMatchObject({ source: nextSource, status: 'saved' })
  })

  it('keeps failed JavaScript edits available for retry', async () => {
    const initial = draftWithCode()
    const changeDraft = vi.fn(async () => {
      throw new ApiError(400, 'project.invalid', 'Invalid module.')
    })
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['code'])
    store.workspace.updateModuleSource('export default async function run() { return { result: 42 } }')

    await expect(store.workspace.saveModuleEditor()).resolves.toBe(false)

    expect(store.workspace.$.moduleEditor.value).toMatchObject({
      source: 'export default async function run() { return { result: 42 } }',
      status: 'failed',
    })
  })

  it('blocks node and Flow navigation until JavaScript edits are saved or discarded', async () => {
    const initial = draftWithCode()
    const store = new WorkbenchStore(client({ getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['code'])
    store.workspace.updateModuleSource('export default async function run() { return { result: "local" } }')

    expect(store.workspace.selectNodes(['other'])).toBe(false)
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['code'])
    expect(store.workspace.selectTarget({ id: 'secondary', kind: 'flow' })).toBe(false)
    expect(store.workspace.$.target.value).toEqual({ id: 'main', kind: 'flow' })
    expect(store.$.notice.value?.message).toContain('Save or discard')

    store.workspace.discardModuleChanges()

    expect(store.workspace.$.moduleEditor.value?.status).toBe('saved')
    expect(store.workspace.selectTarget({ id: 'secondary', kind: 'flow' })).toBe(true)
    expect(store.workspace.$.target.value).toEqual({ id: 'secondary', kind: 'flow' })
  })

  it('maps Module diagnostics to the selected JavaScript editor with source location', async () => {
    const diagnostic = { code: 'module.syntax', column: 7, line: 3, message: 'Invalid source.', path: '/modules/code-module/source' }
    const prefixed = { ...diagnostic, path: '/modules/code-module-extra/source' }
    const currentCheck = { ...check(), diagnostics: [diagnostic, prefixed], valid: false }
    const store = new WorkbenchStore(client({ checkFlow: vi.fn(async () => currentCheck), getDraft: vi.fn(async () => draftWithCode()) }), preferences())
    await start(store)
    await vi.waitFor(() => expect(store.workspace.$.checkLoading.value).toBe(false))
    store.selectNodes(['code'])

    expect(store.workspace.$.moduleDiagnostics.value).toEqual([diagnostic])
    expect(store.workspace.$.inspectorDiagnostics.value).toEqual([diagnostic])
  })

  it('maps diagnostics to their current Flow node and Inspector section', async () => {
    const diagnostics = [
      {
        code: 'graph.condition-output-invalid',
        column: 0,
        line: 1,
        message: 'Condition output is invalid.',
        path: '/document/flows/main/graph/nodes/other/cases/0/output',
      },
      {
        code: 'task.missing-entry',
        column: 0,
        line: 1,
        message: 'Inline Task module must export a default function.',
        path: '/document/flows/main/graph/nodes/code/task/moduleId',
      },
      { code: 'module.syntax', column: 7, line: 3, message: 'Invalid source.', path: '/modules/code-module/source' },
      { code: 'graph.cycle', column: 0, line: 1, message: 'Graph has a cycle.', path: '/document/flows/main/graph' },
    ]
    const currentCheck = { ...check(), diagnostics, valid: false }
    const store = new WorkbenchStore(client({ checkFlow: vi.fn(async () => currentCheck), getDraft: vi.fn(async () => draftWithCode()) }), preferences())
    await start(store)
    await vi.waitFor(() => expect(store.workspace.$.checkLoading.value).toBe(false))

    expect(store.workspace.$.diagnosticItems.value).toMatchObject([
      { location: { nodeId: 'other', section: 'condition' }, scope: 'node' },
      { location: { nodeId: 'code', section: 'task' }, scope: 'task' },
      { location: { nodeId: 'code', section: 'module' }, scope: 'code' },
      { scope: 'flow' },
    ])
    expect(store.workspace.$.diagnosticItems.value[3]?.location).toBeUndefined()

    expect(store.workspace.locateDiagnostic(store.workspace.$.diagnosticItems.value[0]!)).toBe(true)
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['other'])
    expect(store.workspace.$.diagnosticFocus.value).toMatchObject({
      diagnostic: diagnostics[0],
      nodeId: 'other',
      requestId: 1,
      section: 'condition',
    })

    expect(store.workspace.locateDiagnostic(store.workspace.$.diagnosticItems.value[2]!)).toBe(true)
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['code'])
    expect(store.workspace.$.diagnosticFocus.value).toMatchObject({
      diagnostic: diagnostics[2],
      nodeId: 'code',
      requestId: 2,
      section: 'module',
    })
    expect(store.workspace.locateDiagnostic(store.workspace.$.diagnosticItems.value[3]!)).toBe(false)
  })

  it('maps Connection diagnostics to the Connector account section', async () => {
    const diagnostic = {
      code: 'connector.connection-unavailable',
      column: 0,
      line: 1,
      message: 'Connection is unavailable.',
      path: '/document/tasks/connector-task/executor/connectionId',
    }
    const currentCheck = { ...check(), diagnostics: [diagnostic], valid: false }
    const store = new WorkbenchStore(
      client({
        checkFlow: vi.fn(async () => currentCheck),
        getConnectorAction: vi.fn(async () => connectorAction),
        getDraft: vi.fn(async () => draftWithConnector()),
      }),
      preferences(),
    )
    await start(store)
    await vi.waitFor(() => expect(store.workspace.$.checkLoading.value).toBe(false))

    expect(store.workspace.$.diagnosticItems.value).toMatchObject([{ diagnostic, location: { nodeId: 'connector', section: 'account' }, scope: 'task' }])
  })

  it('keeps diagnostics navigation on the current node while JavaScript has unsaved edits', async () => {
    const diagnostic = {
      code: 'graph.condition-output-invalid',
      column: 0,
      line: 1,
      message: 'Condition output is invalid.',
      path: '/document/flows/main/graph/nodes/other/cases/0/output',
    }
    const currentCheck = { ...check(), diagnostics: [diagnostic], valid: false }
    const store = new WorkbenchStore(client({ checkFlow: vi.fn(async () => currentCheck), getDraft: vi.fn(async () => draftWithCode()) }), preferences())
    await start(store)
    await vi.waitFor(() => expect(store.workspace.$.checkLoading.value).toBe(false))
    store.selectNodes(['code'])
    store.workspace.updateModuleSource('export default async function run() { return { result: "local" } }')

    expect(store.workspace.locateDiagnostic(store.workspace.$.diagnosticItems.value[0]!)).toBe(false)
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['code'])
    expect(store.workspace.$.diagnosticFocus.value).toBeUndefined()
    expect(store.$.notice.value?.message).toContain('Save or discard')
  })

  it('does not expose graph-created Task definitions as reusable Quick Pick items', async () => {
    const current = draftWithConnector()
    const store = new WorkbenchStore(
      client({
        getConnectorAction: vi.fn(async () => connectorAction),
        getDraft: vi.fn(async () => current),
      }),
      preferences(),
    )

    await start(store)

    expect(store.workspace.$.addNodeOptions.value.some((option) => option.id == 'task:code-task' || option.id == 'task:connector-task')).toBe(false)
  })

  it('does not expose Project Subflows in the Quick Pick', async () => {
    const current = draft()
    const withSubflow: Draft = {
      ...current,
      content: {
        ...current.content,
        document: {
          ...current.content.document,
          subflows: {
            shared: { graph: { nodes: {} }, inputs: {}, name: 'Shared', outputs: {} },
          },
        },
      },
    }
    const store = new WorkbenchStore(client({ getDraft: vi.fn(async () => withSubflow) }), preferences())

    await start(store)

    expect(store.workspace.$.addNodeOptions.value.some((option) => option.kind == 'subflow')).toBe(false)
  })

  it('persists Comment nodes only in Presentation', async () => {
    const changeDraft = vi.fn()
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const store = new WorkbenchStore(client({ changeDraft, updatePresentation }), preferences())
    await start(store)

    const comment = store.workspace.$.addNodeOptions.value.find((option) => option.kind == 'comment')!
    const nodeId = await store.addNode(comment, { x: 48, y: 72 })

    expect(changeDraft).not.toHaveBeenCalled()
    expect(updatePresentation).toHaveBeenCalledOnce()
    expect(store.workspace.$.presentation.value?.value).toMatchObject({
      designer: {
        flows: {
          main: {
            comments: { [nodeId!]: { content: '', title: 'Comment #1' } },
            nodes: { [nodeId!]: { x: 48, y: 72 } },
          },
        },
      },
    })

    await store.workspace.duplicateSelectedNodes()

    const copy = store.$.designer.value.nodes.find((node) => node.kind == 'comment' && node.id != nodeId)
    expect(changeDraft).not.toHaveBeenCalled()
    expect(updatePresentation).toHaveBeenCalledTimes(2)
    expect(copy).toMatchObject({ content: '', kind: 'comment', position: { x: 88, y: 112 }, title: 'Comment #1 copy' })
    expect(store.workspace.$.selectedNodeIds.value).toEqual([copy!.id])
  })

  it('creates managed LLM and Connector Task definitions instead of JavaScript stubs', async () => {
    const revisions = [draft('revision-2'), draft('revision-3')]
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) =>
        draftChange(revisions.shift()!) satisfies DraftChange,
    )
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const store = new WorkbenchStore(client({ changeDraft, searchConnectorActions: vi.fn(async () => [connectorAction]), updatePresentation }), preferences())
    await start(store)

    await store.addNode(
      store.workspace.$.addNodeOptions.value.find((option) => option.id == 'llm:chat')!,
      { x: 10, y: 20 },
    )
    const connectorOptions = await store.connectors.provideAddNodeOptions('create issue', new AbortController().signal)
    await store.addNode(connectorOptions![0]!, { x: 30, y: 40 })

    expect(changeDraft).toHaveBeenCalledTimes(2)
    expect(changeDraft.mock.calls[0]![2]).toEqual([
      expect.objectContaining({ kind: 'task.create', task: expect.objectContaining({ executor: { kind: 'llm', mode: 'chat' } }) }),
      expect.objectContaining({ kind: 'graph.node.create', node: expect.objectContaining({ kind: 'task' }) }),
    ])
    expect(changeDraft.mock.calls[1]![2]).toEqual([
      expect.objectContaining({
        kind: 'task.create',
        task: expect.objectContaining({ executor: { action: 'github.create_issue', connectionId: 'github-work', kind: 'connector' } }),
      }),
      expect.objectContaining({ kind: 'graph.node.create', node: expect.objectContaining({ kind: 'task' }) }),
    ])
  })

  it('projects a new node and its connection before the Draft change completes', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) => await pending.promise,
    )
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => draftWithNode()), updatePresentation }), preferences(), () => 'created')
    await start(store)

    const option = store.workspace.$.addNodeOptions.value.find((candidate) => candidate.kind == 'condition')!
    const add = store.addNode(option, { x: 200, y: 0 }, (nodeId) => ({
      source: 'first',
      sourceHandle: 'true',
      target: nodeId,
      targetHandle: 'value',
    }))

    expect(store.$.designer.value.nodes.some((node) => node.id == 'created')).toBe(true)
    expect(store.$.designer.value.edges).toContainEqual({
      id: JSON.stringify(['first', 'true', 'created', 'value']),
      source: 'first',
      sourceHandle: 'true',
      target: 'created',
      targetHandle: 'value',
    })

    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    expect(changeDraft.mock.calls[0]![2]).toEqual([
      expect.objectContaining({ kind: 'graph.node.create', nodeId: 'created' }),
      {
        edge: { source: 'first', sourceHandle: 'true', target: 'created', targetHandle: 'value' },
        kind: 'graph.edge.connect',
        target: { id: 'main', kind: 'flow' },
      },
    ])

    pending.resolve(draftChange(draft('revision-2')))
    await expect(add).resolves.toBe('created')
    store.dispose()
  })

  it('projects duplicated node positions before the Draft change completes', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) => await pending.promise,
    )
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const initialPresentation: Presentation = {
      ...presentation(),
      value: { designer: { flows: { main: { nodes: { first: { x: 10, y: 20 } } } }, version: 1 } },
    }
    const store = new WorkbenchStore(
      client({
        changeDraft,
        getDraft: vi.fn(async () => draftWithNode()),
        getPresentation: vi.fn(async () => initialPresentation),
        updatePresentation,
      }),
      preferences(),
      () => 'copy',
    )
    await start(store)
    store.selectNodes(['first'])

    const duplicate = store.workspace.duplicateSelectedNodes()

    expect(store.$.designer.value.nodes.find((node) => node.id == 'copy')?.position).toEqual({ x: 50, y: 60 })
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['copy'])
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(updatePresentation).toHaveBeenCalledOnce())

    pending.resolve(draftChange(draft('revision-2')))
    await duplicate
    store.dispose()
  })

  it('discovers Trigger Keys and creates a connection-pinned Draft Trigger', async () => {
    const changeDraft = vi.fn(async () => draftChange(draft('revision-2')) satisfies DraftChange)
    const listConnectorConnections = vi.fn(async () => [connectorAction.defaultConnection!])
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const identity = vi.fn().mockReturnValueOnce('trigger-new').mockReturnValueOnce('binding-new')
    const store = new WorkbenchStore(
      client({
        changeDraft,
        listConnectorConnections,
        listTriggerDefinitions: vi.fn(async () => [triggerDefinition]),
        updatePresentation,
      }),
      preferences(),
      identity,
    )
    await start(store)

    const options = await store.browseAddNodeOptions(new AbortController().signal)
    const triggerGroup = options?.find((option) => option.kind == 'trigger')

    expect(triggerGroup).toMatchObject({
      choices: [],
      description: 'Choose the Connection for this Trigger.',
      group: 'Triggers',
      label: 'GitHub Issue Event',
      outputs: [],
    })
    expect(listConnectorConnections).not.toHaveBeenCalled()

    const choices = await store.provideAddNodeOptionChoices(triggerGroup!.id, new AbortController().signal)
    const trigger = choices?.[0]
    expect(trigger).toMatchObject({
      description: 'Work account',
      label: 'GitHub Issue Event',
      outputs: [{ handle: 'payload', jsonSchema: triggerDefinition.payloadSchema }],
      trigger: { connectionId: 'github-work', definition: triggerDefinition, kind: 'catalog' },
    })
    expect(listConnectorConnections).toHaveBeenCalledWith('project-1', 'github', expect.any(AbortSignal))

    expect(await store.addNode(trigger!, { x: 120, y: 80 })).toBe('trigger-new')
    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      { binding: { kind: 'connection', target: 'github-work' }, bindingId: 'binding-new', kind: 'binding.create' },
      {
        kind: 'graph.node.create',
        node: {
          bindingId: 'binding-new',
          config: {},
          definition: triggerDefinition,
          kind: 'integration',
          name: 'GitHub Issue Event',
        },
        nodeId: 'trigger-new',
        target: { id: 'main', kind: 'flow' },
      },
    ])
    expect(updatePresentation).toHaveBeenCalledOnce()
  })

  it('offers Connection creation instead of creating an unbound Provider Trigger', async () => {
    const changeDraft = vi.fn()
    const listConnectorConnections = vi.fn(async () => [])
    const openExternalPage = vi.fn(async (resolveUrl: () => Promise<string>) => {
      expect(await resolveUrl()).toBe('https://connector.example/connections/new')
      return true
    })
    const store = new WorkbenchStore(
      client({
        changeDraft,
        createConnectorConnectionPage: vi.fn(async () => 'https://connector.example/connections/new'),
        listConnectorConnections,
        listTriggerDefinitions: vi.fn(async () => [triggerDefinition]),
      }),
      preferences(),
      () => crypto.randomUUID(),
      createI18n(),
      { openExternalPage },
    )
    await start(store)

    const options = await store.browseAddNodeOptions(new AbortController().signal)
    const triggerGroup = options?.find((option) => option.kind == 'trigger')
    expect(listConnectorConnections).not.toHaveBeenCalled()

    const choices = await store.provideAddNodeOptionChoices(triggerGroup!.id, new AbortController().signal)
    expect(choices).toMatchObject([{ label: 'Add Connection', trigger: { kind: 'connect', provider: 'github' } }])
    await store.addNode(choices![0]!, { x: 0, y: 0 })

    expect(openExternalPage).toHaveBeenCalledOnce()
    expect(store.triggers.$.selectedAuthorizationPending.value).toBe(false)
    expect(changeDraft).not.toHaveBeenCalled()
  })

  it('browses Connector providers and loads one provider action catalog on expansion', async () => {
    const notionAction: ConnectorAction = {
      ...connectorAction,
      actionId: 'notion.create_page',
      defaultConnection: undefined,
      name: 'Create Page',
      serviceId: 'notion',
      serviceName: 'Notion',
    }
    const listConnectorActions = vi.fn(async (_projectId: string, serviceId: string) => (serviceId == 'notion' ? [notionAction] : [connectorAction]))
    const listConnectorProviders = vi.fn(async () => [
      { icon: 'https://assets.example/github.svg', serviceId: 'github', serviceName: 'GitHub' },
      { icon: 'https://assets.example/notion.svg', serviceId: 'notion', serviceName: 'Notion' },
    ])
    const listTriggerDefinitions = vi.fn(async () => [triggerDefinition])
    const listConnectorConnections = vi.fn(async () => [connectorAction.defaultConnection!])
    const store = new WorkbenchStore(client({ listConnectorActions, listConnectorConnections, listConnectorProviders, listTriggerDefinitions }), preferences())
    await start(store)

    const options = await store.browseAddNodeOptions(new AbortController().signal)
    const cached = await store.browseAddNodeOptions(new AbortController().signal)

    expect(options).toMatchObject([
      { kind: 'trigger', label: 'GitHub Issue Event' },
      { choices: [], kind: 'connector-group', label: 'GitHub', serviceId: 'github' },
      { choices: [], kind: 'connector-group', label: 'Notion', serviceId: 'notion' },
    ])
    expect(cached).toEqual(options)
    expect(listConnectorProviders).toHaveBeenCalledOnce()
    expect(listConnectorActions).not.toHaveBeenCalled()
    expect(listConnectorConnections).not.toHaveBeenCalled()

    const actions = await store.provideAddNodeOptionChoices('connector-provider:notion', new AbortController().signal)
    const cachedActions = await store.provideAddNodeOptionChoices('connector-provider:notion', new AbortController().signal)

    expect(actions).toMatchObject([{ connector: notionAction, kind: 'connector', label: 'Create Page' }])
    expect(cachedActions).toEqual(actions)
    expect(listConnectorActions).toHaveBeenCalledOnce()
    expect(listConnectorActions).toHaveBeenCalledWith('project-1', 'notion', expect.any(AbortSignal))
    expect(listTriggerDefinitions).toHaveBeenCalledOnce()
    expect(listConnectorConnections).not.toHaveBeenCalled()
    store.dispose()
  })

  it('loads connections only for the expanded Trigger provider', async () => {
    const gmailDefinition: TriggerKeySnapshot = {
      ...triggerDefinition,
      displayName: 'Gmail Message Event',
      key: 'gmail.message_event',
      name: 'message_event',
      provider: 'gmail',
    }
    const definitions = [triggerDefinition, gmailDefinition]
    const listConnectorConnections = vi.fn(async (_projectId: string, provider: string) => (provider == 'github' ? [connectorAction.defaultConnection!] : []))
    const store = new WorkbenchStore(
      client({
        listConnectorConnections,
        listTriggerDefinitions: vi.fn(async () => definitions),
      }),
      preferences(),
    )
    await start(store)

    const options = await store.browseAddNodeOptions(new AbortController().signal)
    expect(listConnectorConnections).not.toHaveBeenCalled()

    const github = options?.find((option) => option.id == `trigger:${triggerDefinition.key}`)
    await expect(store.provideAddNodeOptionChoices(github!.id, new AbortController().signal)).resolves.toMatchObject([
      { trigger: { connectionId: 'github-work', kind: 'catalog' } },
    ])
    expect(listConnectorConnections).toHaveBeenCalledOnce()
    expect(listConnectorConnections).toHaveBeenCalledWith('project-1', 'github', expect.any(AbortSignal))
    store.dispose()
  })

  it('loads all Trigger definitions with one catalog request', async () => {
    const definitions = Array.from({ length: 6 }, (_, index) => ({
      ...triggerDefinition,
      displayName: `Trigger ${index}`,
      key: `github.trigger_${index}`,
      name: `trigger_${index}`,
    }))
    const getTriggerKey = vi.fn()
    const listTriggerDefinitions = vi.fn(async () => definitions)
    const store = new WorkbenchStore(
      client({
        getTriggerKey,
        listTriggerDefinitions,
      }),
      preferences(),
    )
    await start(store)

    await expect(store.triggers.browseAddNodeOptions(new AbortController().signal)).resolves.toHaveLength(6)
    await expect(store.triggers.browseAddNodeOptions(new AbortController().signal)).resolves.toHaveLength(6)
    expect(listTriggerDefinitions).toHaveBeenCalledOnce()
    expect(getTriggerKey).not.toHaveBeenCalled()
    store.dispose()
  })

  it('does not turn an aborted Trigger catalog request into an empty catalog', async () => {
    const pending = Promise.withResolvers<readonly TriggerKeySnapshot[]>()
    const listTriggerDefinitions = vi.fn(() => pending.promise)
    const store = new WorkbenchStore(
      client({
        listTriggerDefinitions,
      }),
      preferences(),
    )
    await start(store)
    const controller = new AbortController()

    const loading = store.triggers.browseAddNodeOptions(controller.signal)
    await vi.waitFor(() => expect(listTriggerDefinitions).toHaveBeenCalledOnce())
    controller.abort()
    pending.resolve([triggerDefinition])

    await expect(loading).resolves.toBeUndefined()
    store.dispose()
  })

  it('reports a partial catalog failure while retaining available providers', async () => {
    const store = new WorkbenchStore(
      client({
        listConnectorProviders: vi.fn(async () => [{ icon: 'https://assets.example/github.svg', serviceId: 'github', serviceName: 'GitHub' }]),
        listTriggerDefinitions: vi.fn(async () => {
          throw new ApiError(503, 'trigger-gateway.unavailable', 'Trigger Gateway is unavailable.')
        }),
      }),
      preferences(),
    )
    await start(store)

    await expect(store.browseAddNodeOptions(new AbortController().signal)).resolves.toMatchObject([
      { kind: 'connector-group', label: 'GitHub', serviceId: 'github' },
    ])
    expect(store.$.notice.value).toMatchObject({ kind: 'error', message: 'Trigger Gateway is unavailable. (trigger-gateway.unavailable)' })
    store.dispose()
  })

  it('does not report a partial catalog failure after cancellation', async () => {
    const pending = Promise.withResolvers<readonly TriggerKeySnapshot[]>()
    const listTriggerDefinitions = vi.fn(() => pending.promise)
    const listConnectorProviders = vi.fn(async () => [{ icon: 'https://assets.example/github.svg', serviceId: 'github', serviceName: 'GitHub' }])
    const store = new WorkbenchStore(client({ listConnectorProviders, listTriggerDefinitions }), preferences())
    await start(store)
    const controller = new AbortController()

    const loading = store.browseAddNodeOptions(controller.signal)
    await vi.waitFor(() => {
      expect(listTriggerDefinitions).toHaveBeenCalledOnce()
      expect(listConnectorProviders).toHaveBeenCalledOnce()
    })
    controller.abort()
    pending.reject(new Error('signal is aborted without reason'))

    await expect(loading).resolves.toBeUndefined()
    expect(store.$.notice.value).toBeUndefined()
    store.dispose()
  })

  it('reuses the Trigger Key catalog while filtering QuickPick options', async () => {
    const listTriggerDefinitions = vi.fn(async () => [triggerDefinition])
    const listConnectorConnections = vi.fn(async () => [connectorAction.defaultConnection!])
    const store = new WorkbenchStore(client({ listConnectorConnections, listTriggerDefinitions }), preferences())
    await start(store)

    await expect(store.triggers.provideAddNodeOptions('', new AbortController().signal)).resolves.toEqual([])
    expect(listTriggerDefinitions).not.toHaveBeenCalled()
    expect(listConnectorConnections).not.toHaveBeenCalled()

    await expect(store.triggers.provideAddNodeOptions('issue', new AbortController().signal)).resolves.toHaveLength(1)
    await expect(store.triggers.provideAddNodeOptions('github', new AbortController().signal)).resolves.toHaveLength(1)

    expect(listTriggerDefinitions).toHaveBeenCalledOnce()
    expect(listConnectorConnections).toHaveBeenCalledOnce()

    store.triggers.reset()
    await expect(store.triggers.provideAddNodeOptions('github', new AbortController().signal)).resolves.toHaveLength(1)
    expect(listTriggerDefinitions).toHaveBeenCalledTimes(2)
    expect(listConnectorConnections).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('retries a failed Trigger Key catalog request', async () => {
    const listTriggerDefinitions = vi
      .fn<WorkbenchClient['listTriggerDefinitions']>()
      .mockRejectedValueOnce(new ApiError(503, 'trigger-gateway.unavailable', 'Trigger Gateway is unavailable.'))
      .mockResolvedValueOnce([triggerDefinition])
    const store = new WorkbenchStore(
      client({
        listConnectorConnections: vi.fn(async () => [connectorAction.defaultConnection!]),
        listTriggerDefinitions,
      }),
      preferences(),
    )
    await start(store)

    await expect(store.triggers.provideAddNodeOptions('issue', new AbortController().signal)).rejects.toThrow('Trigger Gateway is unavailable.')
    await expect(store.triggers.provideAddNodeOptions('issue', new AbortController().signal)).resolves.toHaveLength(1)

    expect(listTriggerDefinitions).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('disconnects and removes selected Draft Triggers with their private binding', async () => {
    const initial = draftWithTrigger()
    const changeDraft = vi.fn(async () => draftChange(initial) satisfies DraftChange)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)

    await store.workspace.disconnect({
      id: '["trigger-1","payload","target","event"]',
      source: 'trigger-1',
      sourceHandle: 'payload',
      target: 'target',
      targetHandle: 'event',
    })
    expect(changeDraft).toHaveBeenLastCalledWith('project-1', 'revision-1', [
      {
        edge: { source: 'trigger-1', sourceHandle: 'payload', target: 'target', targetHandle: 'event' },
        kind: 'graph.edge.disconnect',
        target: { id: 'main', kind: 'flow' },
      },
    ])

    store.selectNodes(['trigger-1'])
    await store.workspace.deleteSelectedNodes()
    expect(changeDraft).toHaveBeenLastCalledWith('project-1', 'revision-1', [
      { kind: 'graph.node.delete', nodeId: 'trigger-1', target: { id: 'main', kind: 'flow' } },
      { bindingId: 'trigger-connection', kind: 'binding.delete' },
    ])
  })

  it('projects mixed semantic and Comment deletion before the Draft change completes', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) => await pending.promise,
    )
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const initialPresentation: Presentation = {
      ...presentation(),
      value: {
        designer: {
          flows: {
            main: {
              comments: { comment: { content: '', title: 'Comment' } },
              nodes: { comment: { x: 40, y: 40 }, first: { x: 10, y: 20 } },
            },
          },
          version: 1,
        },
      },
    }
    const store = new WorkbenchStore(
      client({
        changeDraft,
        getDraft: vi.fn(async () => draftWithNode()),
        getPresentation: vi.fn(async () => initialPresentation),
        updatePresentation,
      }),
      preferences(),
    )
    await start(store)
    store.selectNodes(['first', 'comment'])

    const deletion = store.workspace.deleteSelectedNodes()

    expect(store.$.designer.value.nodes).toEqual([])
    expect(store.workspace.$.selectedNodeIds.value).toEqual([])
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(updatePresentation).toHaveBeenCalledOnce())

    pending.resolve(draftChange(draft('revision-2')))
    await deletion
    store.dispose()
  })

  it('keeps a scheduled Trigger selected after changing its schedule', async () => {
    const initial = draftWithCronTrigger()
    const changed = draftWithCronTrigger('revision-2', 'minute')
    const changeDraft = vi.fn(async () => draftChange(changed) satisfies DraftChange)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['cron-trigger'])

    expect(await store.workspace.saveTriggerSchedule('cron-trigger', [{ type: 'every', unit: 'minute', value: 1 }])).toBe(true)

    expect(store.workspace.$.selectedNodeIds.value).toEqual(['cron-trigger'])
    expect(store.workspace.$.selection.value?.kind).toBe('trigger')
  })

  it('updates Provider Trigger config from the node and keeps it selected', async () => {
    const initial = draftWithTrigger()
    const changed = draftWithTrigger('revision-2', 'github-work', 'oomol/new-repository')
    const changeDraft = vi.fn(async () => draftChange(changed) satisfies DraftChange)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['trigger-1'])

    expect(await store.workspace.saveTriggerConfig('trigger-1', 'repository', 'oomol/new-repository')).toBe(true)

    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      expect.objectContaining({
        kind: 'graph.node.replace',
        node: expect.objectContaining({ config: { repository: 'oomol/new-repository' } }),
        nodeId: 'trigger-1',
      }),
    ])
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['trigger-1'])
  })

  it('updates a node description from the settings panel and keeps it selected', async () => {
    const initial = draftWithNode()
    const changed = draftWithNode('revision-2')
    const changeDraft = vi.fn(async () => draftChange(changed) satisfies DraftChange)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['first'])

    expect(await store.workspace.saveNodeDescription('first', 'Checks the input value.')).toBe(true)

    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      expect.objectContaining({
        kind: 'graph.node.replace',
        node: expect.objectContaining({ description: 'Checks the input value.' }),
        nodeId: 'first',
      }),
    ])
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['first'])
  })

  it('updates Webhook options from the node and keeps it selected', async () => {
    const initial = draftWithWebhookTrigger()
    const changed = draftWithWebhookTrigger('revision-2', 202)
    const changeDraft = vi.fn(async () => draftChange(changed) satisfies DraftChange)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => initial) }), preferences())
    await start(store)
    store.selectNodes(['webhook-trigger'])

    expect(await store.workspace.saveWebhook('webhook-trigger', { inputs: [], options: { responseStatusCode: 202 } })).toBe(true)

    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      expect.objectContaining({
        kind: 'graph.node.replace',
        node: expect.objectContaining({ options: { responseStatusCode: 202 } }),
        nodeId: 'webhook-trigger',
      }),
    ])
    expect(store.workspace.$.selectedNodeIds.value).toEqual(['webhook-trigger'])
  })

  it('keeps a Provider Trigger pinned and switches its Connection explicitly', async () => {
    const initial = draftWithTrigger()
    const connections: readonly ConnectorConnection[] = [
      { connectionId: 'github-work', displayName: 'Work account', isDefault: false, serviceId: 'github', status: 'active' },
      { connectionId: 'github-personal', displayName: 'Personal account', isDefault: true, serviceId: 'github', status: 'active' },
    ]
    const changeDraft = vi.fn(async () => draftChange(draftWithTrigger('revision-2', 'github-personal')) satisfies DraftChange)
    const store = new WorkbenchStore(
      client({ changeDraft, getDraft: vi.fn(async () => initial), listConnectorConnections: vi.fn(async () => connections) }),
      preferences(),
    )
    await start(store)

    store.selectNodes(['trigger-1'])
    await vi.waitFor(() => expect(store.triggers.$.selectedConnection.value?.connectionId).toBe('github-work'))

    expect(await store.triggers.setConnection('trigger-1', 'github-personal')).toBe(true)
    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      { binding: { kind: 'connection', target: 'github-personal' }, bindingId: 'trigger-connection', kind: 'binding.replace' },
    ])
  })

  it('keeps an existing Connector pinned when the Team default changes and only switches it explicitly', async () => {
    const connections = [
      { connectionId: 'github-work', displayName: 'Work account', isDefault: false, serviceId: 'github', status: 'active' as const },
      { connectionId: 'github-personal', displayName: 'Personal account', isDefault: true, serviceId: 'github', status: 'active' as const },
    ]
    const action: ConnectorAction = { ...connectorAction, defaultConnection: connections[1] }
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) =>
        draftChange(draft('revision-2')) satisfies DraftChange,
    )
    const store = new WorkbenchStore(
      client({
        changeDraft,
        getConnectorAction: vi.fn(async () => action),
        getDraft: vi.fn(async () => draftWithConnector()),
        listConnectorConnections: vi.fn(async () => connections),
      }),
      preferences(),
    )
    await start(store)

    await vi.waitFor(() => expect(store.$.designer.value.nodes[0]).toMatchObject({ icon: connectorAction.icon }))

    store.selectNodes(['connector'])
    await vi.waitFor(() => expect(store.connectors.$.selectedConnection.value?.connectionId).toBe('github-work'))
    expect(changeDraft).not.toHaveBeenCalled()

    await store.connectors.setConnection('connector-task', 'github-personal')
    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      expect.objectContaining({
        kind: 'task.replace',
        task: expect.objectContaining({ executor: { action: 'github.create_issue', connectionId: 'github-personal', kind: 'connector' } }),
        taskId: 'connector-task',
      }),
    ])
  })

  it('fixes the current default Connection into an unconfigured Connector Task', async () => {
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) =>
        draftChange(draft('revision-2')) satisfies DraftChange,
    )
    const store = new WorkbenchStore(
      client({
        changeDraft,
        getConnectorAction: vi.fn(async () => connectorAction),
        getDraft: vi.fn(async () => draftWithConnector('revision-1', null)),
        listConnectorConnections: vi.fn(async () => [connectorAction.defaultConnection!]),
      }),
      preferences(),
    )
    await start(store)

    store.selectNodes(['connector'])
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    expect(changeDraft.mock.calls[0]![2]).toEqual([
      expect.objectContaining({
        kind: 'task.replace',
        task: expect.objectContaining({ executor: { action: 'github.create_issue', connectionId: 'github-work', kind: 'connector' } }),
      }),
    ])
  })

  it('clears Connector loading when selection changes during refresh', async () => {
    const connections = Promise.withResolvers<readonly ConnectorConnection[]>()
    const listConnectorConnections = vi.fn(async () => await connections.promise)
    const store = new WorkbenchStore(
      client({
        getConnectorAction: vi.fn(async () => connectorAction),
        getDraft: vi.fn(async () => draftWithConnector()),
        listConnectorConnections,
      }),
      preferences(),
    )
    await start(store)
    await vi.waitFor(() => expect(store.connectors.$.actions.value[connectorAction.actionId]).toEqual(connectorAction))

    store.workspace.selectNodes(['connector'])
    const refresh = store.connectors.refresh()
    await vi.waitFor(() => {
      expect(store.connectors.$.actionLoading.value).toBe(connectorAction.actionId)
      expect(store.connectors.$.connectionLoading.value).toBe(connectorAction.serviceId)
    })

    store.workspace.selectNodes([])
    await store.connectors.refresh()

    expect(store.connectors.$.actionLoading.value).toBeUndefined()
    expect(store.connectors.$.connectionLoading.value).toBeUndefined()

    connections.resolve([connectorAction.defaultConnection!])
    await refresh

    expect(listConnectorConnections).toHaveBeenCalledOnce()
    expect(store.connectors.$.actionLoading.value).toBeUndefined()
    expect(store.connectors.$.connectionLoading.value).toBeUndefined()
    store.dispose()
  })

  it('keeps Connector refresh failures in the selected account state', async () => {
    const store = new WorkbenchStore(
      client({
        getConnectorAction: vi.fn(async () => connectorAction),
        getDraft: vi.fn(async () => draftWithConnector()),
        listConnectorConnections: vi.fn(async () => {
          throw new ApiError(503, 'connector.unavailable', 'Connector is unavailable.')
        }),
      }),
      preferences(),
    )
    await start(store)

    store.selectNodes(['connector'])
    await vi.waitFor(() => expect(store.connectors.$.selectedConnectionError.value).toContain('Connector is unavailable'))

    expect(store.connectors.$.selectedAction.value).toEqual(connectorAction)
    expect(store.$.notice.value).toBeUndefined()
  })

  it('refreshes a returned Connection authorization and fixes the newly active account', async () => {
    const created = { connectionId: 'github-new', displayName: 'New account', isDefault: false, serviceId: 'github', status: 'active' as const }
    const listConnectorConnections = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created])
    const changeDraft = vi.fn(async () => draftChange(draftWithConnector('revision-2', created.connectionId)) satisfies DraftChange)
    const openExternalPage = vi.fn(async (resolveUrl: () => Promise<string>) => {
      expect(await resolveUrl()).toBe('https://connector.example/connections/new')
      return true
    })
    const store = new WorkbenchStore(
      client({
        changeDraft,
        createConnectorConnectionPage: vi.fn(async () => 'https://connector.example/connections/new'),
        getConnectorAction: vi.fn(async () => ({ ...connectorAction, defaultConnection: undefined })),
        getDraft: vi.fn(async () => draftWithConnector('revision-1', null)),
        listConnectorConnections,
      }),
      preferences(),
      () => crypto.randomUUID(),
      createI18n(),
      { openExternalPage },
    )
    await start(store)
    store.selectNodes(['connector'])
    await vi.waitFor(() => expect(listConnectorConnections).toHaveBeenCalledOnce())

    await store.connectors.connect('github')
    expect(store.connectors.$.selectedAuthorizationPending.value).toBe(true)
    await store.connectors.refreshAfterAuthorization()

    expect(listConnectorConnections).toHaveBeenCalledTimes(2)
    expect(changeDraft).toHaveBeenCalledWith('project-1', 'revision-1', [
      expect.objectContaining({
        kind: 'task.replace',
        task: expect.objectContaining({ executor: { action: 'github.create_issue', connectionId: 'github-new', kind: 'connector' } }),
      }),
    ])
    expect(store.connectors.$.selectedAuthorizationPending.value).toBe(false)
    expect(openExternalPage).toHaveBeenCalledOnce()
  })

  it('ignores Connector search results after cancellation', async () => {
    let resolveSearch: ((actions: readonly ConnectorAction[]) => void) | undefined
    const store = new WorkbenchStore(
      client({ searchConnectorActions: vi.fn(() => new Promise<readonly ConnectorAction[]>((resolve) => (resolveSearch = resolve))) }),
      preferences(),
    )
    await start(store)
    const controller = new AbortController()

    const result = store.connectors.provideAddNodeOptions('github', controller.signal)
    controller.abort()
    resolveSearch?.([connectorAction])

    await expect(result).resolves.toBeUndefined()
    expect(store.connectors.$.actions.value).toEqual({})
  })

  it('does not load the full Connector catalog for an empty QuickPick query', async () => {
    const listConnectorActions = vi.fn(async () => [connectorAction])
    const searchConnectorActions = vi.fn(async () => [connectorAction])
    const store = new WorkbenchStore(client({ listConnectorActions, searchConnectorActions }), preferences())
    await start(store)

    await expect(store.connectors.provideAddNodeOptions('', new AbortController().signal)).resolves.toEqual([])
    expect(listConnectorActions).not.toHaveBeenCalled()
    expect(searchConnectorActions).not.toHaveBeenCalled()
    store.dispose()
  })

  it('groups previously discovered Connector actions for an empty QuickPick query', async () => {
    const notionAction: ConnectorAction = {
      ...connectorAction,
      actionId: 'notion.create_page',
      icon: 'https://assets.example/notion.svg',
      name: 'Create Page',
      serviceId: 'notion',
      serviceName: 'Notion',
    }
    const listConnectorActions = vi.fn(async () => [])
    const searchConnectorActions = vi.fn(async () => [connectorAction, { ...connectorAction, actionId: 'github.get_issue', name: 'Get Issue' }, notionAction])
    const store = new WorkbenchStore(client({ listConnectorActions, searchConnectorActions }), preferences())
    await start(store)

    await store.connectors.provideAddNodeOptions('connector', new AbortController().signal)
    const providers = await store.connectors.provideAddNodeOptions('  ', new AbortController().signal)

    expect(providers).toHaveLength(2)
    expect(providers?.[0]).toMatchObject({
      choices: [
        { option: expect.objectContaining({ connector: connectorAction, id: 'connector:github.create_issue', kind: 'connector' }) },
        { option: expect.objectContaining({ id: 'connector:github.get_issue', kind: 'connector' }) },
      ],
      description: '2 actions',
      group: 'Connector actions',
      id: 'connector-provider:github',
      kind: 'connector-group',
      label: 'GitHub',
    })
    expect(providers?.[1]).toMatchObject({
      choices: [{ option: expect.objectContaining({ connector: notionAction, id: 'connector:notion.create_page', kind: 'connector' }) }],
      description: '1 action',
      id: 'connector-provider:notion',
      label: 'Notion',
    })
    expect(listConnectorActions).not.toHaveBeenCalled()
    expect(searchConnectorActions).toHaveBeenCalledOnce()

    await expect(store.connectors.provideAddNodeOptions('', new AbortController().signal)).resolves.toHaveLength(2)
    expect(searchConnectorActions).toHaveBeenCalledOnce()
    store.dispose()
  })

  it('rebases and retries a semantic change after a CAS conflict', async () => {
    const latest = draft('revision-2')
    const changed = {
      ...draft('revision-3'),
      content: {
        ...latest.content,
        document: {
          ...latest.content.document,
          subflows: {
            shared: {
              graph: { nodes: {} },
              inputs: { value: { jsonSchema: {}, nullable: true, value: null } },
              name: 'Shared',
              outputs: { result: { jsonSchema: {}, nullable: true, sources: [{ input: 'value', kind: 'flow' as const }] } },
            },
          },
        },
      },
    }
    const changeDraft = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(412, 'project.revision-conflict', 'Revision conflict.'))
      .mockResolvedValueOnce(draftChange(changed))
    const control = client({
      changeDraft,
      getDraft: vi.fn(async () => draft()),
      listFlows: vi.fn(async () => [flow(latest.revisionId)]),
      syncDraft: vi.fn(async () => ({ draft: latest, draftFlows: draftChange(latest).draftFlows, kind: 'snapshot' as const, version: 1 as const })),
    })
    const store = new WorkbenchStore(control, preferences(), () => 'shared')
    await start(store)

    await expect(store.workspace.createResource('subflow', 'Shared')).resolves.toBe(true)

    expect(changeDraft.mock.calls.map((call) => call[1])).toEqual(['revision-1', 'revision-2'])
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-3')
    expect(store.workspace.$.draft.value?.content.document.subflows.shared?.name).toBe('Shared')
  })

  it('rolls back a semantic change after repeated CAS conflicts and keeps the queue usable', async () => {
    const latest = draftWithNode('revision-2', 4)
    const saved = draftWithNode('revision-3', 3)
    const changeDraft = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(412, 'project.revision-conflict', 'Revision conflict.'))
      .mockRejectedValueOnce(new ApiError(412, 'project.revision-conflict', 'Revision conflict.'))
      .mockResolvedValueOnce(draftChange(saved))
    const syncDraft = vi.fn(async () => ({
      draft: latest,
      draftFlows: draftChange(latest).draftFlows,
      kind: 'snapshot' as const,
      version: 1 as const,
    }))
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => draftWithNode()), syncDraft }), preferences())
    await start(store)

    await expect(store.workspace.saveNodeSettings('first', { concurrency: 2 })).resolves.toBe(false)

    expect(store.workspace.$.draft.value?.revisionId).toBe(latest.revisionId)
    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 4 })
    expect(store.$.notice.value?.message).toContain('edit was not applied')

    await expect(store.workspace.saveNodeSettings('first', { concurrency: 3 })).resolves.toBe(true)

    expect(changeDraft.mock.calls.map((call) => call[1])).toEqual(['revision-1', 'revision-2', 'revision-2'])
    expect(syncDraft).toHaveBeenCalledTimes(2)
    expect(store.workspace.$.draft.value?.revisionId).toBe(saved.revisionId)
    store.dispose()
  })

  it('loads a Draft committed by another client after a realtime notification', async () => {
    const latest = draft('revision-2')
    let notify: ((revisionId?: string) => void) | undefined
    const getProject = vi.fn(async () => ({ ...project, draftRevisionId: latest.revisionId }))
    const control = client({
      getDraft: vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(latest),
      getProject,
      listFlows: vi
        .fn()
        .mockResolvedValueOnce([flow()])
        .mockResolvedValueOnce([flow(latest.revisionId)]),
      syncDraft: vi.fn(async () => ({ draft: latest, draftFlows: draftChange(latest).draftFlows, kind: 'snapshot' as const, version: 1 as const })),
      watchProject: vi.fn((_projectId, changed) => {
        notify = changed
        return () => {}
      }),
    })
    const store = new WorkbenchStore(control, preferences())
    await start(store)

    getProject.mockClear()
    notify?.(latest.revisionId)
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2'))

    expect(store.$.notice.value?.message).toContain('another client')
    expect(getProject).not.toHaveBeenCalled()
    store.dispose()
  })

  it('ignores its own realtime Draft notification when synchronization returns the committed snapshot', async () => {
    const changed = draftWithNode('revision-2', 2)
    let notify: ((revisionId?: string) => void) | undefined
    const syncDraft = vi.fn(async () => ({
      draft: changed,
      draftFlows: draftChange(changed).draftFlows,
      kind: 'snapshot' as const,
      version: 1 as const,
    }))
    const control = client({
      changeDraft: vi.fn(async () => {
        notify?.(changed.revisionId)
        return draftChange(changed)
      }),
      getDraft: vi.fn(async () => draftWithNode()),
      syncDraft,
      watchProject: vi.fn((_projectId, onChanged) => {
        notify = onChanged
        return () => {}
      }),
    })
    const store = new WorkbenchStore(control, preferences())
    await start(store)

    await expect(store.workspace.saveNodeSettings('first', { concurrency: 2 })).resolves.toBe(true)
    await vi.waitFor(() => expect(syncDraft).toHaveBeenCalledWith(project.projectId, changed.revisionId))

    expect(store.workspace.$.draft.value?.revisionId).toBe(changed.revisionId)
    expect(store.$.notice.value).toBeUndefined()
    store.dispose()
  })

  it('follows a Run created by another client for the open Flow', async () => {
    const externalRun: DraftRun = {
      closureDigest: 'closure',
      createdAt: '2026-08-11T00:00:00.000Z',
      engineContract: 'open-flow-engine/v1',
      engineDigest: 'engine-digest',
      finishedAt: '2026-08-11T00:00:00.008Z',
      flowId: 'main',
      modelVersion: 1,
      projectId: 'project-1',
      revisionDigest: 'digest-revision-1',
      revisionId: 'revision-1',
      runId: 'run-cli',
      source: 'draft',
      startedAt: '2026-08-11T00:00:00.001Z',
      status: 'completed',
      version: 1,
    }
    let runCreated: ((event: Extract<ProjectChangeEvent, { readonly kind: 'run.created' }>) => void) | undefined
    const getRun = vi.fn(async () => externalRun)
    const control = client({
      getRun,
      getRunEvents: vi.fn(async () => ({ done: true, events: [], historyComplete: true, nextAfter: 0, runId: externalRun.runId, version: 1 as const })),
      getRunResult: vi.fn(async () => ({
        finishedAt: externalRun.finishedAt!,
        result: null,
        runId: externalRun.runId,
        status: 'completed' as const,
        version: 1 as const,
      })),
      watchProject: vi.fn((_projectId, _changed, nextRunCreated) => {
        runCreated = nextRunCreated
        return () => {}
      }),
    })
    const store = new WorkbenchStore(control, preferences())
    await start(store)

    runCreated?.({ flowId: 'secondary', kind: 'run.created', projectId: project.projectId, runId: 'run-other', version: 1 })
    expect(getRun).not.toHaveBeenCalled()

    runCreated?.({ flowId: 'main', kind: 'run.created', projectId: project.projectId, runId: externalRun.runId, version: 1 })
    await vi.waitFor(() => expect(store.runs.$.externalRunId.value).toBe(externalRun.runId))

    expect(store.runs.$.run.value).toEqual(externalRun)
    expect(store.runs.$.runs.value).toEqual([externalRun])
    expect(getRun).toHaveBeenCalledWith(externalRun.runId)
    store.dispose()
  })

  it('applies an incremental Draft batch once and keeps an unrelated target projection cached', async () => {
    const initial = draftWithFlows('revision-1', { main: 'Main', secondary: 'Secondary' })
    const latest = draftWithFlows('revision-2', { main: 'Main', secondary: 'Renamed' })
    let notify: ((revisionId?: string) => void) | undefined
    const getDraft = vi.fn(async () => initial)
    const listFlows = vi.fn(async () => [flowSummary('main', 'Main', 'revision-1'), flowSummary('secondary', 'Secondary', 'revision-1')])
    const syncDraft = vi.fn(async () => ({
      draftFlows: draftChange(latest).draftFlows,
      kind: 'changes' as const,
      revisions: [
        {
          operations: [{ flowId: 'secondary', kind: 'flow.rename' as const, name: 'Renamed' }],
          revision: revisionMetadata(latest, 'revision-1'),
        },
      ],
      version: 1 as const,
    }))
    const store = new WorkbenchStore(
      client({
        getDraft,
        getProject: vi.fn(async () => ({ ...project, draftRevisionId: 'revision-2' })),
        listFlows,
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)
    await vi.waitFor(() => expect(store.workspace.$.diagnostics.value).toBeDefined())
    const designer = store.$.designer.value

    notify?.('revision-2')
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2'))

    expect(store.workspace.$.draft.value?.content.document.flows.secondary?.name).toBe('Renamed')
    expect(store.$.designer.value).toBe(designer)
    expect(syncDraft).toHaveBeenCalledWith('project-1', 'revision-1')
    expect(getDraft).toHaveBeenCalledOnce()
    expect(listFlows).toHaveBeenCalledOnce()
    store.dispose()
  })

  it('falls back to one forced snapshot when an incremental revision chain is invalid', async () => {
    const initial = draft('revision-1')
    const latest = draftWithNode('revision-2')
    let notify: ((revisionId?: string) => void) | undefined
    const syncDraft = vi
      .fn()
      .mockResolvedValueOnce({
        draftFlows: draftChange(latest).draftFlows,
        kind: 'changes',
        revisions: [{ operations: [], revision: revisionMetadata(latest, 'wrong-parent') }],
        version: 1,
      })
      .mockResolvedValueOnce({ draft: latest, draftFlows: draftChange(latest).draftFlows, kind: 'snapshot', version: 1 })
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => initial),
        getProject: vi.fn(async () => ({ ...project, draftRevisionId: 'revision-2' })),
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)

    notify?.('revision-2')
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2'))

    expect(syncDraft.mock.calls).toEqual([['project-1', 'revision-1'], ['project-1']])
    store.dispose()
  })

  it('coalesces rapid Draft invalidations while preserving revision order', async () => {
    const initial = draftWithFlows('revision-1', { main: 'One' })
    const second = draftWithFlows('revision-2', { main: 'Two' })
    const latest = draftWithFlows('revision-3', { main: 'Three' })
    const firstSync = Promise.withResolvers<Extract<DraftSync, { readonly kind: 'changes' }>>()
    let notify: ((revisionId?: string) => void) | undefined
    const syncDraft = vi
      .fn()
      .mockImplementationOnce(async () => await firstSync.promise)
      .mockResolvedValueOnce({
        draftFlows: draftChange(latest).draftFlows,
        kind: 'changes',
        revisions: [
          {
            operations: [{ flowId: 'main', kind: 'flow.rename', name: 'Three' }],
            revision: revisionMetadata(latest, 'revision-2'),
          },
        ],
        version: 1,
      })
    const getProject = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ ...project, draftRevisionId: 'revision-2' })
      .mockResolvedValueOnce({ ...project, draftRevisionId: 'revision-3' })
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => initial),
        getProject,
        listFlows: vi.fn(async () => [flowSummary('main', 'One', 'revision-1')]),
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)

    notify?.('revision-2')
    await vi.waitFor(() => expect(syncDraft).toHaveBeenCalledOnce())
    notify?.('revision-3')
    notify?.('revision-3')
    firstSync.resolve({
      draftFlows: draftChange(second).draftFlows,
      kind: 'changes',
      revisions: [
        {
          operations: [{ flowId: 'main', kind: 'flow.rename', name: 'Two' }],
          revision: revisionMetadata(second, 'revision-1'),
        },
      ],
      version: 1,
    })

    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe('revision-3'))
    expect(store.workspace.$.draft.value?.content.document.flows.main?.name).toBe('Three')
    expect(syncDraft.mock.calls).toEqual([
      ['project-1', 'revision-1'],
      ['project-1', 'revision-2'],
    ])
    store.dispose()
  })

  it('preserves an explicit Draft notification received during a silent connection sync', async () => {
    const latest = draftWithNode('revision-2')
    const firstSync = Promise.withResolvers<DraftSync>()
    let notify: ((revisionId?: string) => void) | undefined
    const syncDraft = vi
      .fn()
      .mockImplementationOnce(async () => await firstSync.promise)
      .mockResolvedValueOnce({
        draft: latest,
        draftFlows: draftChange(latest).draftFlows,
        kind: 'snapshot' as const,
        version: 1 as const,
      })
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => draft()),
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)

    notify?.()
    await vi.waitFor(() => expect(syncDraft).toHaveBeenCalledOnce())
    notify?.(latest.revisionId)
    firstSync.resolve({
      draft: draft(),
      draftFlows: draftChange(draft()).draftFlows,
      kind: 'snapshot',
      version: 1,
    })

    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe(latest.revisionId))
    expect(syncDraft.mock.calls).toEqual([
      [project.projectId, 'revision-1'],
      [project.projectId, 'revision-1'],
    ])
    expect(store.$.notice.value?.message).toContain('another client')
    store.dispose()
  })

  it('retries Draft synchronization after a transient failure and a later invalidation', async () => {
    const latest = draftWithNode('revision-2')
    let notify: ((revisionId?: string) => void) | undefined
    const syncDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary synchronization failure.'))
      .mockResolvedValueOnce({
        draft: latest,
        draftFlows: draftChange(latest).draftFlows,
        kind: 'snapshot' as const,
        version: 1 as const,
      })
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => draft()),
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)

    notify?.(latest.revisionId)
    await vi.waitFor(() => expect(syncDraft).toHaveBeenCalledOnce())
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0))
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-1')
    expect(store.$.notice.value).toBeUndefined()

    notify?.(latest.revisionId)
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe(latest.revisionId))

    expect(syncDraft).toHaveBeenCalledTimes(2)
    expect(store.$.notice.value?.message).toContain('another client')
    store.dispose()
  })

  it('reveals one node once after adjacent realtime changes become quiet', async () => {
    vi.useFakeTimers()
    const initial = draft()
    const second = draftWithNode('revision-2')
    const latest = draftWithNode('revision-3', 2)
    const created = second.content.document.flows.main!.graph.nodes.first!
    const replaced = latest.content.document.flows.main!.graph.nodes.first!
    let notify: ((revisionId?: string) => void) | undefined
    const getProject = vi
      .fn()
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ ...project, draftRevisionId: 'revision-2' })
      .mockResolvedValueOnce({ ...project, draftRevisionId: 'revision-3' })
    const syncDraft = vi
      .fn()
      .mockResolvedValueOnce({
        draftFlows: draftChange(second).draftFlows,
        kind: 'changes',
        revisions: [
          {
            operations: [{ kind: 'graph.node.create', node: created, nodeId: 'first', target: { id: 'main', kind: 'flow' } }],
            revision: revisionMetadata(second, 'revision-1'),
          },
        ],
        version: 1,
      })
      .mockResolvedValueOnce({
        draftFlows: draftChange(latest).draftFlows,
        kind: 'changes',
        revisions: [
          {
            operations: [{ kind: 'graph.node.replace', node: replaced, nodeId: 'first', target: { id: 'main', kind: 'flow' } }],
            revision: revisionMetadata(latest, 'revision-2'),
          },
        ],
        version: 1,
      })
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => initial),
        getProject,
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    try {
      await start(store)

      notify?.('revision-2')
      await vi.advanceTimersByTimeAsync(0)

      expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2')
      expect(store.workspace.$.nodeFocus.value).toBeUndefined()

      await vi.advanceTimersByTimeAsync(200)
      notify?.('revision-3')
      await vi.advanceTimersByTimeAsync(0)

      expect(store.workspace.$.draft.value?.revisionId).toBe('revision-3')
      expect(store.workspace.$.nodeFocus.value).toBeUndefined()

      await vi.advanceTimersByTimeAsync(249)
      expect(store.workspace.$.nodeFocus.value).toBeUndefined()

      await vi.advanceTimersByTimeAsync(1)
      expect(store.workspace.$.nodeFocus.value).toEqual({ nodeId: 'first', requestId: 1 })
      expect(store.workspace.$.selectedNodeIds.value).toEqual([])

      await vi.advanceTimersByTimeAsync(1_000)
      expect(store.workspace.$.nodeFocus.value).toEqual({ nodeId: 'first', requestId: 1 })
    } finally {
      store.dispose()
      vi.useRealTimers()
    }
  })

  it.each(['selection', 'viewport', 'target', 'local Draft change'] as const)('lets a %s cancel a pending realtime reveal', async (interaction) => {
    vi.useFakeTimers()
    const initial = draft()
    const latest = draftWithNode('revision-2')
    const created = latest.content.document.flows.main!.graph.nodes.first!
    let notify: ((revisionId?: string) => void) | undefined
    const store = new WorkbenchStore(
      client({
        changeDraft: vi.fn(async () => draftChange(draftWithNode('revision-3', 2))),
        getDraft: vi.fn(async () => initial),
        getProject: vi
          .fn()
          .mockResolvedValueOnce(project)
          .mockResolvedValueOnce({ ...project, draftRevisionId: latest.revisionId }),
        syncDraft: vi.fn(async () => ({
          draftFlows: draftChange(latest).draftFlows,
          kind: 'changes' as const,
          revisions: [
            {
              operations: [{ kind: 'graph.node.create' as const, node: created, nodeId: 'first', target: { id: 'main', kind: 'flow' as const } }],
              revision: revisionMetadata(latest, 'revision-1'),
            },
          ],
          version: 1 as const,
        })),
        updatePresentation: vi.fn(async (_projectId, _revision, value) => ({ ...presentation(2), value })),
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    try {
      await start(store)
      notify?.(latest.revisionId)
      await vi.advanceTimersByTimeAsync(0)
      expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2')

      switch (interaction) {
        case 'selection':
          store.selectNodes(['first'])
          break
        case 'viewport':
          await store.workspace.moveViewport({ x: 20, y: 30, zoom: 1 })
          break
        case 'target':
          store.workspace.selectTarget({ id: 'secondary', kind: 'flow' })
          break
        case 'local Draft change':
          await store.workspace.saveNodeSettings('first', { concurrency: 2 })
          break
      }

      await vi.advanceTimersByTimeAsync(250)
      expect(store.workspace.$.nodeFocus.value).toBeUndefined()
    } finally {
      store.dispose()
      vi.useRealTimers()
    }
  })

  it('does not reveal a snapshot received from a realtime invalidation', async () => {
    vi.useFakeTimers()
    const latest = draftWithNode('revision-2')
    let notify: ((revisionId?: string) => void) | undefined
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => draft()),
        getProject: vi
          .fn()
          .mockResolvedValueOnce(project)
          .mockResolvedValueOnce({ ...project, draftRevisionId: latest.revisionId }),
        syncDraft: vi.fn(async () => ({ draft: latest, draftFlows: draftChange(latest).draftFlows, kind: 'snapshot' as const, version: 1 as const })),
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    try {
      await start(store)
      notify?.(latest.revisionId)
      await vi.advanceTimersByTimeAsync(0)
      expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2')

      await vi.advanceTimersByTimeAsync(250)
      expect(store.workspace.$.nodeFocus.value).toBeUndefined()
    } finally {
      store.dispose()
      vi.useRealTimers()
    }
  })

  it('silently syncs changes found after an SSE reconnect without a realtime revision', async () => {
    vi.useFakeTimers()
    const latest = draftWithNode('revision-2')
    const created = latest.content.document.flows.main!.graph.nodes.first!
    let reconnect: ((revisionId?: string) => void) | undefined
    const getProject = vi.fn(async () => ({ ...project, draftRevisionId: latest.revisionId }))
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async () => draft()),
        getProject,
        syncDraft: vi.fn(async () => ({
          draftFlows: draftChange(latest).draftFlows,
          kind: 'changes' as const,
          revisions: [
            {
              operations: [{ kind: 'graph.node.create' as const, node: created, nodeId: 'first', target: { id: 'main', kind: 'flow' as const } }],
              revision: revisionMetadata(latest, 'revision-1'),
            },
          ],
          version: 1 as const,
        })),
        watchProject: vi.fn((_projectId, changed) => {
          reconnect = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    try {
      await start(store)
      getProject.mockClear()
      reconnect?.()

      await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2'))
      expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toEqual(created)
      await vi.advanceTimersByTimeAsync(250)
      expect(store.workspace.$.nodeFocus.value).toBeUndefined()
      expect(store.$.notice.value).toBeUndefined()
      expect(getProject).not.toHaveBeenCalled()
    } finally {
      store.dispose()
      vi.useRealTimers()
    }
  })

  it('defers an external Draft refresh until the semantic change queue settles', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const latest = draftWithNode('revision-3')
    let notify: ((revisionId?: string) => void) | undefined
    const changeDraft = vi.fn(async () => await pending.promise)
    const getDraft = vi.fn().mockResolvedValueOnce(draftWithNode()).mockResolvedValueOnce(latest)
    const getProject = vi.fn(async () => ({ ...project, draftRevisionId: latest.revisionId }))
    const listFlows = vi.fn(async () => [flow()])
    const store = new WorkbenchStore(
      client({
        changeDraft,
        getDraft,
        getProject,
        listFlows,
        syncDraft: vi.fn(async () => ({ draft: latest, draftFlows: draftChange(latest).draftFlows, kind: 'snapshot' as const, version: 1 as const })),
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)
    getProject.mockClear()

    const save = store.workspace.saveNodeSettings('first', { concurrency: 2 })
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    notify?.(latest.revisionId)

    expect(getProject).not.toHaveBeenCalled()

    pending.resolve(draftChange(draftWithNode('revision-2')))
    await expect(save).resolves.toBe(true)
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe(latest.revisionId))

    expect(getProject).not.toHaveBeenCalled()
    expect(getDraft).toHaveBeenCalledOnce()
    expect(listFlows).toHaveBeenCalledOnce()
    store.dispose()
  })

  it('bases a local change on an external Draft synchronization already in flight', async () => {
    const external = draftWithNode('revision-2', 2)
    const saved = draftWithNode('revision-3', 3)
    const pendingSync = Promise.withResolvers<DraftSync>()
    let notify: ((revisionId?: string) => void) | undefined
    const changeDraft = vi.fn(async () => draftChange(saved))
    const syncDraft = vi.fn(async () => await pendingSync.promise)
    const store = new WorkbenchStore(
      client({
        changeDraft,
        getDraft: vi.fn(async () => draftWithNode()),
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    await start(store)

    notify?.(external.revisionId)
    await vi.waitFor(() => expect(syncDraft).toHaveBeenCalledOnce())
    const save = store.workspace.saveNodeSettings('first', { concurrency: 3 })

    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 3 })
    expect(changeDraft).not.toHaveBeenCalled()

    pendingSync.resolve({
      draft: external,
      draftFlows: draftChange(external).draftFlows,
      kind: 'snapshot',
      version: 1,
    })
    await expect(save).resolves.toBe(true)

    expect(changeDraft).toHaveBeenCalledWith(project.projectId, external.revisionId, expect.any(Array))
    expect(store.workspace.$.draft.value?.revisionId).toBe(saved.revisionId)
    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 3 })
    store.dispose()
  })

  it.each(['switch', 'dispose'] as const)('drops a Draft synchronization response after a workspace %s', async (action) => {
    const latest = draftWithNode('revision-2')
    const otherProject = { ...project, draftRevisionId: 'revision-other', name: 'Other', projectId: 'project-2' }
    const otherDraft = { ...draft(), digest: 'digest-other', projectId: otherProject.projectId, revisionId: otherProject.draftRevisionId }
    const pendingSync = Promise.withResolvers<DraftSync>()
    const stop = vi.fn()
    const syncDraft = vi.fn(async () => await pendingSync.promise)
    let notify: ((revisionId?: string) => void) | undefined
    const store = new WorkbenchStore(
      client({
        getDraft: vi.fn(async (projectId) => (projectId == otherProject.projectId ? otherDraft : draft())),
        getProject: vi.fn(async (projectId) => (projectId == otherProject.projectId ? otherProject : project)),
        listFlows: vi.fn(async (projectId) => [flow(projectId == otherProject.projectId ? otherDraft.revisionId : 'revision-1')]),
        syncDraft,
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return stop
        }),
      }),
      preferences(),
    )
    await start(store)

    notify?.(latest.revisionId)
    await vi.waitFor(() => expect(syncDraft).toHaveBeenCalledOnce())
    if (action == 'switch') await store.selectProject(otherProject.projectId, 'main')
    else store.dispose()

    expect(stop).toHaveBeenCalledOnce()
    pendingSync.resolve({
      draft: latest,
      draftFlows: draftChange(latest).draftFlows,
      kind: 'snapshot',
      version: 1,
    })
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0))

    if (action == 'switch') {
      expect(store.workspace.$.projectId.value).toBe(otherProject.projectId)
      expect(store.workspace.$.draft.value).toEqual(otherDraft)
      expect(store.$.notice.value).toBeUndefined()
      store.dispose()
    }
  })

  it('serializes Presentation writes so each move uses the saved revision', async () => {
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const control = client({ updatePresentation })
    const store = new WorkbenchStore(control, preferences())
    await start(store)

    await Promise.all([store.workspace.moveNodes({ first: { x: 10, y: 20 } }), store.workspace.moveNodes({ second: { x: 30, y: 40 } })])

    expect(updatePresentation.mock.calls.map((call) => call[1])).toEqual([1, 2])
    expect(store.workspace.$.presentation.value?.value).toMatchObject({
      designer: { flows: { main: { nodes: { first: { x: 10, y: 20 }, second: { x: 30, y: 40 } } } } },
    })
  })

  it('keeps the latest viewport while queued Presentation writes complete', async () => {
    const saves: PromiseWithResolvers<Presentation>[] = []
    const updatePresentation = vi.fn((_projectId: string, _expectedRevision: number, _value: Presentation['value']) => {
      const save = Promise.withResolvers<Presentation>()
      saves.push(save)
      return save.promise
    })
    const store = new WorkbenchStore(client({ updatePresentation }), preferences())
    await start(store)

    const first = store.workspace.moveViewport({ x: 10, y: 20, zoom: 1 })
    await vi.waitFor(() => expect(updatePresentation).toHaveBeenCalledOnce())
    const second = store.workspace.moveViewport({ x: 30, y: 40, zoom: 1 })

    expect(store.$.designer.value.viewport).toEqual({ x: 30, y: 40, zoom: 1 })

    saves[0]!.resolve({ ...presentation(2), value: updatePresentation.mock.calls[0]![2] })
    await first

    expect(store.$.designer.value.viewport).toEqual({ x: 30, y: 40, zoom: 1 })
    await vi.waitFor(() => expect(updatePresentation).toHaveBeenCalledTimes(2))

    saves[1]!.resolve({ ...presentation(3), value: updatePresentation.mock.calls[1]![2] })
    await second

    expect(updatePresentation.mock.calls.map((call) => call[1])).toEqual([1, 2])
    expect(store.$.designer.value.viewport).toEqual({ x: 30, y: 40, zoom: 1 })
  })

  it('does not persist an unchanged viewport', async () => {
    const updatePresentation = vi.fn(async (_projectId: string, expectedRevision: number, value: Presentation['value']) => ({
      ...presentation(expectedRevision + 1),
      value,
    }))
    const store = new WorkbenchStore(client({ updatePresentation }), preferences())
    await start(store)

    await store.workspace.moveViewport({ x: 0, y: 0, zoom: 1 })
    expect(updatePresentation).not.toHaveBeenCalled()

    await store.workspace.moveViewport({ x: 10, y: 20, zoom: 1 })
    expect(updatePresentation).toHaveBeenCalledOnce()

    await store.workspace.moveViewport({ x: 10, y: 20, zoom: 1 })
    expect(updatePresentation).toHaveBeenCalledOnce()
  })

  it('keeps background viewport saves out of the Draft status', async () => {
    const pending = Promise.withResolvers<Presentation>()
    const updatePresentation = vi.fn(async () => await pending.promise)
    const store = new WorkbenchStore(client({ updatePresentation }), preferences())
    await start(store)

    const move = store.workspace.moveViewport({ x: 10, y: 20, zoom: 1 })
    await vi.waitFor(() => expect(updatePresentation).toHaveBeenCalledOnce())

    expect(store.workspace.$.status.value).toBe('saved')

    pending.resolve(presentation(2))
    await move
  })

  it('drops queued and late Presentation writes after disposal', async () => {
    const pending = Promise.withResolvers<Presentation>()
    const updatePresentation = vi.fn(async () => await pending.promise)
    const store = new WorkbenchStore(client({ updatePresentation }), preferences())
    await start(store)

    const first = store.workspace.moveViewport({ x: 10, y: 20, zoom: 1 })
    const queued = store.workspace.moveViewport({ x: 30, y: 40, zoom: 1 })
    await vi.waitFor(() => expect(updatePresentation).toHaveBeenCalledOnce())

    store.dispose()
    const late = store.workspace.moveViewport({ x: 50, y: 60, zoom: 1 })
    pending.resolve(presentation(2))

    await expect(Promise.all([first, queued, late])).resolves.toEqual([undefined, undefined, undefined])
    expect(updatePresentation).toHaveBeenCalledOnce()
  })

  it('drops a semantic response that arrives after disposal', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const changeDraft = vi.fn(async () => await pending.promise)
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => draftWithNode()) }), preferences())
    await start(store)

    const save = store.workspace.saveNodeSettings('first', { concurrency: 2 })
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    store.dispose()
    pending.resolve(draftChange(draftWithNode('revision-2')))

    await expect(save).resolves.toBe(false)
  })

  it('projects semantic changes immediately and advances the committed revision after saving', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const listFlows = vi.fn(async () => [flow()])
    const store = new WorkbenchStore(
      client({
        changeDraft: vi.fn(async () => await pending.promise),
        getDraft: vi.fn(async () => draftWithNode()),
        listFlows,
      }),
      preferences(),
    )
    await start(store)

    const save = store.workspace.saveNodeSettings('first', { concurrency: 2 })

    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 2 })
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-1')
    expect(store.workspace.$.status.value).toBe('saving')

    pending.resolve(draftChange(draftWithNode('revision-2', 2)))
    await expect(save).resolves.toBe(true)

    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2')
    expect(store.workspace.$.targetFlow.value).toMatchObject({
      draft: { revisionId: 'revision-2' },
      hasUnpublishedChanges: true,
    })
    expect(store.workspace.$.status.value).toBe('saved')
    expect(listFlows).toHaveBeenCalledOnce()
  })

  it('rolls back an optimistic semantic change when the deployment rejects it', async () => {
    const pending = Promise.withResolvers<DraftChange>()
    const store = new WorkbenchStore(
      client({
        changeDraft: vi.fn(async () => await pending.promise),
        getDraft: vi.fn(async () => draftWithNode()),
      }),
      preferences(),
    )
    await start(store)

    const save = store.workspace.saveNodeSettings('first', { concurrency: 2 })
    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 2 })

    pending.reject(new ApiError(400, 'project.invalid', 'Invalid node.'))
    await expect(save).resolves.toBe(false)

    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 1 })
    expect(store.workspace.$.status.value).toBe('saved')
    expect(store.$.notice.value?.message).toContain('Invalid node')
  })

  it('keeps the latest local projection and coalesces queued replacements for one node', async () => {
    const first = Promise.withResolvers<DraftChange>()
    const second = Promise.withResolvers<DraftChange>()
    const responses = [first.promise, second.promise]
    const listFlows = vi.fn(async () => [flow()])
    const changeDraft = vi.fn(
      async (_projectId: string, _revisionId: string, _changes: Parameters<WorkbenchClient['changeDraft']>[2]) => await responses.shift()!,
    )
    const store = new WorkbenchStore(client({ changeDraft, getDraft: vi.fn(async () => draftWithNode()), listFlows }), preferences())
    await start(store)

    const settings = store.workspace.saveNodeSettings('first', { concurrency: 2 })
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledOnce())
    const description = store.workspace.saveNodeDescription('first', 'Draft')
    const latest = store.workspace.saveNodeDescription('first', 'Final')

    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 2, description: 'Final' })

    first.resolve(draftChange(draftWithNode('revision-2', 2)))
    await vi.waitFor(() => expect(changeDraft).toHaveBeenCalledTimes(2))

    expect(changeDraft.mock.calls[1]?.[1]).toBe('revision-2')
    expect(changeDraft.mock.calls[1]?.[2]).toEqual([
      expect.objectContaining({
        kind: 'graph.node.replace',
        node: expect.objectContaining({ concurrency: 2, description: 'Final' }),
      }),
    ])
    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toMatchObject({ concurrency: 2, description: 'Final' })

    second.resolve(draftChange(draftWithNode('revision-3', 2, 'Final')))
    await expect(Promise.all([settings, description, latest])).resolves.toEqual([true, true, true])

    expect(changeDraft).toHaveBeenCalledTimes(2)
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-3')
    expect(listFlows).toHaveBeenCalledOnce()
  })

  it('serializes semantic writes so node deletion uses the preceding revision', async () => {
    const revisions = [draftWithNode('revision-2'), draft('revision-3')]
    const changeDraft = vi.fn(async (_projectId: string, _revisionId: string, _operations: Parameters<WorkbenchClient['changeDraft']>[2]) => {
      const revision = revisions.shift()!
      return draftChange(revision)
    })
    const control = client({ changeDraft, getDraft: vi.fn(async () => draftWithNode()) })
    const store = new WorkbenchStore(control, preferences())
    await start(store)
    store.selectNodes(['first'])

    await Promise.all([store.workspace.saveNodeSettings('first', { concurrency: 2 }), store.workspace.deleteSelectedNodes()])

    expect(changeDraft.mock.calls.map((call) => call[1])).toEqual(['revision-1', 'revision-2'])
    expect(changeDraft.mock.calls.map((call) => call[2][0]?.kind)).toEqual(['graph.node.replace', 'graph.node.delete'])
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-3')
    expect(store.workspace.$.draft.value?.content.document.flows.main?.graph.nodes.first).toBeUndefined()
  })

  it('keeps semantic changes inside store commands', async () => {
    const current = draft()
    const changeDraft = vi.fn(async (_projectId: string, _revisionId: string, operations: Parameters<WorkbenchClient['changeDraft']>[2]) => {
      const operation = operations[0]!
      const document =
        operation.kind == 'subflow.create'
          ? {
              ...current.content.document,
              subflows: { ...current.content.document.subflows, [operation.subflowId]: operation.subflow },
            }
          : current.content.document
      const revision: Draft = { ...current, content: { ...current.content, document }, parentRevisionId: 'revision-1', revisionId: 'revision-2' }
      return draftChange(revision)
    })
    const control = client({ changeDraft })
    const identities = ['subflow-1']
    const store = new WorkbenchStore(control, preferences(), () => identities.shift()!)
    await start(store)

    expect(await store.workspace.createResource('subflow', 'Shared')).toBe(true)

    expect(changeDraft).toHaveBeenCalledOnce()
    expect(changeDraft.mock.calls[0]?.[2]).toEqual([expect.objectContaining({ kind: 'subflow.create', subflowId: 'subflow-1' })])
    expect(store.workspace.$.draft.value?.content.document.subflows['subflow-1']?.name).toBe('Shared')
    expect(store.workspace.$.target.value).toEqual({ id: 'subflow-1', kind: 'subflow' })
  })

  it('loads and paginates Publication history independently from Run history', async () => {
    const first = publication('main', 'revision-1')
    const second = { ...publication('main', 'revision-0'), publicationId: 'publication-older' }
    const listPublications = vi
      .fn()
      .mockResolvedValueOnce({ nextCursor: 'publication-cursor', publications: [first], total: 2, version: 1 as const })
      .mockResolvedValueOnce({ publications: [second], version: 1 as const })
    const store = new WorkbenchStore(
      client({
        getLive: vi.fn(async () => liveState(first)),
        listPublications,
      }),
      preferences(),
    )
    await start(store)

    await store.publications.load('project-1', 'main')
    await store.publications.loadMore()

    expect(store.publications.$.live.value?.publication?.publicationId).toBe(first.publicationId)
    expect(store.publications.$.publications.value.map((item) => item.publicationId)).toEqual([first.publicationId, second.publicationId])
    expect(store.publications.$.total.value).toBe(2)
    expect(listPublications).toHaveBeenNthCalledWith(1, 'project-1', 'main', { includeTotal: true, limit: 50 })
    expect(listPublications).toHaveBeenNthCalledWith(2, 'project-1', 'main', { cursor: 'publication-cursor', limit: 50 })
    store.dispose()
  })

  it('loads Trigger binding details and changes the operator pause state', async () => {
    const current = publication('main', 'revision-1')
    const active = triggerBinding('active')
    const suspended = triggerBinding('paused')
    const detail: TriggerBindingDetail = {
      binding: active,
      version: 1,
    }
    const listFlowTriggerBindings = vi.fn().mockResolvedValueOnce([active]).mockResolvedValueOnce([suspended]).mockResolvedValueOnce([active])
    const pauseResponse = Promise.withResolvers<TriggerBinding>()
    const pauseFlowTrigger = vi.fn(async () => await pauseResponse.promise)
    const resumeFlowTrigger = vi.fn(async () => active)
    const store = new WorkbenchStore(
      client({
        getFlowTriggerBinding: vi.fn(async () => detail),
        getLive: vi.fn(async () => liveState(current)),
        listFlowTriggerBindings,
        listPublications: vi.fn(async () => ({ publications: [current], version: 1 as const })),
        pauseFlowTrigger,
        resumeFlowTrigger,
      }),
      preferences(),
    )
    await start(store)
    await store.publications.load('project-1', 'main')

    await store.publications.openTrigger(active.triggerNodeId)
    expect(store.publications.$.detail.value).toEqual(detail)

    const pausing = store.publications.toggleTrigger(active)
    await vi.waitFor(() => expect(pauseFlowTrigger).toHaveBeenCalledOnce())
    expect(store.$.busy.value).toBe('trigger')
    pauseResponse.resolve(suspended)
    expect(await pausing).toBe(true)
    expect(pauseFlowTrigger).toHaveBeenCalledWith('project-1', 'main', active.triggerNodeId)
    expect(store.publications.$.bindings.value).toEqual([suspended])

    expect(await store.publications.toggleTrigger(suspended)).toBe(true)
    expect(resumeFlowTrigger).toHaveBeenCalledWith('project-1', 'main', active.triggerNodeId)
    expect(store.publications.$.bindings.value).toEqual([active])
    store.dispose()
  })

  it('paginates Trigger activities and tests a current Poll binding without changing its runtime state', async () => {
    const current = publication('main', 'revision-1')
    const poll = { ...triggerBinding('active'), kind: 'poll' as const, triggerNodeId: 'poll-trigger' }
    const firstActivity = {
      activityId: 'activity-1',
      createdAt: '2026-08-12T00:00:00.000Z',
      kind: 'health.recovered' as const,
    }
    const secondActivity = {
      activityId: 'activity-2',
      createdAt: '2026-08-11T00:00:00.000Z',
      errorCode: 'connector.connection-required',
      errorMessage: 'Reconnect the selected account.',
      kind: 'delivery.failed' as const,
    }
    const listFlowTriggerActivities = vi
      .fn()
      .mockResolvedValueOnce({ activities: [firstActivity], nextCursor: 'activity-cursor', version: 1 as const })
      .mockResolvedValueOnce({ activities: [secondActivity], version: 1 as const })
    const testFlowPollTrigger = vi.fn(async () => ({ events: [{ id: 'event-1' }], filtered: 2, hasMore: true, version: 1 as const }))
    const store = new WorkbenchStore(
      client({
        getFlowTriggerBinding: vi.fn(async () => ({ binding: poll, version: 1 as const })),
        getLive: vi.fn(async () => liveState(current)),
        listFlowTriggerActivities,
        listFlowTriggerBindings: vi.fn(async () => [poll]),
        listPublications: vi.fn(async () => ({ publications: [current], version: 1 as const })),
        testFlowPollTrigger,
      }),
      preferences(),
    )
    await start(store)
    await store.publications.load('project-1', 'main')

    await store.publications.openTrigger(poll.triggerNodeId)
    expect(store.publications.$.activities.value).toEqual([firstActivity])
    expect(store.publications.$.activitiesNextCursor.value).toBe('activity-cursor')

    await store.publications.loadMoreTriggerActivities()
    expect(store.publications.$.activities.value).toEqual([firstActivity, secondActivity])
    expect(listFlowTriggerActivities).toHaveBeenNthCalledWith(2, 'project-1', 'main', poll.triggerNodeId, {
      cursor: 'activity-cursor',
      limit: 20,
    })

    expect(await store.publications.testTrigger()).toBe(true)
    expect(testFlowPollTrigger).toHaveBeenCalledWith('project-1', 'main', poll.triggerNodeId)
    expect(store.publications.$.testResult.value).toEqual({ events: [{ id: 'event-1' }], filtered: 2, hasMore: true, version: 1 })
    expect(store.publications.$.testingTriggerId.value).toBeUndefined()
    store.dispose()
  })

  it('keeps a late Poll test result out after closing Trigger details', async () => {
    const current = publication('main', 'revision-1')
    const poll = { ...triggerBinding('active'), kind: 'poll' as const, triggerNodeId: 'poll-trigger' }
    const result = Promise.withResolvers<Awaited<ReturnType<WorkbenchClient['testFlowPollTrigger']>>>()
    const store = new WorkbenchStore(
      client({
        getFlowTriggerBinding: vi.fn(async () => ({ binding: poll, version: 1 as const })),
        getLive: vi.fn(async () => liveState(current)),
        listFlowTriggerBindings: vi.fn(async () => [poll]),
        listPublications: vi.fn(async () => ({ publications: [current], version: 1 as const })),
        testFlowPollTrigger: vi.fn(async () => await result.promise),
      }),
      preferences(),
    )
    await start(store)
    await store.publications.load('project-1', 'main')
    await store.publications.openTrigger(poll.triggerNodeId)

    const testing = store.publications.testTrigger()
    store.publications.closeTrigger()
    result.resolve({ events: [{ id: 'event-1' }], filtered: 0, hasMore: false, version: 1 })

    expect(await testing).toBe(false)
    expect(store.publications.$.selectedTriggerId.value).toBeUndefined()
    expect(store.publications.$.testingTriggerId.value).toBeUndefined()
    expect(store.publications.$.testResult.value).toBeUndefined()
    store.dispose()
  })

  it('keeps a late Publication load out of the current Flow session', async () => {
    const old = publication('main', 'revision-1')
    const latest = publication('secondary', 'revision-2')
    const oldLive = Promise.withResolvers<Live>()
    const oldPage = Promise.withResolvers<Awaited<ReturnType<WorkbenchClient['listPublications']>>>()
    const getLive = vi
      .fn()
      .mockImplementationOnce(() => oldLive.promise)
      .mockResolvedValueOnce({ ...liveState(latest), flowId: latest.flowId })
    const listPublications = vi
      .fn()
      .mockImplementationOnce(() => oldPage.promise)
      .mockResolvedValueOnce({ publications: [latest], version: 1 as const })
    const store = new WorkbenchStore(client({ getLive, listPublications }), preferences())
    await start(store)

    const loadingOld = store.publications.load('project-1', old.flowId)
    await store.publications.load('project-1', latest.flowId)
    oldLive.resolve(liveState(old))
    oldPage.resolve({ publications: [old], version: 1 })
    await loadingOld

    expect(store.publications.$.live.value?.flowId).toBe(latest.flowId)
    expect(store.publications.$.publications.value).toEqual([latest])
    store.dispose()
  })

  it('keeps a failed Publication page recoverable', async () => {
    const first = publication('main', 'revision-1')
    const listPublications = vi
      .fn()
      .mockResolvedValueOnce({ nextCursor: 'publication-cursor', publications: [first], version: 1 as const })
      .mockRejectedValueOnce(new ApiError(503, 'request.failed', 'Page failed.'))
      .mockResolvedValueOnce({ publications: [], version: 1 as const })
    const store = new WorkbenchStore(
      client({
        getLive: vi.fn(async () => liveState(first)),
        listPublications,
      }),
      preferences(),
    )
    await start(store)
    await store.publications.load('project-1', 'main')

    await store.publications.loadMore()
    expect(store.publications.$.loadMoreFailed.value).toBe(true)

    await store.publications.loadMore()
    expect(store.publications.$.loadMoreFailed.value).toBe(false)
    expect(listPublications).toHaveBeenCalledTimes(3)
    store.dispose()
  })

  it('retries one Publish operation with the same idempotency key and refreshes Live state', async () => {
    const previous = publication('main', 'revision-0')
    const published = { ...publication('main', 'revision-1'), publicationId: 'publication-current' }
    const initialFlow: Flow = {
      draft: { closureDigest: 'closure-main', name: 'Main', revisionDigest: 'digest-revision-1', revisionId: 'revision-1' },
      flowId: 'main',
      hasUnpublishedChanges: true,
      live: { publication: previous, revision: 1, status: 'runnable' },
    }
    const currentFlow: Flow = {
      ...initialFlow,
      hasUnpublishedChanges: false,
      live: { publication: published, revision: 2, status: 'runnable' },
    }
    const publishFlow = vi.fn().mockRejectedValueOnce(new Error('Connection lost.')).mockResolvedValueOnce(published)
    const listFlows = vi.fn().mockResolvedValueOnce([initialFlow]).mockResolvedValueOnce([currentFlow])
    const getLive = vi.fn().mockResolvedValueOnce(liveState(previous, 1)).mockResolvedValueOnce(liveState(published, 2))
    const listPublications = vi
      .fn()
      .mockResolvedValueOnce({ publications: [previous], total: 1, version: 1 as const })
      .mockResolvedValueOnce({ publications: [published, previous], total: 2, version: 1 as const })
    const store = new WorkbenchStore(client({ getLive, listFlows, listPublications, publishFlow }), preferences(), () => 'publication-operation')
    await start(store)
    await store.publications.load('project-1', 'main')

    await expect(store.publications.publish()).resolves.toBe(false)
    await expect(store.publications.publish()).resolves.toBe(true)

    expect(publishFlow).toHaveBeenCalledTimes(2)
    expect(publishFlow.mock.calls.map((call) => call[4])).toEqual([{ idempotencyKey: 'publication-operation' }, { idempotencyKey: 'publication-operation' }])
    expect(publishFlow).toHaveBeenLastCalledWith('project-1', 'revision-1', 'main', previous.publicationId, {
      idempotencyKey: 'publication-operation',
    })
    expect(store.workspace.$.targetFlow.value).toEqual(currentFlow)
    expect(store.publications.$.live.value?.publication?.publicationId).toBe(published.publicationId)
    expect(store.publications.$.publications.value).toEqual([published, previous])
    store.dispose()
  })

  it('reloads the competing Live state after a Publish precondition conflict', async () => {
    const previous = publication('main', 'revision-0')
    const competing = { ...publication('main', 'revision-other'), publicationId: 'publication-competing' }
    const initialFlow: Flow = {
      draft: { closureDigest: 'closure-main', name: 'Main', revisionDigest: 'digest-revision-1', revisionId: 'revision-1' },
      flowId: 'main',
      hasUnpublishedChanges: true,
      live: { publication: previous, revision: 1, status: 'runnable' },
    }
    const competingFlow: Flow = { ...initialFlow, live: { publication: competing, revision: 2, status: 'runnable' } }
    const store = new WorkbenchStore(
      client({
        getLive: vi.fn().mockResolvedValueOnce(liveState(previous, 1)).mockResolvedValueOnce(liveState(competing, 2)),
        listFlows: vi.fn().mockResolvedValueOnce([initialFlow]).mockResolvedValueOnce([competingFlow]),
        listPublications: vi
          .fn()
          .mockResolvedValueOnce({ publications: [previous], total: 1, version: 1 as const })
          .mockResolvedValueOnce({ publications: [competing, previous], total: 2, version: 1 as const }),
        publishFlow: vi.fn(async () => {
          throw new ApiError(412, 'live.conflict', 'Live changed.')
        }),
      }),
      preferences(),
      () => 'conflicting-operation',
    )
    await start(store)
    await store.publications.load('project-1', 'main')

    await expect(store.publications.publish()).resolves.toBe(false)

    expect(store.workspace.$.targetFlow.value).toEqual(competingFlow)
    expect(store.publications.$.live.value?.publication?.publicationId).toBe(competing.publicationId)
    expect(store.publications.$.publications.value).toEqual([competing, previous])
    expect(store.$.notice.value?.message).toContain('live.conflict')
    store.dispose()
  })

  it('creates a new rollback Publication without reading or replacing the Draft', async () => {
    const target = { ...publication('main', 'revision-0'), publicationId: 'publication-target' }
    const current = { ...publication('main', 'revision-1'), publicationId: 'publication-current' }
    const rolledBack: Publication = {
      ...target,
      createdAt: '2026-08-11T00:00:00.000Z',
      operation: 'rollback',
      publicationId: 'publication-rollback',
      sourcePublicationId: target.publicationId,
    }
    const initialFlow: Flow = {
      draft: { closureDigest: 'closure-main', name: 'Main', revisionDigest: 'digest-revision-1', revisionId: 'revision-1' },
      flowId: 'main',
      hasUnpublishedChanges: false,
      live: { publication: current, revision: 2, status: 'runnable' },
    }
    const nextFlow: Flow = {
      ...initialFlow,
      hasUnpublishedChanges: true,
      live: { publication: rolledBack, revision: 3, status: 'runnable' },
    }
    const getDraft = vi.fn(async () => draft())
    const rollbackFlow = vi.fn(async () => rolledBack)
    const store = new WorkbenchStore(
      client({
        getDraft,
        getLive: vi.fn().mockResolvedValueOnce(liveState(current, 2)).mockResolvedValueOnce(liveState(rolledBack, 3)),
        listFlows: vi.fn().mockResolvedValueOnce([initialFlow]).mockResolvedValueOnce([nextFlow]),
        listPublications: vi
          .fn()
          .mockResolvedValueOnce({ publications: [current, target], total: 2, version: 1 as const })
          .mockResolvedValueOnce({ publications: [rolledBack, current, target], total: 3, version: 1 as const }),
        rollbackFlow,
      }),
      preferences(),
      () => 'rollback-operation',
    )
    await start(store)
    await store.publications.load('project-1', 'main')

    await expect(store.publications.rollback(target)).resolves.toBe(true)

    expect(rollbackFlow).toHaveBeenCalledWith('project-1', 'main', target.publicationId, current.publicationId, {
      idempotencyKey: 'rollback-operation',
    })
    expect(getDraft).toHaveBeenCalledOnce()
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-1')
    expect(store.publications.$.publications.value[0]).toEqual(rolledBack)
    store.dispose()
  })
})
