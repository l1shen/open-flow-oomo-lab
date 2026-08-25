import { describe, expect, it, vi } from 'vitest'
import { ApiError, ControlClient } from './api.ts'

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status })
}

function project(projectId = 'project-1') {
  return {
    createdAt: '2026-08-14T00:00:00.000Z',
    draftRevisionId: 'revision-1',
    name: 'Example',
    projectId,
    status: 'active',
    updatedAt: '2026-08-14T00:00:00.000Z',
    version: 1,
  }
}

function revision(revisionId = 'revision-2') {
  return {
    actorId: 'actor-1',
    createdAt: '2026-08-14T00:00:00.000Z',
    digest: `digest-${revisionId}`,
    modelVersion: 1,
    parentRevisionId: 'revision-1',
    projectId: 'project-1',
    revisionId,
    version: 1,
  }
}

describe('ControlClient', () => {
  it('reads Project and Flow summaries through the Control API request', async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/v1/projects?')) {
        return json({ nextCursor: 'next', projects: [project()], total: 1, version: 1 })
      }
      return json({
        flows: [
          {
            draft: { closureDigest: 'closure-1', name: 'Main', revisionDigest: 'digest-1', revisionId: 'revision-1' },
            flowId: 'flow-1',
            hasUnpublishedChanges: true,
            live: null,
          },
        ],
        projectId: 'project-1',
        version: 1,
      })
    })
    const client = new ControlClient(request)

    await expect(client.listProjects({ includeTotal: true, limit: 50 })).resolves.toMatchObject({ total: 1 })
    await expect(client.listFlows('project/1')).resolves.toEqual([
      expect.objectContaining({ draft: expect.objectContaining({ revisionId: 'revision-1' }), flowId: 'flow-1' }),
    ])
    expect(request.mock.calls.map((call) => call[0])).toEqual(['/v1/projects?limit=50&includeTotal=true', '/v1/projects/project%2F1/flows'])
  })

  it('submits one non-idempotent Draft change and decodes its lightweight acknowledgement', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({
        draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
        revision: revision(),
        version: 1,
      }),
    )
    const client = new ControlClient(request)
    const operations = [{ flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'flow-1', kind: 'flow.create' as const }]

    await expect(client.changeDraft('project-1', 'revision-1', operations)).resolves.toMatchObject({ revision: { revisionId: 'revision-2' } })

    expect(request).toHaveBeenCalledOnce()
    const [path, init] = request.mock.calls[0]!
    expect(path).toBe('/v1/projects/project-1/draft/changes')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).has('idempotency-key')).toBe(false)
    expect(JSON.parse(String(init?.body))).toEqual({ expectedRevisionId: 'revision-1', operations, version: 1 })
  })

  it('preserves explicit conflicts without retrying the mutation', async () => {
    const request = vi.fn(async () => json({ error: { code: 'project.revision-conflict', message: 'The Draft changed.' }, version: 1 }, 412))
    const client = new ControlClient(request)

    await expect(client.changeDraft('project-1', 'revision-1', [{ flowId: 'flow-1', kind: 'flow.delete' }])).rejects.toEqual(
      new ApiError(412, 'project.revision-conflict', 'The Draft changed.'),
    )
    expect(request).toHaveBeenCalledOnce()
  })

  it('rejects an unconfirmed Draft acknowledgement at the Control API boundary', async () => {
    const request = vi.fn(async () => json({ draftFlows: [], revision: { revisionId: 'revision-2' }, version: 1 }))
    const client = new ControlClient(request)

    await expect(client.changeDraft('project-1', 'revision-1', [{ flowId: 'flow-1', kind: 'flow.delete' }])).rejects.toMatchObject({
      code: 'response.invalid',
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it('rejects Connector metadata outside the public Control projection', async () => {
    const client = new ControlClient(
      vi.fn(async () =>
        json({
          connections: [
            {
              authType: 'oauth2',
              connectionId: 'mail-work',
              displayName: 'Work mailbox',
              isDefault: true,
              serviceId: 'mail',
              status: 'active',
            },
          ],
          projectId: 'project-1',
          serviceId: 'mail',
          version: 1,
        }),
      ),
    )

    await expect(client.listConnectorConnections('project-1', 'mail')).rejects.toMatchObject({ code: 'response.invalid', status: 502 })
  })

  it('rejects a non-HTTP Connector Connection page', async () => {
    const client = new ControlClient(vi.fn(async () => json({ url: 'javascript:alert(1)', version: 1 })))

    await expect(client.createConnectorConnectionPage('project-1', 'mail')).rejects.toMatchObject({
      code: 'response.invalid',
      status: 502,
    })
  })

  it('controls Live Trigger bindings through the public Control API contract', async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init?: RequestInit }> = []
    const binding = {
      currentPublicationId: 'publication-1',
      currentRevisionId: 'revision-1',
      flowId: 'flow/a',
      health: 'healthy',
      kind: 'poll',
      operatorState: 'active',
      projectId: 'project/a',
      runtimeVersion: 2,
      triggerNodeId: 'trigger/1',
      updatedAt: '2026-08-14T00:00:00.000Z',
      version: 1,
    } as const
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ init, input })
      const path = String(input)
      if (path.endsWith('/activities?cursor=cursor%2F%2B&limit=20')) {
        return json({
          activities: [
            {
              activityId: 'activity-1',
              createdAt: '2026-08-14T00:00:00.000Z',
              errorCode: 'provider.unavailable',
              errorMessage: 'The provider is unavailable.',
              kind: 'health.failed',
            },
          ],
          nextCursor: 'next',
          version: 1,
        })
      }
      if (path.endsWith('/test')) return json({ events: [{ id: 'event-1' }], filtered: 2, hasMore: true, version: 1 })
      if (path.endsWith('/pause')) return json({ ...binding, operatorState: 'paused', runtimeVersion: 3 })
      if (path.endsWith('/resume')) return json({ ...binding, runtimeVersion: 4 })
      if (path.endsWith('/trigger%2F1')) return json({ binding: { ...binding, endpointUrl: 'https://example.test/poll' }, version: 1 })
      return json({ bindings: [binding], flowId: 'flow/a', projectId: 'project/a', version: 1 })
    })
    const client = new ControlClient(request)

    await expect(client.listFlowTriggerBindings('project/a', 'flow/a')).resolves.toEqual([binding])
    await expect(client.getFlowTriggerBinding('project/a', 'flow/a', 'trigger/1')).resolves.toEqual({
      binding: { ...binding, endpointUrl: 'https://example.test/poll' },
      version: 1,
    })
    await expect(client.listFlowTriggerActivities('project/a', 'flow/a', 'trigger/1', { cursor: 'cursor/+', limit: 20 })).resolves.toMatchObject({
      activities: [{ activityId: 'activity-1', kind: 'health.failed' }],
      nextCursor: 'next',
    })
    await expect(client.pauseFlowTrigger('project/a', 'flow/a', 'trigger/1')).resolves.toMatchObject({ operatorState: 'paused', runtimeVersion: 3 })
    await expect(client.resumeFlowTrigger('project/a', 'flow/a', 'trigger/1')).resolves.toMatchObject({ operatorState: 'active', runtimeVersion: 4 })
    await expect(client.testFlowPollTrigger('project/a', 'flow/a', 'trigger/1')).resolves.toEqual({
      events: [{ id: 'event-1' }],
      filtered: 2,
      hasMore: true,
      version: 1,
    })

    expect(requests.map(({ input }) => input)).toEqual([
      '/v1/projects/project%2Fa/flows/flow%2Fa/triggers',
      '/v1/projects/project%2Fa/flows/flow%2Fa/triggers/trigger%2F1',
      '/v1/projects/project%2Fa/flows/flow%2Fa/triggers/trigger%2F1/activities?cursor=cursor%2F%2B&limit=20',
      '/v1/projects/project%2Fa/flows/flow%2Fa/triggers/trigger%2F1/pause',
      '/v1/projects/project%2Fa/flows/flow%2Fa/triggers/trigger%2F1/resume',
      '/v1/projects/project%2Fa/flows/flow%2Fa/triggers/trigger%2F1/test',
    ])
    expect(requests.slice(-3).map(({ init }) => JSON.parse(String(init?.body)))).toEqual([{ version: 1 }, { version: 1 }, { version: 1 }])
  })

  it('rejects an invalid Trigger binding at the Control API boundary', async () => {
    const client = new ControlClient(
      vi.fn(async () =>
        json({
          bindings: [
            {
              flowId: 'flow-1',
              health: 'healthy',
              kind: 'webhook',
              operatorState: 'active',
              projectId: 'project-1',
              runtimeVersion: 0,
              triggerNodeId: 'trigger-1',
              updatedAt: '2026-08-14T00:00:00.000Z',
              version: 1,
            },
          ],
          flowId: 'flow-1',
          projectId: 'project-1',
          version: 1,
        }),
      ),
    )

    await expect(client.listFlowTriggerBindings('project-1', 'flow-1')).rejects.toMatchObject({ code: 'response.invalid', status: 502 })
  })

  it('rejects a Run response that omits its fixed execution identity', async () => {
    const client = new ControlClient(
      vi.fn(async () =>
        json({
          createdAt: '2026-08-14T00:00:00.000Z',
          flowId: 'flow-1',
          projectId: 'project-1',
          revisionId: 'revision-1',
          runId: 'run-1',
          source: 'draft',
          status: 'queued',
          version: 1,
        }),
      ),
    )

    await expect(client.createDraftRun('project-1', 'revision-1', 'flow-1')).rejects.toMatchObject({ code: 'response.invalid', status: 502 })
  })
})
