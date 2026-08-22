import type { WorkbenchClient, Draft, Flow, Presentation, Project } from './api.ts'

import { describe, expect, it, vi } from 'vitest'
import { NavigationStore } from './navigation.ts'
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

const draft: Draft = {
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
  digest: 'digest-1',
  modelVersion: 1,
  parentRevisionId: null,
  projectId: project.projectId,
  revisionId: 'revision-1',
  version: 1,
}

const flow: Flow = {
  draft: { closureDigest: 'closure-1', name: 'Main', revisionDigest: draft.digest, revisionId: draft.revisionId },
  flowId: 'main',
  hasUnpublishedChanges: true,
  live: null,
}

const presentation: Presentation = {
  revision: 1,
  updatedAt: '2026-08-10T00:00:00.000Z',
  value: {},
  version: 1,
}

function client(overrides: Partial<WorkbenchClient> = {}): WorkbenchClient {
  return {
    checkFlow: vi.fn(async () => ({
      closureDigest: flow.draft!.closureDigest,
      diagnostics: [],
      engineContract: 'open-flow-engine/v1',
      flowId: flow.flowId,
      modelVersion: 1,
      projectId: project.projectId,
      revisionDigest: draft.digest,
      revisionId: draft.revisionId,
      valid: true,
      version: 1,
    })),
    getDraft: vi.fn(async () => draft),
    getPresentation: vi.fn(async () => presentation),
    getProject: vi.fn(async () => project),
    listFlows: vi.fn(async () => [flow]),
    listProjects: vi.fn(async () => ({ projects: [project], total: 1, version: 1 as const })),
    watchProject: vi.fn(() => () => {}),
    ...overrides,
  } as WorkbenchClient
}

function preferences(): Pick<Storage, 'getItem' | 'setItem'> {
  return { getItem: () => null, setItem: () => {} }
}

