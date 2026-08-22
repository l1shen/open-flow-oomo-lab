import type { RevisionContent } from '@oomol-lab/open-flow/project-change'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ServerService } from '../node/service.ts'

const directories: string[] = []
const port = { jsonSchema: {}, nullable: false } as const

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function databaseFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-server-'))
  directories.push(directory)
  return path.join(directory, 'open-flow.sqlite')
}

function fullFlow(value = 2): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              value: {
                concurrency: 1,
                inputs: {},
                kind: 'value',
                values: { value: { ...port, value } },
              },
              increment: {
                concurrency: 1,
                inputs: { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'value', output: 'value' }] } },
                kind: 'task',
                task: { inputs: { value: port }, moduleId: 'increment', name: 'Increment', outputs: { value: port } },
              },
              nested: {
                concurrency: 1,
                inputs: { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'increment', output: 'value' }] } },
                kind: 'subflow',
                subflowId: 'double',
              },
            },
          },
          name: 'Main',
        },
      },
      subflows: {
        double: {
          graph: {
            nodes: {
              task: {
                concurrency: 1,
                inputs: { value: { kind: 'sources', sources: [{ input: 'value', kind: 'flow' }] } },
                kind: 'task',
                task: { inputs: { value: port }, moduleId: 'double', name: 'Double', outputs: { value: port } },
              },
            },
          },
          inputs: { value: port },
          name: 'Double',
          outputs: { value: { ...port, sources: [{ kind: 'node', nodeId: 'task', output: 'value' }] } },
        },
      },
      tasks: {},
    },
    modelVersion: 1,
    modules: {
      double: { imports: [], name: 'Double', source: 'export default ({ value }) => ({ value: value * 2 })' },
      increment: { imports: [], name: 'Increment', source: 'export default ({ value }) => ({ value: value + 1 })' },
    },
  }
}

function hangingFlow(): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              task: {
                concurrency: 1,
                inputs: {},
                kind: 'task',
                task: { inputs: {}, moduleId: 'main', name: 'Main', outputs: {} },
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
    modules: { main: { imports: [], name: 'Main', source: 'export default async () => await new Promise(() => {})' } },
  }
}

function llmFlow(): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              llm: {
                concurrency: 1,
                inputs: { prompt: { kind: 'value', value: 'Hello' } },
                kind: 'task',
                taskId: 'llm',
              },
            },
          },
          name: 'Main',
        },
      },
      subflows: {},
      tasks: {
        llm: {
          executor: { kind: 'llm', mode: 'json' },
          inputs: { prompt: port },
          name: 'Generate',
          outputs: { answer: port },
        },
      },
    },
    modelVersion: 1,
    modules: {},
  }
}

