import type { RevisionContent } from '@oomol-lab/open-flow/flow-change'
import type { DestinationStream } from 'pino'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createServerApp } from '../node/http.ts'
import { createLogger } from '../node/logger.ts'
import { ServerService } from '../node/service.ts'
import { acceptRun } from './runFixture.ts'
import { closeService, openService, startService } from './serviceFixture.ts'

const directories: string[] = []
const services: ServerService[] = []

afterEach(async () => {
  await Promise.allSettled(services.splice(0).map(closeService))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function databaseFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-logging-'))
  directories.push(directory)
  return path.join(directory, 'open-flow.sqlite')
}

function capture() {
  let output = ''
  const destination: DestinationStream = {
    write(chunk) {
      output += chunk
    },
  }
  return {
    entries: () =>
      output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Readonly<Record<string, unknown>>),
    logger: createLogger('trace', destination),
    output: () => output,
  }
}

function failingFlow(): RevisionContent {
  return {
    document: {
      bindings: {},
      graph: {
        nodes: {
          task: {
            concurrency: 1,
            inputs: {},
            kind: 'task',
            task: { inputs: [], moduleId: 'main', name: 'Main', outputs: [] },
          },
        },
      },
      subflows: {},
      tasks: {},
    },
    modelVersion: 1,
    modules: { main: { imports: [], name: 'Main', source: "export default () => { throw new Error('user-secret-must-not-leak') }" } },
  }
}

it('writes Pino JSON and redacts common secret fields', () => {
  const captured = capture()

  captured.logger.info(
    {
      authorization: 'Bearer authorization-secret',
      nested: { token: 'nested-token-secret' },
      token: 'root-token-secret',
    },
    'Redaction test.',
  )

  expect(captured.entries()).toEqual([
    expect.objectContaining({
      authorization: '[Redacted]',
      level: 30,
      nested: { token: '[Redacted]' },
      service: 'open-flow-server',
      token: '[Redacted]',
    }),
  ])
  expect(captured.output()).not.toContain('authorization-secret')
  expect(captured.output()).not.toContain('nested-token-secret')
  expect(captured.output()).not.toContain('root-token-secret')
})

it('correlates an unknown HTTP failure without logging headers or request bodies', async () => {
  const captured = capture()
  const service = await openService(await databaseFile())
  services.push(service)
  const app = createServerApp(service, {
    logger: captured.logger,
    resolveControlActor: () => {
      throw new Error('Internal authentication failure.')
    },
  })

  const response = await app.request('http://server.local/v1/flows', {
    body: JSON.stringify({ secret: 'request-body-secret' }),
    headers: {
      'authorization': 'Bearer request-authorization-secret',
      'cookie': 'session=request-cookie-secret',
      'content-type': 'application/json',
      'x-request-id': 'request-123',
    },
    method: 'POST',
  })

  expect(response.status).toBe(500)
  expect(response.headers.get('x-request-id')).toBe('request-123')
  expect(captured.entries()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: 'http.request.failed', method: 'POST', path: '/v1/flows', requestId: 'request-123' }),
      expect.objectContaining({
        category: 'http.request.completed',
        method: 'POST',
        path: '/v1/flows',
        requestId: 'request-123',
        status: 500,
      }),
    ]),
  )
  expect(captured.output()).not.toContain('request-authorization-secret')
  expect(captured.output()).not.toContain('request-cookie-secret')
  expect(captured.output()).not.toContain('request-body-secret')
})

it('does not log callback endpoint identities', async () => {
  const captured = capture()
  const service = await openService(await databaseFile())
  services.push(service)
  const app = createServerApp(service, { logger: captured.logger })
  const endpointId = 'endpoint_0123456789abcdef0123456789abcdef'

  expect((await app.request(`http://server.local/v1/webhooks/${endpointId}`)).status).toBe(404)
  expect((await app.request(`http://server.local/v1/integrations/${endpointId}`)).status).toBe(404)

  expect(captured.entries()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: 'http.request.completed', path: '/v1/webhooks/:endpointId' }),
      expect.objectContaining({ category: 'http.request.completed', path: '/v1/integrations/:endpointId' }),
    ]),
  )
  expect(captured.output()).not.toContain(endpointId)
})

it('logs Run lifecycle metadata without copying user errors or Run payloads', async () => {
  const captured = capture()
  const service = await openService(await databaseFile(), undefined, Date.now, {}, undefined, captured.logger)
  services.push(service)
  await startService(service)

  const accepted = await acceptRun(service, {
    flowId: 'main',
    idempotencyKey: 'logging-failure',
    revision: failingFlow(),
    revisionId: 'revision-logging',
  })
  if (accepted.kind != 'accepted') throw new Error('Logging test Run acceptance conflicted.')
  await service.waitForIdle()

  expect(service.run(accepted.runId)?.status).toBe('failed')
  expect(captured.entries()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: 'run.started', flowId: expect.any(String), runId: accepted.runId }),
      expect.objectContaining({ category: 'run.failed', flowId: expect.any(String), runId: accepted.runId }),
    ]),
  )
  expect(captured.output()).not.toContain('user-secret-must-not-leak')
})
