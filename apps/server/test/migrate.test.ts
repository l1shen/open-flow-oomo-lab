import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { migrateDatabase } from '../src/migrate.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function databaseFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-migration-'))
  directories.push(directory)
  return path.join(directory, 'open-flow.sqlite')
}

function schemaVersion(database: DatabaseSync): number {
  return (database.prepare('PRAGMA user_version').get() as { readonly user_version: number }).user_version
}

it('applies the current schema without foreign keys', async () => {
  const file = await databaseFile()
  migrateDatabase(file)

  const database = new DatabaseSync(file)
  try {
    expect(schemaVersion(database)).toBe(8)
    const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {
      readonly name: string
    }[]
    expect(tables.map(({ name }) => name)).toEqual([
      'cron_admissions',
      'cron_bindings',
      'events',
      'flow_live',
      'integration_admissions',
      'integration_bindings',
      'integration_states',
      'poll_admissions',
      'poll_bindings',
      'poll_claims',
      'poll_event_dedupe',
      'project_presentations',
      'project_revisions',
      'projects',
      'publications',
      'revisions',
      'runs',
      'trigger_activities',
      'trigger_occurrences',
      'webhook_admissions',
      'webhook_bindings',
      'work',
    ])
    for (const { name } of tables) expect(database.prepare(`PRAGMA foreign_key_list(${name})`).all(), name).toEqual([])
  } finally {
    database.close()
  }
})

it('does not reapply an applied migration', async () => {
  const file = await databaseFile()
  migrateDatabase(file)
  const database = new DatabaseSync(file)
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-a', 'digest-a', '{}')
  database.close()

  migrateDatabase(file)

  const reopened = new DatabaseSync(file)
  try {
    expect(reopened.prepare('SELECT revision_id AS revisionId FROM revisions').all()).toEqual([{ revisionId: 'revision-a' }])
  } finally {
    reopened.close()
  }
})

it('upgrades a version 1 database without changing existing rows', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  database.exec(await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'))
  database.exec('PRAGMA user_version = 1')
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-v1', 'digest-v1', '{}')
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    expect(upgraded.prepare('SELECT revision_id AS revisionId FROM revisions').all()).toEqual([{ revisionId: 'revision-v1' }])
    expect(upgraded.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'poll_bindings'").get()).toEqual({ name: 'poll_bindings' })
  } finally {
    upgraded.close()
  }
})

it('upgrades a version 2 database without changing existing rows', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  database.exec(await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'))
  database.exec(await readFile(new URL('../migrations/0002_poll_trigger.sql', import.meta.url), 'utf8'))
  database.exec('PRAGMA user_version = 2')
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-v2', 'digest-v2', '{}')
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    expect(upgraded.prepare('SELECT revision_id AS revisionId FROM revisions').all()).toEqual([{ revisionId: 'revision-v2' }])
    expect(upgraded.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'integration_bindings'").get()).toEqual({
      name: 'integration_bindings',
    })
  } finally {
    upgraded.close()
  }
})

