import type { FlowRunOptions, SchedulerEvent, TaskInvocation } from '../src/execution/common/scheduler.ts'
import type { JsonValue, RevisionContent } from '../src/project/common/change.ts'
import type { PreparedFlow } from '../src/project/common/semantics.ts'

import { describe, expect, it } from 'vitest'
import { currentEngineContract } from '../src/execution/common/runtime.ts'
import { runFlow as scheduleFlow } from '../src/execution/common/scheduler.ts'
import { prepareFlow as prepareProjectFlow } from '../src/project/common/semantics.ts'

const port = { jsonSchema: {}, nullable: false } as const
const engine = currentEngineContract
const connectorConnectionRequired = 'connector.connection-required'
const connectorUnavailable = 'connector.unavailable'
let nextId = 0

function runFlow(prepared: PreparedFlow, options: Omit<FlowRunOptions, 'createId'>) {
  return scheduleFlow(prepared, {
    createId: () => `scheduler-${++nextId}`,
    projectFailure: (error) => {
      if (error instanceof TaskError) return { code: error.code, message: error.message }
      return { code: 'node.failed', message: error instanceof Error ? error.message : String(error) }
    },
    ...options,
  })
}

async function prepareFlow(source: RevisionContent, flowId: string, contract: string): Promise<PreparedFlow> {
  const result = await prepareProjectFlow(source, flowId, contract)
  if (result.kind != 'prepared') throw new Error(`Flow preparation failed: ${result.kind}.`)
  return result.flow
}

class TaskError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function task(name: string, inputs: readonly string[], outputs: readonly string[]) {
  return {
    inputs: Object.fromEntries(inputs.map((handle) => [handle, port])),
    moduleId: 'module-main',
    name,
    outputs: Object.fromEntries(outputs.map((handle) => [handle, port])),
  }
}

function revision(document: RevisionContent['document'], exports: readonly string[]): RevisionContent {
  return {
    document,
    modelVersion: 1,
    modules: {
      'module-main': {
        imports: [],
        name: 'Main',
        source: `export default function ${exports[0] ?? 'run'}() { return {} }`,
      },
    },
  }
}

function waitForAbort({ signal }: TaskInvocation): Promise<never> {
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
}