describe('NavigationStore', () => {
  it('keeps a routed Flow focused while its Project is loading', async () => {
    const pendingDraft = Promise.withResolvers<Draft>()
    const store = new WorkbenchStore(client({ getDraft: vi.fn(() => pendingDraft.promise) }), preferences())
    const navigation = new NavigationStore(store, { flowId: flow.flowId, projectId: project.projectId, view: 'design' }, vi.fn())

    const starting = navigation.start()
    expect(store.workspace.$.workspaceLoading.value).toBe(true)
    expect(store.workspace.$.target.value).toEqual({ id: flow.flowId, kind: 'flow' })

    pendingDraft.resolve(draft)
    await starting
    expect(store.workspace.$.target.value).toEqual({ id: flow.flowId, kind: 'flow' })
    navigation.dispose()
    store.dispose()
  })

  it('moves through Project list, Flow list, and the focused Flow without restoring a previous selection', async () => {
    const control = client()
    const store = new WorkbenchStore(control, preferences())
    const navigate = vi.fn()
    const navigation = new NavigationStore(store, { view: 'design' }, navigate)

    await navigation.start()

    expect(store.workspace.$.projectId.value).toBeUndefined()
    expect(store.workspace.$.target.value).toBeUndefined()
    expect(control.getDraft).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()

    await navigation.selectProject(project.projectId)

    expect(store.workspace.$.projectId.value).toBe(project.projectId)
    expect(store.workspace.$.target.value).toBeUndefined()
    expect(navigate).toHaveBeenLastCalledWith({ flowId: undefined, projectId: project.projectId, view: 'design' }, { replace: false })

    navigation.selectFlow(flow)

    expect(store.workspace.$.target.value).toEqual({ id: flow.flowId, kind: 'flow' })
    expect(navigate).toHaveBeenLastCalledWith({ flowId: flow.flowId, projectId: project.projectId, view: 'design' }, { replace: false })

    navigation.openProject()

    expect(store.workspace.$.target.value).toBeUndefined()
    expect(navigate).toHaveBeenLastCalledWith({ flowId: undefined, projectId: project.projectId, view: 'design' }, { replace: false })

    await navigation.openProjects()

    expect(store.workspace.$.projectId.value).toBeUndefined()
    expect(navigate).toHaveBeenLastCalledWith({ flowId: undefined, projectId: undefined, view: 'design' }, { replace: false })
    expect(control.listProjects).toHaveBeenCalledOnce()
    navigation.dispose()
    store.dispose()
  })

  it('opens a Flow created by another client when the Project browser is open', async () => {
    const createdDraft: Draft = {
      ...draft,
      content: {
        ...draft.content,
        document: {
          ...draft.content.document,
          flows: {
            ...draft.content.document.flows,
            created: { graph: { nodes: {} }, name: 'Created' },
          },
        },
      },
      digest: 'digest-2',
      parentRevisionId: draft.revisionId,
      revisionId: 'revision-2',
    }
    const createdFlow: Flow = {
      draft: { closureDigest: 'closure-created', name: 'Created', revisionDigest: createdDraft.digest, revisionId: createdDraft.revisionId },
      flowId: 'created',
      hasUnpublishedChanges: true,
      live: null,
    }
    const nextDraft: Draft = {
      ...createdDraft,
      content: {
        ...createdDraft.content,
        document: {
          ...createdDraft.content.document,
          flows: {
            ...createdDraft.content.document.flows,
            next: { graph: { nodes: {} }, name: 'Next' },
          },
        },
      },
      digest: 'digest-3',
      parentRevisionId: createdDraft.revisionId,
      revisionId: 'revision-3',
    }
    let notify: ((revisionId?: string) => void) | undefined
    let draftRevisionId = draft.revisionId
    const store = new WorkbenchStore(
      client({
        getProject: vi.fn(async () => ({ ...project, draftRevisionId })),
        syncDraft: vi.fn(async (_projectId, baseRevisionId) =>
          baseRevisionId == draft.revisionId
            ? {
                draft: createdDraft,
                draftFlows: [
                  { closureDigest: flow.draft!.closureDigest, flowId: flow.flowId, name: flow.draft!.name },
                  { closureDigest: createdFlow.draft!.closureDigest, flowId: createdFlow.flowId, name: createdFlow.draft!.name },
                ],
                kind: 'snapshot' as const,
                version: 1 as const,
              }
            : {
                draft: nextDraft,
                draftFlows: [
                  { closureDigest: flow.draft!.closureDigest, flowId: flow.flowId, name: flow.draft!.name },
                  { closureDigest: createdFlow.draft!.closureDigest, flowId: createdFlow.flowId, name: createdFlow.draft!.name },
                  { closureDigest: 'closure-next', flowId: 'next', name: 'Next' },
                ],
                kind: 'snapshot' as const,
                version: 1 as const,
              },
        ),
        watchProject: vi.fn((_projectId, changed) => {
          notify = changed
          return () => {}
        }),
      }),
      preferences(),
    )
    const navigate = vi.fn()
    const navigation = new NavigationStore(store, { projectId: project.projectId, view: 'design' }, navigate)
    await navigation.start()

    expect(store.workspace.$.target.value).toBeUndefined()

    draftRevisionId = createdDraft.revisionId
    notify?.(createdDraft.revisionId)
    await vi.waitFor(() => expect(store.workspace.$.target.value).toEqual({ id: createdFlow.flowId, kind: 'flow' }))

    expect(navigate).toHaveBeenLastCalledWith({ flowId: createdFlow.flowId, projectId: project.projectId, view: 'design' }, { replace: true })

    draftRevisionId = nextDraft.revisionId
    notify?.(nextDraft.revisionId)
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe(nextDraft.revisionId))

    expect(store.workspace.$.target.value).toEqual({ id: createdFlow.flowId, kind: 'flow' })
    expect(navigate).not.toHaveBeenCalledWith({ flowId: 'next', projectId: project.projectId, view: 'design' }, expect.anything())
    navigation.dispose()
    store.dispose()
  })
})