it('upgrades a version 3 database without changing existing Run rows', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  database.exec(await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'))
  database.exec(await readFile(new URL('../migrations/0002_poll_trigger.sql', import.meta.url), 'utf8'))
  database.exec(await readFile(new URL('../migrations/0003_integration_trigger.sql', import.meta.url), 'utf8'))
  database.exec('PRAGMA user_version = 3')
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-v3', 'digest-v3', '{}')
  database
    .prepare(
      `INSERT INTO runs (
         run_id, idempotency_key, request_digest, revision_id, revision_digest, flow_id,
         engine_contract, engine_digest, inputs, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
    )
    .run('run-v3', 'key-v3', 'request-v3', 'revision-v3', 'digest-v3', 'flow-v3', 'contract-v3', 'engine-v3', '{}')
  database.prepare('INSERT INTO events (run_id, cursor, kind, payload) VALUES (?, ?, ?, ?)').run('run-v3', 1, 'run.started', '{}')
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    expect(upgraded.prepare('SELECT run_id AS runId, project_id AS projectId, created_at AS createdAt FROM runs').all()).toEqual([
      { createdAt: 0, projectId: null, runId: 'run-v3' },
    ])
    expect(upgraded.prepare('SELECT run_id AS runId, created_at AS createdAt FROM events').all()).toEqual([{ createdAt: 0, runId: 'run-v3' }])
  } finally {
    upgraded.close()
  }
})

it('upgrades a version 4 database without changing existing Publication, Live, or Run rows', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  for (const migration of ['0001_initial.sql', '0002_poll_trigger.sql', '0003_integration_trigger.sql', '0004_control_api.sql']) {
    database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  database.exec('PRAGMA user_version = 4')
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-v4', 'digest-v4', '{}')
  database
    .prepare(
      `INSERT INTO publications (
         publication_id, project_id, flow_id, revision_id, revision_digest,
         closure_digest, engine_contract, idempotency_key, request_digest
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('publication-v4', 'project-v4', 'flow-v4', 'revision-v4', 'digest-v4', 'closure-v4', 'contract-v4', 'publish-v4', 'request-v4')
  database.prepare('INSERT INTO flow_live (project_id, flow_id, publication_id) VALUES (?, ?, ?)').run('project-v4', 'flow-v4', 'publication-v4')
  database
    .prepare(
      `INSERT INTO runs (
         run_id, idempotency_key, request_digest, revision_id, revision_digest, flow_id,
         engine_contract, engine_digest, inputs, status, project_id, source, closure_digest,
         model_version, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 'draft', ?, 1, ?)`,
    )
    .run('run-v4', 'run-key-v4', 'run-request-v4', 'revision-v4', 'digest-v4', 'flow-v4', 'contract-v4', 'engine-v4', '{}', 'project-v4', 'closure-v4', 42)
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    expect(
      upgraded
        .prepare(
          `SELECT actor_id AS actorId, created_at AS createdAt, model_version AS modelVersion,
                  operation, publication_id AS publicationId, source_publication_id AS sourcePublicationId
           FROM publications`,
        )
        .all(),
    ).toEqual([{ actorId: 'legacy', createdAt: 0, modelVersion: 1, operation: 'publish', publicationId: 'publication-v4', sourcePublicationId: null }])
    expect(upgraded.prepare('SELECT publication_id AS publicationId, revision, updated_at AS updatedAt FROM flow_live').all()).toEqual([
      { publicationId: 'publication-v4', revision: 1, updatedAt: 0 },
    ])
    expect(upgraded.prepare('SELECT publication_id AS publicationId, run_id AS runId FROM runs').all()).toEqual([{ publicationId: null, runId: 'run-v4' }])
  } finally {
    upgraded.close()
  }
})

it('upgrades a version 5 database without changing existing Trigger bindings', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  for (const migration of [
    '0001_initial.sql',
    '0002_poll_trigger.sql',
    '0003_integration_trigger.sql',
    '0004_control_api.sql',
    '0005_publication_control_api.sql',
  ]) {
    database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  database.exec('PRAGMA user_version = 5')
  database
    .prepare(
      `INSERT INTO webhook_bindings (
         endpoint_id, project_id, flow_id, trigger_node_id, current_publication_id, runtime_version, trigger_json
       ) VALUES ('webhook-v5', 'project-v5', 'flow-v5', 'webhook', NULL, 2, '{}')`,
    )
    .run()
  database
    .prepare(
      `INSERT INTO cron_bindings (
         binding_id, project_id, flow_id, trigger_node_id, current_publication_id, runtime_version, trigger_json, schedule_json, next_at
       ) VALUES ('cron-v5', 'project-v5', 'flow-v5', 'cron', NULL, 3, '{}', '[]', NULL)`,
    )
    .run()
  database
    .prepare(
      `INSERT INTO poll_bindings (
         binding_id, project_id, flow_id, trigger_node_id, current_publication_id, runtime_version,
         trigger_json, connection_id, schedule_json, next_at, retry_at, health
       ) VALUES ('poll-v5', 'project-v5', 'flow-v5', 'poll', NULL, 4, '{}', 'connection-v5', '[]', NULL, NULL, 'failed')`,
    )
    .run()
  database
    .prepare(
      `INSERT INTO integration_bindings (
         binding_id, endpoint_id, project_id, flow_id, trigger_node_id, current_publication_id,
         runtime_version, trigger_json, connection_id, health, reconcile_at, retry_at
       ) VALUES ('integration-v5', 'endpoint-v5', 'project-v5', 'flow-v5', 'integration', NULL, 5, '{}', 'connection-v5', 'needs_reauth', NULL, NULL)`,
    )
    .run()
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    for (const table of ['webhook_bindings', 'cron_bindings', 'poll_bindings', 'integration_bindings']) {
      expect(upgraded.prepare(`SELECT operator_state AS operatorState, updated_at AS updatedAt FROM ${table}`).get(), table).toEqual({
        operatorState: 'active',
        updatedAt: 0,
      })
    }
    expect(upgraded.prepare('SELECT last_error_code AS lastErrorCode FROM poll_bindings').get()).toEqual({ lastErrorCode: null })
    expect(upgraded.prepare('SELECT last_error_code AS lastErrorCode FROM integration_bindings').get()).toEqual({ lastErrorCode: null })
  } finally {
    upgraded.close()
  }
})

