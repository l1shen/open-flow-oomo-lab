import type { ChangeOperation } from '@oomol-lab/open-flow/project-change'
import type { WorkbenchClient, Draft, DraftFlow, Flow, Project, RevisionMetadata } from '../../open-flow/src/workbench/browser/runtime/api.ts'

import { applyProjectChanges } from '@oomol-lab/open-flow/project-change'
import { describe, expect, it, vi } from 'vitest'
import { WorkbenchStore } from '../../open-flow/src/workbench/browser/runtime/stores/workbenchStore.ts'
import { runCli } from '../src/cli/node/cli.ts'

const createdAt = '2026-08-14T00:00:00.000Z'

function initialDraft(): Draft {
  return {
    actorId: 'actor-1',
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
    createdAt,
    digest: 'digest-revision-1',
    modelVersion: 1,
    parentRevisionId: null,
    projectId: 'project-1',
    revisionId: 'revision-1',
    version: 1,
  }
}

function metadata(value: Draft): RevisionMetadata {
  const { content: _content, ...revision } = value
  return revision
}

function draftFlows(value: Draft): readonly DraftFlow[] {
  return Object.entries(value.content.document.flows).map(([flowId, flow]) => ({
    closureDigest: `closure-${flowId}-${value.revisionId}`,
    flowId,
    name: flow.name,
  }))
}

function flows(value: Draft): readonly Flow[] {
  return draftFlows(value).map((flow) => ({
    draft: {
      closureDigest: flow.closureDigest,
      name: flow.name,
      revisionDigest: value.digest,
      revisionId: value.revisionId,
    },
    flowId: flow.flowId,
    hasUnpublishedChanges: true,
    live: null,
  }))
}

function project(value: Draft): Project {
  return {
    createdAt,
    draftRevisionId: value.revisionId,
    name: 'Example',
    projectId: 'project-1',
    status: 'active',
    updatedAt: createdAt,
    version: 1,
  }
}

function preferences(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  }
}

describe('CLI and Workbench', () => {
  it('advances an open Workbench from R0 to the Revision committed by the CLI', async () => {
    let current = initialDraft()
    let acceptedOperations: readonly ChangeOperation[] = []
    let notify: ((revisionId?: string) => void) | undefined
    const syncDraft = vi.fn(async (_projectId: string, fromRevisionId?: string) => {
      if (fromRevisionId == 'revision-1' && current.revisionId == 'revision-2') {
        return {
          draftFlows: draftFlows(current),
          kind: 'changes' as const,
          revisions: [{ operations: acceptedOperations, revision: metadata(current) }],
          version: 1 as const,
        }
      }
      return { draft: current, draftFlows: draftFlows(current), kind: 'snapshot' as const, version: 1 as const }
    })
    const workbenchClient = {
      checkFlow: vi.fn(async (_projectId: string, revisionId: string, flowId: string) => ({
        closureDigest: `closure-${flowId}-${revisionId}`,
        diagnostics: [],
        engineContract: 'open-flow-engine/v1',
        flowId,
        modelVersion: 1,
        projectId: 'project-1',
        revisionDigest: `digest-${revisionId}`,
        revisionId,
        valid: true,
        version: 1 as const,
      })),
      getDraft: vi.fn(async () => current),
      getPresentation: vi.fn(async () => ({ revision: 1, updatedAt: createdAt, value: {}, version: 1 as const })),
      getProject: vi.fn(async () => project(current)),
      listConnectorActions: vi.fn(async () => []),
      listFlows: vi.fn(async () => flows(current)),
      listFlowTriggerBindings: vi.fn(async () => []),
      listProjects: vi.fn(async () => ({ projects: [project(current)], total: 1, version: 1 as const })),
      syncDraft,
      watchProject: vi.fn((_projectId: string, changed: (revisionId?: string) => void) => {
        notify = changed
        return () => {}
      }),
    } as unknown as WorkbenchClient
    const store = new WorkbenchStore(workbenchClient, preferences())
    await store.start('project-1', 'main')
    expect(store.workspace.$.draft.value?.revisionId).toBe('revision-1')

    let mutationRequests = 0
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path == '/v1/projects/project-1') return Response.json(project(current))
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: flows(current), projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/draft/changes') {
        mutationRequests += 1
        const body = JSON.parse(String(init?.body)) as {
          readonly expectedRevisionId: string
          readonly operations: readonly ChangeOperation[]
          readonly version: 1
        }
        expect(body.expectedRevisionId).toBe('revision-1')
        acceptedOperations = body.operations
        current = {
          ...current,
          content: applyProjectChanges(current.content, body.operations),
          digest: 'digest-revision-2',
          parentRevisionId: 'revision-1',
          revisionId: 'revision-2',
        }
        notify?.(current.revisionId)
        return Response.json({ draftFlows: draftFlows(current), revision: metadata(current), version: 1 })
      }
      return Response.json({ error: { code: 'route.not-found', message: path } }, { status: 404 })
    })
    let stdout = ''
    let stderr = ''

    const exitCode = await runCli(
      ['create', 'CLI Flow', '--project', 'project-1', '--json'],
      { request, getProject: async () => undefined, setProject: async () => {} },
      {
        env: {},
        language: 'en',
        openUrl: async () => {},
        readFile: async () => '',
        readStdin: async () => '',
        stderr: { write: (value) => (stderr += value) },
        stdout: { write: (value) => (stdout += value) },
        wait: async () => {},
      },
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchObject({ kind: 'flow.create', revision: { revisionId: 'revision-2' } })
    expect(mutationRequests).toBe(1)
    await vi.waitFor(() => expect(store.workspace.$.draft.value?.revisionId).toBe('revision-2'))
    expect(Object.values(store.workspace.$.draft.value?.content.document.flows ?? {}).map((flow) => flow.name)).toContain('CLI Flow')
    expect(syncDraft).toHaveBeenCalledWith('project-1', 'revision-1')
    store.dispose()
  })
})
