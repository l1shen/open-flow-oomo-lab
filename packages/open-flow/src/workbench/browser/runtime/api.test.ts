import type { ProjectChangeEvent } from './contract.ts'

import { describe, expect, it, vi } from 'vitest'
import { ApiError, WorkbenchClient } from './api.ts'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status })
}

function revision(revisionId: string, parentRevisionId: string | null) {
  return {
    actorId: 'actor-1',
    createdAt: '2026-08-10T00:00:00.000Z',
    digest: `digest-${revisionId}`,
    modelVersion: 1,
    parentRevisionId,
    projectId: 'project-1',
    revisionId,
    version: 1,
  }
}

function draft(revisionId: string, parentRevisionId: string | null) {
  return {
    ...revision(revisionId, parentRevisionId),
    content: {
      document: { bindings: {}, flows: {}, subflows: {}, tasks: {} },
      modelVersion: 1,
      modules: {},
    },
  }
}

function project(projectId: string, draftRevisionId: string) {
  return {
    createdAt: '2026-08-10T00:00:00.000Z',
    draftRevisionId,
    name: 'Acme',
    projectId,
    status: 'active',
    updatedAt: '2026-08-10T00:00:00.000Z',
    version: 1,
  }
}

function publication(operation: 'publish' | 'rollback' = 'publish') {
  return {
    actorId: 'actor-1',
    closureDigest: 'closure-1',
    createdAt: '2026-08-10T00:00:00.000Z',
    engineContract: 'open-flow-engine/v1',
    flowId: 'flow/a',
    modelVersion: 1,
    operation,
    projectId: 'project-1',
    publicationId: 'publication-1',
    revisionDigest: 'digest-revision-1',
    revisionId: 'revision-1',
    ...(operation == 'rollback' ? { sourcePublicationId: 'publication/source' } : {}),
    version: 1,
  }
}

function run(source: 'draft' | 'live') {
  return {
    closureDigest: 'closure-1',
    createdAt: '2026-08-10T00:00:00.000Z',
    engineContract: 'open-flow-engine/v1',
    engineDigest: 'engine-1',
    flowId: 'flow/a',
    modelVersion: 1,
    projectId: 'project-1',
    ...(source == 'live' ? { publicationId: 'publication-1' } : {}),
    revisionDigest: 'digest-revision-1',
    revisionId: 'revision-1',
    runId: 'run-1',
    source,
    status: 'queued',
    version: 1,
  }
}

