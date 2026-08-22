import { ControlClient } from '@oomol-lab/open-flow/control-api'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createServerApp } from '../node/http.ts'
import { ServerService } from '../node/service.ts'

function webhookFlow(name: string) {
  return {
    graph: {
      nodes: {
        incoming: {
          inputsDef: [{ handle: 'message', jsonSchema: { type: 'string' }, nullable: false }],
          kind: 'webhook',
          name,
          options: { responseStatusCode: 204 },
        },
      },
    },
    name,
  }
}

it('fails closed when the Control API has no operator resolver', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-control-auth-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  try {
    const app = createServerApp(service)
    const response = await app.request('/v1/projects', {
      body: JSON.stringify({ name: 'Unavailable', version: 1 }),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'unavailable' },
      method: 'POST',
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'authentication.required', message: 'Authentication is required.' },
      version: 1,
    })
    expect((await app.request('/healthz')).status).toBe(200)
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('returns node outputs through the public RunEvent shape', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-control-output-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  try {
    const created = await service.control.createProject('operator', 'Output project', 'output-project')
    const changed = await service.control.changeDraft('operator', created.project.projectId, created.project.draftRevisionId, [
      { flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'main', kind: 'flow.create' },
      {
        kind: 'module.create',
        module: {
          imports: [],
          name: 'Code',
          source: 'export default function run() { return { empty: null, result: { answer: 42 } } }',
        },
        moduleId: 'code',
      },
      {
        kind: 'graph.node.create',
        node: {
          concurrency: 1,
          inputs: {},
          kind: 'task',
          name: 'Code',
          task: {
            inputs: {},
            moduleId: 'code',
            name: 'Code',
            outputs: {
              empty: { jsonSchema: {}, nullable: true },
              result: { jsonSchema: { type: 'object' }, nullable: false },
            },
          },
        },
        nodeId: 'code',
        target: { id: 'main', kind: 'flow' },
      },
    ])
    service.start()
    const accepted = await service.control.createDraftRun(
      created.project.projectId,
      changed.revision.revisionId,
      'main',
      'open-flow-engine/v1',
      {},
      'output-run',
    )
    await service.waitForIdle()

    const app = createServerApp(service, { resolveControlActor: () => 'operator' })
    const response = await app.request(`/v1/projects/${created.project.projectId}/runs/${accepted.run.runId}/events`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      readonly events: readonly { readonly kind: string; readonly payload: Readonly<Record<string, unknown>>; readonly value?: unknown }[]
    }
    const outputs = body.events.filter((event) => event.kind == 'node.output')
    expect(outputs.map((event) => event.payload)).toEqual([
      expect.objectContaining({ handle: 'empty', output: { kind: 'inline', value: null } }),
      expect.objectContaining({ handle: 'result', output: { kind: 'inline', value: { answer: 42 } } }),
    ])
    expect(outputs.every((event) => !Object.hasOwn(event, 'value'))).toBe(true)
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('projects Cron Trigger Runs through the public Control API', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-control-trigger-run-'))
  let now = Date.parse('2026-08-22T00:00:30.000Z')
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'), undefined, () => now)
  try {
    const created = await service.control.createProject('operator', 'Cron project', 'cron-project')
    const changed = await service.control.changeDraft('operator', created.project.projectId, created.project.draftRevisionId, [
      {
        flow: {
          graph: {
            nodes: {
              scheduled: {
                cronTimes: [{ type: 'every', unit: 'minute', value: 1 }],
                kind: 'cron',
                name: 'Scheduled trigger',
              },
            },
          },
          name: 'Main',
        },
        flowId: 'main',
        kind: 'flow.create',
      },
    ])
    const published = await service.control.publishFlow(
      'operator',
      created.project.projectId,
      changed.revision.revisionId,
      'main',
      'open-flow-engine/v1',
      null,
      'cron-publication',
    )

    now = Date.parse('2026-08-22T00:01:00.000Z')
    await service.tickCron()
    service.start()
    await service.waitForIdle()

    const app = createServerApp(service, { resolveControlActor: () => 'operator' })
    const client = new ControlClient(async (input, init) => await app.request(input, init))
    const page = await client.listRuns(created.project.projectId, { flowId: 'main' })
    expect(page.runs).toHaveLength(1)
    expect(page.runs[0]).toMatchObject({
      flowId: 'main',
      projectId: created.project.projectId,
      revisionId: changed.revision.revisionId,
      source: 'trigger',
      status: 'completed',
    })

    const runId = page.runs[0]!.runId
    await expect(client.getRun(created.project.projectId, runId)).resolves.toMatchObject({
      closureDigest: published.publication.closureDigest,
      modelVersion: 1,
      occurrenceId: expect.any(String),
      publicationId: published.publication.publicationId,
      source: 'trigger',
      triggerNodeId: 'scheduled',
    })
    await expect(client.getRunEvents(created.project.projectId, runId)).resolves.toMatchObject({
      done: true,
      events: expect.arrayContaining([expect.objectContaining({ kind: 'run.queued' }), expect.objectContaining({ kind: 'run.completed' })]),
    })
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('persists authoring state and commits only one concurrent Draft change', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-control-persistence-'))
  const file = path.join(directory, 'open-flow.sqlite')
  let now = Date.UTC(2026, 7, 22)
  const open = () => ServerService.open(file, undefined, () => ++now)
  let service = open()
  let app = createServerApp(service, { resolveControlActor: () => 'operator-a' })
  try {
    const create = () =>
      app.request('/v1/projects', {
        body: JSON.stringify({ name: 'Persistent project', version: 1 }),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'persistent-project' },
        method: 'POST',
      })
    const createdResponse = await create()
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()) as { readonly draftRevisionId: string; readonly projectId: string }
    const change = (flowId: string) =>
      app.request(`/v1/projects/${created.projectId}/draft/changes`, {
        body: JSON.stringify({
          expectedRevisionId: created.draftRevisionId,
          operations: [{ flow: { graph: { nodes: {} }, name: flowId }, flowId, kind: 'flow.create' }],
          version: 1,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    const changes = await Promise.all([change('alpha'), change('beta')])
    expect(changes.map((response) => response.status).toSorted()).toEqual([200, 412])
    const committed = changes.find((response) => response.status == 200)!
    const revisionId = ((await committed.json()) as { readonly revision: { readonly revisionId: string } }).revision.revisionId
    const flowId = changes[0]!.status == 200 ? 'alpha' : 'beta'

    const run = (targetFlowId: string) =>
      app.request(`/v1/projects/${created.projectId}/revisions/${revisionId}/flows/${targetFlowId}/runs`, {
        body: JSON.stringify({ engineContract: 'open-flow-engine/v1', inputs: {}, version: 1 }),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'scoped-run' },
        method: 'POST',
      })
    expect((await run(flowId)).status).toBe(202)
    const conflictingRun = await run('missing')
    expect(conflictingRun.status).toBe(409)
    expect(await conflictingRun.json()).toMatchObject({ error: { code: 'run.conflict' } })

    const presentation = await app.request(`/v1/projects/${created.projectId}/presentation`, {
      body: JSON.stringify({ expectedRevision: 1, value: { selected: 'main' }, version: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(presentation.status).toBe(200)

    const publishedResponse = await app.request(`/v1/projects/${created.projectId}/revisions/${revisionId}/flows/${flowId}/publications`, {
      body: JSON.stringify({ engineContract: 'open-flow-engine/v1', expectedLivePublicationId: null, version: 1 }),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'persistent-publication' },
      method: 'POST',
    })
    expect(publishedResponse.status).toBe(201)
    const published = (await publishedResponse.json()) as { readonly publicationId: string }
    const liveRunResponse = await app.request(`/v1/projects/${created.projectId}/flows/${flowId}/runs`, {
      body: JSON.stringify({ inputs: {}, version: 1 }),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'persistent-live-run' },
      method: 'POST',
    })
    expect(liveRunResponse.status).toBe(202)
    const liveRun = (await liveRunResponse.json()) as { readonly runId: string }

    await service.close()
    service = open()
    app = createServerApp(service, { resolveControlActor: () => 'operator-b' })

    const replay = await create()
    expect(replay.status).toBe(200)
    expect((await replay.json()) as unknown).toMatchObject({ draftRevisionId: revisionId, projectId: created.projectId })
    const draft = await app.request(`/v1/projects/${created.projectId}/draft`)
    expect(draft.status).toBe(200)
    expect((await draft.json()) as unknown).toMatchObject({ revisionId })
    const restoredPresentation = await app.request(`/v1/projects/${created.projectId}/presentation`)
    expect(await restoredPresentation.json()).toMatchObject({ revision: 2, value: { selected: 'main' } })
    const restoredLive = await app.request(`/v1/projects/${created.projectId}/flows/${flowId}/live`)
    expect(await restoredLive.json()).toMatchObject({ publication: { publicationId: published.publicationId }, revision: 1, status: 'runnable' })
    const restoredHistory = await app.request(`/v1/projects/${created.projectId}/flows/${flowId}/publications?includeTotal=true`)
    expect(await restoredHistory.json()).toMatchObject({ publications: [{ publicationId: published.publicationId }], total: 1 })
    const restoredRun = await app.request(`/v1/projects/${created.projectId}/runs/${liveRun.runId}`)
    expect(await restoredRun.json()).toMatchObject({ publicationId: published.publicationId, runId: liveRun.runId, source: 'live' })
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('commits only one concurrent Publish for the same Live precondition', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-control-publication-cas-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  const app = createServerApp(service, { resolveControlActor: () => 'operator' })
  try {
    const createdResponse = await app.request('/v1/projects', {
      body: JSON.stringify({ name: 'Concurrent Publication', version: 1 }),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'concurrent-publication-project' },
      method: 'POST',
    })
    const created = (await createdResponse.json()) as { readonly draftRevisionId: string; readonly projectId: string }
    const changedResponse = await app.request(`/v1/projects/${created.projectId}/draft/changes`, {
      body: JSON.stringify({
        expectedRevisionId: created.draftRevisionId,
        operations: [{ flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'main', kind: 'flow.create' }],
        version: 1,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const revisionId = ((await changedResponse.json()) as { readonly revision: { readonly revisionId: string } }).revision.revisionId
    const publish = (idempotencyKey: string) =>
      app.request(`/v1/projects/${created.projectId}/revisions/${revisionId}/flows/main/publications`, {
        body: JSON.stringify({ engineContract: 'open-flow-engine/v1', expectedLivePublicationId: null, version: 1 }),
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        method: 'POST',
      })

    const responses = await Promise.all([publish('concurrent-publication-a'), publish('concurrent-publication-b')])
    expect(responses.map((response) => response.status).toSorted()).toEqual([201, 412])
    expect(await responses.find((response) => response.status == 412)!.json()).toMatchObject({ error: { code: 'live.conflict' } })
    const history = await app.request(`/v1/projects/${created.projectId}/flows/main/publications?includeTotal=true`)
    const historyBody = (await history.json()) as { readonly publications: readonly unknown[]; readonly total: number }
    expect(historyBody.total).toBe(1)
    expect(historyBody.publications).toHaveLength(1)
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('retires published Trigger bindings with a deleted Flow and Project', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-control-trigger-retirement-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  const app = createServerApp(service, { resolveControlActor: () => 'operator' })
  try {
    const createdResponse = await app.request('/v1/projects', {
      body: JSON.stringify({ name: 'Trigger retirement', version: 1 }),
      headers: { 'content-type': 'application/json', 'idempotency-key': 'trigger-retirement-project' },
      method: 'POST',
    })
    const created = (await createdResponse.json()) as { readonly draftRevisionId: string; readonly projectId: string }
    const changedResponse = await app.request(`/v1/projects/${created.projectId}/draft/changes`, {
      body: JSON.stringify({
        expectedRevisionId: created.draftRevisionId,
        operations: [
          { flow: webhookFlow('Alpha'), flowId: 'alpha', kind: 'flow.create' },
          { flow: webhookFlow('Beta'), flowId: 'beta', kind: 'flow.create' },
        ],
        version: 1,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const revisionId = ((await changedResponse.json()) as { readonly revision: { readonly revisionId: string } }).revision.revisionId
    for (const flowId of ['alpha', 'beta']) {
      const published = await app.request(`/v1/projects/${created.projectId}/revisions/${revisionId}/flows/${flowId}/publications`, {
        body: JSON.stringify({ engineContract: 'open-flow-engine/v1', expectedLivePublicationId: null, version: 1 }),
        headers: { 'content-type': 'application/json', 'idempotency-key': `publish-${flowId}` },
        method: 'POST',
      })
      expect(published.status).toBe(201)
    }
    const alphaEndpoint = service.webhookEndpoint(created.projectId, 'alpha', 'incoming')
    const betaEndpoint = service.webhookEndpoint(created.projectId, 'beta', 'incoming')
    expect(alphaEndpoint).toBeDefined()
    expect(betaEndpoint).toBeDefined()

    const deletedResponse = await app.request(`/v1/projects/${created.projectId}/draft/changes`, {
      body: JSON.stringify({ expectedRevisionId: revisionId, operations: [{ flowId: 'alpha', kind: 'flow.delete' }], version: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(deletedResponse.status).toBe(200)
    expect(service.webhookEndpoint(created.projectId, 'alpha', 'incoming')).toBeUndefined()
    expect(service.webhookTarget(alphaEndpoint!)).toBeUndefined()
    expect(service.webhookEndpoint(created.projectId, 'beta', 'incoming')).toBe(betaEndpoint)

    expect((await app.request(`/v1/projects/${created.projectId}`, { method: 'DELETE' })).status).toBe(202)
    expect(service.webhookEndpoint(created.projectId, 'beta', 'incoming')).toBeUndefined()
    expect(service.webhookTarget(betaEndpoint!)).toBeUndefined()
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})
