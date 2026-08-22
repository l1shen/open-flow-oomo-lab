import type { JsonValue, RevisionContent } from '@oomol-lab/open-flow/project-change'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createServerApp } from '../src/http.ts'
import { ServerService } from '../src/service.ts'

const directories: string[] = []
const services: ServerService[] = []
const stringPort = { jsonSchema: { type: 'string' }, nullable: false } as const
const payloadPort = {
  jsonSchema: {
    additionalProperties: false,
    properties: { message: { type: 'string' } },
    required: ['message'],
    type: 'object',
  },
  nullable: false,
} as const

afterEach(async () => {
  await Promise.allSettled(services.splice(0).map((service) => service.close()))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function databaseFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-webhook-'))
  directories.push(directory)
  return path.join(directory, 'open-flow.sqlite')
}

function webhookFlow(): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              capture: {
                concurrency: 1,
                inputs: { event: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'incoming', output: 'payload' }] } },
                kind: 'task',
                task: { inputs: { event: payloadPort }, moduleId: 'capture', name: 'Capture', outputs: { message: stringPort } },
              },
              incoming: {
                inputsDef: [{ handle: 'message', ...stringPort }],
                kind: 'webhook',
                name: 'Incoming',
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
    modules: {
      capture: { imports: [], name: 'Capture', source: 'export default ({ event }) => ({ message: event.message })' },
    },
  }
}

function occurrence(payload: JsonValue = { message: 'hello' }) {
  return {
    flowId: 'main',
    occurrenceId: 'delivery-1',
    payload,
    revision: webhookFlow(),
    revisionId: 'revision-webhook',
    triggerNodeId: 'incoming',
  }
}

describe('Server Webhook Trigger admission', () => {
  it('does not expose resolved occurrence admission as an HTTP route', async () => {
    const service = ServerService.open(await databaseFile())
    services.push(service)
    const app = createServerApp(service)

    const response = await app.request('http://server.local/v1/trigger-occurrences/webhook', {
      body: JSON.stringify(occurrence()),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: { code: 'route.not-found', message: 'Route was not found.' } })
  })

  it('executes one ordinary Run and deduplicates concurrent occurrence delivery', async () => {
    const service = ServerService.open(await databaseFile())
    services.push(service)

    const [first, second] = await Promise.all([service.acceptWebhookOccurrence(occurrence()), service.acceptWebhookOccurrence(occurrence())])
    if (first.kind != 'accepted' || second.kind != 'accepted') throw new Error('Concurrent matching occurrences unexpectedly conflicted.')
    const acceptedRuns = [first, second]
    expect(new Set(acceptedRuns.map((accepted) => accepted.runId)).size).toBe(1)
    const accepted = acceptedRuns.find((candidate) => candidate.created)
    if (accepted == null) throw new Error('Concurrent Webhook occurrence did not create a Run.')
    expect(acceptedRuns.filter((candidate) => candidate.created)).toHaveLength(1)
    service.start()
    await service.waitForIdle()
    expect(service.run(accepted.runId)).toMatchObject({
      result: { kind: 'node-results', nodes: [{ jobs: [{ outputs: { message: 'hello' } }], nodeId: 'capture' }] },
      status: 'completed',
    })
    expect(service.events(accepted.runId).some((event) => event.payload.nodeId == 'incoming')).toBe(false)

    await expect(service.acceptWebhookOccurrence(occurrence())).resolves.toMatchObject({ created: false, runId: accepted.runId, status: 'completed' })

    await expect(service.acceptWebhookOccurrence(occurrence({ message: 'different' }))).resolves.toEqual({ kind: 'conflict' })
  })

  it('recovers a queued occurrence into the same Run after reopening SQLite', async () => {
    const file = await databaseFile()
    let service = ServerService.open(file)
    services.push(service)
    const accepted = await service.acceptWebhookOccurrence(occurrence())
    if (accepted.kind != 'accepted') throw new Error('Initial Webhook occurrence unexpectedly conflicted.')
    expect(service.run(accepted.runId)?.status).toBe('queued')
    await service.close()

    service = ServerService.open(file)
    services.push(service)
    service.start()
    await service.waitForIdle()
    expect(service.run(accepted.runId)?.status).toBe('completed')
    expect(service.events(accepted.runId).filter((event) => event.kind == 'run.completed')).toHaveLength(1)
    await expect(service.acceptWebhookOccurrence(occurrence())).resolves.toMatchObject({
      created: false,
      runId: accepted.runId,
      status: 'completed',
    })
  })

  it('rejects a mismatched payload or non-Webhook Trigger before acceptance', async () => {
    const service = ServerService.open(await databaseFile())
    services.push(service)

    await expect(service.acceptWebhookOccurrence(occurrence({ message: 42 }))).rejects.toMatchObject({ code: 'trigger-payload-invalid' })
    await expect(service.acceptWebhookOccurrence({ ...occurrence(), triggerNodeId: 'capture' })).rejects.toMatchObject({ code: 'trigger-invalid' })
  })
})