describe('WorkbenchClient', () => {
  it('routes realtime Draft and Run invalidations', () => {
    const stopped = vi.fn()
    let listener: ((event?: ProjectChangeEvent) => void) | undefined
    const subscribeProject = vi.fn((_projectId, nextListener) => {
      listener = nextListener
      return stopped
    })
    const changed = vi.fn()
    const runCreated = vi.fn()
    const stop = new WorkbenchClient(vi.fn(), subscribeProject).watchProject('project-1', changed, runCreated)

    expect(subscribeProject).toHaveBeenCalledWith('project-1', expect.any(Function))
    listener?.()
    listener?.({ kind: 'draft.changed', projectId: 'project-1', revisionId: 'revision-2', version: 1 })
    listener?.({ flowId: 'main', kind: 'run.created', projectId: 'project-1', runId: 'run-1', version: 1 })
    expect(changed.mock.calls).toEqual([[], ['revision-2']])
    expect(runCreated).toHaveBeenCalledWith({ flowId: 'main', kind: 'run.created', projectId: 'project-1', runId: 'run-1', version: 1 })

    stop()
    expect(stopped).toHaveBeenCalledOnce()
  })

  it('reads the lightweight Project head through the host request', async () => {
    const fetcher = vi.fn(async () => json(project('project-1', 'revision-2')))
    const client = new WorkbenchClient(fetcher)

    expect(await client.getProject('project-1')).toMatchObject({ draftRevisionId: 'revision-2' })
    expect(fetcher).toHaveBeenCalledWith('/v1/projects/project-1', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('retires a Project through the host request', async () => {
    const retiring = { ...project('project/a', 'revision-2'), status: 'retiring' as const }
    const fetcher = vi.fn(async () => json(retiring, 202))
    const client = new WorkbenchClient(fetcher)

    expect(await client.deleteProject('project/a')).toEqual(retiring)
    expect(fetcher).toHaveBeenCalledWith('/v1/projects/project%2Fa', expect.objectContaining({ headers: expect.any(Headers), method: 'DELETE' }))
  })

  it('reads an immutable Project Revision', async () => {
    const fetcher = vi.fn(async () => json(draft('revision/a', null)))
    const client = new WorkbenchClient(fetcher)

    expect(await client.getRevision('project/a', 'revision/a')).toMatchObject({ revisionId: 'revision/a' })
    expect(fetcher).toHaveBeenCalledWith('/v1/projects/project%2Fa/revisions/revision%2Fa', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('uses the versioned Project tree and delegates credentials to the host', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      const path = String(input)
      if (path == '/v1/projects?limit=50&includeTotal=true') {
        return json({ nextCursor: 'next', projects: [project('project-1', 'revision-1')], total: 2, version: 1 })
      }
      if (path.endsWith('/runs')) return json(run('draft'), 202)
      return json(publication())
    })
    const client = new WorkbenchClient(fetcher)

    expect(await client.listProjects({ includeTotal: true, limit: 50 })).toEqual({
      nextCursor: 'next',
      projects: [project('project-1', 'revision-1')],
      total: 2,
      version: 1,
    })
    await client.createDraftRun('project-1', 'revision-1', 'flow/a')
    await client.publishFlow('project-1', 'revision-1', 'flow/a', null)

    expect(requests[0]?.input).toBe('/v1/projects?limit=50&includeTotal=true')
    expect(requests[0]?.init?.credentials).toBeUndefined()
    expect(requests[1]?.input).toBe('/v1/projects/project-1/revisions/revision-1/flows/flow%2Fa/runs')
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({ engineContract: 'open-flow-engine/v1', inputs: {}, version: 1 })
    expect(new Headers(requests[1]?.init?.headers).get('idempotency-key')).toMatch(/^run-/)
    expect(JSON.parse(String(requests[2]?.init?.body))).toEqual({
      engineContract: 'open-flow-engine/v1',
      expectedLivePublicationId: null,
      version: 1,
    })
  })

  it('lists Runs with encoded filters and an opaque cursor', async () => {
    const fetcher = vi.fn(async () => json({ nextCursor: 'next', projectId: 'project/a', runs: [], version: 1 }))
    const client = new WorkbenchClient(fetcher)

    expect(await client.listRuns('project/a', { cursor: 'cursor/+', flowId: 'flow/a', limit: 20, status: 'failed' })).toEqual({
      nextCursor: 'next',
      projectId: 'project/a',
      runs: [],
      version: 1,
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/v1/projects/project%2Fa/runs?cursor=cursor%2F%2B&flowId=flow%2Fa&limit=20&status=failed',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('reads Live and paginates Publication history', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/live')) {
        return json({
          flowId: 'flow/a',
          hasUnpublishedChanges: false,
          projectId: 'project/a',
          publication: null,
          revision: 0,
          status: 'not-published',
          version: 1,
        })
      }
      return json({ nextCursor: 'next', publications: [], total: 0, version: 1 })
    })
    const client = new WorkbenchClient(fetcher)

    expect(await client.getLive('project/a', 'flow/a')).toMatchObject({ status: 'not-published' })
    expect(await client.listPublications('project/a', 'flow/a', { cursor: 'cursor/+', includeTotal: true, limit: 20 })).toEqual({
      nextCursor: 'next',
      publications: [],
      total: 0,
      version: 1,
    })

    expect(fetcher).toHaveBeenNthCalledWith(1, '/v1/projects/project%2Fa/flows/flow%2Fa/live', expect.objectContaining({ headers: expect.any(Headers) }))
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/v1/projects/project%2Fa/flows/flow%2Fa/publications?cursor=cursor%2F%2B&limit=20&includeTotal=true',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('uses caller-owned idempotency keys for Run, Publish, and Rollback retries', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      const path = String(input)
      if (path.endsWith('/runs')) return json(run(path.includes('/revisions/') ? 'draft' : 'live'))
      return json(publication(path.endsWith('/rollback') ? 'rollback' : 'publish'))
    })
    const client = new WorkbenchClient(fetcher)
    const inputs = { trigger: { message: 'hello' } }

    await client.createDraftRun('project-1', 'revision-1', 'flow/a', { idempotencyKey: 'draft-run-operation', inputs })
    await client.createLiveRun('publication/live', { idempotencyKey: 'live-run-operation', inputs })
    await client.createLiveRun('publication/live', { idempotencyKey: 'live-run-operation', inputs })
    await client.publishFlow('project-1', 'revision-1', 'flow/a', null, { idempotencyKey: 'publish-operation' })
    await client.rollbackFlow('project-1', 'flow/a', 'publication/source', 'publication-live', { idempotencyKey: 'rollback-operation' })

    expect(requests.map((request) => String(request.input))).toEqual([
      '/v1/projects/project-1/revisions/revision-1/flows/flow%2Fa/runs',
      '/v1/runs',
      '/v1/runs',
      '/v1/projects/project-1/revisions/revision-1/flows/flow%2Fa/publications',
      '/v1/projects/project-1/flows/flow%2Fa/publications/publication%2Fsource/rollback',
    ])
    expect(requests.map((request) => new Headers(request.init?.headers).get('idempotency-key'))).toEqual([
      'draft-run-operation',
      'live-run-operation',
      'live-run-operation',
      'publish-operation',
      'rollback-operation',
    ])
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ engineContract: 'open-flow-engine/v1', inputs, version: 1 })
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({ inputs, publicationId: 'publication/live', version: 1 })
    expect(JSON.parse(String(requests[3]?.init?.body))).toEqual({
      engineContract: 'open-flow-engine/v1',
      expectedLivePublicationId: null,
      version: 1,
    })
    expect(JSON.parse(String(requests[4]?.init?.body))).toEqual({ expectedLivePublicationId: 'publication-live', version: 1 })
  })

  it('increments Run event reads and cancels a Run through the control routes', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      if (String(input).endsWith('/cancel')) return json({ cancelAccepted: true, runId: 'run/a', status: 'canceled', version: 1 })
      return json({ done: false, events: [], eventsExpiresAt: '2026-08-12T00:00:00.000Z', historyComplete: true, nextAfter: 42, runId: 'run/a', version: 1 })
    })
    const client = new WorkbenchClient(fetcher)

    expect(await client.getRunEvents('run/a', { after: 21, limit: 100 })).toMatchObject({ nextAfter: 42 })
    expect(await client.cancelRun('run/a')).toMatchObject({ cancelAccepted: true, status: 'canceled' })

    expect(requests[0]?.input).toBe('/v1/runs/run%2Fa/events?after=21&limit=100')
    expect(requests[0]?.init?.method).toBeUndefined()
    expect(requests[1]?.input).toBe('/v1/runs/run%2Fa/cancel')
    expect(requests[1]?.init?.method).toBe('POST')
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({ version: 1 })
    expect(new Headers(requests[1]?.init?.headers).has('idempotency-key')).toBe(false)
  })

  it('loads Connector providers, provider actions, and Connections and opens the external Connection page', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      if (String(input).endsWith('/page')) return json({ url: 'https://connector.example/providers/github', version: 1 })
      if (String(input).endsWith('/connections/github')) {
        return json({
          connections: [{ connectionId: 'github-work', displayName: 'Work account', isDefault: true, serviceId: 'github', status: 'active' }],
          projectId: 'project-1',
          serviceId: 'github',
          version: 1,
        })
      }
      if (String(input).endsWith('/connector/providers')) {
        return json({
          projectId: 'project-1',
          providers: [{ icon: 'https://assets.example/github.svg', serviceId: 'github', serviceName: 'GitHub' }],
          version: 1,
        })
      }
      return json({
        actions: [
          {
            actionId: 'github.create_issue',
            description: 'Create an issue.',
            inputs: {},
            name: 'Create issue',
            outputs: {},
            serviceId: 'github',
            serviceName: 'GitHub',
          },
        ],
        projectId: 'project-1',
        version: 1,
      })
    })
    const client = new WorkbenchClient(fetcher)

    expect(await client.listConnectorProviders('project-1')).toEqual([
      { icon: 'https://assets.example/github.svg', serviceId: 'github', serviceName: 'GitHub' },
    ])
    expect(await client.listConnectorActions('project-1', 'github')).toMatchObject([{ actionId: 'github.create_issue' }])
    expect(await client.searchConnectorActions('project-1', 'create issue')).toEqual([
      {
        actionId: 'github.create_issue',
        description: 'Create an issue.',
        inputs: {},
        name: 'Create issue',
        outputs: {},
        serviceId: 'github',
        serviceName: 'GitHub',
      },
    ])
    expect(await client.listConnectorConnections('project-1', 'github')).toEqual([
      { connectionId: 'github-work', displayName: 'Work account', isDefault: true, serviceId: 'github', status: 'active' },
    ])
    expect(await client.createConnectorConnectionPage('project-1', 'github')).toBe('https://connector.example/providers/github')

    expect(requests[0]?.input).toBe('/v1/projects/project-1/connector/providers')
    expect(requests[1]?.input).toBe('/v1/projects/project-1/connector/actions?service=github')
    expect(requests[2]?.input).toBe('/v1/projects/project-1/connector/actions?q=create%20issue')
    expect(requests[3]?.input).toBe('/v1/projects/project-1/connector/connections/github')
    expect(requests[4]?.input).toBe('/v1/projects/project-1/connector/connections/github/page')
    expect(JSON.parse(String(requests[4]?.init?.body))).toEqual({ version: 1 })
  })

  it('discovers Trigger Keys through the shared Control API client', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = []
    const definition = {
      configSchema: {},
      definitionVersion: 1,
      description: 'Repository event.',
      displayName: 'Repository Event',
      endpoint: {
        body: { allowArray: false, allowEmpty: false, formats: ['json'] },
        methods: ['POST'],
        successStatus: 202,
      },
      key: 'github.repository_event',
      name: 'repository_event',
      payloadSchema: {},
      provider: 'github',
      type: 'integration',
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      const path = String(input)
      if (path == '/v1/trigger-keys') {
        return json({
          keys: [
            {
              description: 'Repository event.',
              displayName: 'Repository Event',
              key: 'github.repository_event',
              name: 'repository_event',
              provider: 'github',
              type: 'integration',
            },
          ],
          version: 1,
        })
      }
      if (path == '/v1/trigger-keys/catalog') return json({ definitions: [definition], version: 1 })
      if (path.startsWith('/v1/trigger-keys/')) {
        return json({ definition, version: 1 })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const client = new WorkbenchClient(fetcher)

    expect(await client.listTriggerKeys()).toEqual([
      {
        description: 'Repository event.',
        displayName: 'Repository Event',
        key: 'github.repository_event',
        name: 'repository_event',
        provider: 'github',
        type: 'integration',
      },
    ])
    expect(await client.listTriggerDefinitions()).toEqual([definition])
    expect(await client.getTriggerKey('github.repository/event')).toMatchObject({ key: 'github.repository_event' })

    expect(requests.map((request) => request.input)).toEqual(['/v1/trigger-keys', '/v1/trigger-keys/catalog', '/v1/trigger-keys/github.repository%2Fevent'])
  })

  it('submits one revision-guarded domain change', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      json({
        draftFlows: [{ closureDigest: 'closure-1', flowId: 'flow-1', name: 'Main' }],
        revision: revision('revision-2', 'revision-1'),
        version: 1,
        request: JSON.parse(String(init?.body)),
      }),
    )
    const client = new WorkbenchClient(fetcher)
    const operation = { flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'flow-1', kind: 'flow.create' as const }

    const response = await client.changeDraft('project-1', 'revision-1', [operation])

    expect(response).toMatchObject({ draftFlows: [{ flowId: 'flow-1' }], revision: { revisionId: 'revision-2' } })
    expect(fetcher).toHaveBeenCalledWith(
      '/v1/projects/project-1/draft/changes',
      expect.objectContaining({
        body: JSON.stringify({ expectedRevisionId: 'revision-1', operations: [operation], version: 1 }),
        method: 'POST',
      }),
    )
  })

  it('syncs Draft changes from an opaque Revision and can force a snapshot', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      json(
        String(input).includes('?')
          ? { draftFlows: [], kind: 'changes', revisions: [], version: 1 }
          : { draft: draft('revision-2', 'revision-1'), draftFlows: [], kind: 'snapshot', version: 1 },
      ),
    )
    const client = new WorkbenchClient(fetcher)

    await expect(client.syncDraft('project/a', 'revision/a')).resolves.toMatchObject({ kind: 'changes' })
    await expect(client.syncDraft('project/a')).resolves.toMatchObject({ kind: 'snapshot' })
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      '/v1/projects/project%2Fa/draft/sync?fromRevisionId=revision%2Fa',
      '/v1/projects/project%2Fa/draft/sync',
    ])
  })

  it('rejects malformed Draft sync responses at the deployment boundary', async () => {
    const client = new WorkbenchClient(vi.fn(async () => json({ draftFlows: [], kind: 'changes', revisions: [{}], version: 1 })))

    await expect(client.syncDraft('project-1', 'revision-1')).rejects.toMatchObject({ code: 'response.invalid', status: 502 })
  })

  it('reads and revision-guards Presentation independently from the Draft', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      return json({ revision: init?.method == 'PUT' ? 3 : 2, updatedAt: '2026-08-10T00:00:00.000Z', value: { designer: {} }, version: 1 })
    })
    const client = new WorkbenchClient(fetcher)

    expect((await client.getPresentation('project-1')).revision).toBe(2)
    expect((await client.updatePresentation('project-1', 2, { designer: { version: 1 } })).revision).toBe(3)

    expect(requests[0]?.input).toBe('/v1/projects/project-1/presentation')
    expect(requests[1]?.input).toBe('/v1/projects/project-1/presentation')
    expect(requests[1]?.init?.method).toBe('PUT')
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({ expectedRevision: 2, value: { designer: { version: 1 } }, version: 1 })
  })

  it('checks a revision Flow against the explicit engine contract', async () => {
    const fetcher = vi.fn(async () =>
      json({
        closureDigest: 'closure',
        diagnostics: [],
        engineContract: 'open-flow-engine/v1',
        flowId: 'flow/a',
        modelVersion: 1,
        projectId: 'project-1',
        revisionDigest: 'digest',
        revisionId: 'revision-1',
        valid: true,
        version: 1,
      }),
    )
    const client = new WorkbenchClient(fetcher)

    await client.checkFlow('project-1', 'revision-1', 'flow/a')

    expect(fetcher).toHaveBeenCalledWith(
      '/v1/projects/project-1/revisions/revision-1/flows/flow%2Fa/check',
      expect.objectContaining({ body: JSON.stringify({ engineContract: 'open-flow-engine/v1', version: 1 }), method: 'POST' }),
    )
  })

  it('preserves the deployment error code for actionable UI feedback', async () => {
    const client = new WorkbenchClient(async () => json({ error: { code: 'flow.invalid', message: 'The Flow is invalid.' }, version: 1 }, 400))

    await expect(client.listFlows('project-1')).rejects.toEqual(new ApiError(400, 'flow.invalid', 'The Flow is invalid.'))
  })
})
