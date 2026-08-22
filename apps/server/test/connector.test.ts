import type { ConnectorAction, ConnectorConnection, ConnectorProvider } from '@oomol-lab/open-flow/control-api'
import type { JsonValue, RevisionContent } from '@oomol-lab/open-flow/project-change'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectorTaskError } from '../src/connector.ts'
import { ServerService } from '../src/service.ts'
import { createConnectorHost } from './connectorHost.ts'

const directories: string[] = []
const services: ServerService[] = []
const port = { jsonSchema: {}, nullable: false } as const

afterEach(async () => {
  await Promise.allSettled(services.splice(0).map((service) => service.close()))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function databaseFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-connector-'))
  directories.push(directory)
  return path.join(directory, 'open-flow.sqlite')
}

function connectorFlow(timeoutMs?: number): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              connector: {
                concurrency: 1,
                inputs: { message: { kind: 'value', value: 'hello' } },
                kind: 'task',
                taskId: 'connector',
                ...(timeoutMs == null ? {} : { timeoutMs }),
              },
            },
          },
          name: 'Main',
        },
      },
      subflows: {},
      tasks: {
        connector: {
          executor: { action: 'example.echo', connectionId: 'connection-work', kind: 'connector' },
          inputs: { message: port },
          name: 'Echo',
          outputs: { message: port },
        },
      },
    },
    modelVersion: 1,
    modules: {},
  }
}

function capabilityFlow(declared = true): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              capability: {
                concurrency: 1,
                inputs: { message: { kind: 'value', value: 'hello' } },
                kind: 'task',
                task: {
                  ...(declared ? { capabilities: [{ action: 'example.echo', connectionId: 'connection-work', kind: 'connector' as const }] } : {}),
                  inputs: { message: port },
                  moduleId: 'capability',
                  name: 'Capability',
                  outputs: { message: port },
                },
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
      capability: {
        imports: [],
        name: 'Capability',
        source:
          "export default async (input, capability) => (await capability.connector({ action: 'example.echo', connectionId: 'connection-work', input })).body",
      },
    },
  }
}

async function open(connector?: Parameters<typeof ServerService.open>[1], connectorConsoleOrigin?: string): Promise<ServerService> {
  const service = ServerService.open(await databaseFile(), connector, Date.now, {}, connectorConsoleOrigin)
  services.push(service)
  service.start()
  return service
}

async function run(service: ServerService, revision: RevisionContent): Promise<string> {
  const accepted = await service.acceptRun({ flowId: 'main', idempotencyKey: crypto.randomUUID(), revision, revisionId: crypto.randomUUID() })
  if (accepted.kind != 'accepted') throw new Error('Connector Run acceptance conflicted.')
  await service.waitForIdle()
  return accepted.runId
}

describe('Server Connector host', () => {
  it('projects discovery and the explicit external Connection page from the injected host', async () => {
    const providers: readonly ConnectorProvider[] = [{ serviceId: 'example', serviceName: 'Example' }]
    const actions: readonly ConnectorAction[] = [
      { actionId: 'example.echo', description: 'Echo.', inputs: {}, name: 'Echo', outputs: {}, serviceId: 'example', serviceName: 'Example' },
    ]
    const connections: readonly ConnectorConnection[] = [
      { connectionId: 'connection-work', displayName: 'Work', isDefault: true, serviceId: 'example', status: 'active' },
    ]
    const connector = createConnectorHost({
      getAction: async () => actions[0]!,
      listActions: async () => actions,
      listConnections: async () => connections,
      listProviders: async () => providers,
      searchActions: async () => actions,
    })
    const service = await open(connector, 'https://connector.example')
    const created = await service.control.createProject('operator', 'Connector project', 'connector-project')
    const projectId = created.project.projectId

    await expect(service.control.listConnectorProviders(projectId)).resolves.toEqual(providers)
    await expect(service.control.listConnectorActions(projectId, 'example')).resolves.toEqual(actions)
    await expect(service.control.searchConnectorActions(projectId, 'echo')).resolves.toEqual(actions)
    await expect(service.control.getConnectorAction(projectId, 'example.echo')).resolves.toEqual(actions[0])
    await expect(service.control.listConnectorConnections(projectId, 'example')).resolves.toEqual(connections)
    expect(service.control.connectorConnectionPage(projectId, 'example')).toBe('https://connector.example/providers/example')
  })

  it('executes managed Connector Tasks through the injected host', async () => {
    const execute = vi.fn(async (_action: string, _connectionId: string, input: Readonly<Record<string, JsonValue>>) => input)
    const service = await open(createConnectorHost({ execute }))
    const runId = await run(service, connectorFlow())

    expect(execute).toHaveBeenCalledWith('example.echo', 'connection-work', { message: 'hello' }, expect.any(String), expect.any(AbortSignal))
    expect(service.run(runId)).toMatchObject({
      result: { kind: 'node-results', nodes: [{ jobs: [{ outputs: { message: 'hello' } }], nodeId: 'connector' }] },
      status: 'completed',
    })
  })

  it('allows only Connector Capabilities declared by the current inline Task', async () => {
    const execute = vi.fn(async (_action: string, _connectionId: string, input: Readonly<Record<string, JsonValue>>) => input)
    const service = await open(createConnectorHost({ execute }))
    const allowedRunId = await run(service, capabilityFlow())
    expect(service.run(allowedRunId)?.status).toBe('completed')
    expect(execute).toHaveBeenCalledTimes(1)

    const deniedRunId = await run(service, capabilityFlow(false))
    expect(service.events(deniedRunId).find((event) => event.kind == 'node.failed')).toMatchObject({
      payload: { error: { code: 'capability.denied', message: 'The Runtime Capability is not declared for this Task.' } },
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('fails closed when no Connector host is injected', async () => {
    const service = await open()
    const runId = await run(service, connectorFlow())

    expect(service.run(runId)?.status).toBe('failed')
    expect(service.events(runId).find((event) => event.kind == 'node.failed')).toMatchObject({
      payload: { error: { code: 'connector.unavailable', message: 'The Connector request could not be completed.' } },
    })
  })

  it('preserves stable host errors and propagates Task cancellation', async () => {
    const disconnected = await open(
      createConnectorHost({
        execute: async () => {
          throw new ConnectorTaskError('connector.connection-required', 'The selected Connector Connection must be reconnected or replaced.')
        },
      }),
    )
    const disconnectedRunId = await run(disconnected, connectorFlow())
    expect(disconnected.events(disconnectedRunId).find((event) => event.kind == 'node.failed')).toMatchObject({
      payload: { error: { code: 'connector.connection-required' } },
    })

    const waiting = await open(
      createConnectorHost({
        execute: async (_action, _connectionId, _input, _invocationId, signal) =>
          await new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
      }),
    )
    const timedOutRunId = await run(waiting, connectorFlow(20))
    expect(waiting.events(timedOutRunId).find((event) => event.kind == 'node.failed')).toMatchObject({
      payload: { error: { code: 'node.failed', message: 'Node "connector" timed out.' } },
    })
  })
})
