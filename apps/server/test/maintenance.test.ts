import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createServerApp } from '../node/http.ts'
import { migrateDatabase } from '../node/migrate.ts'
import { ServerService } from '../node/service.ts'

async function waitForStatus(service: ServerService, runId: string, status: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (service.run(runId)?.status == status) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Run did not reach ${status}.`)
}

it('expires detailed Run events while preserving the terminal Run and result', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-event-retention-'))
  const file = path.join(directory, 'open-flow.sqlite')
  let now = Date.parse('2026-08-22T00:00:00.000Z')
  const service = ServerService.open(file, undefined, () => now, { runEventRetentionMs: 1_000 })
  try {
    const created = await service.control.createProject('operator', 'Retention', 'retention-project')
    const changed = await service.control.changeDraft('operator', created.project.projectId, created.project.draftRevisionId, [
      { flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'main', kind: 'flow.create' },
    ])
    service.start()
    const accepted = await service.control.createDraftRun(
      created.project.projectId,
      changed.revision.revisionId,
      'main',
      'open-flow-engine/v1',
      {},
      'retained-run',
    )
    await service.waitForIdle()

    expect(service.control.getRun(accepted.run.runId)).toMatchObject({
      eventsExpiresAt: '2026-08-22T00:00:01.000Z',
      status: 'completed',
    })
    expect(service.control.getRunEvents(accepted.run.runId, 0, 100).events.length).toBeGreaterThan(0)

    now += 1_000
    const app = createServerApp(service, { resolveControlActor: () => 'operator' })
    const expired = await app.request(`/v1/runs/${accepted.run.runId}/events`)
    expect(expired.status).toBe(410)
    expect(await expired.json()).toMatchObject({ error: { code: 'run.events-expired' } })

    await service.tickMaintenance()
    expect(service.control.getRun(accepted.run.runId)).toMatchObject({ status: 'completed' })
    expect(service.control.getRunResult(accepted.run.runId)).toMatchObject({ status: 'completed' })
    const database = new DatabaseSync(file)
    try {
      expect(database.prepare('SELECT COUNT(*) AS count FROM events WHERE run_id = ?').get(accepted.run.runId)).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM runs WHERE run_id = ?').get(accepted.run.runId)).toEqual({ count: 1 })
    } finally {
      database.close()
    }
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('recovers Project retirement after restart, waits for Integration state, and physically deletes owned records', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-project-retirement-'))
  const file = path.join(directory, 'open-flow.sqlite')
  let service = ServerService.open(file)
  try {
    const created = await service.control.createProject('operator', 'Retirement', 'retirement-project')
    const changed = await service.control.changeDraft('operator', created.project.projectId, created.project.draftRevisionId, [
      {
        flow: {
          graph: {
            nodes: {
              incoming: {
                inputsDef: [{ handle: 'message', jsonSchema: { type: 'string' }, nullable: false }],
                kind: 'webhook',
                name: 'Incoming',
                options: { responseStatusCode: 204 },
              },
            },
          },
          name: 'Main',
        },
        flowId: 'main',
        kind: 'flow.create',
      },
    ])
    await service.control.publishFlow(
      'operator',
      created.project.projectId,
      changed.revision.revisionId,
      'main',
      'open-flow-engine/v1',
      null,
      'retirement-publication',
    )
    await service.control.createDraftRun(created.project.projectId, changed.revision.revisionId, 'main', 'open-flow-engine/v1', {}, 'retirement-run')
    expect(service.control.retireProject(created.project.projectId).status).toBe('retiring')

    await service.close()
    const blocking = new DatabaseSync(file)
    blocking
      .prepare(
        `INSERT INTO integration_bindings (
           binding_id, endpoint_id, project_id, flow_id, trigger_node_id, current_publication_id,
           runtime_version, trigger_json, connection_id, health, reconcile_at, retry_at
         ) VALUES ('blocking-binding', 'blocking-endpoint', ?, 'main', 'integration', NULL, 1, '{}', 'connection', 'healthy', NULL, NULL)`,
      )
      .run(created.project.projectId)
    blocking
      .prepare(
        `INSERT INTO integration_states (
           binding_id, runtime_version, trigger_json, connection_id, checkpoint_json,
           subscription_json, reconcile_at, updated_at
         ) VALUES ('blocking-binding', 1, '{}', 'connection', 'null', '{}', NULL, 0)`,
      )
      .run()
    blocking.close()

    service = ServerService.open(file)
    await service.tickMaintenance()
    await service.tickMaintenance()
    expect(service.control.getProject(created.project.projectId).status).toBe('retiring')

    const unblocking = new DatabaseSync(file)
    unblocking.prepare("DELETE FROM integration_states WHERE binding_id = 'blocking-binding'").run()
    unblocking.close()
    await service.tickMaintenance()
    await service.tickMaintenance()

    expect(() => service.control.getProject(created.project.projectId)).toThrow('The Project or Revision was not found.')
    const database = new DatabaseSync(file)
    try {
      for (const [table, column] of [
        ['projects', 'project_id'],
        ['project_revisions', 'project_id'],
        ['publications', 'project_id'],
        ['flow_live', 'project_id'],
        ['runs', 'project_id'],
        ['webhook_bindings', 'project_id'],
      ] as const) {
        expect(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(created.project.projectId), table).toEqual({ count: 0 })
      }
      expect(database.prepare('SELECT COUNT(*) AS count FROM revisions').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM events').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM work').get()).toEqual({ count: 0 })
    } finally {
      database.close()
    }
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('gives existing terminal Runs a full retention window on first upgraded open', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-event-retention-upgrade-'))
  const file = path.join(directory, 'open-flow.sqlite')
  migrateDatabase(file)
  const database = new DatabaseSync(file)
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-old', 'digest-old', '{}')
  database
    .prepare(
      `INSERT INTO runs (
         run_id, idempotency_key, request_digest, revision_id, revision_digest, flow_id,
         engine_contract, engine_digest, inputs, status, finished_at
       ) VALUES ('run-old', 'run-key-old', 'run-request-old', 'revision-old', 'digest-old', 'flow-old',
                 'contract-old', 'engine-old', '{}', 'completed', 1)`,
    )
    .run()
  database.close()

  const now = Date.parse('2026-08-22T00:00:00.000Z')
  const service = ServerService.open(file, undefined, () => now, { runEventRetentionMs: 1_000 })
  try {
    const reopened = new DatabaseSync(file)
    try {
      expect(reopened.prepare("SELECT events_expires_at AS eventsExpiresAt FROM runs WHERE run_id = 'run-old'").get()).toEqual({ eventsExpiresAt: now + 1_000 })
    } finally {
      reopened.close()
    }
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('cancels active Project Runs before physical deletion', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-active-project-retirement-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  try {
    const created = await service.control.createProject('operator', 'Active retirement', 'active-retirement-project')
    const changed = await service.control.changeDraft('operator', created.project.projectId, created.project.draftRevisionId, [
      { flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'main', kind: 'flow.create' },
      {
        kind: 'module.create',
        module: { imports: [], name: 'Hanging', source: 'export default async () => await new Promise(() => {})' },
        moduleId: 'hanging',
      },
      {
        kind: 'graph.node.create',
        node: {
          concurrency: 1,
          inputs: {},
          kind: 'task',
          name: 'Hanging',
          task: { inputs: {}, moduleId: 'hanging', name: 'Hanging', outputs: {} },
        },
        nodeId: 'hanging',
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
      'active-retirement-run',
    )
    await waitForStatus(service, accepted.run.runId, 'running')

    service.control.retireProject(created.project.projectId)
    await service.tickMaintenance()
    await service.waitForIdle()
    await service.tickMaintenance()
    await service.tickMaintenance()

    expect(() => service.control.getProject(created.project.projectId)).toThrow('The Project or Revision was not found.')
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})