describe('revision graph scheduler', () => {
  it('activates only the seeded Trigger downstream without scheduling Trigger nodes', async () => {
    const source = revision(
      {
        bindings: {},
        flows: {
          main: {
            graph: {
              nodes: {
                capture: {
                  concurrency: 1,
                  inputs: { event: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'incoming', output: 'payload' }] } },
                  kind: 'task',
                  task: task('capture', ['event'], ['event']),
                },
                ignored: {
                  concurrency: 1,
                  inputs: { event: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'scheduled', output: 'payload' }] } },
                  kind: 'task',
                  task: task('ignored', ['event'], ['event']),
                },
                incoming: { inputsDef: [], kind: 'webhook', name: 'Incoming' },
                scheduled: { cronTimes: [{ type: 'every', unit: 'minute', value: 1 }], kind: 'cron', name: 'Scheduled' },
              },
            },
            name: 'Main',
          },
        },
        subflows: {},
        tasks: {},
      },
      ['capture'],
    )
    const prepared = await prepareFlow(source, 'main', engine)
    const invoked: string[] = []
    const events: SchedulerEvent[] = []
    const result = await runFlow(prepared, {
      emit: (event) => void events.push(event),
      invokeTask: async (invocation) => {
        invoked.push(invocation.nodeId)
        return { event: invocation.input.event }
      },
      runId: 'run-trigger',
      trigger: { nodeId: 'incoming', payload: { action: 'opened' } },
    })

    expect(invoked).toEqual(['capture'])
    expect(result.nodes).toEqual([
      { jobs: [{ jobId: expect.any(String), outputs: { event: { action: 'opened' } } }], nodeId: 'capture' },
      { jobs: [], nodeId: 'ignored' },
    ])
    expect(events.some((event) => 'nodeId' in event && (event.nodeId == 'incoming' || event.nodeId == 'scheduled'))).toBe(false)

    invoked.length = 0
    const manual = await runFlow(prepared, {
      invokeTask: async (invocation) => {
        invoked.push(invocation.nodeId)
        return { event: invocation.input.event }
      },
      runId: 'run-manual',
    })
    expect(invoked).toEqual([])
    expect(manual.nodes).toEqual([
      { jobs: [], nodeId: 'capture' },
      { jobs: [], nodeId: 'ignored' },
    ])
  })

  it('emits Value node outputs without invoking a Task', async () => {
    const source = revision(
      {
        bindings: {},
        flows: {
          main: {
            graph: {
              nodes: {
                value: {
                  concurrency: 1,
                  inputs: {},
                  kind: 'value',
                  values: {
                    count: { jsonSchema: { type: 'number' }, nullable: false, value: 2 },
                    label: { jsonSchema: { type: 'string' }, nullable: false, value: 'ready' },
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
      [],
    )
    const prepared = await prepareFlow(source, 'main', engine)
    const events: SchedulerEvent[] = []
    const result = await runFlow(prepared, {
      emit: (event) => void events.push(event),
      invokeTask: async () => {
        throw new Error('Value nodes must not invoke a Task.')
      },
      runId: 'run-value',
    })

    expect(result).toEqual({
      kind: 'node-results',
      nodes: [{ jobs: [{ jobId: expect.any(String), outputs: { count: 2, label: 'ready' } }], nodeId: 'value' }],
    })
    expect(events).toContainEqual(expect.objectContaining({ nodeId: 'value', nodeKind: 'value', type: 'node.started' }))
  })

  it('routes first-match Conditions through nested Subflows and preserves empty branches', async () => {
    const source = revision(
      {
        bindings: {},
        flows: {
          main: {
            graph: {
              nodes: {
                source: {
                  concurrency: 1,
                  inputs: { value: { kind: 'value', value: 1 } },
                  kind: 'task',
                  task: task('source', ['value'], ['value']),
                },
                branch: {
                  cases: [{ expressions: [{ input: 'value', operator: '>', value: 5 }], output: 'high', relation: 'all' }],
                  concurrency: 1,
                  defaultOutput: 'low',
                  input: { ...port, handle: 'value' },
                  inputs: { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'source', output: 'value' }] } },
                  kind: 'condition',
                },
                nested: {
                  concurrency: 1,
                  inputs: { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'branch', output: 'high' }] } },
                  kind: 'subflow',
                  subflowId: 'double-flow',
                },
                low: {
                  concurrency: 1,
                  inputs: { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'branch', output: 'low' }] } },
                  kind: 'task',
                  task: task('low', ['value'], ['value']),
                },
              },
            },
            name: 'Main',
          },
        },
        subflows: {
          'double-flow': {
            graph: {
              nodes: {
                double: {
                  concurrency: 1,
                  inputs: { value: { kind: 'sources', sources: [{ input: 'value', kind: 'flow' }] } },
                  kind: 'task',
                  task: task('double', ['value'], ['value']),
                },
              },
            },
            inputs: { value: port },
            name: 'Double',
            outputs: {
              value: { ...port, sources: [{ kind: 'node', nodeId: 'double', output: 'value' }] },
            },
          },
        },
        tasks: {},
      },
      ['double', 'low', 'source'],
    )
    const prepared = await prepareFlow(source, 'main', engine)
    const events: SchedulerEvent[] = []
    const invoked: string[] = []
    const result = await runFlow(prepared, {
      emit: (event) => void events.push(event),
      inputs: { source: { value: 7 } },
      async invokeTask(invocation) {
        invoked.push(invocation.nodeId)
        if (invocation.nodeId == 'source') return { value: invocation.input.value }
        if (invocation.nodeId == 'double') return { value: (invocation.input.value as number) * 2 }
        return { value: 'low' }
      },
      runId: 'run-condition',
    })

    expect(invoked).toEqual(['source', 'double'])
    expect(result).toEqual({
      kind: 'node-results',
      nodes: [
        { jobs: [], nodeId: 'low' },
        { jobs: [{ jobId: expect.any(String), outputs: { value: 14 } }], nodeId: 'nested' },
      ],
    })
    expect(events.filter((event) => event.type == 'run.started').map((event) => event.flowId)).toEqual(['main', 'double-flow'])
    expect(events).toContainEqual(expect.objectContaining({ handle: 'high', nodeId: 'branch', type: 'node.output', value: 7 }))
  })

  it('queues multiple sources in delivery order while enforcing node concurrency', async () => {
    const source = revision(
      {
        bindings: {},
        flows: {
          main: {
            graph: {
              nodes: {
                a: { concurrency: 1, inputs: {}, kind: 'task', task: task('a', [], ['item']) },
                b: { concurrency: 1, inputs: {}, kind: 'task', task: task('b', [], ['item']) },
                collect: {
                  concurrency: 1,
                  inputs: {
                    item: {
                      kind: 'sources',
                      sources: [
                        { kind: 'node', nodeId: 'a', output: 'item' },
                        { kind: 'node', nodeId: 'b', output: 'item' },
                      ],
                    },
                  },
                  kind: 'task',
                  task: task('collect', ['item'], ['seen']),
                },
              },
            },
            name: 'Main',
          },
        },
        subflows: {},
        tasks: {},
      },
      ['a', 'b', 'collect'],
    )
    const prepared = await prepareFlow(source, 'main', engine)
    let activeCollectors = 0
    let maximumCollectors = 0
    const seen: JsonValue[] = []
    const result = await runFlow(prepared, {
      async invokeTask(invocation) {
        if (invocation.nodeId == 'a') {
          await new Promise((resolve) => setTimeout(resolve, 20))
          return { item: 'a' }
        }
        if (invocation.nodeId == 'b') return { item: 'b' }
        activeCollectors += 1
        maximumCollectors = Math.max(maximumCollectors, activeCollectors)
        seen.push(invocation.input.item)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeCollectors -= 1
        return { seen: invocation.input.item }
      },
      runId: 'run-fifo',
    })

    expect(seen).toEqual(['b', 'a'])
    expect(maximumCollectors).toBe(1)
    expect(result.nodes).toEqual([
      {
        jobs: [
          { jobId: expect.any(String), outputs: { seen: 'b' } },
          { jobId: expect.any(String), outputs: { seen: 'a' } },
        ],
        nodeId: 'collect',
      },
    ])
  })

  it('enforces timeout and cancellation through each Task invocation signal', async () => {
    const source = revision(
      {
        bindings: {},
        flows: {
          main: {
            graph: { nodes: { slow: { concurrency: 1, inputs: {}, kind: 'task', task: task('slow', [], []), timeoutMs: 10 } } },
            name: 'Main',
          },
        },
        subflows: {},
        tasks: {},
      },
      ['slow'],
    )
    const prepared = await prepareFlow(source, 'main', engine)
    const events: SchedulerEvent[] = []
    await expect(runFlow(prepared, { emit: (event) => void events.push(event), invokeTask: waitForAbort, runId: 'run-timeout' })).rejects.toThrow('timed out')
    expect(events.filter((event) => event.type == 'node.failed')).toHaveLength(1)
    expect(events.filter((event) => event.type == 'run.failed')).toHaveLength(1)

    const slow = prepared.flow.graph.nodes.slow!
    if (!('inputs' in slow)) throw new Error('Fixture slow node must be executable.')
    const controller = new AbortController()
    const canceled = runFlow(
      { ...prepared, flow: { ...prepared.flow, graph: { nodes: { slow: { ...slow, timeoutMs: undefined } } } } },
      { invokeTask: waitForAbort, runId: 'run-cancel', signal: controller.signal },
    )
    controller.abort(new Error('canceled by test'))
    await expect(canceled).rejects.toThrow('canceled by test')
  })

  it.each([
    [connectorConnectionRequired, 'The selected Connector Connection must be reconnected or replaced.'],
    [connectorUnavailable, 'The Connector request could not be completed.'],
  ] as const)('preserves the managed Task failure category %s', async (code, message) => {
    const source = revision(
      {
        bindings: {},
        flows: {
          main: {
            graph: { nodes: { task: { concurrency: 1, inputs: {}, kind: 'task', taskId: 'task-main' } } },
            name: 'Main',
          },
        },
        subflows: {},
        tasks: {
          'task-main': {
            executor: { kind: 'llm', mode: 'chat' },
            inputs: {},
            name: 'Managed',
            outputs: {},
          },
        },
      },
      ['run'],
    )
    const prepared = await prepareFlow(source, 'main', engine)
    const events: SchedulerEvent[] = []

    await expect(
      runFlow(prepared, {
        emit: (event) => void events.push(event),
        invokeTask: async () => {
          throw new TaskError(code, message)
        },
        runId: 'run-managed-failure',
      }),
    ).rejects.toMatchObject({ code })
    expect(events.find((event) => event.type == 'node.failed')).toMatchObject({ code, message, type: 'node.failed' })
  })
})
