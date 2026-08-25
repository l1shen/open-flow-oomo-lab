import type { Draft, DraftRun, Flow, LiveRun } from './api.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RunRequestStore } from './runs/runRequestStore.ts'

const flow: Flow = {
  draft: { closureDigest: 'closure', name: 'Main', revisionDigest: 'digest', revisionId: 'revision-1' },
  flowId: 'main',
  hasUnpublishedChanges: true,
  live: null,
}

const run: DraftRun = {
  closureDigest: 'closure',
  createdAt: '2026-08-11T00:00:00.000Z',
  engineContract: 'open-flow-engine/v1',
  engineDigest: 'engine-digest',
  flowId: 'main',
  modelVersion: 1,
  projectId: 'project-1',
  revisionDigest: 'revision-digest',
  revisionId: 'revision-1',
  runId: 'run-1',
  source: 'draft',
  status: 'queued',
  version: 1,
}

const liveRun: LiveRun = {
  ...run,
  publicationId: 'publication-live',
  revisionId: 'revision-live',
  runId: 'run-live',
  source: 'live',
}

function draft(unconnected = true): Draft {
  return {
    actorId: 'actor-1',
    content: {
      document: {
        bindings: {},
        flows: {
          main: {
            graph: {
              nodes: {
                task: {
                  concurrency: 1,
                  inputs: {
                    connected: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'source', output: 'result' }] },
                    static: { kind: 'value', value: 'fixed' },
                  },
                  kind: 'task',
                  task: {
                    inputs: {
                      connected: { jsonSchema: { type: 'string' }, nullable: false },
                      defaulted: { jsonSchema: { type: 'string' }, nullable: false, value: 'default' },
                      ...(unconnected ? { message: { jsonSchema: { type: 'string' }, nullable: false } } : {}),
                      static: { jsonSchema: { type: 'string' }, nullable: false },
                    },
                    moduleId: 'module-main',
                    name: 'Code task',
                    outputs: {},
                  },
                },
                source: {
                  concurrency: 1,
                  inputs: {},
                  kind: 'value',
                  values: { result: { jsonSchema: { type: 'string' }, nullable: false, value: 'source' } },
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
      modules: { 'module-main': { imports: [], name: 'Main', source: 'export default function run(input) { return input }' } },
    },
    createdAt: '2026-08-11T00:00:00.000Z',
    digest: 'draft-digest',
    modelVersion: 1,
    parentRevisionId: null,
    projectId: 'project-1',
    revisionId: 'revision-1',
    version: 1,
  }
}

beforeEach(() => {
  vi.stubGlobal('cancelIdleCallback', vi.fn())
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 1),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('RunRequestStore', () => {
  it('requests only unset root inputs and sends the confirmed values', async () => {
    const createDraftRun = vi.fn(async () => run)
    const follow = vi.fn(() => true)
    const store = new RunRequestStore(
      { createDraftRun, createLiveRun: vi.fn(), getRevision: vi.fn() },
      { follow, prepareStart: vi.fn(() => () => true) },
      vi.fn(),
    )

    await expect(store.requestDraft('project-1', flow, draft())).resolves.toBe('input')
    const request = store.$.inputRequest.value!
    expect(request.groups.map(({ nodeId, title }) => ({ nodeId, title }))).toEqual([{ nodeId: 'task', title: 'Code task' }])
    expect(request.groups[0]!.editor.replaceValues({ connected: 'not allowed', message: 'Hello' })).toBe(false)
    expect(request.groups[0]!.editor.replaceValues({ message: 'Hello' })).toBe(true)
    expect(request.valid.value).toBe(true)

    await expect(store.confirmInputs()).resolves.toBe(true)
    expect(createDraftRun).toHaveBeenCalledWith('project-1', 'revision-1', 'main', {
      idempotencyKey: expect.any(String),
      inputs: { task: { message: 'Hello' } },
    })
    expect(follow).toHaveBeenCalledWith(run, expect.any(Function))
    expect(store.$.inputRequest.value).toBeUndefined()
    store.dispose()
  })

  it('starts immediately when the Flow has no unset root inputs', async () => {
    const createDraftRun = vi.fn(async () => run)
    const store = new RunRequestStore(
      { createDraftRun, createLiveRun: vi.fn(), getRevision: vi.fn() },
      { follow: vi.fn(() => true), prepareStart: vi.fn(() => () => true) },
      vi.fn(),
    )

    await expect(store.requestDraft('project-1', flow, draft(false))).resolves.toBe('started')
    expect(createDraftRun).toHaveBeenCalledWith('project-1', 'revision-1', 'main', { idempotencyKey: expect.any(String), inputs: {} })
    store.dispose()
  })

  it('derives Live inputs from the immutable published Revision and starts a Live Run', async () => {
    const liveFlow: Flow = {
      draft: { closureDigest: 'draft-closure', name: 'Main', revisionDigest: 'draft-digest', revisionId: 'revision-draft' },
      flowId: 'main',
      hasUnpublishedChanges: true,
      live: {
        publication: {
          actorId: 'actor-1',
          closureDigest: 'live-closure',
          createdAt: '2026-08-10T00:00:00.000Z',
          engineContract: 'open-flow-engine/v1',
          flowId: 'main',
          modelVersion: 1,
          operation: 'publish',
          projectId: 'project-1',
          publicationId: 'publication-live',
          revisionDigest: 'live-digest',
          revisionId: 'revision-live',
          version: 1,
        },
        revision: 1,
        status: 'runnable',
      },
    }
    const publishedRevision = { ...draft(), revisionId: 'revision-live' }
    const createLiveRun = vi.fn(async () => liveRun)
    const getRevision = vi.fn(async () => publishedRevision)
    const store = new RunRequestStore(
      { createDraftRun: vi.fn(), createLiveRun, getRevision },
      { follow: vi.fn(() => true), prepareStart: vi.fn(() => () => true) },
      vi.fn(),
      undefined,
      () => 'live-run-operation',
    )

    await expect(store.requestLive('project-1', liveFlow)).resolves.toBe('input')
    expect(getRevision).toHaveBeenCalledWith('project-1', 'revision-live')
    expect(store.$.inputRequest.value?.source).toBe('live')
    expect(store.$.inputRequest.value?.revisionId).toBe('revision-live')
    expect(store.$.inputRequest.value?.groups[0]?.editor.replaceValues({ message: 'From Live' })).toBe(true)

    await expect(store.confirmInputs()).resolves.toBe(true)
    expect(createLiveRun).toHaveBeenCalledWith('publication-live', {
      idempotencyKey: 'live-run-operation',
      inputs: { task: { message: 'From Live' } },
    })
    store.dispose()
  })

  it('does not supersede an active Live request when the requested Flow has no Draft', async () => {
    const revision = Promise.withResolvers<Draft>()
    const liveFlow: Flow = {
      draft: null,
      flowId: 'main',
      hasUnpublishedChanges: false,
      live: {
        publication: {
          actorId: 'actor-1',
          closureDigest: 'live-closure',
          createdAt: '2026-08-10T00:00:00.000Z',
          engineContract: 'open-flow-engine/v1',
          flowId: 'main',
          modelVersion: 1,
          operation: 'publish',
          projectId: 'project-1',
          publicationId: 'publication-live',
          revisionDigest: 'live-digest',
          revisionId: 'revision-live',
          version: 1,
        },
        revision: 1,
        status: 'runnable',
      },
    }
    const store = new RunRequestStore(
      { createDraftRun: vi.fn(), createLiveRun: vi.fn(), getRevision: vi.fn(() => revision.promise) },
      { follow: vi.fn(() => true), prepareStart: vi.fn(() => () => true) },
      vi.fn(),
    )

    const requestingLive = store.requestLive('project-1', liveFlow)
    expect(store.$.starting.value).toBe(true)
    await expect(store.requestDraft('project-1', liveFlow, draft())).resolves.toBe('unavailable')
    expect(store.$.starting.value).toBe(true)

    revision.resolve(draft())
    await expect(requestingLive).resolves.toBe('input')
    expect(store.$.starting.value).toBe(false)
    expect(store.$.inputRequest.value?.source).toBe('live')
    store.dispose()
  })

  it('ignores a run accepted after the current project session was reset', async () => {
    const pending = Promise.withResolvers<DraftRun>()
    const createDraftRun = vi.fn(() => pending.promise)
    const follow = vi.fn(() => true)
    const store = new RunRequestStore(
      { createDraftRun, createLiveRun: vi.fn(), getRevision: vi.fn() },
      { follow, prepareStart: vi.fn(() => () => true) },
      vi.fn(),
    )

    const starting = store.requestDraft('project-1', flow, draft(false))
    expect(store.$.starting.value).toBe(true)
    expect(store.$.submitting.value).toBe('draft')

    store.reset()
    pending.resolve(run)
    await starting

    expect(store.$.starting.value).toBe(false)
    expect(store.$.submitting.value).toBeUndefined()
    expect(follow).not.toHaveBeenCalled()
    store.dispose()
  })

  it('clears submission state when another Run selection supersedes the start request', async () => {
    const pending = Promise.withResolvers<DraftRun>()
    let current = true
    const follow = vi.fn()
    const store = new RunRequestStore(
      { createDraftRun: vi.fn(() => pending.promise), createLiveRun: vi.fn(), getRevision: vi.fn() },
      { follow, prepareStart: vi.fn(() => () => current) },
      vi.fn(),
    )

    const starting = store.requestDraft('project-1', flow, draft(false))
    expect(store.$.starting.value).toBe(true)
    expect(store.$.submitting.value).toBe('draft')
    current = false
    pending.resolve(run)

    await expect(starting).resolves.toBe('unavailable')
    expect(store.$.starting.value).toBe(false)
    expect(store.$.submitting.value).toBeUndefined()
    expect(follow).not.toHaveBeenCalled()
    store.dispose()
  })
})