async function waitForStatus(service: ServerService, runId: string, status: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (service.run(runId)?.status == status) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Run did not reach ${status}.`)
}

describe('Server application service', () => {
  it('executes a fixed full Flow through Scheduler and isolated-vm and persists public events', async () => {
    const service = ServerService.open(await databaseFile())
    service.start()
    const accepted = await service.acceptRun({
      flowId: 'main',
      idempotencyKey: 'full-flow',
      revision: fullFlow(),
      revisionId: 'revision-a',
    })
    if (accepted.kind != 'accepted') throw new Error('Initial Run acceptance conflicted.')
    await service.waitForIdle()

    expect(service.run(accepted.runId)).toMatchObject({
      eventsTruncated: false,
      result: {
        kind: 'node-results',
        nodes: [{ jobs: [{ outputs: { value: 6 } }], nodeId: 'nested' }],
      },
      status: 'completed',
    })
    const events = service.events(accepted.runId)
    const kinds = events.map((event) => event.kind)
    expect(kinds[0]).toBe('run.started')
    expect(kinds.at(-1)).toBe('run.completed')
    expect(kinds.filter((kind) => kind == 'run.started')).toHaveLength(2)
    expect(kinds.filter((kind) => kind == 'node.started')).toHaveLength(4)
    expect(kinds.filter((kind) => kind == 'node.output')).toHaveLength(4)
    expect(kinds.filter((kind) => kind == 'node.completed')).toHaveLength(4)
    expect(kinds.filter((kind) => kind == 'run.progress')).toHaveLength(4)
    expect(events.map((event) => event.cursor)).toEqual(events.map((_, index) => index + 1))
    expect(JSON.stringify(events.filter((event) => event.kind != 'run.completed'))).not.toContain('jobId')

    await expect(service.acceptRun({ flowId: 'main', idempotencyKey: 'full-flow', revision: fullFlow(), revisionId: 'revision-a' })).resolves.toMatchObject({
      created: false,
      runId: accepted.runId,
      status: 'completed',
    })
    await expect(service.acceptRun({ flowId: 'main', idempotencyKey: 'full-flow', revision: fullFlow(4), revisionId: 'revision-b' })).resolves.toEqual({
      kind: 'conflict',
    })
    await service.close()
  })

  it('reopens queued work before the start barrier and completes the same Run once', async () => {
    const file = await databaseFile()
    let service = ServerService.open(file)
    const accepted = await service.acceptRun({
      flowId: 'main',
      idempotencyKey: 'before-barrier',
      revision: fullFlow(),
      revisionId: 'revision-a',
    })
    if (accepted.kind != 'accepted') throw new Error('Initial Run acceptance conflicted.')
    expect(service.run(accepted.runId)?.status).toBe('queued')
    await service.close()

    service = ServerService.open(file)
    service.start()
    await service.waitForIdle()
    expect(service.run(accepted.runId)?.status).toBe('completed')
    expect(service.events(accepted.runId).filter((event) => event.kind == 'run.started')).toHaveLength(2)
    expect(service.events(accepted.runId).filter((event) => event.kind == 'run.completed')).toHaveLength(1)
    await service.close()
  })

  it('lets cancellation win once and terminates the active Executor', async () => {
    const service = ServerService.open(await databaseFile())
    service.start()
    const accepted = await service.acceptRun({
      flowId: 'main',
      idempotencyKey: 'cancel',
      revision: hangingFlow(),
      revisionId: 'revision-cancel',
    })
    if (accepted.kind != 'accepted') throw new Error('Initial Run acceptance conflicted.')
    await waitForStatus(service, accepted.runId, 'running')
    expect(service.cancel(accepted.runId)).toBe(true)
    await service.waitForIdle()

    expect(service.run(accepted.runId)?.status).toBe('canceled')
    expect(service.events(accepted.runId).filter((event) => ['run.canceled', 'run.completed', 'run.failed'].includes(event.kind))).toEqual([
      expect.objectContaining({ kind: 'run.canceled' }),
    ])
    await service.close()
  })

  it('executes LLM Tasks through the deployment host and projects stable host failures', async () => {
    const invocations: { readonly input: unknown; readonly mode: string }[] = []
    const configured = ServerService.open(await databaseFile(), undefined, Date.now, {
      llm: async ({ input, mode }) => {
        invocations.push({ input, mode })
        return { kind: 'completed', value: { answer: 'Hello back' }, version: 1 }
      },
    })
    configured.start()
    const completed = await configured.acceptRun({ flowId: 'main', idempotencyKey: 'llm-completed', revision: llmFlow(), revisionId: 'revision-llm' })
    if (completed.kind != 'accepted') throw new Error('LLM Run acceptance conflicted.')
    await configured.waitForIdle()

    expect(invocations).toEqual([{ input: { prompt: 'Hello' }, mode: 'json' }])
    expect(configured.run(completed.runId)).toMatchObject({
      result: { kind: 'node-results', nodes: [{ jobs: [{ outputs: { answer: 'Hello back' } }], nodeId: 'llm' }] },
      status: 'completed',
    })
    await configured.close()

    const unavailable = ServerService.open(await databaseFile())
    unavailable.start()
    const failed = await unavailable.acceptRun({ flowId: 'main', idempotencyKey: 'llm-unavailable', revision: llmFlow(), revisionId: 'revision-llm' })
    if (failed.kind != 'accepted') throw new Error('LLM Run acceptance conflicted.')
    await unavailable.waitForIdle()

    expect(unavailable.events(failed.runId).find((event) => event.kind == 'node.failed')).toMatchObject({
      payload: { error: { code: 'llm.unavailable', message: 'The LLM request could not be completed.' } },
    })
    await unavailable.close()

    const transport = ServerService.open(await databaseFile(), undefined, Date.now, {
      llm: async () => {
        throw new Error('provider-secret-detail')
      },
    })
    transport.start()
    const rejected = await transport.acceptRun({ flowId: 'main', idempotencyKey: 'llm-rejected', revision: llmFlow(), revisionId: 'revision-llm' })
    if (rejected.kind != 'accepted') throw new Error('LLM Run acceptance conflicted.')
    await transport.waitForIdle()
    expect(transport.events(rejected.runId).find((event) => event.kind == 'node.failed')).toMatchObject({
      payload: { error: { code: 'llm.unavailable', message: 'The LLM request could not be completed.' } },
    })
    expect(JSON.stringify(transport.events(rejected.runId))).not.toContain('provider-secret-detail')
    await transport.close()
  })

  it('propagates Run cancellation into the active LLM Task host', async () => {
    let started!: () => void
    const invoked = new Promise<void>((resolve) => {
      started = resolve
    })
    let aborted = false
    const service = ServerService.open(await databaseFile(), undefined, Date.now, {
      llm: async ({ signal }) => {
        started()
        return await new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        })
      },
    })
    service.start()
    const accepted = await service.acceptRun({ flowId: 'main', idempotencyKey: 'llm-canceled', revision: llmFlow(), revisionId: 'revision-llm' })
    if (accepted.kind != 'accepted') throw new Error('LLM Run acceptance conflicted.')
    await invoked
    expect(service.cancel(accepted.runId)).toBe(true)
    await service.waitForIdle()

    expect(aborted).toBe(true)
    expect(service.run(accepted.runId)?.status).toBe('canceled')
    await service.close()
  })
})