it('backfills the Control identity of existing Trigger Runs when upgrading version 6', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  for (const migration of [
    '0001_initial.sql',
    '0002_poll_trigger.sql',
    '0003_integration_trigger.sql',
    '0004_control_api.sql',
    '0005_publication_control_api.sql',
    '0006_trigger_control_api.sql',
  ]) {
    database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  database.exec('PRAGMA user_version = 6')
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-v6', 'digest-v6', '{}')
  database
    .prepare(
      `INSERT INTO publications (
         publication_id, project_id, flow_id, revision_id, revision_digest,
         closure_digest, engine_contract, idempotency_key, request_digest, model_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('publication-v6', 'project-v6', 'flow-v6', 'revision-v6', 'digest-v6', 'closure-v6', 'contract-v6', 'publication-key-v6', 'publication-request-v6', 3)
  database
    .prepare(
      `INSERT INTO runs (
         run_id, idempotency_key, request_digest, revision_id, revision_digest, flow_id,
         engine_contract, engine_digest, inputs, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    )
    .run('run-v6', 'run-key-v6', 'run-request-v6', 'revision-v6', 'digest-v6', 'flow-v6', 'contract-v6', 'engine-v6', '{}')
  database
    .prepare('INSERT INTO trigger_occurrences (occurrence_id, run_id, trigger_node_id, payload) VALUES (?, ?, ?, ?)')
    .run('occurrence-v6', 'run-v6', 'cron-v6', '{}')
  database
    .prepare('INSERT INTO cron_admissions (run_id, binding_id, runtime_version, publication_id, scheduled_at) VALUES (?, ?, ?, ?, ?)')
    .run('run-v6', 'binding-v6', 1, 'publication-v6', '2026-08-22T00:01:00.000Z')
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    expect(
      upgraded
        .prepare(
          `SELECT closure_digest AS closureDigest, model_version AS modelVersion,
                  project_id AS projectId, publication_id AS publicationId, source
           FROM runs WHERE run_id = 'run-v6'`,
        )
        .get(),
    ).toEqual({
      closureDigest: 'closure-v6',
      modelVersion: 3,
      projectId: 'project-v6',
      publicationId: 'publication-v6',
      source: 'trigger',
    })
  } finally {
    upgraded.close()
  }
})

it('adds retirement and RunEvent retention state when upgrading version 7', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  for (const migration of [
    '0001_initial.sql',
    '0002_poll_trigger.sql',
    '0003_integration_trigger.sql',
    '0004_control_api.sql',
    '0005_publication_control_api.sql',
    '0006_trigger_control_api.sql',
    '0007_trigger_run_control_api.sql',
  ]) {
    database.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  database.exec('PRAGMA user_version = 7')
  database
    .prepare(
      `INSERT INTO projects (
         project_id, name, status, draft_revision_id, create_idempotency_key,
         create_request_digest, created_at, updated_at
       ) VALUES ('project-v7', 'Version 7', 'retiring', 'revision-v7', 'project-key-v7', 'project-request-v7', 1, 2)`,
    )
    .run()
  database.prepare('INSERT INTO revisions (revision_id, digest, content) VALUES (?, ?, ?)').run('revision-v7', 'digest-v7', '{}')
  database
    .prepare(
      `INSERT INTO runs (
         run_id, idempotency_key, request_digest, revision_id, revision_digest, flow_id,
         engine_contract, engine_digest, inputs, status, finished_at
       ) VALUES ('run-v7', 'run-key-v7', 'run-request-v7', 'revision-v7', 'digest-v7', 'flow-v7',
                 'contract-v7', 'engine-v7', '{}', 'completed', 3)`,
    )
    .run()
  database.close()

  migrateDatabase(file)

  const upgraded = new DatabaseSync(file)
  try {
    expect(schemaVersion(upgraded)).toBe(8)
    expect(
      upgraded
        .prepare(
          `SELECT deletion_attempted_at AS deletionAttemptedAt, deletion_requested_at AS deletionRequestedAt
           FROM projects WHERE project_id = 'project-v7'`,
        )
        .get(),
    ).toEqual({ deletionAttemptedAt: null, deletionRequestedAt: null })
    expect(upgraded.prepare("SELECT events_expires_at AS eventsExpiresAt FROM runs WHERE run_id = 'run-v7'").get()).toEqual({ eventsExpiresAt: null })
    expect(
      upgraded.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN ('projects_retirement', 'runs_events_expiry') ORDER BY name").all(),
    ).toEqual([{ name: 'projects_retirement' }, { name: 'runs_events_expiry' }])
  } finally {
    upgraded.close()
  }
})

it('rejects a newer schema version', async () => {
  const file = await databaseFile()
  migrateDatabase(file)

  const database = new DatabaseSync(file)
  const supportedVersion = schemaVersion(database)
  const newerVersion = supportedVersion + 1
  try {
    database.exec(`PRAGMA user_version = ${newerVersion}`)
  } finally {
    database.close()
  }

  expect(() => migrateDatabase(file)).toThrow(`SQLite schema version ${newerVersion} is newer than the supported version ${supportedVersion}.`)

  const reopened = new DatabaseSync(file)
  try {
    expect(schemaVersion(reopened)).toBe(newerVersion)
  } finally {
    reopened.close()
  }
})

it('rejects an unversioned application database without changing it', async () => {
  const file = await databaseFile()
  const database = new DatabaseSync(file)
  database.exec('CREATE TABLE revisions (revision_id TEXT PRIMARY KEY) STRICT')
  database.close()

  expect(() => migrateDatabase(file)).toThrow('SQLite contains an unversioned Server schema. Rebuild the unpublished development database before starting.')

  const reopened = new DatabaseSync(file)
  try {
    expect(reopened.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 })
    expect(reopened.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'revisions'").get()).toEqual({ name: 'revisions' })
  } finally {
    reopened.close()
  }
})
